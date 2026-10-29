import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
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
import { mobileApiService, unwrapApiData, unwrapCollection } from '../../services/mobileApiService';
import { getApiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { isPrincipalRole } from '../../utils/roles';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import { WeeklyEvaluationReportPaperModal } from '../WeeklyEvaluationReportPaperModal';

const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SurahItem {
  nomor: number;
  nama: string;
  nama_latin: string;
  jumlah_ayat: number;
  tempat_turun?: string;
  arti?: string;
  deskripsi?: string;
}

import { getDynamicAcademicInfo } from '../../utils/academicYear';

// Canonical helper untuk menentukan Juz Al-Qur'an (1 s/d 30) berdasarkan Surah dan Ayat
export const getQuranJuz = (surahNum: number, ayahNum: number = 1): number => {
  const juzStarts: [number, number][] = [
    [1, 1], [2, 142], [2, 253], [3, 93], [4, 24], [4, 148],
    [5, 83], [6, 111], [7, 88], [8, 41], [9, 93], [11, 6],
    [12, 53], [15, 1], [17, 1], [18, 75], [21, 1], [23, 1],
    [25, 21], [27, 56], [29, 46], [33, 31], [36, 28], [39, 32],
    [41, 47], [46, 1], [51, 31], [58, 1], [67, 1], [78, 1],
  ];
  if (surahNum < 1) return 1;
  if (surahNum >= 78) return 30;

  for (let j = juzStarts.length - 1; j >= 0; j--) {
    const [s, a] = juzStarts[j];
    if (surahNum > s || (surahNum === s && ayahNum >= a)) {
      return j + 1;
    }
  }
  return 1;
};

export default function TeacherTahfizhWorkspace({
  onBack,
  initialTab = 'input',
}: {
  onBack?: () => void;
  initialTab?: 'input' | 'logs' | 'leaderboard' | 'report';
}) {
  const user = useAuthStore((state) => state.user);
  const isPrincipal = isPrincipalRole(user?.roles || []);
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  // Sub-tabs: 'input' | 'logs' | 'leaderboard' | 'report' (Kepala Sekolah hanya untuk monitor & rekap)
  const defaultTab = isPrincipal && initialTab === 'input' ? 'logs' : initialTab;
  const [activeTab, setActiveTab] = useState<'input' | 'logs' | 'leaderboard' | 'report'>(defaultTab);

  useEffect(() => {
    if (isPrincipal && activeTab === 'input') {
      setActiveTab('logs');
    }
  }, [isPrincipal, activeTab]);

  // Loading & Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [loadingContinue, setLoadingContinue] = useState<boolean>(false);
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [tahfizhLogs, setTahfizhLogs] = useState<any[]>([]);

  // State Modal Lanjutan Tahfizh
  const [continueModalVisible, setContinueModalVisible] = useState<boolean>(false);
  const [surahPickerTarget, setSurahPickerTarget] = useState<'form' | 'continueModal'>('form');
  const [continueModalData, setContinueModalData] = useState<{
    hasHistory: boolean;
    lastSurahNumber?: number;
    lastSurahName?: string;
    lastAyahStart?: number;
    lastAyahEnd?: number;
    lastDate?: string;
    targetSurahNumber: number;
    targetAyahStart: number;
    targetAyahEnd: number;
    targetJuz: number;
    hasPendingMurajaah?: boolean;
    pendingMurajaahInfo?: any;
  } | null>(null);

  // State Pratinjau Teks Ayat Al-Qur'an Terpilih
  const [versePreviewModalVisible, setVersePreviewModalVisible] = useState<boolean>(false);
  const [loadingVerses, setLoadingVerses] = useState<boolean>(false);
  const [versePreviewData, setVersePreviewData] = useState<{
    surahNumber: number;
    surahNameLatin: string;
    surahNameArabic: string;
    arti: string;
    ayahStart: number;
    ayahEnd: number;
    juz: number;
    verses: Array<{
      nomor_ayat: number;
      teks_arab: string;
      teks_latin?: string;
      teks_indonesia?: string;
    }>;
  } | null>(null);

  // Logs (Riwayat) Search & Type Filter States
  const [logsSearchQuery, setLogsSearchQuery] = useState<string>('');
  const [logsTypeFilter, setLogsTypeFilter] = useState<'all' | 'Ziyadah' | 'Murajaah' | 'Tasmi' | 'Ujian'>('all');

  // Report States
  const [reportSummary, setReportSummary] = useState<any | null>(null);
  const [reportLogs, setReportLogs] = useState<any[]>([]);
  const [reportLoading, setReportLoading] = useState<boolean>(false);
  const [reportSearchQuery, setReportSearchQuery] = useState<string>('');
  const [printReportStudent, setPrintReportStudent] = useState<any | null>(null);
  const [printReportVisible, setPrintReportVisible] = useState<boolean>(false);

  // Feedback modal
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Info Kelanjutan Hafalan Terakhir
  const [lastHafalanInfo, setLastHafalanInfo] = useState<{
    isFirst: boolean;
    lastSurahName?: string;
    lastAyatStart?: number;
    lastAyatEnd?: number;
    nextSurahName?: string;
    nextAyahStart?: number;
    nextAyahEnd?: number;
    hasPendingMurajaah?: boolean;
    pendingMurajaahInfo?: any;
  } | null>(null);

  // Form State
  const [selectedStudentId, setSelectedStudentId] = useState<string>('');
  const [setoranType, setSetoranType] = useState<string>('Ziyadah');
  const [juz, setJuz] = useState<number>(1);
  const [surahNumber, setSurahNumber] = useState<number>(0);
  const [ayatStart, setAyatStart] = useState<number>(1);
  const [ayatEnd, setAyatEnd] = useState<number>(1);
  const [kelancaran, setKelancaran] = useState<string>('Sangat Lancar');
  const [tajwid, setTajwid] = useState<string>('Baik');
  const [makhraj, setMakhraj] = useState<string>('Baik');
  const [notes, setNotes] = useState<string>('');

  // Modals for selection pickers
  const [classPickerVisible, setClassPickerVisible] = useState<boolean>(false);
  const [studentPickerVisible, setStudentPickerVisible] = useState<boolean>(false);
  const [surahPickerVisible, setSurahPickerVisible] = useState<boolean>(false);
  const [studentSearch, setStudentSearch] = useState<string>('');
  const [surahSearch, setSurahSearch] = useState<string>('');

  // Selected entities info
  const selectedStudent = useMemo(() => {
    return students.find((s) => String(s.id) === String(selectedStudentId));
  }, [students, selectedStudentId]);

  const selectedSurah = useMemo(() => {
    return surahs.find((s) => s.nomor === surahNumber);
  }, [surahs, surahNumber]);

  // Perhitungan Baris Mushaf Madinah (15 baris per halaman standar)
  const calculatedLines = useMemo(() => {
    if (surahNumber <= 0 || !selectedSurah) return 0;
    const ayatCount = Math.max(1, ayatEnd - ayatStart + 1);
    // Estimasi proporsional: 1 baris mushaf Madinah rata-rata 1-2 ayat pendek (atau 0.5-1 ayat panjang)
    // Sesuai standar kurikulum SIT, 1 ayat rata-rata setara 1-1.5 baris tergantung surah
    return Math.max(1, Math.round(ayatCount * 1.1));
  }, [surahNumber, selectedSurah, ayatStart, ayatEnd]);

  // Riwayat setoran santri untuk Surah yang sedang dipilih
  const activeSurahHistory = useMemo(() => {
    if (!selectedStudentId || surahNumber <= 0) return null;
    const logs = (tahfizhLogs || []).filter((l: any) => {
      const sid = l?.student_id || l?.santri_id || l?.user_id;
      const sNum = Number(l?.hafalan_surah_number || l?.surah_number || 0);
      return String(sid) === String(selectedStudentId) && sNum === surahNumber;
    });
    if (logs.length === 0) return null;
    logs.sort(
      (a: any, b: any) =>
        new Date(b.record_date || b.created_at || 0).getTime() -
        new Date(a.record_date || a.created_at || 0).getTime()
    );
    const latest = logs[0];
    const lastAyahEnd = Number(latest.hafalan_ayah_end || latest.ayat_end || 0);
    const lastAyahStart = Number(latest.hafalan_ayah_start || latest.ayat_start || 1);
    return {
      lastAyahStart,
      lastAyahEnd,
      recordDate: latest.record_date || latest.created_at,
      kelancaran: latest.kelancaran || 'Lancar',
    };
  }, [selectedStudentId, surahNumber, tahfizhLogs]);

  // Load Initial Data
  const loadData = useCallback(async () => {
    try {
      const [studRes, schedRes, classRes, surahRes, logRes, reportRes] = await Promise.allSettled([
        mobileApiService.getTeacherStudents({ per_page: 500 }),
        mobileApiService.getTeacherSchedules(),
        mobileApiService.getTeacherClasses(),
        mobileApiService.getQuranSurahs(),
        mobileApiService.getTeacherTahfizh({ per_page: 500 }),
        mobileApiService.getTahfizhReport({ per_page: 500 }),
      ]);

      if (studRes.status === 'fulfilled') {
        const list: any[] = unwrapCollection(studRes.value);
        setStudents(list);
        if (list.length > 0 && !selectedStudentId) {
          setSelectedStudentId(String(list[0].id));
        }
      }

      const uniqueClasses: any[] = [];
      const seen = new Set<string>();

      // 1. Prioritaskan kelas resmi rombel unit dari getTeacherClasses
      if (classRes.status === 'fulfilled') {
        const rawClasses: any[] = unwrapCollection(classRes.value);
        for (const item of (rawClasses as any[])) {
          const cid = item.id;
          const cname = item.nama_kelas || item.name;
          if (cid && !seen.has(String(cid))) {
            seen.add(String(cid));
            uniqueClasses.push({ id: String(cid), name: cname || `Kelas ${cid}` });
          }
        }
      }

      // 2. Fallback/tambahan dari jadwal KBM guru
      if (schedRes.status === 'fulfilled') {
        const rawSched: any[] = unwrapCollection(schedRes.value);
        for (const item of (rawSched as any[])) {
          const cid = item.kelas_id || item.class_id;
          const cname = item.kelas?.nama_kelas || item.class?.name || item.rombel;
          if (cid && !seen.has(String(cid))) {
            seen.add(String(cid));
            uniqueClasses.push({ id: String(cid), name: cname || `Kelas ${cid}` });
          }
        }
      }

      if (uniqueClasses.length > 0) {
        setClasses(uniqueClasses);
      }

      if (surahRes.status === 'fulfilled') {
        const rawSurahs = unwrapApiData<SurahItem[]>(surahRes.value) || [];
        setSurahs(Array.isArray(rawSurahs) ? rawSurahs : []);
      }

      if (logRes.status === 'fulfilled') {
        const rawLogs = unwrapCollection(logRes.value);
        setTahfizhLogs(rawLogs);
      }

      if (reportRes.status === 'fulfilled') {
        const rawReport: any = reportRes.value;
        if (rawReport?.summary) {
          setReportSummary(rawReport.summary);
        }
        const logs = unwrapCollection(rawReport);
        if (logs.length > 0) {
          setReportLogs(logs);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedStudentId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Adjust ayat_end when surah changes
  useEffect(() => {
    if (selectedSurah) {
      if (ayatEnd > selectedSurah.jumlah_ayat) {
        setAyatEnd(selectedSurah.jumlah_ayat);
      }
    }
  }, [selectedSurah, ayatEnd]);

  // Buka Modal Pemilihan & Konfirmasi Lanjutan Tahfizh
  const handleOpenContinueModal = useCallback(async () => {
    if (!selectedStudentId) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Pilih Santri 👤',
        message: 'Silakan pilih santri terlebih dahulu.',
      });
      return;
    }

    setLoadingContinue(true);
    try {
      // 1. Ambil data hafalan terakhir dari backend API
      let data: any = null;
      try {
        const res = await mobileApiService.getLastHafalan(selectedStudentId);
        data = unwrapApiData<any>(res);
      } catch (e) {
        console.warn('Backend getLastHafalan warning:', e);
      }

      // 2. Cross-check dengan riwayat lokal terbaru santri di tahfizhLogs jika ada (abaikan Murajaah/Murojaah)
      const studentLogs = tahfizhLogs
        .filter((l) => {
          if (String(l.student_id || l.santri_id) !== String(selectedStudentId)) return false;
          const lType = String(l.metadata?.type || l.type || '').toLowerCase();
          return lType !== 'murajaah' && lType !== 'murojaah';
        })
        .sort(
          (a, b) =>
            new Date(b.record_date || b.created_at || 0).getTime() -
            new Date(a.record_date || a.created_at || 0).getTime()
        );

      const localLatest = studentLogs.length > 0 ? studentLogs[0] : null;

      const isFirst = Boolean(
        (!data || data.is_first_hafalan || !data.last_surah_name) && !localLatest
      );

      if (isFirst) {
        // Santri belum pernah melakukan tahfizh: jangan otomatis memaksakan Surah 78 (An-Naba) atau 1 (Al-Fatihah)
        setContinueModalData({
          hasHistory: false,
          targetSurahNumber: 0,
          targetAyahStart: 1,
          targetAyahEnd: 1,
          targetJuz: 1,
          hasPendingMurajaah: Boolean(data?.has_pending_murajaah),
          pendingMurajaahInfo: data?.pending_murajaah_info,
        });
        setContinueModalVisible(true);
        return;
      }

      // Tentukan riwayat terakhir santri
      const lastSurahNum = Number(
        data?.last_surah_number ||
          localLatest?.hafalan_surah_number ||
          localLatest?.surah_number ||
          1
      );
      const lastSurahName = String(
        data?.last_surah_name ||
          localLatest?.hafalan_surah_name ||
          localLatest?.surah_name ||
          ''
      );
      const lastAyahStart = Number(
        data?.last_ayah_start ||
          localLatest?.hafalan_ayah_start ||
          localLatest?.ayat_start ||
          1
      );
      const lastAyahEnd = Number(
        data?.last_ayah_end ||
          localLatest?.hafalan_ayah_end ||
          localLatest?.ayat_end ||
          1
      );
      const lastDate = localLatest?.record_date || localLatest?.date || undefined;

      const currentSurahObj = surahs.find((s) => s.nomor === lastSurahNum);
      const totalAyatInSurah = currentSurahObj ? currentSurahObj.jumlah_ayat : 7;

      let nextSurahNum = lastSurahNum;
      let nextAyahStart = lastAyahEnd + 1;

      // Jika surah sudah selesai, lanjutkan ke surah berikutnya
      if (nextAyahStart > totalAyatInSurah) {
        nextSurahNum = Math.min(114, lastSurahNum + 1);
        nextAyahStart = 1;
      }

      const nextSurahObj =
        surahs.find((s) => s.nomor === nextSurahNum) || currentSurahObj;
      const nextSurahTotal = nextSurahObj ? nextSurahObj.jumlah_ayat : 7;
      const nextAyahEnd = Math.min(nextAyahStart + 9, nextSurahTotal);
      const nextJuz = getQuranJuz(nextSurahNum, nextAyahStart);

      setContinueModalData({
        hasHistory: true,
        lastSurahNumber: lastSurahNum,
        lastSurahName:
          lastSurahName || currentSurahObj?.nama_latin || `Surah #${lastSurahNum}`,
        lastAyahStart,
        lastAyahEnd,
        lastDate,
        targetSurahNumber: nextSurahNum,
        targetAyahStart: nextAyahStart,
        targetAyahEnd: nextAyahEnd,
        targetJuz: nextJuz,
        hasPendingMurajaah: Boolean(data?.has_pending_murajaah),
        pendingMurajaahInfo: data?.pending_murajaah_info,
      });

      setContinueModalVisible(true);
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Riwayat',
        message: getApiErrorMessage(
          err,
          'Terjadi kendala saat memeriksa riwayat hafalan santri.'
        ),
      });
    } finally {
      setLoadingContinue(false);
    }
  }, [selectedStudentId, tahfizhLogs, surahs]);

  // Terapkan Pilihan Lanjutan dari Modal ke Formulir
  const handleApplyContinueModal = useCallback(() => {
    if (!continueModalData) return;

    if (!continueModalData.hasHistory && (!continueModalData.targetSurahNumber || continueModalData.targetSurahNumber <= 0)) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Pilih Surah 📖',
        message: 'Silakan pilih Surah Al-Qur’an terlebih dahulu untuk setoran perdana santri.',
      });
      return;
    }

    setSurahNumber(continueModalData.targetSurahNumber);
    setAyatStart(continueModalData.targetAyahStart);
    setAyatEnd(continueModalData.targetAyahEnd);
    setJuz(continueModalData.targetJuz);

    const targetSurahObj = surahs.find(
      (s) => s.nomor === continueModalData.targetSurahNumber
    );

    setLastHafalanInfo({
      isFirst: !continueModalData.hasHistory,
      lastSurahName: continueModalData.lastSurahName,
      lastAyatStart: continueModalData.lastAyahStart,
      lastAyatEnd: continueModalData.lastAyahEnd,
      nextSurahName:
        targetSurahObj?.nama_latin || `Surah #${continueModalData.targetSurahNumber}`,
      nextAyahStart: continueModalData.targetAyahStart,
      nextAyahEnd: continueModalData.targetAyahEnd,
      hasPendingMurajaah: continueModalData.hasPendingMurajaah,
      pendingMurajaahInfo: continueModalData.pendingMurajaahInfo,
    });

    setContinueModalVisible(false);

    setFeedback({
      visible: true,
      type: 'success',
      title: 'Lanjutan Diterapkan ke Formulir ✨',
      message: `Formulir telah diisi dengan Surah ${targetSurahObj?.nama_latin || continueModalData.targetSurahNumber} (Ayat ${continueModalData.targetAyahStart}–${continueModalData.targetAyahEnd}). Silakan periksa kembali sebelum menyimpan setoran.`,
    });
  }, [continueModalData, surahs]);

  // Fitur Pratinjau Teks Ayat Al-Qur'an yang Dipilih
  const handlePreviewVerses = useCallback(
    async (sNum: number, aStart: number, aEnd: number) => {
      if (!sNum || sNum <= 0) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Pilih Surah 📖',
          message: 'Silakan tentukan Surah Al-Qur\'an terlebih dahulu sebelum melihat teks ayat.',
        });
        return;
      }

      const surahObj = surahs.find((s) => s.nomor === sNum);
      const sName = surahObj?.nama_latin || `Surah #${sNum}`;
      const sArab = surahObj?.nama || '';
      const sArti = surahObj?.arti || '';
      const start = Math.max(1, aStart);
      const end = Math.max(start, aEnd);

      setLoadingVerses(true);
      setVersePreviewModalVisible(true);
      setVersePreviewData({
        surahNumber: sNum,
        surahNameLatin: sName,
        surahNameArabic: sArab,
        arti: sArti,
        ayahStart: start,
        ayahEnd: end,
        juz: getQuranJuz(sNum, start),
        verses: [],
      });

      try {
        const res = await mobileApiService.getQuranSurahDetail(sNum);
        const rawAyat: any[] = res?.ayat || res?.data?.ayat || res?.data || [];
        const filtered = (Array.isArray(rawAyat) ? rawAyat : [])
          .filter((item: any) => {
            const no = Number(item.nomor_ayat || item.nomor || item.ayat || 0);
            return no >= start && no <= end;
          })
          .map((item: any) => ({
            nomor_ayat: Number(item.nomor_ayat || item.nomor || item.ayat || 0),
            teks_arab: item.teks_arab || item.teksArab || item.ar || item.arab || '',
            teks_latin: item.teks_latin || item.teksLatin || item.tr || item.latin || '',
            teks_indonesia:
              item.teks_indonesia ||
              item.teksIndonesia ||
              item.arti ||
              item.idn ||
              item.terjemah ||
              '',
          }));

        setVersePreviewData({
          surahNumber: sNum,
          surahNameLatin: sName,
          surahNameArabic: sArab,
          arti: sArti,
          ayahStart: start,
          ayahEnd: end,
          juz: getQuranJuz(sNum, start),
          verses: filtered,
        });
      } catch (err: any) {
        setFeedback({
          visible: true,
          type: 'error',
          title: 'Gagal Memuat Ayat',
          message: getApiErrorMessage(
            err,
            'Terjadi kendala saat memuat teks ayat Al-Qur’an.'
          ),
        });
      } finally {
        setLoadingVerses(false);
      }
    },
    [surahs]
  );

  const handleSubmit = async () => {
    if (!selectedStudentId) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Pilih Santri 👤',
        message: 'Silakan pilih santri terlebih dahulu.',
      });
      return;
    }
    if (!surahNumber || surahNumber <= 0) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Pilih Surah 📖',
        message: 'Silakan tentukan Surah yang disetorkan terlebih dahulu.',
      });
      return;
    }
    if (ayatEnd < ayatStart) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Rentang Ayat Tidak Valid ⚠️',
        message: 'Ayat akhir tidak boleh lebih kecil dari ayat awal.',
      });
      return;
    }

    setSubmitting(true);
    try {
      const targetClassId =
        selectedClassId && selectedClassId !== 'all'
          ? selectedClassId
          : selectedStudent?.kelas_id || selectedStudent?.class_id || undefined;

      const payload = {
        student_id: selectedStudentId,
        class_id: targetClassId,
        type: setoranType,
        juz,
        surah_number: surahNumber,
        ayat_start: ayatStart,
        ayat_end: ayatEnd,
        kelancaran,
        tajwid,
        makhraj,
        notes_teacher: notes.trim() || undefined,
      };

      await mobileApiService.createTeacherTahfizh(payload);

      setFeedback({
        visible: true,
        type: 'success',
        title: 'Setoran Berhasil Disimpan! 📖',
        message: `Setoran ${setoranType} Surah ${selectedSurah?.nama_latin || surahNumber} (Ayat ${ayatStart}–${ayatEnd}) untuk ${selectedStudent?.nama_lengkap || 'Santri'} berhasil dicatat ke sistem.`,
      });

      setNotes('');
      // Update kelanjutan ayat setoran berikutnya HANYA jika bukan Murajaah (Ziyadah/Tasmi/Ujian)
      if (setoranType !== 'Murajaah' && selectedSurah && ayatEnd < selectedSurah.jumlah_ayat) {
        const nextStart = ayatEnd + 1;
        setAyatStart(nextStart);
        setAyatEnd(Math.min(nextStart + 9, selectedSurah.jumlah_ayat));
        setJuz(getQuranJuz(surahNumber, nextStart));
      } else if (setoranType !== 'Murajaah') {
        setSurahNumber(0);
        setAyatStart(1);
        setAyatEnd(1);
        setLastHafalanInfo(null);
      }

      await loadData();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Setoran',
        message: getApiErrorMessage(err, 'Terjadi kendala saat menyimpan setoran tahfizh.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Gabungan rombel/kelas dari jadwal dan data siswa
  const availableClasses = useMemo(() => {
    const list: { id: string; name: string }[] = [...classes];
    const seen = new Set<string>(classes.map((c) => String(c.id)));
    for (const s of students) {
      const cid = s.kelas_id || s.class_id;
      const cname = s.kelas?.nama_kelas || s.class?.name || (cid ? `Kelas ${cid}` : null);
      if (cid && cname && !seen.has(String(cid))) {
        seen.add(String(cid));
        list.push({ id: String(cid), name: cname });
      }
    }
    return list;
  }, [classes, students]);

  // Otomatis pilih rombel pertama saat data rombel tersedia jika belum ada rombel terpilih
  useEffect(() => {
    if (availableClasses.length > 0 && !selectedClassId) {
      setSelectedClassId(String(availableClasses[0].id));
    }
  }, [availableClasses, selectedClassId]);

  // Fetch siswa khusus rombel terpilih (selaras dengan web-dashboard yang mengambil siswa per kelas)
  useEffect(() => {
    if (!selectedClassId) return;
    let isMounted = true;
    const fetchClassStudents = async () => {
      try {
        const params: any = { per_page: 500 };
        if (selectedClassId !== 'all') {
          params.class_id = selectedClassId;
        }
        const res = await mobileApiService.getTeacherStudents(params);
        if (isMounted) {
          const list = unwrapCollection(res);
          if (Array.isArray(list)) {
            setStudents(list);
          }
        }
      } catch (e) {
        console.error('Failed to fetch students for class', e);
      }
    };
    fetchClassStudents();
    return () => {
      isMounted = false;
    };
  }, [selectedClassId]);

  // Objek Rombel terpilih
  const selectedClass = useMemo(() => {
    if (selectedClassId === 'all') {
      return { id: 'all', name: 'Semua Rombel Halaqah' };
    }
    return availableClasses.find((c) => String(c.id) === String(selectedClassId)) || availableClasses[0] || null;
  }, [availableClasses, selectedClassId]);

  // Santri yang berada khusus di dalam rombel terpilih
  const studentsInSelectedClass = useMemo(() => {
    if (!selectedClassId) return [];
    if (selectedClassId === 'all') return students;
    return students.filter(
      (s) => String(s.kelas_id || s.class_id || s.kelas?.id || '') === String(selectedClassId)
    );
  }, [students, selectedClassId]);

  // Sinkronisasi santri pertama saat rombel berganti (tanpa auto-generate hafalan)
  useEffect(() => {
    if (studentsInSelectedClass.length > 0) {
      const isCurrentInClass = studentsInSelectedClass.some(
        (s) => String(s.id) === String(selectedStudentId)
      );
      if (!isCurrentInClass) {
        const firstSid = String(studentsInSelectedClass[0].id);
        setSelectedStudentId(firstSid);
        setLastHafalanInfo(null);
        setSurahNumber(0);
        setAyatStart(1);
        setAyatEnd(1);
      }
    } else {
      setSelectedStudentId('');
      setLastHafalanInfo(null);
      setSurahNumber(0);
      setAyatStart(1);
      setAyatEnd(1);
    }
  }, [studentsInSelectedClass, selectedStudentId]);

  // Filtered Students untuk Modal Picker (hanya santri di rombel terpilih)
  const filteredStudents = useMemo(() => {
    const q = studentSearch.toLowerCase().trim();
    return studentsInSelectedClass.filter((s) => {
      const matchName = (s.nama_lengkap || s.full_name || '').toLowerCase().includes(q);
      const matchNis = (s.nis || s.nisn || '').toLowerCase().includes(q);
      return matchName || matchNis;
    });
  }, [studentsInSelectedClass, studentSearch]);

  // Filtered Surahs for Picker Modal
  const filteredSurahs = useMemo(() => {
    const q = surahSearch.toLowerCase().trim();
    return surahs.filter((s) => {
      return (
        s.nama_latin.toLowerCase().includes(q) ||
        String(s.nomor).includes(q) ||
        s.nama.toLowerCase().includes(q)
      );
    });
  }, [surahs, surahSearch]);

  // Base riwayat logs untuk rombel yang dipilih
  const classLogsBase = useMemo(() => {
    if (!selectedClassId || selectedClassId === 'all') return tahfizhLogs;
    return tahfizhLogs.filter((log: any) => {
      const lClassId = log.class_id || log.student?.kelas_id || log.student?.class_id || log.student?.kelas?.id;
      return String(lClassId) === String(selectedClassId);
    });
  }, [tahfizhLogs, selectedClassId]);

  // Hitungan per jenis setoran untuk chip filter di Tab Riwayat
  const typeCounts = useMemo(() => {
    const counts = { all: classLogsBase.length, Ziyadah: 0, Murajaah: 0, Tasmi: 0, Ujian: 0 };
    for (const log of classLogsBase) {
      const rawT = log.metadata?.type || log.type || (log.hafalan_surah_number ? 'Ziyadah' : 'Murajaah');
      const t = String(rawT).toLowerCase() === 'murojaah' ? 'Murajaah' : rawT;
      if (t === 'Murajaah') counts.Murajaah++;
      else if (t === 'Tasmi' || t === "Tasmi'") counts.Tasmi++;
      else if (t === 'Ujian') counts.Ujian++;
      else counts.Ziyadah++;
    }
    return counts;
  }, [classLogsBase]);

  // Riwayat setoran difilter jenis setoran & kata kunci pencarian
  const classFilteredLogs = useMemo(() => {
    let list = classLogsBase;
    if (logsTypeFilter !== 'all') {
      list = list.filter((log: any) => {
        const rawT = log.metadata?.type || log.type || (log.hafalan_surah_number ? 'Ziyadah' : 'Murajaah');
        const t = String(rawT).toLowerCase() === 'murojaah' ? 'Murajaah' : rawT;
        if (logsTypeFilter === 'Tasmi') return t === 'Tasmi' || t === "Tasmi'";
        return t.toLowerCase() === logsTypeFilter.toLowerCase();
      });
    }
    if (logsSearchQuery.trim()) {
      const q = logsSearchQuery.trim().toLowerCase();
      list = list.filter((log: any) => {
        const sName = (log.student?.nama_lengkap || log.student?.name || '').toLowerCase();
        const sNis = String(log.student?.nis || log.student?.nisn || '');
        const surah = (log.hafalan_surah_name || '').toLowerCase();
        const notes = (log.notes_teacher || '').toLowerCase();
        return sName.includes(q) || sNis.includes(q) || surah.includes(q) || notes.includes(q);
      });
    }
    return list;
  }, [classLogsBase, logsTypeFilter, logsSearchQuery]);

  // Top 5 Students Leaderboard (Selaras dengan Web-Dashboard: totalAyat desc, completedSurahs desc, totalSetoran desc)
  const topStudents = useMemo(() => {
    const sourceLogs = classLogsBase;
    const studentMap = new Map<string, any>();

    // Populasi data santri dari state students
    students.forEach((s) => {
      if (s?.id) {
        studentMap.set(String(s.id), {
          ...s,
          nama_lengkap: s.nama_lengkap || s.full_name || s.name || 'Santri',
          nis: s.nis || s.nisn || '-',
          unit_name: s.education_unit?.name || s.unit?.name || s.kelas?.unit_pendidikan?.name || s.unit_name || (user as any)?.unit?.name || (user?.metadata as any)?.unit_name || 'Unit Pendidikan',
          class_name: s.kelas?.nama_kelas || s.class_name || (selectedClass ? selectedClass.name : 'Rombel'),
        });
      }
    });

    // Populasi tambahan dari riwayat logs jika ada santri yang belum terdaftar di state students
    sourceLogs.forEach((log) => {
      if (log.student?.id && !studentMap.has(String(log.student.id))) {
        const s = log.student;
        studentMap.set(String(s.id), {
          ...s,
          id: s.id,
          nama_lengkap: s.nama_lengkap || s.full_name || s.name || 'Santri',
          nis: s.nis || s.nisn || '-',
          unit_name: s.education_unit?.name || s.unit?.name || log.class_model?.unit_pendidikan?.name || (user as any)?.unit?.name || (user?.metadata as any)?.unit_name || 'Unit Pendidikan',
          class_name: log.class_model?.nama_kelas || s.kelas?.nama_kelas || 'Rombel',
        });
      }
    });

    const allList = Array.from(studentMap.values());

    const rankedList = allList.map((student) => {
      const studentLogs = sourceLogs
        .filter((log) => String(log.student_id) === String(student.id) || String(log.student?.id) === String(student.id))
        .sort((a, b) => String(b.record_date || '').localeCompare(String(a.record_date || '')));

      const latest = studentLogs[0] || null;

      // Hitung hanya setoran hafalan baru (Ziyadah) tervalidasi dengan interval merging
      const ziyadahLogs = studentLogs.filter((log) => {
        const rawT = String(log.metadata?.type || log.type || (log.hafalan_surah_number ? 'Ziyadah' : 'Murajaah')).toLowerCase();
        const isValidated = !log.status || ['approved', 'verified', 'finalized'].includes(String(log.status).toLowerCase());
        return rawT !== 'murajaah' && rawT !== 'murojaah' && !!log.hafalan_surah_number && isValidated;
      });

      const surahMap: Record<string, Array<{ start: number; end: number }>> = {};
      ziyadahLogs.forEach((log) => {
        const sNum = String(log.hafalan_surah_number);
        if (!surahMap[sNum]) surahMap[sNum] = [];
        const start = Number(log.hafalan_ayah_start || 1);
        const end = Number(log.hafalan_ayah_end || start);
        if (start <= end) surahMap[sNum].push({ start, end });
      });

      let totalAyat = 0;
      let completedSurahs = 0;
      Object.entries(surahMap).forEach(([sNum, ranges]) => {
        if (!ranges.length) return;
        ranges.sort((a, b) => a.start - b.start);
        const merged = [ranges[0]];
        for (let i = 1; i < ranges.length; i++) {
          const cur = ranges[i];
          const prev = merged[merged.length - 1];
          if (cur.start <= prev.end + 1) {
            prev.end = Math.max(prev.end, cur.end);
          } else {
            merged.push(cur);
          }
        }
        const surahAyats = merged.reduce((acc, r) => acc + (r.end - r.start + 1), 0);
        totalAyat += surahAyats;
        const qSurah = surahs.find((s) => Number(s.nomor) === Number(sNum));
        if (qSurah && surahAyats >= Number(qSurah.jumlah_ayat)) {
          completedSurahs++;
        }
      });

      const totalSetoran = studentLogs.length;
      const unitName = student.unit_name || (user as any)?.unit?.name || 'Unit Pendidikan';
      const className = student.class_name || 'Rombel';

      const lastSurahName = latest?.hafalan_surah_name || (latest?.hafalan_surah_number ? `Surah #${latest.hafalan_surah_number}` : 'Belum setoran');
      const lastAyahRange = latest ? `Ayat ${latest.hafalan_ayah_start || 1}–${latest.hafalan_ayah_end || 1}` : '—';
      const lastJuz = latest ? (latest.metadata?.juz || getQuranJuz(Number(latest.hafalan_surah_number) || 1, Number(latest.hafalan_ayah_start) || 1)) : '—';

      return {
        student,
        latest,
        totalAyat,
        completedSurahs,
        totalSetoran,
        unitName,
        className,
        lastSurahName,
        lastAyahRange,
        lastJuz,
      };
    });

    return rankedList
      .filter((item) => item.totalSetoran > 0 || item.totalAyat > 0)
      .sort((a, b) => {
        if (b.totalAyat !== a.totalAyat) return b.totalAyat - a.totalAyat;
        if (b.completedSurahs !== a.completedSurahs) return b.completedSurahs - a.completedSurahs;
        const nameCompare = (a.student.nama_lengkap || '').localeCompare(b.student.nama_lengkap || '');
        if (nameCompare !== 0) return nameCompare;
        return String(a.student.id || '').localeCompare(String(b.student.id || ''));
      })
      .slice(0, 5);
  }, [students, classLogsBase, selectedClass, surahs]);

  // Muat data Laporan Tahfizh sesuai filter rombel
  const fetchTahfizhReport = useCallback(async () => {
    setReportLoading(true);
    try {
      const params: any = { per_page: 500 };
      if (selectedClassId && selectedClassId !== 'all') {
        params.class_id = selectedClassId;
      }
      const res: any = await mobileApiService.getTahfizhReport(params);
      if (res) {
        if (res.summary) {
          setReportSummary(res.summary);
        }
        const logs = unwrapCollection(res);
        if (logs.length > 0) {
          setReportLogs(logs);
        }
      }
    } catch (e) {
      console.warn('Failed to load tahfizh report:', e);
    } finally {
      setReportLoading(false);
    }
  }, [selectedClassId]);

  useEffect(() => {
    if (activeTab === 'report') {
      void fetchTahfizhReport();
    }
  }, [activeTab, fetchTahfizhReport]);

  // Ringkasan KPI Eksekutif Laporan Tahfizh
  const effectiveSummary = useMemo(() => {
    const rawLogs = reportLogs.length > 0 ? reportLogs : tahfizhLogs;
    const isFiltered = Boolean(selectedClassId && selectedClassId !== 'all');
    const logs = isFiltered
      ? rawLogs.filter((log: any) => {
          const lClassId = log.class_id || log.student?.kelas_id || log.student?.class_id || log.student?.kelas?.id;
          return String(lClassId) === String(selectedClassId);
        })
      : rawLogs;

    const fallbackSiswaCount = new Set(logs.map((l) => String(l.student_id || l.student?.id)).filter(Boolean)).size || studentsInSelectedClass.length;
    const fallbackBaris = logs.reduce((acc, l) => acc + (Number(l.hafalan_baris) || 0), 0);
    const fallbackTilawah = logs.reduce((acc, l) => acc + (Number(l.tilawah_baris) || 0), 0);
    const fallbackMurajaah = logs.reduce((acc, l) => acc + (Number(l.murajaah_lembar) || 0), 0);
    const fallbackZiyadah = logs.filter((l) => {
      const rawT = (l.metadata?.type || l.type || (l.hafalan_surah_number ? 'Ziyadah' : 'Murajaah')).toLowerCase();
      if (rawT === 'murajaah' || rawT === 'murojaah') return false;
      return rawT === 'ziyadah' || Boolean(l.hafalan_surah_number);
    }).length;
    const fallbackMur = logs.filter((l) => {
      const rawT = (l.metadata?.type || l.type || '').toLowerCase();
      return rawT === 'murajaah' || rawT === 'murojaah' || Number(l.murajaah_lembar) > 0;
    }).length;
    const fallbackTasmi = logs.filter((l) => l.metadata?.type === 'Tasmi').length;
    const fallbackUjian = logs.filter((l) => l.metadata?.type === 'Ujian').length;

    return {
      total_logs: isFiltered ? logs.length : (reportSummary?.total_logs ?? logs.length),
      total_siswa: isFiltered ? fallbackSiswaCount : (reportSummary?.total_siswa ?? fallbackSiswaCount),
      total_hafalan_baris: isFiltered ? fallbackBaris : (reportSummary?.total_hafalan_baris ?? fallbackBaris),
      total_tilawah_baris: isFiltered ? fallbackTilawah : (reportSummary?.total_tilawah_baris ?? fallbackTilawah),
      total_murajaah_lembar: isFiltered ? fallbackMurajaah : (reportSummary?.total_murajaah_lembar ?? fallbackMurajaah),
      total_ziyadah: isFiltered ? fallbackZiyadah : (reportSummary?.total_ziyadah ?? fallbackZiyadah),
      total_murajaah: isFiltered ? fallbackMur : (reportSummary?.total_murajaah ?? fallbackMur),
      total_tasmi: isFiltered ? fallbackTasmi : (reportSummary?.total_tasmi ?? fallbackTasmi),
      total_ujian: isFiltered ? fallbackUjian : (reportSummary?.total_ujian ?? fallbackUjian),
      persentase: reportSummary?.persentase ?? 0,
      target_lines: (selectedClass as any)?.target_lines || reportSummary?.target_baris || reportSummary?.target_lines,
    };
  }, [reportSummary, reportLogs, tahfizhLogs, studentsInSelectedClass, selectedClassId, selectedClass]);

  // Data Rekap Roster Santri untuk Tab Laporan
  const studentReportList = useMemo(() => {
    const q = reportSearchQuery.toLowerCase().trim();
    const sourceLogs = reportLogs.length > 0 ? reportLogs : tahfizhLogs;

    // Gabungkan siswa aktif dan siswa dari catatan setoran
    const studentMap = new Map<string, any>();
    students.forEach((s) => {
      if (s?.id) studentMap.set(String(s.id), s);
    });
    sourceLogs.forEach((l) => {
      if (l.student?.id && !studentMap.has(String(l.student.id))) {
        studentMap.set(String(l.student.id), {
          ...l.student,
          kelas_id: l.class_id || l.student?.kelas_id || l.student?.class_id,
          class_id: l.class_id || l.student?.kelas_id || l.student?.class_id,
        });
      }
    });
    const combined = Array.from(studentMap.values());

    // Filter santri berdasarkan rombel dan kata kunci pencarian
    const filtered = combined.filter((s) => {
      const sClassId = s.kelas_id || s.class_id || s.kelas?.id;
      const matchClass =
        !selectedClassId ||
        selectedClassId === 'all' ||
        String(sClassId) === String(selectedClassId);
      const matchSearch =
        !q ||
        (s.nama_lengkap || s.full_name || s.name || '').toLowerCase().includes(q) ||
        (s.nis || s.nisn || '').toLowerCase().includes(q);
      return matchClass && matchSearch;
    });

    return filtered.map((s) => {
      const sid = String(s.id);
      const sLogs = sourceLogs
        .filter((l) => String(l.student_id || l.student?.id) === sid)
        .sort((a, b) => {
          const dateA = new Date(a.record_date || a.created_at || 0).getTime();
          const dateB = new Date(b.record_date || b.created_at || 0).getTime();
          return dateB - dateA;
        });
      const latestLog = sLogs[0];
      const setoranCount = sLogs.length;
      const totalBaris = sLogs.reduce((acc, l) => acc + (Number(l.hafalan_baris) || 0), 0);
      const totalLembar = sLogs.reduce((acc, l) => acc + (Number(l.murajaah_lembar) || 0), 0);

      const surahName =
        latestLog?.hafalan_surah_name ||
        latestLog?.surah_name ||
        latestLog?.metadata?.surah_name ||
        (latestLog?.hafalan_surah_number ? `Surah #${latestLog.hafalan_surah_number}` : null);
      const aStart = latestLog?.hafalan_ayat_start ?? latestLog?.ayat_mulai ?? latestLog?.metadata?.ayat_start;
      const aEnd = latestLog?.hafalan_ayat_end ?? latestLog?.ayat_selesai ?? latestLog?.metadata?.ayat_end;
      const lastSurahDisplay = surahName
        ? `${surahName}${aStart && aEnd ? ` (${aStart}–${aEnd})` : ''}`
        : 'Belum Ada Setoran';

      const lastDate =
        latestLog?.record_date || latestLog?.date || latestLog?.tanggal || latestLog?.created_at;
      const lastDateDisplay = lastDate
        ? new Date(lastDate).toLocaleDateString('id-ID', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
          })
        : '-';

      const kelancaranText =
        latestLog?.kelancaran_label ||
        latestLog?.kelancaran ||
        latestLog?.metadata?.kelancaran ||
        (setoranCount > 0 ? 'Lancar' : 'Belum Ada');

      return {
        student: s,
        setoranCount,
        totalBaris,
        totalLembar,
        latestLog,
        lastSurahDisplay,
        lastDateDisplay,
        kelancaranText,
      };
    });
  }, [students, reportLogs, tahfizhLogs, selectedClassId, reportSearchQuery]);

  const totalLinesHafalan = useMemo(() => {
    return tahfizhLogs.reduce((acc, l) => acc + (Number(l.hafalan_baris) || Number(l.total_baris) || 0), 0);
  }, [tahfizhLogs]);

  const academicInfo = useMemo(() => {
    return getDynamicAcademicInfo(selectedClass || classes[0]);
  }, [selectedClass, classes]);

  // Data cetak rapor untuk santri terpilih
  const printStudentTahfizhData = useMemo(() => {
    if (!printReportStudent) return undefined;
    const sid = String(printReportStudent.id);
    const sourceLogs = reportLogs.length > 0 ? reportLogs : tahfizhLogs;
    const sLogs = sourceLogs.filter((l) => String(l.student_id) === sid);
    const latest = sLogs[0];
    const totalLines = sLogs.reduce((acc, l) => acc + (Number(l.hafalan_baris) || 0), 0);

    const surahName =
      latest?.hafalan_surah_name ||
      latest?.surah_name ||
      latest?.metadata?.surah_name;
    const aStart = latest?.hafalan_ayat_start ?? latest?.ayat_mulai ?? latest?.metadata?.ayat_start;
    const aEnd = latest?.hafalan_ayat_end ?? latest?.ayat_selesai ?? latest?.metadata?.ayat_end;
    const lastSurah = surahName
      ? `Surah ${surahName}${aStart && aEnd ? ` (${aStart}–${aEnd})` : ''}`
      : '-';

    const lastDate =
      latest?.record_date || latest?.date || latest?.tanggal || latest?.created_at;
    const lastDepositDate = lastDate
      ? new Date(lastDate).toLocaleDateString('id-ID', {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        })
      : '-';

    return {
      lastSurah,
      lastDepositDate,
      totalLines: `${totalLines} Baris`,
      targetLines: (selectedClass as any)?.target_lines
        ? `${(selectedClass as any).target_lines} Baris`
        : reportSummary?.target_baris
        ? `${reportSummary.target_baris} Baris`
        : 'Standar Kurikulum',
      status: latest ? (latest.kelancaran_label || latest.kelancaran || latest.metadata?.kelancaran || 'Lancar') : 'Belum Ada Setoran',
    };
  }, [printReportStudent, reportLogs, tahfizhLogs, selectedClass]);

  return (
    <View style={styles.rootContainer}>
      {/* ── Background Mosque & School (Identik Halaman Utama & Jadwal Pelajaran) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien berbasis warna #18A165 identik dengan Jadwal Pelajaran & Halaman Utama */}
        <LinearGradient
          colors={[
            'rgba(24, 161, 101, 0.18)',
            'rgba(24, 161, 101, 0.40)',
            'rgba(240, 253, 244, 0.95)',
            '#F0FDF4',
          ]}
          locations={[0, 0.28, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN JADWAL PELAJARAN TU (TuScheduleWorkspace) ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={onBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 42 }} />
          )}

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerBadgeText} numberOfLines={1} ellipsizeMode="tail">
                {isPrincipal ? 'KEPALA SEKOLAH • MONITORING TAHFIZH' : 'GURU HALAQAH • JURNAL & TAHFIZH'}
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              {isPrincipal ? 'Monitoring & Rekap Tahfizh' : 'Jurnal & Setoran Halaqah'}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {selectedClass ? selectedClass.name : 'Semua Rombel Halaqah'} · {tahfizhLogs.length} Setoran
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            {activeTab === 'input' && !isPrincipal && (
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleSubmit}
                disabled={submitting || !selectedStudentId}
                style={[
                  styles.refreshButton,
                  { backgroundColor: '#ECFDF5', borderColor: '#059669' },
                  (submitting || !selectedStudentId) && { opacity: 0.6 },
                ]}
                accessibilityRole="button"
                accessibilityLabel="Simpan Setoran"
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#047857" />
                ) : (
                  <MaterialCommunityIcons name="content-save" size={20} color="#047857" />
                )}
              </TouchableOpacity>
            )}

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                void loadData();
              }}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Muat Ulang"
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── TAB SWITCHER TETAP MUNCUL DI HEADER (TIDAK IKUT SCROLL HALAMAN BODI) ── */}
        <View style={styles.tahfizhTabsWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tahfizhTabsScroll}
          >
            {(isPrincipal
              ? [
                  { id: 'logs', label: `Monitoring (${tahfizhLogs.length})`, icon: 'history' },
                  { id: 'report', label: 'Rekap & Laporan', icon: 'file-chart-outline' },
                  { id: 'leaderboard', label: 'Top 5', icon: 'trophy-outline' },
                ]
              : [
                  { id: 'input', label: 'Input Setoran', icon: 'plus-circle-outline' },
                  { id: 'logs', label: `Riwayat (${tahfizhLogs.length})`, icon: 'history' },
                  { id: 'leaderboard', label: 'Top 5', icon: 'trophy-outline' },
                  { id: 'report', label: 'Laporan', icon: 'file-chart-outline' },
                ]
            ).map((item) => {
              const isActive = activeTab === item.id;
              return (
                <TouchableOpacity
                  key={item.id}
                  activeOpacity={0.85}
                  style={[styles.tahfizhTabPill, isActive && styles.tahfizhTabPillActive]}
                  onPress={() => setActiveTab(item.id as any)}
                >
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={16}
                    color={isActive ? '#FFFFFF' : '#047857'}
                  />
                  <Text
                    style={[
                      styles.tahfizhTabPillText,
                      isActive && styles.tahfizhTabPillTextActive,
                    ]}
                  >
                    {item.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </View>

      {/* ── MAIN SHEET CONTAINER ── */}
      <View style={styles.sheetContainer}>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[
            styles.cleanMainScrollContent,
            { paddingBottom: Math.max(bottomInset + 80, 100) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadData();
              }}
              tintColor="#0E5C44"
              colors={['#059669', '#10B981']}
            />
          }
        >
          <View style={styles.bodyContentWrapper}>
            {/* ── 3 KPI STATS CARDS: STANDAR EMAS KISI-KISI UJIAN & JADWAL ── */}
            <View style={styles.kpiCardsRow}>
              {/* Card 1: Total Setoran (Emerald) */}
              <View style={[styles.kpiCardItem, { borderColor: '#A7F3D0' }]}>
                <LinearGradient colors={['#FFFFFF', '#ECFDF5']} style={styles.kpiCardGradient}>
                  <View style={styles.kpiCardTopRow}>
                    <View style={[styles.kpiIconSquare, { backgroundColor: '#059669' }]}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={15} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiCardValue, { color: '#064E3B' }]}>{tahfizhLogs.length}</Text>
                  </View>
                  <Text style={[styles.kpiCardLabel, { color: '#047857' }]} numberOfLines={1}>Total Setoran</Text>
                  <Text style={styles.kpiCardSub} numberOfLines={1}>Jurnal Tercatat</Text>
                </LinearGradient>
              </View>

              {/* Card 2: Baris Mushaf (Sky) */}
              <View style={[styles.kpiCardItem, { borderColor: '#BAE6FD' }]}>
                <LinearGradient colors={['#FFFFFF', '#F0F9FF']} style={styles.kpiCardGradient}>
                  <View style={styles.kpiCardTopRow}>
                    <View style={[styles.kpiIconSquare, { backgroundColor: '#0284C7' }]}>
                      <MaterialCommunityIcons name="format-line-spacing" size={15} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiCardValue, { color: '#075985' }]}>{totalLinesHafalan}</Text>
                  </View>
                  <Text style={[styles.kpiCardLabel, { color: '#0284C7' }]} numberOfLines={1}>Baris Mushaf</Text>
                  <Text style={styles.kpiCardSub} numberOfLines={1}>Mushaf Madinah</Text>
                </LinearGradient>
              </View>

              {/* Card 3: Santri Binaan (Amber) */}
              <View style={[styles.kpiCardItem, { borderColor: '#FDE68A' }]}>
                <LinearGradient colors={['#FFFFFF', '#FFFBEB']} style={styles.kpiCardGradient}>
                  <View style={styles.kpiCardTopRow}>
                    <View style={[styles.kpiIconSquare, { backgroundColor: '#D97706' }]}>
                      <MaterialCommunityIcons name="account-group" size={15} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiCardValue, { color: '#78350F' }]}>{studentsInSelectedClass.length}</Text>
                  </View>
                  <Text style={[styles.kpiCardLabel, { color: '#B45309' }]} numberOfLines={1}>Santri Binaan</Text>
                  <Text style={styles.kpiCardSub} numberOfLines={1}>{selectedClass ? selectedClass.name : 'Semua Rombel'}</Text>
                </LinearGradient>
              </View>
            </View>

          {/* Dynamic Academic Year & Semester Pill */}
          <View style={styles.academicInfoPill}>
            <MaterialCommunityIcons name="calendar-range" size={13} color="#059669" />
            <Text style={styles.academicInfoText}>Tahun Ajaran: {academicInfo}</Text>
          </View>

          {/* Card Pemilih Rombel / Kelas Halaqah Terpadu (Tersedia & Aktif di Seluruh 4 Tab: Input, Riwayat, Top 5, Laporan) */}
          <View style={styles.globalRombelSelectorCard}>
            <View style={styles.globalRombelHeaderRow}>
              <View style={styles.globalRombelLeft}>
                <View style={styles.globalRombelIcon}>
                  <MaterialCommunityIcons name="google-classroom" size={18} color="#047857" />
                </View>
                <View>
                  <Text style={styles.globalRombelTitle}>Rombel / Kelas Halaqah</Text>
                  <Text style={styles.globalRombelSub}>
                    Menyaring data santri, riwayat, peringkat, & laporan
                  </Text>
                </View>
              </View>
              <View style={styles.globalRombelBadge}>
                <Text style={styles.globalRombelBadgeText}>
                  {availableClasses.length} Rombel
                </Text>
              </View>
            </View>

            <TouchableOpacity
              onPress={() => setClassPickerVisible(true)}
              style={styles.globalRombelBtn}
              activeOpacity={0.8}
            >
              <View style={styles.globalRombelBtnContent}>
                <View style={styles.globalClassAvatar}>
                  <MaterialCommunityIcons name="school" size={20} color="#047857" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.globalClassNameText} numberOfLines={1}>
                    {selectedClass ? selectedClass.name : 'Pilih Rombel / Kelas Halaqah'}
                  </Text>
                  <Text style={styles.globalClassSubText}>
                    {selectedClassId === 'all'
                      ? `Menampilkan seluruh ${students.length} santri binaan`
                      : `${studentsInSelectedClass.length} Santri binaan terdaftar di rombel ini`}
                  </Text>
                </View>
                <View style={styles.globalRombelArrow}>
                  <Text style={styles.globalRombelChangeText}>Ganti</Text>
                  <MaterialCommunityIcons name="chevron-down" size={18} color="#047857" />
                </View>
              </View>
            </TouchableOpacity>
          </View>

          {/* Main Content Area */}
          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loaderText}>Memuat data halaqah tahfizh...</Text>
            </View>
          ) : activeTab === 'input' ? (
            /* TAB 1: FORM INPUT SETORAN TAHFIZH */
            <View style={styles.formContainer}>
              {/* 1. Pilih Santri Halaqah */}
              <View style={styles.fieldSection}>
                <View style={styles.fieldLabelRow}>
                  <Text style={styles.fieldLabel}>
                    1. Pilih Santri Halaqah <Text style={styles.requiredMark}>*</Text>
                  </Text>
                  <Text style={styles.fieldHelperText}>
                    ({selectedClass?.name || 'Rombel'}: {studentsInSelectedClass.length} Santri)
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => setStudentPickerVisible(true)}
                  style={[styles.pickerSelector, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
                  activeOpacity={0.8}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: '#E0F2FE', borderColor: '#7DD3FC', borderWidth: 1 }]}>
                    <Text style={[styles.pickerAvatarText, { color: '#0284C7' }]}>
                      {selectedStudent ? (selectedStudent.nama_lengkap || 'S').slice(0, 2).toUpperCase() : '?'}
                    </Text>
                  </View>
                  <View style={styles.pickerMeta}>
                    <Text style={[styles.pickerTitle, { color: '#0369A1' }]} numberOfLines={1}>
                      {selectedStudent?.nama_lengkap || (studentsInSelectedClass.length === 0 ? 'Tidak ada santri di rombel ini' : 'Pilih Santri Rombel')}
                    </Text>
                    <Text style={[styles.pickerSub, { color: '#0284C7' }]}>
                      NIS: {selectedStudent?.nis || selectedStudent?.nisn || '-'} · {selectedStudent?.kelas?.nama_kelas || selectedClass?.name || '-'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={22} color="#0284C7" />
                </TouchableOpacity>
              </View>

              {/* Tombol & Status Lanjutkan Tahfizh Otomatis */}
              <View style={styles.continueSection}>
                <TouchableOpacity
                  onPress={() => void handleOpenContinueModal()}
                  disabled={loadingContinue || !selectedStudentId}
                  style={[styles.continueButton, (!selectedStudentId || loadingContinue) && { opacity: 0.7 }]}
                  activeOpacity={0.85}
                >
                  <LinearGradient
                    colors={
                      lastHafalanInfo?.isFirst
                        ? ['#0369A1', '#0284C7', '#0EA5E9']
                        : ['#047857', '#059669', '#0D9488']
                    }
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.continueGradient}
                  >
                    {loadingContinue ? (
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    ) : (
                      <MaterialCommunityIcons
                        name={lastHafalanInfo?.isFirst ? 'seed-outline' : 'auto-fix'}
                        size={19}
                        color={lastHafalanInfo?.isFirst ? '#BAE6FD' : '#FDE047'}
                      />
                    )}
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text style={styles.continueBtnTitle}>
                        {lastHafalanInfo?.isFirst
                          ? '🌱 Hafalan Perdana (Santri Baru)'
                          : '✨ Lanjutkan Tahfizh Otomatis'}
                      </Text>
                      <Text style={styles.continueBtnSub}>
                        {lastHafalanInfo?.isFirst
                          ? 'Belum ada riwayat setoran · Buka dialog untuk tentukan surah & ayat perdana'
                          : lastHafalanInfo?.lastSurahName
                          ? `Lanjutan aktif: Surah ${lastHafalanInfo.nextSurahName} (${lastHafalanInfo.nextAyahStart}–${lastHafalanInfo.nextAyahEnd})`
                          : 'Buka dialog deteksi riwayat & pilih lanjutan ayat santri'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#FFFFFF" />
                  </LinearGradient>
                </TouchableOpacity>

                {lastHafalanInfo && (
                  <View
                    style={[
                      styles.lastInfoBanner,
                      lastHafalanInfo.hasPendingMurajaah
                        ? styles.lastInfoBannerWarning
                        : lastHafalanInfo.isFirst
                        ? [styles.lastInfoBannerSuccess, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]
                        : styles.lastInfoBannerSuccess,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={
                        lastHafalanInfo.hasPendingMurajaah
                          ? 'alert-circle-outline'
                          : lastHafalanInfo.isFirst
                          ? 'information-outline'
                          : 'history'
                      }
                      size={16}
                      color={
                        lastHafalanInfo.hasPendingMurajaah
                          ? '#B45309'
                          : lastHafalanInfo.isFirst
                          ? '#0284C7'
                          : '#047857'
                      }
                    />
                    <Text
                      style={[
                        styles.lastInfoBannerText,
                        lastHafalanInfo.hasPendingMurajaah
                          ? { color: '#92400E' }
                          : lastHafalanInfo.isFirst
                          ? { color: '#0369A1' }
                          : { color: '#065F46' },
                      ]}
                    >
                      {lastHafalanInfo.hasPendingMurajaah ? (
                        `Perhatian: Ada Murajaah di Rumah belum diverifikasi: Surah ${lastHafalanInfo.pendingMurajaahInfo?.surah_name || '-'} (${lastHafalanInfo.pendingMurajaahInfo?.ayah_start}–${lastHafalanInfo.pendingMurajaahInfo?.ayah_end})`
                      ) : lastHafalanInfo.isFirst ? (
                        'Santri baru: Belum ada setoran sebelumnya. Silakan tentukan surah & rentang ayat awal pada formulir di bawah.'
                      ) : (
                        `Setoran Terakhir: Surah ${lastHafalanInfo.lastSurahName || '-'} (Ayat ${lastHafalanInfo.lastAyatStart}–${lastHafalanInfo.lastAyatEnd})`
                      )}
                    </Text>
                  </View>
                )}
              </View>

              {/* Setoran Type & Juz Row */}
              <View style={styles.rowTwoCols}>
                <View style={[styles.fieldSection, { flex: 1 }]}>
                  <Text style={styles.fieldLabel}>Jenis Setoran</Text>
                  <View style={styles.typeButtonsRow}>
                    {[
                      { type: 'Ziyadah', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0', activeBg: '#059669' },
                      { type: 'Murajaah', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD', activeBg: '#0284C7' },
                      { type: 'Tasmi', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE', activeBg: '#7C3AED' },
                      { type: 'Ujian', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A', activeBg: '#D97706' },
                    ].map((tObj) => {
                      const isSel = setoranType === tObj.type;
                      return (
                        <TouchableOpacity
                          key={tObj.type}
                          onPress={() => setSetoranType(tObj.type)}
                          style={[
                            styles.typePill,
                            {
                              backgroundColor: isSel ? tObj.activeBg : tObj.bg,
                              borderColor: isSel ? tObj.activeBg : tObj.border,
                            },
                          ]}
                        >
                          <Text
                            style={[
                              styles.typePillText,
                              {
                                color: isSel ? '#FFFFFF' : tObj.color,
                                fontWeight: isSel ? '900' : '700',
                              },
                            ]}
                          >
                            {tObj.type}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>

                <View style={[styles.fieldSection, { width: 100 }]}>
                  <Text style={styles.fieldLabel}>Juz Capaian</Text>
                  <View style={[styles.juzStepper, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                    <TouchableOpacity
                      onPress={() => setJuz((j) => Math.max(1, j - 1))}
                      style={[styles.stepperBtn, { backgroundColor: '#FEF3C7' }]}
                    >
                      <Text style={[styles.stepperBtnText, { color: '#B45309' }]}>-</Text>
                    </TouchableOpacity>
                    <Text style={[styles.juzValueText, { color: '#B45309' }]}>{juz}</Text>
                    <TouchableOpacity
                      onPress={() => setJuz((j) => Math.min(30, j + 1))}
                      style={[styles.stepperBtn, { backgroundColor: '#FEF3C7' }]}
                    >
                      <Text style={[styles.stepperBtnText, { color: '#B45309' }]}>+</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              {/* Surah Selector */}
              <View style={styles.fieldSection}>
                <Text style={styles.fieldLabel}>
                  Surah Al-Qur'an <Text style={styles.requiredMark}>*</Text>
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setSurahPickerTarget('form');
                    setSurahPickerVisible(true);
                  }}
                  style={[styles.pickerSelector, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
                >
                  <View style={[styles.pickerAvatar, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC', borderWidth: 1 }]}>
                    <Text style={[styles.pickerAvatarText, { color: '#047857' }]}>
                      {surahNumber > 0 ? surahNumber : '?'}
                    </Text>
                  </View>
                  <View style={styles.pickerMeta}>
                    <Text style={[styles.pickerTitle, { color: '#065F46' }]}>
                      {selectedSurah ? `Surah ${selectedSurah.nama_latin}` : 'Pilih Surah Al-Qur\'an'}
                    </Text>
                    <Text style={[styles.pickerSub, { color: '#047857' }]}>
                      {selectedSurah ? `${selectedSurah.nama} · ${selectedSurah.jumlah_ayat || 0} Ayat` : 'Sentuh untuk memilih surah setoran'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="book-open-outline" size={20} color="#059669" />
                </TouchableOpacity>
              </View>

            {/* Ayat Range & Line Calculator */}
            <View style={styles.fieldSection}>
              <View style={styles.labelRow}>
                <Text style={styles.fieldLabel}>Rentang Ayat Setoran</Text>
                <View style={styles.linesBadge}>
                  <MaterialCommunityIcons name="format-line-spacing" size={13} color="#047857" />
                  <Text style={styles.linesBadgeText}>
                    ≈ {calculatedLines} Baris Mushaf Madinah
                  </Text>
                </View>
              </View>

              {/* Informative Auto-Fill Helper Notice */}
              {selectedSurah && (
                <View style={styles.autoContinueNotice}>
                  <MaterialCommunityIcons
                    name={activeSurahHistory?.lastAyahEnd ? 'check-decagram' : 'information-outline'}
                    size={16}
                    color="#047857"
                  />
                  <Text style={styles.autoContinueNoticeText}>
                    {activeSurahHistory?.lastAyahEnd
                      ? `Ayat Awal otomatis terisi dari setoran terakhir (Ayat ${activeSurahHistory.lastAyahEnd}). Anda cukup mengisi Ayat Akhir yang disetorkan santri.`
                      : `Santri belum pernah setor Surah ${selectedSurah.nama_latin}. Ayat Awal otomatis dimulai dari Ayat 1.`}
                  </Text>
                </View>
              )}

              <View style={styles.rangeRow}>
                {/* Kolom Ayat Awal: Otomatis dari setoran terakhir, tetap fleksibel diedit */}
                <View style={styles.rangeCol}>
                  <View style={styles.rangeColHeader}>
                    <Text style={styles.rangeSub}>Ayat Awal</Text>
                    {activeSurahHistory?.lastAyahEnd ? (
                      <View style={styles.lastAyahChip}>
                        <Text style={styles.lastAyahChipText}>
                          Terakhir: {activeSurahHistory.lastAyahEnd}
                        </Text>
                      </View>
                    ) : (
                      <View style={[styles.lastAyahChip, { backgroundColor: '#E2E8F0' }]}>
                        <Text style={[styles.lastAyahChipText, { color: '#64748B' }]}>
                          Mulai: 1
                        </Text>
                      </View>
                    )}
                  </View>
                  <TextInput
                    keyboardType="number-pad"
                    value={String(ayatStart)}
                    onChangeText={(val) => {
                      const num = parseInt(val, 10);
                      if (!isNaN(num) && num >= 1) {
                        setAyatStart(num);
                        setJuz(getQuranJuz(surahNumber, num));
                      }
                    }}
                    style={[styles.rangeInput, styles.rangeInputStart]}
                  />
                  <Text style={styles.rangeColHelper}>
                    {activeSurahHistory?.lastAyahEnd
                      ? `✓ Lanjutan (Ayat ${activeSurahHistory.lastAyahEnd} + 1)`
                      : 'Mulai dari awal'}
                  </Text>
                </View>

                <View style={styles.rangeDivider}>
                  <Text style={styles.rangeDividerText}>s/d</Text>
                </View>

                {/* Kolom Ayat Akhir: Fokus Utama Input Guru */}
                <View style={styles.rangeCol}>
                  <View style={styles.rangeColHeader}>
                    <Text style={[styles.rangeSub, styles.rangeSubHighlight]}>
                      Ayat Akhir ⭐
                    </Text>
                    {selectedSurah && (
                      <Text style={styles.totalAyahBadge}>
                        Maks {selectedSurah.jumlah_ayat}
                      </Text>
                    )}
                  </View>
                  <TextInput
                    keyboardType="number-pad"
                    value={String(ayatEnd)}
                    onChangeText={(val) => {
                      const num = parseInt(val, 10);
                      if (!isNaN(num)) setAyatEnd(num);
                    }}
                    placeholder={selectedSurah ? `1–${selectedSurah.jumlah_ayat}` : 'Akhir'}
                    style={[styles.rangeInput, styles.rangeInputEnd]}
                  />
                  <Text style={[styles.rangeColHelper, { color: '#047857', fontWeight: '700' }]}>
                    Isi batas akhir hafalan
                  </Text>
                </View>
              </View>

              {/* Quick Increment Chips untuk Pengisian Cepat Ayat Akhir */}
              {selectedSurah && (
                <View style={styles.quickAddRow}>
                  <Text style={styles.quickAddLabel}>Cepat isi Ayat Akhir:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickAddScroll}
                  >
                    {[5, 7, 10, 15, 20].map((step) => {
                      const target = Math.min(ayatStart + step - 1, selectedSurah.jumlah_ayat);
                      if (target < ayatStart) return null;
                      const isActive = ayatEnd === target;
                      return (
                        <TouchableOpacity
                          key={step}
                          onPress={() => setAyatEnd(target)}
                          style={[styles.quickAddBtn, isActive && styles.quickAddBtnActive]}
                          activeOpacity={0.7}
                        >
                          <Text
                            style={[
                              styles.quickAddBtnText,
                              isActive && styles.quickAddBtnTextActive,
                            ]}
                          >
                            +{step} ({target})
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                    <TouchableOpacity
                      onPress={() => setAyatEnd(selectedSurah.jumlah_ayat)}
                      style={[
                        styles.quickAddBtn,
                        ayatEnd === selectedSurah.jumlah_ayat && styles.quickAddBtnActive,
                      ]}
                      activeOpacity={0.7}
                    >
                      <Text
                        style={[
                          styles.quickAddBtnText,
                          ayatEnd === selectedSurah.jumlah_ayat && styles.quickAddBtnTextActive,
                        ]}
                      >
                        Sampai Akhir ({selectedSurah.jumlah_ayat})
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                </View>
              )}

              {/* Quick Range Chips */}
              {selectedSurah && (
                <View style={styles.quickRangeRow}>
                  <Text style={styles.quickRangeLabel}>Pilihan Cepat Rentang Ayat:</Text>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.quickRangeScroll}
                  >
                    <TouchableOpacity
                      onPress={() => {
                        setAyatStart(1);
                        setAyatEnd(selectedSurah.jumlah_ayat);
                        setJuz(getQuranJuz(surahNumber, 1));
                      }}
                      style={[
                        styles.quickChip,
                        ayatStart === 1 && ayatEnd === selectedSurah.jumlah_ayat && styles.quickChipActive,
                      ]}
                    >
                      <Text
                        style={[
                          styles.quickChipText,
                          ayatStart === 1 && ayatEnd === selectedSurah.jumlah_ayat && styles.quickChipTextActive,
                        ]}
                      >
                        1–{selectedSurah.jumlah_ayat} (Semua Ayat)
                      </Text>
                    </TouchableOpacity>

                    {selectedSurah.jumlah_ayat > 5 && (
                      <TouchableOpacity
                        onPress={() => {
                          setAyatStart(1);
                          setAyatEnd(5);
                          setJuz(getQuranJuz(surahNumber, 1));
                        }}
                        style={[
                          styles.quickChip,
                          ayatStart === 1 && ayatEnd === 5 && styles.quickChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            ayatStart === 1 && ayatEnd === 5 && styles.quickChipTextActive,
                          ]}
                        >
                          1–5
                        </Text>
                      </TouchableOpacity>
                    )}

                    {selectedSurah.jumlah_ayat > 10 && (
                      <TouchableOpacity
                        onPress={() => {
                          setAyatStart(1);
                          setAyatEnd(10);
                          setJuz(getQuranJuz(surahNumber, 1));
                        }}
                        style={[
                          styles.quickChip,
                          ayatStart === 1 && ayatEnd === 10 && styles.quickChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            ayatStart === 1 && ayatEnd === 10 && styles.quickChipTextActive,
                          ]}
                        >
                          1–10
                        </Text>
                      </TouchableOpacity>
                    )}

                    {selectedSurah.jumlah_ayat > 20 && (
                      <TouchableOpacity
                        onPress={() => {
                          setAyatStart(1);
                          setAyatEnd(20);
                          setJuz(getQuranJuz(surahNumber, 1));
                        }}
                        style={[
                          styles.quickChip,
                          ayatStart === 1 && ayatEnd === 20 && styles.quickChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            ayatStart === 1 && ayatEnd === 20 && styles.quickChipTextActive,
                          ]}
                        >
                          1–20
                        </Text>
                      </TouchableOpacity>
                    )}

                    {ayatStart > 1 && (
                      <TouchableOpacity
                        onPress={() => {
                          setAyatEnd(selectedSurah.jumlah_ayat);
                        }}
                        style={[
                          styles.quickChip,
                          ayatEnd === selectedSurah.jumlah_ayat && styles.quickChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.quickChipText,
                            ayatEnd === selectedSurah.jumlah_ayat && styles.quickChipTextActive,
                          ]}
                        >
                          {ayatStart}–{selectedSurah.jumlah_ayat} (Sampai Akhir)
                        </Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>
              )}

              {/* Button Tampilkan Ayat yang Dipilih */}
              <TouchableOpacity
                onPress={() => void handlePreviewVerses(surahNumber, ayatStart, ayatEnd)}
                disabled={surahNumber <= 0}
                style={[
                  styles.previewVersesButton,
                  surahNumber <= 0 && { opacity: 0.6 },
                ]}
                activeOpacity={0.85}
              >
                <LinearGradient
                  colors={
                    surahNumber > 0
                      ? ['#047857', '#0D9488', '#0E7490']
                      : ['#94A3B8', '#64748B']
                  }
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.previewVersesGradient}
                >
                  <MaterialCommunityIcons
                    name="book-open-page-variant"
                    size={19}
                    color="#FFFFFF"
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.previewVersesTitle}>
                      Tampilkan Ayat yang Dipilih
                    </Text>
                    <Text style={styles.previewVersesSub}>
                      {selectedSurah
                        ? `Lihat teks Surah ${selectedSurah.nama_latin} (Ayat ${ayatStart}–${ayatEnd})`
                        : 'Pilih surah untuk menampilkan teks ayat'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={20}
                    color="#FFFFFF"
                  />
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Quality Evaluations (Kelancaran, Tajwid, Makhraj) Berwarna Semantik */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>Kualitas Tilawah & Kelancaran</Text>
              <View style={[styles.qualityGroup, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                {/* 1. Kelancaran */}
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityTitle}>Kelancaran:</Text>
                  {[
                    { label: 'Sangat Lancar', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
                    { label: 'Lancar', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
                    { label: 'Bimbingan', color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' },
                  ].map((k) => {
                    const isSel = kelancaran === k.label;
                    return (
                      <TouchableOpacity
                        key={k.label}
                        onPress={() => setKelancaran(k.label)}
                        style={[
                          styles.qualityPill,
                          {
                            backgroundColor: isSel ? k.color : k.bg,
                            borderColor: isSel ? k.color : k.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.qualityPillText,
                            {
                              color: isSel ? '#FFFFFF' : k.color,
                              fontWeight: isSel ? '900' : '700',
                            },
                          ]}
                        >
                          {k.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 2. Tajwid */}
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityTitle}>Tajwid:</Text>
                  {[
                    { label: 'Sangat Baik', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
                    { label: 'Baik', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
                    { label: 'Bimbingan', color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' },
                  ].map((t) => {
                    const isSel = tajwid === t.label;
                    return (
                      <TouchableOpacity
                        key={t.label}
                        onPress={() => setTajwid(t.label)}
                        style={[
                          styles.qualityPill,
                          {
                            backgroundColor: isSel ? t.color : t.bg,
                            borderColor: isSel ? t.color : t.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.qualityPillText,
                            {
                              color: isSel ? '#FFFFFF' : t.color,
                              fontWeight: isSel ? '900' : '700',
                            },
                          ]}
                        >
                          {t.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* 3. Makhraj */}
                <View style={styles.qualityRow}>
                  <Text style={styles.qualityTitle}>Makhraj:</Text>
                  {[
                    { label: 'Sangat Baik', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
                    { label: 'Baik', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
                    { label: 'Bimbingan', color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' },
                  ].map((m) => {
                    const isSel = makhraj === m.label;
                    return (
                      <TouchableOpacity
                        key={m.label}
                        onPress={() => setMakhraj(m.label)}
                        style={[
                          styles.qualityPill,
                          {
                            backgroundColor: isSel ? m.color : m.bg,
                            borderColor: isSel ? m.color : m.border,
                          },
                        ]}
                      >
                        <Text
                          style={[
                            styles.qualityPillText,
                            {
                              color: isSel ? '#FFFFFF' : m.color,
                              fontWeight: isSel ? '900' : '700',
                            },
                          ]}
                        >
                          {m.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>
            </View>

            {/* Teacher Notes */}
            <View style={styles.fieldSection}>
              <Text style={styles.fieldLabel}>Catatan Pembimbing / Ustadz</Text>
              <TextInput
                placeholder="Tuliskan catatan tajwid, ayat perlu diulang, atau target berikutnya..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={notes}
                onChangeText={setNotes}
                style={[styles.textArea, { backgroundColor: '#F8FAFC', borderColor: '#CBD5E1' }]}
              />
            </View>

            {/* Save Button dengan LinearGradient Zamrud */}
            <TouchableOpacity
              onPress={handleSubmit}
              disabled={submitting}
              style={[styles.submitButton, submitting && { opacity: 0.7 }]}
              activeOpacity={0.85}
            >
              <LinearGradient
                colors={['#047857', '#059669', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.submitGradient}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-check" size={20} color="#FFFFFF" />
                    <Text style={styles.submitButtonText}>Simpan Setoran Santri</Text>
                  </>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </View>
        ) : activeTab === 'logs' ? (
          /* TAB 2: RIWAYAT SETORAN TAHFIZH KELAS */
          <View style={styles.logsList}>
            {/* Search Bar Riwayat */}
            <View style={styles.logsSearchBox}>
              <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
              <TextInput
                placeholder="Cari santri, surah, atau catatan..."
                placeholderTextColor="#94A3B8"
                value={logsSearchQuery}
                onChangeText={setLogsSearchQuery}
                style={styles.logsSearchInput}
              />
              {logsSearchQuery ? (
                <TouchableOpacity onPress={() => setLogsSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Filter Jenis Setoran Tabs */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.typeFilterChipsScroll}>
              {[
                { id: 'all', label: 'Semua', count: typeCounts.all, color: '#059669', bg: '#ECFDF5', activeBg: '#059669' },
                { id: 'Ziyadah', label: 'Ziyadah', count: typeCounts.Ziyadah, color: '#059669', bg: '#ECFDF5', activeBg: '#059669' },
                { id: 'Murajaah', label: 'Murajaah', count: typeCounts.Murajaah, color: '#0284C7', bg: '#F0F9FF', activeBg: '#0284C7' },
                { id: 'Tasmi', label: "Tasmi'", count: typeCounts.Tasmi, color: '#7C3AED', bg: '#F5F3FF', activeBg: '#7C3AED' },
                { id: 'Ujian', label: 'Ujian', count: typeCounts.Ujian, color: '#D97706', bg: '#FFFBEB', activeBg: '#D97706' },
              ].map((tf) => {
                const isActive = logsTypeFilter === tf.id;
                return (
                  <TouchableOpacity
                    key={tf.id}
                    onPress={() => setLogsTypeFilter(tf.id as any)}
                    style={[
                      styles.typeFilterChip,
                      {
                        backgroundColor: isActive ? tf.activeBg : tf.bg,
                        borderColor: tf.color,
                      },
                    ]}
                  >
                    <Text style={[styles.typeFilterChipText, { color: isActive ? '#FFFFFF' : tf.color }]}>
                      {tf.label} ({tf.count})
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {classFilteredLogs.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="book-open-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Belum Ada Catatan Setoran</Text>
                <Text style={styles.emptySub}>
                  {logsSearchQuery
                    ? `Tidak ditemukan setoran dengan kata kunci "${logsSearchQuery}".`
                    : selectedClassId !== 'all' && selectedClass
                    ? `Belum ada catatan setoran untuk ${selectedClass.name} pada kategori ini. Gunakan tab "Input Setoran" untuk mencatat hafalan.`
                    : 'Gunakan tab "Input Setoran" untuk mencatat hafalan santri binaan hari ini.'}
                </Text>
              </View>
            ) : (
              classFilteredLogs.map((log: any, idx: number) => {
                const sName = log.student?.nama_lengkap || log.student?.name || 'Santri';
                const sNis = log.student?.nis || '-';
                const surahN = log.hafalan_surah_name || `Surah #${log.hafalan_surah_number || '-'}`;
                const rangeA = `Ayat ${log.hafalan_ayah_start || 1}–${log.hafalan_ayah_end || 1}`;
                const baris = log.hafalan_baris || '-';
                const type = log.metadata?.type || log.type || 'Ziyadah';
                const date = log.record_date || 'Hari ini';
                const kelancaranVal = log.kelancaran_label || log.kelancaran || log.metadata?.kelancaran || 'Sangat Lancar';
                const tajwidVal = log.tajwid_label || log.tajwid || log.metadata?.tajwid || 'Baik';
                const makhrajVal = log.makhraj_label || log.makhraj || log.metadata?.makhraj;

                const typeColorMap: Record<string, { color: string; bg: string; border: string }> = {
                  Ziyadah: { color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
                  Murajaah: { color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
                  Tasmi: { color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
                  Ujian: { color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                };
                const tTheme = typeColorMap[type] || typeColorMap.Ziyadah;
                const avatarThemes = [
                  { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
                  { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
                  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
                  { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
                ];
                const aTheme = avatarThemes[idx % avatarThemes.length];

                return (
                  <View
                    key={log.id || idx}
                    style={[
                      styles.logCard,
                      {
                        borderLeftWidth: 4,
                        borderLeftColor: tTheme.color,
                        borderColor: '#E2E8F0',
                      },
                    ]}
                  >
                    <View style={styles.logHeader}>
                      <View
                        style={[
                          styles.logAvatar,
                          {
                            backgroundColor: aTheme.bg,
                            borderWidth: 1,
                            borderColor: aTheme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.logAvatarText, { color: aTheme.text }]}>
                          {(sName || 'S').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.logMeta}>
                        <Text style={styles.logStudentName}>{sName}</Text>
                        <Text style={styles.logStudentNis}>NIS: {sNis} · {date}</Text>
                      </View>
                      <View
                        style={[
                          styles.logTypeBadge,
                          {
                            backgroundColor: tTheme.bg,
                            borderWidth: 1,
                            borderColor: tTheme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.logTypeBadgeText, { color: tTheme.color }]}>
                          {type}
                        </Text>
                      </View>
                    </View>

                    {/* Quality Badges: Kelancaran, Tajwid & Makhraj */}
                    <View style={styles.logQualityBadgesRow}>
                      <View style={[styles.qualityBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <MaterialCommunityIcons name="check-decagram" size={13} color="#059669" />
                        <Text style={[styles.qualityBadgeText, { color: '#065F46' }]}>
                          {kelancaranVal}
                        </Text>
                      </View>
                      <View style={[styles.qualityBadge, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                        <MaterialCommunityIcons name="star-outline" size={13} color="#7C3AED" />
                        <Text style={[styles.qualityBadgeText, { color: '#5B21B6' }]}>
                          Tajwid: {tajwidVal}
                        </Text>
                      </View>
                      {makhrajVal ? (
                        <View style={[styles.qualityBadge, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                          <Text style={[styles.qualityBadgeText, { color: '#B45309' }]}>
                            Makhraj: {makhrajVal}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    <View style={[styles.logDetailBox, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7', borderWidth: 1 }]}>
                      <View style={styles.logDetailRow}>
                        <MaterialCommunityIcons name="book-outline" size={16} color="#059669" />
                        <Text style={[styles.logSurahText, { color: '#065F46' }]}>
                          {surahN} ({rangeA})
                        </Text>
                      </View>
                      <View style={styles.logDetailRow}>
                        <MaterialCommunityIcons name="format-line-spacing" size={16} color="#059669" />
                        <Text style={styles.logLinesText}>
                          Juz {log.metadata?.juz || '-'} · {baris} Baris/Ayat
                        </Text>
                      </View>
                      {log.notes_teacher ? (
                        <Text style={styles.logTeacherNotes}>
                          "{log.notes_teacher}"
                        </Text>
                      ) : null}
                    </View>

                    {/* Quick Action Button: Setor Santri Ini */}
                    <TouchableOpacity
                      onPress={() => {
                        const targetId = log.student_id || log.student?.id;
                        if (targetId) {
                          setSelectedStudentId(String(targetId));
                          setActiveTab('input');
                        }
                      }}
                      style={styles.logQuickSetorBtn}
                      activeOpacity={0.8}
                    >
                      <MaterialCommunityIcons name="plus-circle-outline" size={14} color="#059669" />
                      <Text style={styles.logQuickSetorText}>Setor Santri Ini</Text>
                    </TouchableOpacity>
                  </View>
                );
              })
            )}
          </View>
        ) : activeTab === 'leaderboard' ? (
          /* TAB 3: LEADERBOARD TOP 5 SANTRI */
          <View style={styles.leaderboardContainer}>
            {/* Header Leaderboard */}
            <View style={styles.leaderboardHeaderCard}>
              <View style={styles.leaderboardHeaderLeft}>
                <View style={styles.leaderboardTrophyIconBox}>
                  <MaterialCommunityIcons name="trophy-award" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.leaderboardHeaderTitle}>
                    5 Terbaik Capaian Hafalan Al-Qur'an
                  </Text>
                  <Text style={styles.leaderboardHeaderSub}>
                    {selectedClassId !== 'all' && selectedClass
                      ? `Peringkat santri rombel ${selectedClass.name} berdasarkan akumulasi ayat & surah`
                      : 'Peringkat santri halaqah berdasarkan akumulasi ayat & surah'}
                  </Text>
                </View>
              </View>
              <View style={styles.leaderboardTopBadge}>
                <Text style={styles.leaderboardTopBadgeText}>🏆 Top 5</Text>
              </View>
            </View>

            {topStudents.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="trophy-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Belum Ada Peringkat Setoran</Text>
                <Text style={styles.emptySub}>
                  {selectedClassId !== 'all' && selectedClass
                    ? `Belum ada data setoran di rombel ${selectedClass.name} untuk dihitung peringkatnya.`
                    : 'Belum ada data setoran untuk dihitung peringkatnya.'}
                </Text>
              </View>
            ) : (
              topStudents.map((item, idx) => {
                const s = item.student;
                const sName = s.nama_lengkap || s.name || 'Santri';
                const sNis = s.nis || s.nisn || '-';
                const rankLabels = ['🥇 Rank #1', '🥈 Rank #2', '🥉 Rank #3', '🏅 Rank #4', '🏅 Rank #5'];
                const rankThemes = [
                  {
                    bg: '#FFFBEB',
                    border: '#F59E0B',
                    rankBadgeBg: '#F59E0B',
                    rankBadgeText: '#FFFFFF',
                    accentBox: '#FEF3C7',
                    nameColor: '#78350F',
                    tagBg: '#FEF3C7',
                    tagText: '#B45309',
                  },
                  {
                    bg: '#F8FAFC',
                    border: '#94A3B8',
                    rankBadgeBg: '#64748B',
                    rankBadgeText: '#FFFFFF',
                    accentBox: '#F1F5F9',
                    nameColor: '#0F172A',
                    tagBg: '#E2E8F0',
                    tagText: '#475569',
                  },
                  {
                    bg: '#FFF7ED',
                    border: '#FB923C',
                    rankBadgeBg: '#EA580C',
                    rankBadgeText: '#FFFFFF',
                    accentBox: '#FFEDD5',
                    nameColor: '#7C2D12',
                    tagBg: '#FFEDD5',
                    tagText: '#C2410C',
                  },
                  {
                    bg: '#ECFDF5',
                    border: '#10B981',
                    rankBadgeBg: '#059669',
                    rankBadgeText: '#FFFFFF',
                    accentBox: '#D1FAE5',
                    nameColor: '#064E3B',
                    tagBg: '#D1FAE5',
                    tagText: '#047857',
                  },
                  {
                    bg: '#F0FDFA',
                    border: '#06B6D4',
                    rankBadgeBg: '#0D9488',
                    rankBadgeText: '#FFFFFF',
                    accentBox: '#CCFBF1',
                    nameColor: '#134E4A',
                    tagBg: '#CCFBF1',
                    tagText: '#0F766E',
                  },
                ];
                const rTheme = rankThemes[idx] || rankThemes[3];

                return (
                  <View
                    key={s.id || idx}
                    style={[
                      styles.rankCardModern,
                      {
                        backgroundColor: rTheme.bg,
                        borderColor: rTheme.border,
                        borderWidth: idx === 0 ? 2 : 1.5,
                      },
                    ]}
                  >
                    {/* Top Row: Rank Badge & Unit/Class */}
                    <View style={styles.rankTopRow}>
                      <View style={[styles.rankBadgePill, { backgroundColor: rTheme.rankBadgeBg }]}>
                        <Text style={[styles.rankBadgePillText, { color: rTheme.rankBadgeText }]}>
                          {rankLabels[idx]}
                        </Text>
                      </View>
                      <View style={[styles.rankClassPill, { backgroundColor: rTheme.tagBg }]}>
                        <Text style={[styles.rankClassPillText, { color: rTheme.tagText }]}>
                          {item.className}
                        </Text>
                      </View>
                    </View>

                    {/* Santri Profile Row */}
                    <View style={styles.rankProfileRow}>
                      <View
                        style={[
                          styles.rankAvatarCircle,
                          {
                            backgroundColor: rTheme.accentBox,
                            borderColor: rTheme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.rankAvatarText, { color: rTheme.nameColor }]}>
                          {(sName || 'S').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.rankStudentName, { color: rTheme.nameColor }]} numberOfLines={1}>
                          {sName}
                        </Text>
                        <Text style={styles.rankStudentNis}>
                          NIS: {sNis} · {item.unitName}
                        </Text>
                      </View>
                    </View>

                    {/* Detail Hafalan Box */}
                    <View style={[styles.rankDetailBox, { backgroundColor: rTheme.accentBox, borderColor: rTheme.border }]}>
                      <View style={styles.rankDetailSurahRow}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.rankDetailLabel}>Hafalan Terakhir:</Text>
                          <Text style={[styles.rankDetailSurahName, { color: rTheme.nameColor }]}>
                            {item.lastSurahName}
                          </Text>
                        </View>
                        <View style={styles.rankJuzBadge}>
                          <Text style={styles.rankJuzBadgeText}>Juz {item.lastJuz}</Text>
                        </View>
                      </View>

                      <Text style={styles.rankAyahRangeText}>{item.lastAyahRange}</Text>

                      {/* Mini Stat Grid 3 Kolom */}
                      <View style={styles.rankStatsGrid}>
                        <View style={styles.rankStatCol}>
                          <Text style={styles.rankStatVal}>{item.completedSurahs}</Text>
                          <Text style={styles.rankStatLbl}>Surah</Text>
                        </View>
                        <View style={styles.rankStatCol}>
                          <Text style={styles.rankStatVal}>{item.totalAyat}</Text>
                          <Text style={styles.rankStatLbl}>Ayat/Baris</Text>
                        </View>
                        <View style={styles.rankStatCol}>
                          <Text style={styles.rankStatVal}>{item.totalSetoran}</Text>
                          <Text style={styles.rankStatLbl}>Setoran</Text>
                        </View>
                      </View>
                    </View>

                    {/* Action Buttons Row */}
                    <View style={styles.rankActionRow}>
                      <TouchableOpacity
                        onPress={() => {
                          setPrintReportStudent(s);
                          setPrintReportVisible(true);
                        }}
                        style={[styles.rankActionBtnOutline, { borderColor: rTheme.border }]}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="printer" size={15} color={rTheme.nameColor} />
                        <Text style={[styles.rankActionBtnOutlineText, { color: rTheme.nameColor }]}>
                          Rapor
                        </Text>
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          setSelectedStudentId(String(s.id));
                          setActiveTab('input');
                        }}
                        style={styles.rankActionBtnFill}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="plus-circle" size={15} color="#FFFFFF" />
                        <Text style={styles.rankActionBtnFillText}>Setor</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        ) : (
          /* TAB 4: LAPORAN & REKAP TAHFIZH SANTRI */
          <View style={styles.reportContainer}>
            {/* Executive KPI Summary Header Card */}
            <LinearGradient
              colors={['#064E3B', '#047857', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.reportSummaryCard}
            >
              <View style={styles.reportSummaryHeader}>
                <View style={styles.reportIconBox}>
                  <MaterialCommunityIcons name="chart-box-outline" size={22} color="#D1FAE5" />
                </View>
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={styles.reportSummaryTitle}>Rekapitulasi Halaqah Tahfizh</Text>
                  <Text style={styles.reportSummarySubtitle}>
                    Tahun Ajaran {academicInfo} · Target {effectiveSummary.target_lines ? `${effectiveSummary.target_lines} Baris / Santri` : 'Kurikulum Halaqah'}
                  </Text>
                </View>
                {reportLoading && <ActivityIndicator size="small" color="#A7F3D0" />}
              </View>

              {/* 4 KPI Grid */}
              <View style={styles.kpiGrid}>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiNumber}>{effectiveSummary.total_logs}</Text>
                  <Text style={styles.kpiLabel}>Total Setoran</Text>
                </View>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiNumber}>{effectiveSummary.total_hafalan_baris}</Text>
                  <Text style={styles.kpiLabel}>Baris Mushaf</Text>
                </View>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiNumber}>{effectiveSummary.total_murajaah_lembar}</Text>
                  <Text style={styles.kpiLabel}>Lbr Murajaah</Text>
                </View>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiNumber}>{effectiveSummary.total_siswa}</Text>
                  <Text style={styles.kpiLabel}>Santri Aktif</Text>
                </View>
              </View>

              {/* Breakdown Row */}
              <View style={styles.breakdownRow}>
                <View style={styles.breakdownBadge}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#34D399' }]} />
                  <Text style={styles.breakdownText}>Ziyadah: {effectiveSummary.total_ziyadah}</Text>
                </View>
                <View style={styles.breakdownBadge}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#60A5FA' }]} />
                  <Text style={styles.breakdownText}>Murajaah: {effectiveSummary.total_murajaah}</Text>
                </View>
                <View style={styles.breakdownBadge}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#FBBF24' }]} />
                  <Text style={styles.breakdownText}>Tasmi': {effectiveSummary.total_tasmi}</Text>
                </View>
                <View style={styles.breakdownBadge}>
                  <View style={[styles.breakdownDot, { backgroundColor: '#F87171' }]} />
                  <Text style={styles.breakdownText}>Ujian: {effectiveSummary.total_ujian}</Text>
                </View>
              </View>
            </LinearGradient>

            {/* Student Search & List Header */}
            <View style={styles.reportListHeader}>
              <View style={styles.reportSearchBox}>
                <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
                <TextInput
                  placeholder="Cari santri halaqah..."
                  placeholderTextColor="#94A3B8"
                  value={reportSearchQuery}
                  onChangeText={setReportSearchQuery}
                  style={styles.reportSearchInput}
                />
                {reportSearchQuery ? (
                  <TouchableOpacity onPress={() => setReportSearchQuery('')}>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Student Cards List */}
            {studentReportList.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="account-search-outline" size={44} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Santri Tidak Ditemukan</Text>
                <Text style={styles.emptySub}>
                  {reportSearchQuery
                    ? `Tidak ada santri yang cocok dengan kata kunci "${reportSearchQuery}".`
                    : 'Belum ada data santri pada rombel yang dipilih.'}
                </Text>
              </View>
            ) : (
              studentReportList.map((item, sIdx) => {
                const s = item.student;
                const sName = s.nama_lengkap || s.full_name || s.name || 'Santri';
                const sNis = s.nis || s.nisn || '-';
                const sClass = s.kelas?.nama_kelas || s.class?.name || 'Rombel';

                const avatarThemes = [
                  { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0' },
                  { bg: '#F0F9FF', text: '#0284C7', border: '#BAE6FD' },
                  { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A' },
                  { bg: '#F5F3FF', text: '#7C3AED', border: '#DDD6FE' },
                ];
                const sTheme = avatarThemes[sIdx % avatarThemes.length];

                return (
                  <View key={s.id} style={styles.studentReportCard}>
                    {/* Header: Avatar, Name, NIS, Class */}
                    <View style={styles.studentCardHeader}>
                      <View
                        style={[
                          styles.studentAvatar,
                          {
                            backgroundColor: sTheme.bg,
                            borderWidth: 1,
                            borderColor: sTheme.border,
                          },
                        ]}
                      >
                        <Text style={[styles.studentAvatarText, { color: sTheme.text }]}>
                          {(sName || 'S').slice(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={styles.studentName} numberOfLines={1}>{sName}</Text>
                        <Text style={styles.studentMeta}>NIS: {sNis} · {sClass}</Text>
                      </View>
                      <View
                        style={[
                          styles.kelancaranBadge,
                          item.kelancaranText === 'Sangat Lancar' || item.kelancaranText === 'Mumtaz'
                            ? [styles.badgeMumtaz, { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#A7F3D0' }]
                            : item.kelancaranText === 'Lancar' || item.kelancaranText === 'Jayyid Jiddan'
                            ? [styles.badgeJayyid, { backgroundColor: '#F0F9FF', borderWidth: 1, borderColor: '#BAE6FD' }]
                            : [styles.badgeMaqbul, { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' }],
                        ]}
                      >
                        <Text
                          style={[
                            styles.kelancaranBadgeText,
                            item.kelancaranText === 'Sangat Lancar' || item.kelancaranText === 'Mumtaz'
                              ? { color: '#047857' }
                              : item.kelancaranText === 'Lancar' || item.kelancaranText === 'Jayyid Jiddan'
                              ? { color: '#0284C7' }
                              : { color: '#D97706' },
                          ]}
                        >
                          {item.kelancaranText}
                        </Text>
                      </View>
                    </View>

                    {/* Hafalan Terakhir */}
                    <View style={[styles.lastHafalanRow, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
                      <MaterialCommunityIcons name="book-open-outline" size={16} color="#059669" />
                      <View style={{ flex: 1, marginLeft: 6 }}>
                        <Text style={styles.lastHafalanLabel}>Hafalan Terakhir:</Text>
                        <Text style={[styles.lastHafalanValue, { color: '#065F46' }]}>{item.lastSurahDisplay}</Text>
                      </View>
                      <Text style={styles.lastHafalanDate}>{item.lastDateDisplay}</Text>
                    </View>

                    {/* Stats Mini Chips & Action */}
                    <View style={styles.studentCardFooter}>
                      <View style={styles.statChipsRow}>
                        <View style={[styles.statChip, { backgroundColor: '#ECFDF5' }]}>
                          <Text style={[styles.statChipVal, { color: '#047857' }]}>{item.setoranCount}</Text>
                          <Text style={[styles.statChipLabel, { color: '#059669' }]}>Setoran</Text>
                        </View>
                        <View style={[styles.statChip, { backgroundColor: '#F0F9FF' }]}>
                          <Text style={[styles.statChipVal, { color: '#0284C7' }]}>{item.totalBaris}</Text>
                          <Text style={[styles.statChipLabel, { color: '#0284C7' }]}>Baris</Text>
                        </View>
                        <View style={[styles.statChip, { backgroundColor: '#FFFBEB' }]}>
                          <Text style={[styles.statChipVal, { color: '#D97706' }]}>{item.totalLembar}</Text>
                          <Text style={[styles.statChipLabel, { color: '#D97706' }]}>Lembar</Text>
                        </View>
                      </View>

                      {/* Tombol Cetak Rapor Santri */}
                      <TouchableOpacity
                        onPress={() => {
                          setPrintReportStudent(s);
                          setPrintReportVisible(true);
                        }}
                        style={[styles.printCardBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="printer" size={15} color="#059669" />
                        <Text style={[styles.printCardBtnText, { color: '#047857' }]}>Cetak Rapor</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                );
              })
            )}
          </View>
        )}
        </View>
      </ScrollView>
    </View>

      {/* POPUP MODAL PILIH ROMBEL / KELAS */}
      <Modal
        visible={classPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setClassPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Pilih Rombel / Kelas</Text>
                <Text style={styles.modalSubHeader}>Pilih rombel untuk menyaring santri halaqah</Text>
              </View>
              <TouchableOpacity onPress={() => setClassPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {/* Opsi Semua Rombel */}
              <TouchableOpacity
                key="all"
                onPress={() => {
                  setSelectedClassId('all');
                  setClassPickerVisible(false);
                }}
                style={styles.pickerListItem}
              >
                <View style={[styles.classAvatarSmall, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <MaterialCommunityIcons
                    name="view-grid-outline"
                    size={18}
                    color="#047857"
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerListTitle}>Semua Rombel Halaqah</Text>
                  <Text style={styles.pickerListSub}>Menampilkan seluruh {students.length} santri binaan</Text>
                </View>
                {selectedClassId === 'all' && (
                  <MaterialCommunityIcons name="check-circle" size={20} color="#0E5C44" />
                )}
              </TouchableOpacity>

              {availableClasses.map((c) => {
                const count = students.filter(
                  (s) => String(s.kelas_id || s.class_id) === String(c.id)
                ).length;
                const isSelected = String(selectedClassId) === String(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    onPress={() => {
                      const cid = String(c.id);
                      setSelectedClassId(cid);
                      setClassPickerVisible(false);
                    }}
                    style={styles.pickerListItem}
                  >
                    <View style={styles.classAvatarSmall}>
                      <MaterialCommunityIcons
                        name="google-classroom"
                        size={18}
                        color="#047857"
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerListTitle}>{c.name}</Text>
                      <Text style={styles.pickerListSub}>{count} Santri Terdaftar</Text>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#0E5C44" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* POPUP MODAL PILIH SANTRI */}
      <Modal
        visible={studentPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setStudentPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <View>
                <Text style={styles.modalTitle}>Pilih Santri Halaqah</Text>
                <Text style={styles.modalSubHeader}>
                  {selectedClass ? `${selectedClass.name} · ${studentsInSelectedClass.length} Santri` : 'Pilih santri'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setStudentPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Quick Switch Rombel inside Modal */}
            {availableClasses.length > 1 && (
              <View style={styles.modalRombelChipsWrap}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  {availableClasses.map((c) => {
                    const isSelected = String(selectedClassId) === String(c.id);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        onPress={() => setSelectedClassId(String(c.id))}
                        style={[
                          styles.modalRombelChip,
                          isSelected && styles.modalRombelChipActive,
                        ]}
                      >
                        <Text
                          style={[
                            styles.modalRombelChipText,
                            isSelected && styles.modalRombelChipTextActive,
                          ]}
                        >
                          {c.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            )}

            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
              <TextInput
                placeholder="Cari nama santri atau NIS..."
                placeholderTextColor="#94A3B8"
                value={studentSearch}
                onChangeText={setStudentSearch}
                style={styles.searchInput}
              />
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {filteredStudents.length === 0 ? (
                <View style={styles.modalEmptyBox}>
                  <MaterialCommunityIcons name="account-search-outline" size={36} color="#94A3B8" />
                  <Text style={styles.modalEmptyText}>
                    {studentSearch
                      ? `Tidak ada santri di ${selectedClass?.name || 'rombel'} dengan kata kunci "${studentSearch}"`
                      : `Belum ada santri terdaftar di rombel ${selectedClass?.name || ''}`}
                  </Text>
                </View>
              ) : (
                filteredStudents.map((s) => (
                  <TouchableOpacity
                    key={s.id}
                    onPress={() => {
                      const sid = String(s.id);
                      setSelectedStudentId(sid);
                      setStudentPickerVisible(false);
                      setLastHafalanInfo(null);
                      if (surahNumber > 0 && selectedSurah) {
                        const logsForSurah = (tahfizhLogs || []).filter((l: any) => {
                          const logSid = l?.student_id || l?.santri_id || l?.user_id;
                          const logSNum = Number(l?.hafalan_surah_number || l?.surah_number || 0);
                          return String(logSid) === sid && logSNum === surahNumber;
                        }).sort(
                          (a: any, b: any) =>
                            new Date(b.record_date || b.created_at || 0).getTime() -
                            new Date(a.record_date || a.created_at || 0).getTime()
                        );

                        let nextStart = 1;
                        if (logsForSurah.length > 0) {
                          const lastEnd = Number(
                            logsForSurah[0].hafalan_ayah_end || logsForSurah[0].ayat_end || 0
                          );
                          if (lastEnd > 0 && lastEnd < selectedSurah.jumlah_ayat) {
                            nextStart = lastEnd + 1;
                          }
                        }
                        setAyatStart(nextStart);
                        setAyatEnd(Math.min(nextStart + 9, selectedSurah.jumlah_ayat));
                        setJuz(getQuranJuz(surahNumber, nextStart));
                      } else {
                        setSurahNumber(0);
                        setAyatStart(1);
                        setAyatEnd(1);
                      }
                    }}
                    style={styles.pickerListItem}
                  >
                    <View style={styles.pickerAvatarSmall}>
                      <Text style={styles.pickerAvatarSmallText}>
                        {(s.nama_lengkap || 'S').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerListTitle}>{s.nama_lengkap}</Text>
                      <Text style={styles.pickerListSub}>NIS: {s.nis || '-'} · Kelas {s.kelas?.nama_kelas || selectedClass?.name || '-'}</Text>
                    </View>
                    {String(selectedStudentId) === String(s.id) && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#0E5C44" />
                    )}
                  </TouchableOpacity>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* POPUP MODAL PILIH LANJUTAN TAHFIZH */}
      <Modal
        visible={continueModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setContinueModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { maxHeight: '90%' }]}>
            {/* Header Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <View style={{ width: 32, height: 32, borderRadius: 10, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#047857" />
                </View>
                <View>
                  <Text style={styles.modalTitle}>Lanjutan Tahfizh Santri</Text>
                  <Text style={{ fontSize: 11, color: '#64748B' }}>Pilih & konfirmasi porsi setoran lanjutan</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setContinueModalVisible(false)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Kartu Profil Santri Terpilih */}
              <View style={[styles.pickerListItem, { backgroundColor: '#F8FAFC', borderRadius: 16, marginTop: 12, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' }]}>
                <View style={[styles.pickerAvatarSmall, { backgroundColor: '#047857' }]}>
                  <Text style={[styles.pickerAvatarSmallText, { color: '#FFFFFF' }]}>
                    {(selectedStudent?.nama_lengkap || 'S').slice(0, 2).toUpperCase()}
                  </Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.pickerListTitle, { fontSize: 14, fontWeight: '700' }]}>
                    {selectedStudent?.nama_lengkap || 'Pilih Santri'}
                  </Text>
                  <Text style={styles.pickerListSub}>
                    NIS: {selectedStudent?.nis || '-'} · Kelas: {selectedStudent?.kelas?.nama_kelas || selectedClass?.name || '-'}
                  </Text>
                </View>
              </View>

              {/* Status Riwayat Santri */}
              {continueModalData?.hasHistory ? (
                <View style={{ backgroundColor: '#ECFDF5', borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1.5, borderColor: '#A7F3D0' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MaterialCommunityIcons name="history" size={18} color="#047857" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Riwayat Terakhir Santri
                    </Text>
                  </View>
                  <Text style={{ fontSize: 15, fontWeight: '800', color: '#065F46', marginBottom: 2 }}>
                    Surah {continueModalData.lastSurahName} (Ayat {continueModalData.lastAyahStart}–{continueModalData.lastAyahEnd})
                  </Text>
                  <Text style={{ fontSize: 11, color: '#047857' }}>
                    Juz {getQuranJuz(continueModalData.lastSurahNumber || 1, continueModalData.lastAyahStart || 1)}
                    {continueModalData.lastDate ? ` · Tercatat pada ${continueModalData.lastDate}` : ''}
                  </Text>
                </View>
              ) : (
                <View style={{ backgroundColor: '#F0F9FF', borderRadius: 16, padding: 14, marginTop: 12, borderWidth: 1.5, borderColor: '#BAE6FD' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 6 }}>
                    <MaterialCommunityIcons name="information-outline" size={18} color="#0284C7" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#0369A1', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                      Hafalan Perdana (Santri Baru)
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: '#075985', lineHeight: 18 }}>
                    Santri ini belum memiliki riwayat setoran tahfizh sebelumnya. Silakan pilih Surah dan rentang ayat di bawah untuk setoran awal santri.
                  </Text>
                </View>
              )}

              {/* Form Pemilihan Lanjutan Surah & Ayat */}
              {continueModalData && (
                <View style={{ marginTop: 16, backgroundColor: '#FFFFFF', borderRadius: 16, padding: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 12 }}>
                    Pilihan Lanjutan Setoran
                  </Text>

                  {/* Pemilih Surah Lanjutan */}
                  <View style={{ marginBottom: 14 }}>
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>
                      Surah yang Disetorkan
                    </Text>
                    <TouchableOpacity
                      onPress={() => {
                        setSurahPickerTarget('continueModal');
                        setSurahPickerVisible(true);
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        paddingHorizontal: 12,
                        paddingVertical: 10,
                        backgroundColor: '#F8FAFC',
                        borderRadius: 12,
                        borderWidth: 1,
                        borderColor: '#CBD5E1',
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                        <MaterialCommunityIcons name="book-open-outline" size={18} color="#047857" />
                        <Text style={{ fontSize: 13, fontWeight: '700', color: '#0F172A' }}>
                          {surahs.find((s) => s.nomor === continueModalData.targetSurahNumber)?.nama_latin || (continueModalData.targetSurahNumber > 0 ? `Surah #${continueModalData.targetSurahNumber}` : 'Pilih Surah (Ketuk di sini)')}
                        </Text>
                        <Text style={{ fontSize: 11, color: '#64748B' }}>
                          ({surahs.find((s) => s.nomor === continueModalData.targetSurahNumber)?.jumlah_ayat || '-'} Ayat)
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 8 }}>
                        <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857', marginRight: 2 }}>Ganti</Text>
                        <MaterialCommunityIcons name="chevron-down" size={16} color="#047857" />
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Rentang Ayat Awal & Akhir */}
                  {(() => {
                    const activeSurah = surahs.find((s) => s.nomor === continueModalData.targetSurahNumber);
                    const maxAyat = activeSurah?.jumlah_ayat || 286;
                    return (
                      <View style={{ flexDirection: 'row', gap: 12, marginBottom: 12 }}>
                        {/* Ayat Awal */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>
                            Ayat Awal
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', overflow: 'hidden' }}>
                            <TouchableOpacity
                              onPress={() => {
                                setContinueModalData((prev) => {
                                  if (!prev) return null;
                                  const nStart = Math.max(1, prev.targetAyahStart - 1);
                                  return {
                                    ...prev,
                                    targetAyahStart: nStart,
                                    targetJuz: getQuranJuz(prev.targetSurahNumber, nStart),
                                  };
                                });
                              }}
                              style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#F1F5F9' }}
                            >
                              <MaterialCommunityIcons name="minus" size={16} color="#475569" />
                            </TouchableOpacity>
                            <TextInput
                              value={String(continueModalData.targetAyahStart)}
                              keyboardType="number-pad"
                              onChangeText={(val) => {
                                const num = parseInt(val, 10) || 1;
                                const clamped = Math.min(Math.max(1, num), maxAyat);
                                setContinueModalData((prev) => (prev ? {
                                  ...prev,
                                  targetAyahStart: clamped,
                                  targetAyahEnd: Math.max(clamped, prev.targetAyahEnd),
                                  targetJuz: getQuranJuz(prev.targetSurahNumber, clamped),
                                } : null));
                              }}
                              style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#0F172A', paddingVertical: 8 }}
                            />
                            <TouchableOpacity
                              onPress={() => {
                                setContinueModalData((prev) => {
                                  if (!prev) return null;
                                  const nStart = Math.min(maxAyat, prev.targetAyahStart + 1);
                                  return {
                                    ...prev,
                                    targetAyahStart: nStart,
                                    targetAyahEnd: Math.max(nStart, prev.targetAyahEnd),
                                    targetJuz: getQuranJuz(prev.targetSurahNumber, nStart),
                                  };
                                });
                              }}
                              style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#F1F5F9' }}
                            >
                              <MaterialCommunityIcons name="plus" size={16} color="#475569" />
                            </TouchableOpacity>
                          </View>
                        </View>

                        {/* Ayat Akhir */}
                        <View style={{ flex: 1 }}>
                          <Text style={{ fontSize: 11, fontWeight: '600', color: '#64748B', marginBottom: 6 }}>
                            Ayat Akhir
                          </Text>
                          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderRadius: 12, borderWidth: 1, borderColor: '#CBD5E1', overflow: 'hidden' }}>
                            <TouchableOpacity
                              onPress={() => {
                                setContinueModalData((prev) => {
                                  if (!prev) return null;
                                  const nEnd = Math.max(prev.targetAyahStart, prev.targetAyahEnd - 1);
                                  return { ...prev, targetAyahEnd: nEnd };
                                });
                              }}
                              style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#F1F5F9' }}
                            >
                              <MaterialCommunityIcons name="minus" size={16} color="#475569" />
                            </TouchableOpacity>
                            <TextInput
                              value={String(continueModalData.targetAyahEnd)}
                              keyboardType="number-pad"
                              onChangeText={(val) => {
                                const num = parseInt(val, 10) || 1;
                                const clamped = Math.min(Math.max(continueModalData.targetAyahStart, num), maxAyat);
                                setContinueModalData((prev) => (prev ? { ...prev, targetAyahEnd: clamped } : null));
                              }}
                              style={{ flex: 1, textAlign: 'center', fontSize: 14, fontWeight: '700', color: '#0F172A', paddingVertical: 8 }}
                            />
                            <TouchableOpacity
                              onPress={() => {
                                setContinueModalData((prev) => {
                                  if (!prev) return null;
                                  const nEnd = Math.min(maxAyat, prev.targetAyahEnd + 1);
                                  return { ...prev, targetAyahEnd: nEnd };
                                });
                              }}
                              style={{ paddingHorizontal: 10, paddingVertical: 10, backgroundColor: '#F1F5F9' }}
                            >
                              <MaterialCommunityIcons name="plus" size={16} color="#475569" />
                            </TouchableOpacity>
                          </View>
                        </View>
                      </View>
                    );
                  })()}

                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', backgroundColor: '#F8FAFC', padding: 8, borderRadius: 8 }}>
                    <Text style={{ fontSize: 11, color: '#64748B' }}>
                      Estimasi Porsi Setoran: {Math.max(1, continueModalData.targetAyahEnd - continueModalData.targetAyahStart + 1)} Ayat
                    </Text>
                    <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#0369A1' }}>
                        Juz {continueModalData.targetJuz}
                      </Text>
                    </View>
                  </View>

                  {/* Tombol Pratinjau Ayat di dalam Modal Lanjutan */}
                  <TouchableOpacity
                    onPress={() => void handlePreviewVerses(continueModalData.targetSurahNumber, continueModalData.targetAyahStart, continueModalData.targetAyahEnd)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: 6,
                      backgroundColor: '#ECFDF5',
                      borderWidth: 1,
                      borderColor: '#A7F3D0',
                      borderRadius: 12,
                      paddingVertical: 10,
                      marginTop: 10,
                    }}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons name="book-open-variant" size={17} color="#047857" />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#047857' }}>
                      Pratinjau Teks Ayat ({continueModalData.targetAyahStart}–{continueModalData.targetAyahEnd})
                    </Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Peringatan Murajaah Mandiri Tertunda */}
              {continueModalData?.hasPendingMurajaah && continueModalData.pendingMurajaahInfo && (
                <View style={{ backgroundColor: '#FEF3C7', borderRadius: 12, padding: 10, marginTop: 10, borderWidth: 1, borderColor: '#FDE68A', flexDirection: 'row', gap: 8 }}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#B45309" />
                  <Text style={{ flex: 1, fontSize: 11, color: '#92400E', lineHeight: 16 }}>
                    Santri memiliki tugas Murajaah Rumah yang belum diverifikasi: Surah {continueModalData.pendingMurajaahInfo.surah_name} (Ayat {continueModalData.pendingMurajaahInfo.ayah_start}–{continueModalData.pendingMurajaahInfo.ayah_end}).
                  </Text>
                </View>
              )}
            </ScrollView>

            {/* Footer Modal Action Buttons */}
            <View style={{ flexDirection: 'row', gap: 10, paddingTop: 12, borderTopWidth: 1, borderColor: '#E2E8F0' }}>
              <TouchableOpacity
                onPress={() => setContinueModalVisible(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handleApplyContinueModal}
                style={{ flex: 2, borderRadius: 12, overflow: 'hidden' }}
              >
                <LinearGradient
                  colors={['#047857', '#059669', '#0D9488']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={{ paddingVertical: 12, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 6 }}
                >
                  <MaterialCommunityIcons name="check-circle-outline" size={18} color="#FFFFFF" />
                  <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Terapkan ke Formulir</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* POPUP MODAL PRATINJAU TEKS AYAT AL-QUR'AN */}
      <Modal
        visible={versePreviewModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setVersePreviewModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={[styles.modalContent, { maxHeight: '92%', paddingBottom: 12 }]}>
            {/* Header Modal Pratinjau */}
            <View style={styles.modalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={{ width: 36, height: 36, borderRadius: 12, backgroundColor: '#ECFDF5', alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={22} color="#047857" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.modalTitle, { fontSize: 15, fontWeight: '800', color: '#0F172A' }]}>
                      Surah {versePreviewData?.surahNameLatin || 'Al-Qur’an'}
                    </Text>
                    {versePreviewData?.surahNameArabic ? (
                      <Text style={{ fontSize: 15, fontWeight: '700', color: '#047857' }}>
                        {versePreviewData.surahNameArabic}
                      </Text>
                    ) : null}
                  </View>
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 1 }}>
                    Ayat {versePreviewData?.ayahStart} s/d {versePreviewData?.ayahEnd} · Juz {versePreviewData?.juz} {versePreviewData?.arti ? `(${versePreviewData.arti})` : ''}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setVersePreviewModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            {/* Konten Daftar Ayat */}
            {loadingVerses ? (
              <View style={{ paddingVertical: 48, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <ActivityIndicator size="large" color="#047857" />
                <Text style={{ fontSize: 13, fontWeight: '600', color: '#64748B' }}>
                  Memuat teks ayat Al-Qur'an...
                </Text>
              </View>
            ) : (
              <ScrollView
                showsVerticalScrollIndicator={false}
                contentContainerStyle={{ paddingVertical: 10 }}
              >
                {/* Banner Bismillah jika mulai dari ayat 1 selain Surah At-Taubah (9) dan Al-Fatihah (1) */}
                {versePreviewData &&
                  versePreviewData.ayahStart === 1 &&
                  versePreviewData.surahNumber !== 9 &&
                  versePreviewData.surahNumber !== 1 && (
                    <View
                      style={{
                        backgroundColor: '#F8FAFC',
                        borderRadius: 14,
                        paddingVertical: 14,
                        paddingHorizontal: 16,
                        alignItems: 'center',
                        justifyContent: 'center',
                        marginBottom: 14,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 22,
                          color: '#065F46',
                          fontWeight: 'bold',
                          textAlign: 'center',
                        }}
                      >
                        بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ
                      </Text>
                    </View>
                  )}

                {/* Ayat Cards */}
                {versePreviewData?.verses && versePreviewData.verses.length > 0 ? (
                  versePreviewData.verses.map((v) => (
                    <View
                      key={v.nomor_ayat}
                      style={{
                        backgroundColor: '#FFFFFF',
                        borderRadius: 16,
                        padding: 14,
                        marginBottom: 12,
                        borderWidth: 1,
                        borderColor: '#E2E8F0',
                        shadowColor: '#000',
                        shadowOffset: { width: 0, height: 1 },
                        shadowOpacity: 0.04,
                        shadowRadius: 3,
                        elevation: 1,
                      }}
                    >
                      {/* Baris Nomor Ayat & Penanda */}
                      <View
                        style={{
                          flexDirection: 'row',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          paddingBottom: 8,
                          marginBottom: 8,
                          borderBottomWidth: 1,
                          borderBottomColor: '#F1F5F9',
                        }}
                      >
                        <View
                          style={{
                            backgroundColor: '#ECFDF5',
                            paddingHorizontal: 9,
                            paddingVertical: 3,
                            borderRadius: 8,
                            borderWidth: 1,
                            borderColor: '#A7F3D0',
                          }}
                        >
                          <Text style={{ fontSize: 11, fontWeight: '800', color: '#047857' }}>
                            Ayat {v.nomor_ayat}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, color: '#94A3B8' }}>
                          Surah #{versePreviewData.surahNumber} : {v.nomor_ayat}
                        </Text>
                      </View>

                      {/* Teks Arab Uthmani */}
                      <Text
                        style={{
                          fontSize: 23,
                          fontWeight: 'bold',
                          color: '#0F172A',
                          textAlign: 'right',
                          lineHeight: 46,
                          marginVertical: 4,
                        }}
                      >
                        {v.teks_arab}
                      </Text>

                      {/* Teks Latin Transliterasi */}
                      {v.teks_latin ? (
                        <Text
                          style={{
                            fontSize: 12.5,
                            fontStyle: 'italic',
                            color: '#047857',
                            marginTop: 8,
                            lineHeight: 19,
                          }}
                        >
                          {v.teks_latin}
                        </Text>
                      ) : null}

                      {/* Terjemahan Bahasa Indonesia */}
                      {v.teks_indonesia ? (
                        <Text
                          style={{
                            fontSize: 12.5,
                            color: '#334155',
                            marginTop: 4,
                            lineHeight: 19,
                          }}
                        >
                          {v.teks_indonesia}
                        </Text>
                      ) : null}
                    </View>
                  ))
                ) : (
                  <View style={{ paddingVertical: 32, alignItems: 'center', gap: 8 }}>
                    <MaterialCommunityIcons name="book-open-outline" size={40} color="#94A3B8" />
                    <Text style={{ fontSize: 13, color: '#64748B', textAlign: 'center' }}>
                      Ayat belum dapat dimuat dari server.{'\n'}Pastikan koneksi internet aktif.
                    </Text>
                  </View>
                )}
              </ScrollView>
            )}

            {/* Footer Modal Pratinjau */}
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                paddingTop: 12,
                borderTopWidth: 1,
                borderColor: '#E2E8F0',
              }}
            >
              <Text style={{ fontSize: 12, fontWeight: '600', color: '#64748B' }}>
                Total: {versePreviewData?.verses?.length || 0} Ayat terpilih
              </Text>
              <TouchableOpacity
                onPress={() => setVersePreviewModalVisible(false)}
                style={{
                  backgroundColor: '#047857',
                  paddingHorizontal: 16,
                  paddingVertical: 9,
                  borderRadius: 10,
                }}
              >
                <Text style={{ fontSize: 12.5, fontWeight: '800', color: '#FFFFFF' }}>
                  Tutup Pratinjau
                </Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* POPUP MODAL PILIH SURAH */}
      <Modal
        visible={surahPickerVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setSurahPickerVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>Master Surah Al-Qur'an (114)</Text>
              <TouchableOpacity onPress={() => setSurahPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={24} color="#0F172A" />
              </TouchableOpacity>
            </View>

            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
              <TextInput
                placeholder="Cari nomor atau nama surah..."
                placeholderTextColor="#94A3B8"
                value={surahSearch}
                onChangeText={setSurahSearch}
                style={styles.searchInput}
              />
            </View>

            <ScrollView style={{ maxHeight: 380 }}>
              {filteredSurahs.map((surah) => (
                <TouchableOpacity
                  key={surah.nomor}
                  onPress={() => {
                    if (surahPickerTarget === 'continueModal') {
                      setContinueModalData((prev) => {
                        if (!prev) return null;
                        const totalA = surah.jumlah_ayat || 7;
                        return {
                          ...prev,
                          targetSurahNumber: surah.nomor,
                          targetAyahStart: 1,
                          targetAyahEnd: Math.min(10, totalA),
                          targetJuz: getQuranJuz(surah.nomor, 1),
                        };
                      });
                      setSurahPickerVisible(false);
                    } else {
                      const sNum = surah.nomor;
                      setSurahNumber(sNum);

                      // Cari riwayat hafalan santri di surah ini
                      const logsForSurah = (tahfizhLogs || []).filter((l: any) => {
                        const sid = l?.student_id || l?.santri_id || l?.user_id;
                        const logSNum = Number(l?.hafalan_surah_number || l?.surah_number || 0);
                        return String(sid) === String(selectedStudentId) && logSNum === sNum;
                      }).sort(
                        (a: any, b: any) =>
                          new Date(b.record_date || b.created_at || 0).getTime() -
                          new Date(a.record_date || a.created_at || 0).getTime()
                      );

                      let nextStart = 1;
                      if (logsForSurah.length > 0) {
                        const lastEnd = Number(
                          logsForSurah[0].hafalan_ayah_end || logsForSurah[0].ayat_end || 0
                        );
                        if (lastEnd > 0 && lastEnd < surah.jumlah_ayat) {
                          nextStart = lastEnd + 1;
                        }
                      }

                      setAyatStart(nextStart);
                      // Default porsi hafalan baru: +9 ayat berikutnya atau hingga akhir surah
                      const nextEnd = Math.min(nextStart + 9, surah.jumlah_ayat);
                      setAyatEnd(nextEnd);
                      setJuz(getQuranJuz(sNum, nextStart));
                      setSurahPickerVisible(false);
                    }
                  }}
                  style={styles.pickerListItem}
                >
                  <View style={styles.surahNumberCircle}>
                    <Text style={styles.surahNumberText}>{surah.nomor}</Text>
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerListTitle}>{surah.nama_latin}</Text>
                    <Text style={styles.pickerListSub}>{surah.nama} · {surah.jumlah_ayat} Ayat</Text>
                  </View>
                  {surahNumber === surah.nomor && (
                    <MaterialCommunityIcons name="check-circle" size={20} color="#0E5C44" />
                  )}
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* Cetak Rapor Santri Tahfizh Modal */}
      {printReportStudent && (
        <WeeklyEvaluationReportPaperModal
          visible={printReportVisible}
          student={printReportStudent}
          reportTitle="RAPOR EVALUASI CAPAIAN TAHFIZH SANTRI"
          periodText={`Tahun Ajaran ${academicInfo}`}
          activeReportType="tahfizh"
          tahfizhData={printStudentTahfizhData}
          homeroomTeacher={user?.name || (user as any)?.nama || user?.fullName || (selectedClass as any)?.wali_kelas || (selectedClass as any)?.homeroom_teacher || "-"}
          onClose={() => {
            setPrintReportVisible(false);
            setPrintReportStudent(null);
          }}
        />
      )}

      {/* Feedback Modal */}
      {feedback && (
        <AppFeedbackModal
          visible={feedback.visible}
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          onClose={() => setFeedback(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  rootContainer: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },

  /* ── Background Mosque & School (Identik Halaman Utama & Jadwal Pelajaran) ── */
  bgBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
    width: '100%',
  },
  bgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.45,
  },

  // ── Top Header Identik Jadwal Pelajaran & LMS Nilai/Rapor ──
  headerContainer: {
    zIndex: 10,
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitleWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 3,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 5,
    marginBottom: 2,
  },
  pulseDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#10B981',
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.4,
  },
  headerMainTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
    textAlign: 'center',
  },
  headerSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
    textAlign: 'center',
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },

  // ── Tab Switcher Sticky di Header (Tidak Ikut Scroll Bodi) ──
  tahfizhTabsWrapper: {
    marginTop: 10,
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tahfizhTabsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 2,
  },
  tahfizhTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 11,
    gap: 6,
  },
  tahfizhTabPillActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  tahfizhTabPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  tahfizhTabPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ── Main Sheet Container ──
  sheetContainer: {
    flex: 1,
  },
  screen: {
    flex: 1,
  },
  cleanMainScrollContent: {
    flexGrow: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
  },
  bodyContentWrapper: {
    paddingHorizontal: 14,
    paddingTop: 8,
  },

  // ── 3 KPI Cards Standar Emas Kisi-kisi Ujian & Jadwal Pelajaran ──
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  kpiCardItem: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiCardGradient: {
    paddingVertical: 10,
    paddingHorizontal: 10,
  },
  kpiCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconSquare: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiCardValue: {
    fontSize: 16,
    fontWeight: '900',
  },
  kpiCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.1,
  },
  kpiCardSub: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },

  // ── Body Tab Bar Switcher (Legacy/Compat) ──
  bodyTabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    padding: 4,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
  },
  bodyTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 4,
    borderRadius: 12,
  },
  bodyTabButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  bodyTabButtonText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  bodyTabButtonTextActive: {
    color: '#047857',
    fontWeight: '900',
  },
  academicInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginBottom: 10,
    gap: 6,
    alignSelf: 'flex-start',
  },
  academicInfoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  globalRombelSelectorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  globalRombelHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  globalRombelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  globalRombelIcon: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globalRombelTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  globalRombelSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  globalRombelBadge: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  globalRombelBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  globalRombelBtn: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    borderRadius: 14,
    padding: 10,
  },
  globalRombelBtnContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  globalClassAvatar: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  globalClassNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  globalClassSubText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },
  globalRombelArrow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 2,
  },
  globalRombelChangeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  contentScroll: {
    padding: 16,
    paddingBottom: 90,
  },
  loaderBox: {
    paddingVertical: 50,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  formContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  fieldSection: {
    marginBottom: 14,
  },
  fieldLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
  },
  requiredMark: {
    color: '#EF4444',
  },
  pickerSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 10,
    backgroundColor: '#F8FAFC',
  },
  pickerAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  pickerAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#15803D',
  },
  pickerMeta: {
    flex: 1,
  },
  pickerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  rowTwoCols: {
    flexDirection: 'row',
    gap: 10,
  },
  typeButtonsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 5,
  },
  typePill: {
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typePillActive: {
    backgroundColor: '#DCFCE7',
    borderColor: '#86EFAC',
  },
  typePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  typePillTextActive: {
    color: '#15803D',
    fontWeight: '800',
  },
  juzStepper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    height: 40,
    paddingHorizontal: 4,
  },
  stepperBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  stepperBtnText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#1E293B',
  },
  juzValueText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065F46',
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  linesBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  linesBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  rangeCol: {
    flex: 1,
  },
  rangeSub: {
    fontSize: 10,
    color: '#64748B',
    marginBottom: 3,
  },
  rangeColHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  lastAyahChip: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  lastAyahChipText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#047857',
  },
  rangeColHelper: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 3,
    textAlign: 'center',
  },
  rangeInput: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlign: 'center',
  },
  rangeInputStart: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
    color: '#334155',
  },
  rangeInputEnd: {
    backgroundColor: '#F0FDF4',
    borderColor: '#059669',
    borderWidth: 2,
    color: '#065F46',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 1,
  },
  rangeSubHighlight: {
    color: '#047857',
    fontWeight: '800',
  },
  totalAyahBadge: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  autoContinueNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 8,
  },
  autoContinueNoticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#065F46',
    lineHeight: 16,
  },
  quickAddRow: {
    marginTop: 10,
    gap: 6,
  },
  quickAddLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  quickAddScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickAddBtn: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickAddBtnActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  quickAddBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  quickAddBtnTextActive: {
    color: '#FFFFFF',
  },
  rangeDivider: {
    paddingTop: 16,
  },
  rangeDividerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#94A3B8',
  },
  qualityGroup: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  qualityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  qualityTitle: {
    width: 76,
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  qualityPill: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  qualityPillActive: {
    backgroundColor: '#0E5C44',
    borderColor: '#0E5C44',
  },
  qualityPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  qualityPillTextActive: {
    color: '#FFFFFF',
  },
  textArea: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    padding: 10,
    fontSize: 11.5,
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlignVertical: 'top',
    minHeight: 70,
  },
  submitButton: {
    borderRadius: 14,
    marginTop: 6,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 4,
  },
  submitGradient: {
    paddingVertical: 13,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitButtonText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  logsList: {
    gap: 12,
  },
  logsSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 1,
  },
  logsSearchInput: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  typeFilterChipsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  typeFilterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1.5,
  },
  typeFilterChipText: {
    fontSize: 11,
    fontWeight: '800',
  },
  logCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 10,
  },
  logHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  logAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#15803D',
  },
  logMeta: {
    flex: 1,
  },
  logStudentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  logStudentNis: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  logTypeBadge: {
    backgroundColor: '#EFF6FF',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
  },
  logTypeBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  logQualityBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  qualityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  qualityBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  logDetailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    gap: 4,
  },
  logDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  logSurahText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#047857',
  },
  logLinesText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  logTeacherNotes: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#475569',
    marginTop: 3,
    lineHeight: 16,
  },
  logQuickSetorBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 2,
  },
  logQuickSetorText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  leaderboardContainer: {
    gap: 12,
  },
  leaderboardHeaderCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  leaderboardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  leaderboardTrophyIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  leaderboardHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#78350F',
  },
  leaderboardHeaderSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#92400E',
    marginTop: 1,
  },
  leaderboardTopBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  leaderboardTopBadgeText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#B45309',
  },
  rankCardModern: {
    borderRadius: 18,
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  rankTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rankBadgePill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 1,
  },
  rankBadgePillText: {
    fontSize: 10.5,
    fontWeight: '900',
  },
  rankClassPill: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
  },
  rankClassPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  rankProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  rankAvatarCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  rankAvatarText: {
    fontSize: 13,
    fontWeight: '900',
  },
  rankStudentName: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  rankStudentNis: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  rankDetailBox: {
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    gap: 6,
  },
  rankDetailSurahRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rankDetailLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  rankDetailSurahName: {
    fontSize: 12.5,
    fontWeight: '900',
  },
  rankJuzBadge: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  rankJuzBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  rankAyahRangeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  rankStatsGrid: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 4,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  rankStatCol: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 5,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  rankStatVal: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },
  rankStatLbl: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  rankActionRow: {
    flexDirection: 'row',
    gap: 8,
  },
  rankActionBtnOutline: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
  },
  rankActionBtnOutlineText: {
    fontSize: 11,
    fontWeight: '800',
  },
  rankActionBtnFill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  rankActionBtnFillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 10,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
  },
  pickerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 10,
  },
  pickerAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickerAvatarSmallText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  pickerListTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerListSub: {
    fontSize: 10.5,
    color: '#64748B',
  },
  surahNumberCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
  },
  surahNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  continueSection: {
    marginTop: -2,
    marginBottom: 16,
  },
  continueButton: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 5,
    elevation: 3,
  },
  continueGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  continueBtnTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  continueBtnSub: {
    fontSize: 10.5,
    color: '#D1FAE5',
    marginTop: 1,
  },
  previewVersesButton: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 10,
    shadowColor: '#0F766E',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  previewVersesGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  previewVersesTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  previewVersesSub: {
    fontSize: 10.5,
    color: '#CCFBF1',
    marginTop: 1,
  },
  lastInfoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    marginTop: 8,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  lastInfoBannerSuccess: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  lastInfoBannerWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  lastInfoBannerText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    lineHeight: 15,
  },
  quickRangeRow: {
    marginTop: 10,
  },
  quickRangeLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  quickRangeScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 2,
  },
  quickChip: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  quickChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  quickChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  reportContainer: {
    paddingBottom: 24,
  },
  reportFilterSection: {
    marginBottom: 12,
  },
  classChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  classChip: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  classChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  classChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  classChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  reportSummaryCard: {
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 4,
  },
  reportSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  reportIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  reportSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  reportSummarySubtitle: {
    fontSize: 10.5,
    color: '#D1FAE5',
    marginTop: 1,
  },
  kpiGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(0,0,0,0.18)',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 6,
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  kpiItem: {
    alignItems: 'center',
    flex: 1,
  },
  kpiNumber: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D1FAE5',
    marginTop: 2,
  },
  breakdownRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    justifyContent: 'space-between',
  },
  breakdownBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    gap: 5,
  },
  breakdownDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  breakdownText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#ECFDF5',
  },
  reportListHeader: {
    marginBottom: 10,
  },
  reportSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
  },
  reportSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
  },
  studentReportCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  studentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  studentAvatar: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
  },
  studentAvatarText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  studentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentMeta: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  kelancaranBadge: {
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  badgeMumtaz: {
    backgroundColor: '#ECFDF5',
  },
  badgeJayyid: {
    backgroundColor: '#EFF6FF',
  },
  badgeMaqbul: {
    backgroundColor: '#FFFBEB',
  },
  kelancaranBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  lastHafalanRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  lastHafalanLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  lastHafalanValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  lastHafalanDate: {
    fontSize: 10,
    color: '#94A3B8',
    fontWeight: '600',
  },
  studentCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  statChipsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statChip: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  statChipVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  statChipLabel: {
    fontSize: 8.5,
    color: '#64748B',
    fontWeight: '600',
  },
  printCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 10,
    gap: 4,
  },
  printCardBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  fieldHelperBadge: {
    backgroundColor: '#DCFCE7',
    paddingVertical: 2,
    paddingHorizontal: 7,
    borderRadius: 6,
  },
  fieldHelperBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#15803D',
  },
  fieldHelperText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#047857',
  },

  classAvatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  classAvatarSmall: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#DCFCE7',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  modalSubHeader: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '500',
  },
  modalRombelChipsWrap: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalRombelChip: {
    backgroundColor: '#F1F5F9',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  modalRombelChipActive: {
    backgroundColor: '#064E3B',
    borderColor: '#064E3B',
  },
  modalRombelChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  modalRombelChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  modalEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 30,
    paddingHorizontal: 20,
  },
  modalEmptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
  },
  logsFilterRow: {
    marginBottom: 12,
  },
});
