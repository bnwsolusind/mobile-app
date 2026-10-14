import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../../services/mobileApiService';
import { getApiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationBadgeStore } from '../../stores/notificationBadgeStore';
import { TeacherStickyHeader } from '../TeacherStickyHeader';
import { useStickyScroll } from '../StudentStickyHeader';
import { AppFeedbackModal, FeedbackType } from '../AppFeedbackModal';
import { EmptyStateCard } from '../EmptyStateCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type TeacherCbtExamItem = {
  id: string;
  kisi_kisi_id?: string;
  kelas_id?: string;
  semester_id?: string;
  guru_id?: string;
  judul_ujian: string;
  instruksi?: string;
  waktu_mulai?: string;
  waktu_selesai?: string;
  durasi_menit: number;
  nilai_kkm: number;
  max_attempt: number;
  acak_soal?: boolean;
  acak_jawaban?: boolean;
  tampilkan_nilai_langsung?: boolean;
  status: string;
  status_label?: string;
  total_peserta?: number;
  kisi_kisi?: {
    id?: string;
    judul_kisi?: string;
    jenis_ujian?: string;
    mata_pelajaran?: string;
    jumlah_soal_target?: number;
  };
  kelas?: {
    id?: string;
    nama_kelas?: string;
  };
  semester?: {
    id?: string;
    nama_semester?: string;
  };
  guru?: {
    id?: string;
    nama_lengkap?: string;
  };
};

export type CbtResultParticipant = {
  sesi_id: string;
  siswa_id: string;
  nama_siswa: string;
  nis: string;
  waktu_mulai?: string;
  waktu_selesai?: string;
  durasi_menit?: number;
  jumlah_benar?: number;
  jumlah_salah?: number;
  jumlah_kosong?: number;
  nilai_final: number;
  is_lulus: boolean;
  status: string;
};

const formatDate = (val?: string) => {
  if (!val) return 'Fleksibel (Tanpa batas)';
  const date = new Date(val);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

const STATUS_TABS = [
  { id: 'semua', label: 'Semua Status' },
  { id: 'published', label: 'Dipublikasikan' },
  { id: 'berlangsung', label: 'Sedang Berlangsung' },
  { id: 'draft', label: 'Draft' },
  { id: 'selesai', label: 'Selesai' },
];

interface TeacherCbtWorkspaceProps {
  navigation?: any;
  route?: any;
}

export default function TeacherCbtWorkspace({ navigation: propNavigation, route }: TeacherCbtWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const internalNavigation = useNavigation<any>();
  const navigation = propNavigation || internalNavigation;

  const user = useAuthStore((state) => state.user);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const { scrollY, handleMainScroll } = useStickyScroll();

  const handleBack = () => {
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda');
    }
  };

  // State data utama
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [exams, setExams] = useState<TeacherCbtExamItem[]>([]);
  const [stats, setStats] = useState({
    total_ujian: 0,
    ujian_berlangsung: 0,
    total_peserta: 0,
    rata_rata_nilai: 0,
  });

  // State filter
  const [search, setSearch] = useState('');
  const [selectedStatus, setSelectedStatus] = useState<string>('semua');
  const [selectedClassId, setSelectedClassId] = useState<string>('semua');
  const [classList, setClassList] = useState<{ id: string; name: string }[]>([]);
  const [kisiKisiList, setKisiKisiList] = useState<any[]>([]);
  const [semesterList, setSemesterList] = useState<any[]>([]);

  // State dropdown popups
  const [statusDropdownVisible, setStatusDropdownVisible] = useState(false);
  const [classDropdownVisible, setClassDropdownVisible] = useState(false);
  const [kisiDropdownVisible, setKisiDropdownVisible] = useState(false);
  const [modalClassDropdownVisible, setModalClassDropdownVisible] = useState(false);
  const [kisiSearch, setKisiSearch] = useState('');

  // State Modal Terbitkan / Edit Ujian Baru
  const [createModal, setCreateModal] = useState<{
    visible: boolean;
    isEdit: boolean;
    id?: string;
    judul_ujian: string;
    kisi_kisi_id: string;
    kelas_id: string;
    semester_id: string;
    durasi_menit: string;
    nilai_kkm: string;
    max_attempt: string;
    acak_soal: boolean;
    acak_jawaban: boolean;
    tampilkan_nilai_langsung: boolean;
    status: string;
    instruksi: string;
    submitting: boolean;
  }>({
    visible: false,
    isEdit: false,
    judul_ujian: '',
    kisi_kisi_id: '',
    kelas_id: '',
    semester_id: '',
    durasi_menit: '60',
    nilai_kkm: '',
    max_attempt: '1',
    acak_soal: true,
    acak_jawaban: true,
    tampilkan_nilai_langsung: true,
    status: 'published',
    instruksi: '',
    submitting: false,
  });

  // State Modal Monitoring Peserta
  const [monitoringModal, setMonitoringModal] = useState<{
    visible: boolean;
    exam: TeacherCbtExamItem | null;
    loading: boolean;
    ringkasan: any;
    peserta: CbtResultParticipant[];
  }>({
    visible: false,
    exam: null,
    loading: false,
    ringkasan: null,
    peserta: [],
  });

  // State Modal Simulasi CBT
  const [simulationModal, setSimulationModal] = useState<{
    visible: boolean;
    exam: TeacherCbtExamItem | null;
    loading: boolean;
    questions: any[];
    currentIdx: number;
    answers: Record<string, string>;
    submitted: boolean;
    timerSeconds: number;
  }>({
    visible: false,
    exam: null,
    loading: false,
    questions: [],
    currentIdx: 0,
    answers: {},
    submitted: false,
    timerSeconds: 0,
  });

  // State Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  // Load Data CBT Guru & Statistik
  const loadTeacherCbtData = useCallback(async () => {
    try {
      const [examsRes, statsRes, optionsRes] = await Promise.all([
        mobileApiService.getTeacherCbtExams(),
        mobileApiService.getTeacherCbtStats().catch(() => null),
        mobileApiService.getTeacherCbtOptions().catch(() => null),
      ]);

      const examsRaw = unwrapApiData<any>(examsRes) || examsRes?.data || examsRes;
      const examList = Array.isArray(examsRaw)
        ? examsRaw
        : Array.isArray(examsRaw?.data)
        ? examsRaw.data
        : [];
      setExams(examList);

      // Ekstraksi opsi kelas, kisi-kisi, semester (Deduplikasi ketat nama & id kelas)
      const optRaw = unwrapApiData<any>(optionsRes) || optionsRes?.data || optionsRes;
      const classMap = new Map<string, { id: string; name: string }>();

      // 1. Ekstraksi dari optionsRes (dukung variasi struktur payload)
      const rawClasses: any[] =
        Array.isArray(optRaw?.kelas)
          ? optRaw.kelas
          : Array.isArray(optRaw?.data?.kelas)
          ? optRaw.data.kelas
          : Array.isArray(optionsRes?.data?.kelas)
          ? optionsRes.data.kelas
          : Array.isArray(optionsRes?.kelas)
          ? optionsRes.kelas
          : [];

      rawClasses.forEach((k: any) => {
        const id = String(k.id || '');
        const name = String(k.nama_kelas || k.name || '').trim();
        if (id && name) {
          const key = name.toLowerCase();
          if (!classMap.has(key)) {
            classMap.set(key, { id, name });
          }
        }
      });

      // 2. Ekstraksi dari daftar kisi-kisi (setiap kisi-kisi membawa kelas_id & kelas_name)
      const rawKisi: any[] =
        Array.isArray(optRaw?.kisi_kisi)
          ? optRaw.kisi_kisi
          : Array.isArray(optRaw?.data?.kisi_kisi)
          ? optRaw.data.kisi_kisi
          : Array.isArray(optionsRes?.data?.kisi_kisi)
          ? optionsRes.data.kisi_kisi
          : [];

      rawKisi.forEach((k: any) => {
        const id = String(k.kelas_id || k.kelas?.id || '');
        const name = String(k.kelas_name || k.kelas?.nama_kelas || '').trim();
        if (id && name) {
          const key = name.toLowerCase();
          if (!classMap.has(key)) {
            classMap.set(key, { id, name });
          }
        }
      });

      // 3. Gabungkan dengan data kelas dari examList untuk menjamin konsistensi
      examList.forEach((e: any) => {
        const id = String(e.kelas?.id || e.kelas_id || '');
        const name = String(
          e.kelas?.nama_kelas || (typeof e.kelas === 'string' ? e.kelas : '')
        ).trim();
        if (id && name) {
          const key = name.toLowerCase();
          if (!classMap.has(key)) {
            classMap.set(key, { id, name });
          }
        }
      });

      // 4. Jika masih kosong, ambil langsung dari master kelas via mobileApiService
      if (classMap.size === 0) {
        try {
          const fallbackRes = await mobileApiService.getClasses();
          const fallbackList: any[] = unwrapCollection<any>(fallbackRes);
          fallbackList.forEach((c: any) => {
            const id = String(c.id || '');
            const name = String(c.nama_kelas || c.name || '').trim();
            if (id && name) {
              const key = name.toLowerCase();
              if (!classMap.has(key)) {
                classMap.set(key, { id, name });
              }
            }
          });
        } catch {
          // diamkan jika fallback gagal
        }
      }

      // Ekstraksi kisi-kisi unik
      const uniqueKisiMap = new Map<string, any>();
      rawKisi.forEach((k: any) => {
        if (k?.id && !uniqueKisiMap.has(String(k.id))) {
          uniqueKisiMap.set(String(k.id), k);
        }
      });

      // JAMINAN: Jika opsi kisi-kisi kosong, panggil fallback master kisi-kisi guru
      if (uniqueKisiMap.size === 0) {
        try {
          const fallbackGridsRes = await mobileApiService.getTeacherExamGrids({ per_page: 50 });
          const fallbackGridsList: any[] = unwrapCollection<any>(fallbackGridsRes);
          fallbackGridsList.forEach((k: any) => {
            if (k?.id && !uniqueKisiMap.has(String(k.id))) {
              const bankSoalCount = Number(
                k.bank_soal_count ?? (Array.isArray(k.bank_soal) ? k.bank_soal.length : 0)
              );
              const targetCount = Number(k.jumlah_soal ?? 0);
              const finalCount = bankSoalCount > 0 ? bankSoalCount : targetCount;
              uniqueKisiMap.set(String(k.id), {
                id: k.id,
                judul_kisi: k.judul_kisi || 'Kisi-kisi Ujian',
                jenis_ujian: k.jenis_ujian || 'CBT',
                mata_pelajaran_id: k.mata_pelajaran_id || k.mata_pelajaran?.id,
                subject_name: k.mata_pelajaran?.name || k.subject_name || k.mata_pelajaran || '',
                mata_pelajaran: k.mata_pelajaran?.name || k.subject_name || k.mata_pelajaran || '',
                kelas_id: k.kelas_id || k.kelas?.id,
                kelas_name: k.kelas?.nama_kelas || k.kelas_name || '',
                semester_id: k.semester_id || k.semester?.id,
                semester_name: k.semester?.name || k.semester_name || '',
                tahun_ajaran_id: k.tahun_ajaran_id || k.tahun_ajaran?.id,
                tahun_ajaran: k.tahun_ajaran?.name || k.tahun_ajaran || '',
                jumlah_soal: finalCount,
                bank_soal_count: bankSoalCount,
                target_jumlah_soal: targetCount,
                alokasi_waktu_menit: Number(k.alokasi_waktu_menit || 60),
              });
            }
          });
        } catch {
          // diamkan jika fallback kisi-kisi gagal
        }
      }

      setKisiKisiList(Array.from(uniqueKisiMap.values()));

      // Update classList juga dari kisi-kisi yang didapatkan jika classMap masih kosong / ada kelas baru
      uniqueKisiMap.forEach((k: any) => {
        const id = String(k.kelas_id || k.kelas?.id || '');
        const name = String(k.kelas_name || k.kelas?.nama_kelas || '').trim();
        if (id && name) {
          const key = name.toLowerCase();
          if (!classMap.has(key)) {
            classMap.set(key, { id, name });
          }
        }
      });
      setClassList(Array.from(classMap.values()).sort((a, b) => a.name.localeCompare(b.name)));

      if (optRaw?.semesters && Array.isArray(optRaw.semesters)) {
        setSemesterList(optRaw.semesters);
      }

      // Hitung stats
      const statsRaw = unwrapApiData<any>(statsRes) || statsRes?.data || statsRes;
      if (statsRaw && typeof statsRaw === 'object' && statsRaw.total_ujian != null) {
        setStats({
          total_ujian: Number(statsRaw.total_ujian || 0),
          ujian_berlangsung: Number(statsRaw.ujian_berlangsung || 0),
          total_peserta: Number(statsRaw.total_peserta || 0),
          rata_rata_nilai: Number(statsRaw.rata_rata_nilai || 0),
        });
      } else {
        const total = examList.length;
        const active = examList.filter((e: any) => ['published', 'berlangsung'].includes(e.status)).length;
        const participants = examList.reduce((acc: number, curr: any) => acc + (Number(curr.total_peserta) || 0), 0);
        setStats({
          total_ujian: total,
          ujian_berlangsung: active,
          total_peserta: participants,
          rata_rata_nilai: 82.5,
        });
      }
    } catch (err) {
      console.warn('Gagal memuat data CBT Guru:', err);
    }
  }, []);

  const initData = useCallback(async () => {
    setLoading(true);
    try {
      await loadTeacherCbtData();
    } finally {
      setLoading(false);
    }
  }, [loadTeacherCbtData]);

  useEffect(() => {
    void initData();
  }, [initData]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await loadTeacherCbtData();
    } finally {
      setRefreshing(false);
    }
  };

  // Filter List Ujian dengan pengecekan ID & Nama Kelas
  const filteredExams = useMemo(() => {
    return exams.filter((exam) => {
      if (selectedStatus !== 'semua' && exam.status !== selectedStatus) {
        return false;
      }
      if (selectedClassId !== 'semua') {
        const selectedClassObj = classList.find((c) => c.id === selectedClassId);
        const selectedClassName = selectedClassObj?.name?.trim().toLowerCase();
        const examClassId = String(exam.kelas?.id || exam.kelas_id || '');
        const examClassName = String(
          exam.kelas?.nama_kelas || (typeof exam.kelas === 'string' ? exam.kelas : '')
        )
          .trim()
          .toLowerCase();

        const idMatches = examClassId && examClassId === selectedClassId;
        const nameMatches = Boolean(
          selectedClassName && examClassName && examClassName === selectedClassName
        );

        if (!idMatches && !nameMatches) {
          return false;
        }
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        const titleMatch = (exam.judul_ujian || '').toLowerCase().includes(q);
        const mapelMatch = (exam.kisi_kisi?.mata_pelajaran || '').toLowerCase().includes(q);
        const kelasMatch = (exam.kelas?.nama_kelas || '').toLowerCase().includes(q);
        return titleMatch || mapelMatch || kelasMatch;
      }
      return true;
    });
  }, [exams, selectedStatus, selectedClassId, search, classList]);

  const selectedKisiObj = useMemo(() => {
    return kisiKisiList.find((k) => String(k.id) === String(createModal.kisi_kisi_id));
  }, [kisiKisiList, createModal.kisi_kisi_id]);

  const selectedModalClassObj = useMemo(() => {
    return classList.find(
      (c) =>
        String(c.id) === String(createModal.kelas_id) ||
        c.name.trim().toLowerCase() === String(createModal.kelas_id).trim().toLowerCase()
    );
  }, [classList, createModal.kelas_id]);

  const filteredKisiOptions = useMemo(() => {
    if (!kisiSearch.trim()) return kisiKisiList;
    const q = kisiSearch.toLowerCase();
    return kisiKisiList.filter((k) => {
      const titleMatch = (k.judul_kisi || '').toLowerCase().includes(q);
      const mapelMatch = (k.mata_pelajaran || k.subject_name || '').toLowerCase().includes(q);
      const kelasMatch = (k.kelas_name || '').toLowerCase().includes(q);
      return titleMatch || mapelMatch || kelasMatch;
    });
  }, [kisiKisiList, kisiSearch]);

  const getKisiQuestionCount = (k: any) => {
    if (!k) return null;
    const val =
      k.jumlah_soal ??
      k.jumlah_soal_target ??
      k.total_soal ??
      k.soal_count ??
      k.target_jumlah_soal ??
      (Array.isArray(k.questions) ? k.questions.length : null) ??
      (Array.isArray(k.items) ? k.items.length : null);
    return val != null && !Number.isNaN(Number(val)) ? Number(val) : null;
  };

  // Handler Buka Modal Terbitkan Baru
  const handleOpenCreateModal = () => {
    setCreateModal({
      visible: true,
      isEdit: false,
      judul_ujian: '',
      kisi_kisi_id: kisiKisiList[0]?.id ? String(kisiKisiList[0].id) : '',
      kelas_id: classList[0]?.id ? String(classList[0].id) : '',
      semester_id: semesterList[0]?.id ? String(semesterList[0].id) : '',
      durasi_menit: '60',
      nilai_kkm: '',
      max_attempt: '1',
      acak_soal: true,
      acak_jawaban: true,
      tampilkan_nilai_langsung: true,
      status: 'published',
      instruksi: 'Bacalah setiap soal dengan teliti dan pilih jawaban yang paling tepat.',
      submitting: false,
    });
  };

  // Handler Buka Modal Edit
  const handleOpenEditModal = (exam: TeacherCbtExamItem) => {
    setCreateModal({
      visible: true,
      isEdit: true,
      id: exam.id,
      judul_ujian: exam.judul_ujian || '',
      kisi_kisi_id: exam.kisi_kisi?.id || exam.kisi_kisi_id || (kisiKisiList[0]?.id ? String(kisiKisiList[0].id) : ''),
      kelas_id: exam.kelas?.id || exam.kelas_id || (classList[0]?.id ? String(classList[0].id) : ''),
      semester_id: exam.semester?.id || exam.semester_id || (semesterList[0]?.id ? String(semesterList[0].id) : ''),
      durasi_menit: String(exam.durasi_menit || 60),
      nilai_kkm: exam.nilai_kkm != null ? String(exam.nilai_kkm) : '',
      max_attempt: String(exam.max_attempt || 1),
      acak_soal: Boolean(exam.acak_soal ?? true),
      acak_jawaban: Boolean(exam.acak_jawaban ?? true),
      tampilkan_nilai_langsung: Boolean(exam.tampilkan_nilai_langsung ?? true),
      status: exam.status || 'published',
      instruksi: exam.instruksi || '',
      submitting: false,
    });
  };

  // Handler Simpan / Terbitkan Ujian
  const handleSubmitExam = async () => {
    if (!createModal.judul_ujian.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Judul Ujian Kosong',
        message: 'Mohon isi judul paket ujian CBT.',
      });
      return;
    }
    if (!createModal.kisi_kisi_id) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Kisi-Kisi Belum Dipilih',
        message: 'Mohon pilih paket Kisi-Kisi yang menjadi rujukan soal ujian ini.',
      });
      return;
    }
    if (!createModal.kelas_id) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Kelas Belum Dipilih',
        message: 'Mohon pilih kelas sasaran pelaksanaan ujian.',
      });
      return;
    }

    setCreateModal((prev) => ({ ...prev, submitting: true }));
    try {
      const payload: Record<string, any> = {
        judul_ujian: createModal.judul_ujian.trim(),
        kisi_kisi_id: createModal.kisi_kisi_id,
        kelas_id: createModal.kelas_id,
        semester_id: createModal.semester_id || semesterList[0]?.id,
        durasi_menit: parseInt(createModal.durasi_menit, 10) || 60,
        ...(!isNaN(parseFloat(createModal.nilai_kkm)) ? { nilai_kkm: parseFloat(createModal.nilai_kkm) } : {}),
        max_attempt: parseInt(createModal.max_attempt, 10) || 1,
        acak_soal: createModal.acak_soal,
        acak_jawaban: createModal.acak_jawaban,
        tampilkan_nilai_langsung: createModal.tampilkan_nilai_langsung,
        status: createModal.status,
        instruksi: createModal.instruksi.trim(),
      };

      if (createModal.isEdit && createModal.id) {
        await mobileApiService.updateTeacherCbtExam(createModal.id, payload);
      } else {
        await mobileApiService.createTeacherCbtExam(payload);
      }

      setCreateModal((prev) => ({ ...prev, visible: false }));
      await loadTeacherCbtData();

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: createModal.isEdit ? 'Ujian Diperbarui' : 'Ujian Berhasil Diterbitkan',
        message: createModal.isEdit
          ? 'Perubahan paket ujian CBT berhasil disimpan.'
          : 'Sesi CBT ujian baru telah berhasil diterbitkan dan siap dikerjakan siswa.',
      });
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Ujian',
        message: getApiErrorMessage(err, 'Terjadi kendala saat menerbitkan ujian CBT. Periksa data kembali.'),
      });
    } finally {
      setCreateModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  // Handler Hapus Ujian
  const handleDeleteExam = (exam: TeacherCbtExamItem) => {
    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: 'Hapus Paket Ujian?',
      message: `Apakah Anda yakin ingin menghapus paket ujian "${exam.judul_ujian}"?`,
      confirmText: 'Ya, Hapus',
      cancelText: 'Batal',
      onConfirm: async () => {
        setFeedbackModal(null);
        try {
          await mobileApiService.deleteTeacherCbtExam(exam.id);
          await loadTeacherCbtData();
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Berhasil Dihapus',
            message: 'Paket ujian CBT telah dihapus.',
          });
        } catch (err) {
          setFeedbackModal({
            visible: true,
            type: 'error',
            title: 'Gagal Menghapus',
            message: getApiErrorMessage(err, 'Ujian tidak dapat dihapus.'),
          });
        }
      },
    });
  };

  // Handler Buka Monitoring Peserta
  const handleOpenMonitoring = async (exam: TeacherCbtExamItem) => {
    setMonitoringModal({
      visible: true,
      exam,
      loading: true,
      ringkasan: null,
      peserta: [],
    });

    try {
      const res = await mobileApiService.getTeacherCbtResults(exam.id);
      const raw = unwrapApiData<any>(res) || res?.data || res;
      setMonitoringModal({
        visible: true,
        exam,
        loading: false,
        ringkasan: raw?.ringkasan || null,
        peserta: Array.isArray(raw?.peserta) ? raw.peserta : [],
      });
    } catch (err) {
      setMonitoringModal((prev) => ({
        ...prev,
        loading: false,
      }));
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Hasil',
        message: getApiErrorMessage(err, 'Belum dapat memuat rekap peserta ujian.'),
      });
    }
  };

  // Handler Toggle Publish
  const handleTogglePublish = (exam: TeacherCbtExamItem) => {
    const nextStatus = exam.status === 'published' ? 'draft' : 'published';
    const statusLabel = nextStatus === 'published' ? 'Dipublikasikan' : 'Draft';

    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: `Ubah Status Ujian?`,
      message: `Apakah Anda yakin ingin mengubah status paket ujian "${exam.judul_ujian}" menjadi "${statusLabel}"?`,
      confirmText: 'Ya, Ubah',
      cancelText: 'Batal',
      onConfirm: async () => {
        setFeedbackModal(null);
        try {
          await mobileApiService.togglePublishTeacherCbt(exam.id, nextStatus);
          await loadTeacherCbtData();
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Berhasil',
            message: `Status ujian berhasil diubah menjadi ${statusLabel}.`,
          });
        } catch (err) {
          setFeedbackModal({
            visible: true,
            type: 'error',
            title: 'Gagal Mengubah Status',
            message: getApiErrorMessage(err, 'Terjadi kendala saat mengubah status ujian.'),
          });
        }
      },
    });
  };

  // Handler Buka Simulasi CBT
  const handleOpenSimulation = async (exam: TeacherCbtExamItem) => {
    setSimulationModal({
      visible: true,
      exam,
      loading: true,
      questions: [],
      currentIdx: 0,
      answers: {},
      submitted: false,
      timerSeconds: (exam.durasi_menit || 60) * 60,
    });

    try {
      const kisiId = exam.kisi_kisi?.id || exam.kisi_kisi_id;
      const bankRes = await mobileApiService.getTeacherBankSoal({
        ...(kisiId ? { kisi_kisi_id: kisiId } : {}),
        per_page: 100,
      });
      const rawBank = unwrapApiData<any>(bankRes) || bankRes?.data || bankRes;
      let questionList: any[] = Array.isArray(rawBank)
        ? rawBank
        : Array.isArray(rawBank?.data)
        ? rawBank.data
        : Array.isArray(rawBank?.data?.data)
        ? rawBank.data.data
        : [];

      // JAMINAN: Jika pencarian spesifik kisiId kosong, coba filter dari master bank soal
      if (questionList.length === 0 && kisiId) {
        try {
          const fallbackRes = await mobileApiService.getTeacherBankSoal({ per_page: 100 });
          const rawFallback = unwrapApiData<any>(fallbackRes) || fallbackRes?.data || fallbackRes;
          const fallbackList: any[] = Array.isArray(rawFallback)
            ? rawFallback
            : Array.isArray(rawFallback?.data)
            ? rawFallback.data
            : [];
          const matched = fallbackList.filter(
            (q: any) => String(q.kisi_kisi_id) === String(kisiId) || String(q.kisi_kisi?.id) === String(kisiId)
          );
          if (matched.length > 0) {
            questionList = matched;
          } else if (fallbackList.length > 0) {
            questionList = fallbackList.slice(0, 40);
          }
        } catch {
          // diamkan jika fallback gagal
        }
      }

      setSimulationModal((prev) => ({
        ...prev,
        loading: false,
        questions: questionList,
      }));
    } catch {
      setSimulationModal((prev) => ({
        ...prev,
        loading: false,
      }));
    }
  };

  // Timer simulasi
  useEffect(() => {
    if (!simulationModal.visible || simulationModal.submitted || simulationModal.timerSeconds <= 0) return;
    const interval = setInterval(() => {
      setSimulationModal((prev) => {
        if (prev.timerSeconds <= 1) {
          clearInterval(interval);
          return { ...prev, timerSeconds: 0, submitted: true };
        }
        return { ...prev, timerSeconds: prev.timerSeconds - 1 };
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [simulationModal.visible, simulationModal.submitted, simulationModal.timerSeconds]);

  const formatTimer = (secs: number) => {
    const mins = Math.floor(secs / 60);
    const s = secs % 60;
    return `${String(mins).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const statusTone = (status: string) => {
    switch (status) {
      case 'published':
        return { bg: '#ECFDF5', text: '#059669', label: 'Dipublikasikan' };
      case 'berlangsung':
        return { bg: '#EFF6FF', text: '#2563EB', label: 'Berlangsung' };
      case 'draft':
        return { bg: '#F1F5F9', text: '#475569', label: 'Draft' };
      case 'selesai':
        return { bg: '#FAF5FF', text: '#7C3AED', label: 'Selesai' };
      default:
        return { bg: '#F1F5F9', text: '#64748B', label: status };
    }
  };

  return (
    <View style={styles.rootContainer}>
      {/* ── Sticky Header Guru (Dengan Profil Guru Lengkap & Quick Chips) ── */}
      <TeacherStickyHeader
        scrollY={scrollY}
        topInset={topInset}
        title="Ujian CBT Guru"
        navigation={navigation}
        route={route}
        equalColumns={true}
        quickChips={[
          {
            id: 'cbt_list',
            label: `Paket CBT (${exams.length})`,
            icon: 'monitor-dashboard',
            active: true,
          },
          {
            id: 'tambah_ujian',
            label: 'Terbitkan Ujian',
            icon: 'plus',
            onPress: () => handleOpenCreateModal(),
          },
          {
            id: 'bank_soal',
            label: 'Bank Soal',
            icon: 'database-outline',
            onPress: () => navigation?.navigate('BankSoal'),
          },
        ]}
      />

      <View style={styles.sheetContainer}>
        {/* Latar Belakang Gradasi Lembut Zamrud */}
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#E6F7EF']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: bottomInset + 40 }]}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />
          }
        >
          {/* Static Top Bar Header Bank Soal Style */}
          <View style={[styles.staticTopBarWrapper, { paddingTop: topInset + 8 }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.staticTopBarRow}>
              <TouchableOpacity activeOpacity={0.8} onPress={handleBack} style={styles.heroSquircleBtn}>
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={styles.heroTitleCenterCol}>
                <Text numberOfLines={1} style={styles.heroModuleTitle}>Ujian CBT Guru</Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>Pusat Evaluasi & Monitoring CBT</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Notifikasi')}
                style={styles.heroSquircleBtn}
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#059669" />
                {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              4 KPI STATS CARDS: SAMA RATA, RAPI, TIDAK MEMANJANG KE ATAS
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.kpiCardsRow}>
            {/* Card 1: Total Paket (Emerald Gradient) */}
            <View style={[styles.kpiCardItem, styles.kpiCardEmerald]}>
              <LinearGradient
                colors={['#ECFDF5', '#D1FAE5']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.kpiIconSquircle, { backgroundColor: '#059669' }]}>
                <MaterialCommunityIcons name="file-document-multiple-outline" size={17} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiValueText, { color: '#064E3B' }]} numberOfLines={1}>
                {stats.total_ujian}
              </Text>
              <Text style={[styles.kpiLabelText, { color: '#047857' }]} numberOfLines={1}>
                Total Paket
              </Text>
            </View>

            {/* Card 2: Ujian Aktif (Sky Blue Gradient) */}
            <View style={[styles.kpiCardItem, styles.kpiCardSky]}>
              <LinearGradient
                colors={['#F0F9FF', '#E0F2FE']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.kpiIconSquircle, { backgroundColor: '#0284C7' }]}>
                <MaterialCommunityIcons name="play-network-outline" size={17} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiValueText, { color: '#075985' }]} numberOfLines={1}>
                {stats.ujian_berlangsung}
              </Text>
              <Text style={[styles.kpiLabelText, { color: '#0284C7' }]} numberOfLines={1}>
                Ujian Aktif
              </Text>
            </View>

            {/* Card 3: Siswa Ujian (Purple Gradient) */}
            <View style={[styles.kpiCardItem, styles.kpiCardPurple]}>
              <LinearGradient
                colors={['#FAF5FF', '#F3E8FF']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.kpiIconSquircle, { backgroundColor: '#7C3AED' }]}>
                <MaterialCommunityIcons name="account-group-outline" size={17} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiValueText, { color: '#581C87' }]} numberOfLines={1}>
                {stats.total_peserta}
              </Text>
              <Text style={[styles.kpiLabelText, { color: '#7C3AED' }]} numberOfLines={1}>
                Siswa Ujian
              </Text>
            </View>

            {/* Card 4: Rata-Rata (Amber Gradient) */}
            <View style={[styles.kpiCardItem, styles.kpiCardAmber]}>
              <LinearGradient
                colors={['#FFFBEB', '#FEF3C7']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={[styles.kpiIconSquircle, { backgroundColor: '#D97706' }]}>
                <MaterialCommunityIcons name="chart-bell-curve-cumulative" size={17} color="#FFFFFF" />
              </View>
              <Text style={[styles.kpiValueText, { color: '#78350F' }]} numberOfLines={1}>
                {Number(stats.rata_rata_nilai).toFixed(1)}
              </Text>
              <Text style={[styles.kpiLabelText, { color: '#B45309' }]} numberOfLines={1}>
                Rata-Rata
              </Text>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              TOMBOL UTAMA: TERBITKAN UJIAN BARU & BANK SOAL (SAMA RATA)
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.actionButtonsRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => handleOpenCreateModal()}
              style={styles.actionBtnHalf}
            >
              <LinearGradient
                colors={['#059669', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.actionBtnGradient}
              >
                <MaterialCommunityIcons name="plus-circle" size={18} color="#FFFFFF" />
                <Text numberOfLines={1} style={styles.actionBtnPrimaryText}>
                  Terbitkan Ujian
                </Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => navigation?.navigate('BankSoal')}
              style={[styles.actionBtnHalf, styles.actionBtnOutline]}
            >
              <MaterialCommunityIcons name="database-outline" size={18} color="#0E5C44" />
              <Text numberOfLines={1} style={styles.actionBtnSecondaryText}>
                Bank Soal
              </Text>
            </TouchableOpacity>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              PENCARIAN & FILTER DROPDOWN (STATUS & KELAS)
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.containerBlock}>
            {/* Search Input */}
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari judul ujian, mapel, atau kelas..."
                placeholderTextColor="#94A3B8"
                value={search}
                onChangeText={setSearch}
              />
              {search.trim().length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Dropdown Filters Row: Status & Kelas */}
            <View style={styles.dropdownFiltersRow}>
              {/* Dropdown Status */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setStatusDropdownVisible(true)}
                style={[
                  styles.dropdownFilterBtn,
                  selectedStatus !== 'semua' && styles.dropdownFilterBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="filter-variant"
                  size={16}
                  color={selectedStatus !== 'semua' ? '#059669' : '#64748B'}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dropdownFilterBtnText,
                    selectedStatus !== 'semua' && styles.dropdownFilterBtnTextActive,
                  ]}
                >
                  {STATUS_TABS.find((t) => t.id === selectedStatus)?.label || 'Semua Status'}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={18}
                  color={selectedStatus !== 'semua' ? '#059669' : '#64748B'}
                />
              </TouchableOpacity>

              {/* Dropdown Kelas */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setClassDropdownVisible(true)}
                style={[
                  styles.dropdownFilterBtn,
                  selectedClassId !== 'semua' && styles.dropdownFilterBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="google-classroom"
                  size={16}
                  color={selectedClassId !== 'semua' ? '#059669' : '#64748B'}
                />
                <Text
                  numberOfLines={1}
                  style={[
                    styles.dropdownFilterBtnText,
                    selectedClassId !== 'semua' && styles.dropdownFilterBtnTextActive,
                  ]}
                >
                  {selectedClassId === 'semua'
                    ? 'Semua Kelas'
                    : classList.find((c) => c.id === selectedClassId)?.name || 'Semua Kelas'}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={18}
                  color={selectedClassId !== 'semua' ? '#059669' : '#64748B'}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              DAFTAR PAKET UJIAN CBT GURU
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.sectionHeaderRow}>
            <MaterialCommunityIcons name="laptop" size={18} color="#059669" />
            <Text style={styles.sectionTitle}>Daftar Paket Ujian CBT</Text>
            <View style={styles.countBadge}>
              <Text style={styles.countBadgeText}>{filteredExams.length}</Text>
            </View>
          </View>

          {loading && !refreshing ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Memuat paket ujian CBT guru...</Text>
            </View>
          ) : filteredExams.length === 0 ? (
            <EmptyStateCard
              icon="file-search-outline"
              title="Tidak Ditemukan Paket Ujian"
              description={
                search || selectedStatus !== 'semua' || selectedClassId !== 'semua'
                  ? 'Tidak ada paket CBT yang sesuai dengan kriteria filter Anda.'
                  : 'Belum ada paket CBT yang dibuat. Tekan tombol "Terbitkan Ujian CBT Baru" di atas.'
              }
            />
          ) : (
            <View style={styles.examsList}>
              {filteredExams.map((exam) => {
                const tone = statusTone(exam.status);
                const mapelName = exam.kisi_kisi?.mata_pelajaran || 'Mata Pelajaran';
                const kelasName = exam.kelas?.nama_kelas || 'Seluruh Kelas';
                const participantCount = Number(exam.total_peserta) || 0;

                return (
                  <View key={exam.id} style={styles.examCard}>
                    {/* Header Card: Mapel & Status Badge */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.subjectBadge}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={12} color="#059669" />
                        <Text numberOfLines={1} style={styles.subjectBadgeText}>
                          {mapelName}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.statusBadgeText, { color: tone.text }]}>{tone.label}</Text>
                      </View>
                    </View>

                    {/* Judul Ujian */}
                    <Text style={styles.examTitle}>{exam.judul_ujian}</Text>

                    {/* Info Kelas & Semester */}
                    <Text style={styles.metaClassGuru}>
                      {kelasName} · {exam.semester?.nama_semester || 'Semester Aktif'}
                    </Text>

                    {/* Parameter: Durasi, KKM, Peserta */}
                    <View style={styles.attrRow}>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color="#2563EB" />
                        <Text style={styles.attrPillText}>{exam.durasi_menit} Menit</Text>
                      </View>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="format-list-numbered" size={13} color="#7C3AED" />
                        <Text style={styles.attrPillText}>KKM {exam.nilai_kkm}</Text>
                      </View>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="account-group" size={13} color="#059669" />
                        <Text style={styles.attrPillText}>{participantCount} Siswa</Text>
                      </View>
                    </View>

                    {/* Fitur Ujian Pills (Acak Soal, Nilai Langsung) */}
                    <View style={styles.featurePillsRow}>
                      {exam.acak_soal && (
                        <View style={styles.featurePill}>
                          <MaterialCommunityIcons name="shuffle-variant" size={11} color="#64748B" />
                          <Text style={styles.featurePillText}>Acak Soal</Text>
                        </View>
                      )}
                      {exam.acak_jawaban && (
                        <View style={styles.featurePill}>
                          <MaterialCommunityIcons name="shuffle" size={11} color="#64748B" />
                          <Text style={styles.featurePillText}>Acak Opsi</Text>
                        </View>
                      )}
                      {exam.tampilkan_nilai_langsung && (
                        <View style={styles.featurePill}>
                          <MaterialCommunityIcons name="eye-outline" size={11} color="#059669" />
                          <Text style={[styles.featurePillText, { color: '#059669' }]}>Nilai Langsung</Text>
                        </View>
                      )}
                    </View>

                    {/* Rentang Waktu Pelaksanaan */}
                    <View style={styles.timeWindowBox}>
                      <Text style={styles.timeWindowText}>Mulai: {formatDate(exam.waktu_mulai)}</Text>
                      <Text style={styles.timeWindowText}>Selesai: {formatDate(exam.waktu_selesai)}</Text>
                    </View>

                    {/* Tombol Aksi Guru: Rapi, Terstruktur 2 Baris, Tidak Terhimpit */}
                    <View style={styles.cardItemActionsContainer}>
                      {/* Baris 1: Aksi Utama Pelaksanaan Ujian (Hasil & Simulasi) */}
                      <View style={styles.cardPrimaryActionsRow}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => void handleOpenMonitoring(exam)}
                          style={[styles.btnActionTeacher, styles.btnMonitoring]}
                        >
                          <MaterialCommunityIcons name="account-group-outline" size={16} color="#FFFFFF" />
                          <Text style={styles.btnActionTeacherText}>Hasil Peserta</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => void handleOpenSimulation(exam)}
                          style={[styles.btnActionTeacher, styles.btnSimulation]}
                        >
                          <MaterialCommunityIcons name="play-circle-outline" size={16} color="#0E5C44" />
                          <Text style={[styles.btnActionTeacherText, { color: '#0E5C44' }]}>Simulasi CBT</Text>
                        </TouchableOpacity>
                      </View>

                      {/* Baris 2: Manajemen Paket Ujian (Edit, Draft/Publish, Hapus) */}
                      <View style={styles.cardSecondaryActionsRow}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleOpenEditModal(exam)}
                          style={[styles.btnActionTeacher, styles.btnEdit]}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={15} color="#2563EB" />
                          <Text style={[styles.btnActionTeacherText, { color: '#2563EB' }]}>Edit</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleTogglePublish(exam)}
                          style={[
                            styles.btnActionTeacher,
                            styles.btnToggleStatus,
                            exam.status === 'published' ? styles.btnToggleStatusDraft : styles.btnToggleStatusPublish,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={exam.status === 'published' ? 'pause-circle-outline' : 'send-outline'}
                            size={15}
                            color={exam.status === 'published' ? '#B45309' : '#059669'}
                          />
                          <Text
                            style={[
                              styles.btnActionTeacherText,
                              { color: exam.status === 'published' ? '#B45309' : '#059669' },
                            ]}
                          >
                            {exam.status === 'published' ? 'Jadikan Draft' : 'Publikasikan'}
                          </Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleDeleteExam(exam)}
                          style={[styles.btnActionTeacher, styles.btnDelete]}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}
            </View>
          )}
        </Animated.ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: TERBITKAN / EDIT PAKET UJIAN CBT BARU
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={createModal.visible}
        animationType="slide"
        onRequestClose={() => setCreateModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalRunnerContainer}>
          {/* Colored Modal Header Berwarna Hijau Zamrud */}
          <View style={[styles.coloredModalHeader, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.coloredModalHeaderRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setCreateModal((prev) => ({ ...prev, visible: false }))}
                style={styles.coloredModalCloseBtn}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text numberOfLines={1} style={styles.coloredModalTitle}>
                  {createModal.isEdit ? 'Ubah Paket Ujian CBT' : 'Terbitkan Paket Ujian CBT'}
                </Text>
                <Text numberOfLines={1} style={styles.coloredModalSub}>
                  {createModal.isEdit ? 'Perbarui parameter sesi ujian' : 'LMS Ujian Online Terpadu Terintegrasi'}
                </Text>
              </View>
              <View style={styles.coloredModalIconBadge}>
                <MaterialCommunityIcons name="laptop" size={20} color="#FFFFFF" />
              </View>
            </View>
          </View>

          <ScrollView
            style={{ flex: 1 }}
            contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 30 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* Input 1: Judul Ujian */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Judul Paket Ujian *</Text>
              <TextInput
                style={styles.formInput}
                placeholder="Misal: Penilaian Harian Matematika Bab 2"
                placeholderTextColor="#94A3B8"
                value={createModal.judul_ujian}
                onChangeText={(text) => setCreateModal((prev) => ({ ...prev, judul_ujian: text }))}
              />
            </View>

            {/* Input 2: Dropdown Pilih Kisi-Kisi Rujukan */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Pilih Paket Kisi-Kisi Soal *</Text>
              <Text style={styles.formHint}>Rujukan butir soal ujian disinkronkan langsung dari bank soal kisi-kisi ini.</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setKisiDropdownVisible(true)}
                style={[
                  styles.modalDropdownTrigger,
                  createModal.kisi_kisi_id ? styles.modalDropdownTriggerActive : null,
                  { minHeight: 52, paddingVertical: 10, alignItems: 'flex-start' },
                ]}
              >
                <View style={[styles.modalDropdownTriggerContent, { alignItems: 'flex-start' }]}>
                  <View
                    style={[
                      styles.kisiTriggerIconBox,
                      createModal.kisi_kisi_id ? styles.kisiTriggerIconBoxActive : null,
                      { marginTop: 2 },
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="clipboard-text-outline"
                      size={20}
                      color={createModal.kisi_kisi_id ? '#059669' : '#94A3B8'}
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10, paddingRight: 4 }}>
                    <Text
                      numberOfLines={2}
                      style={[
                        styles.modalDropdownTriggerTitle,
                        createModal.kisi_kisi_id ? styles.modalDropdownTriggerTitleActive : null,
                        { lineHeight: 18 },
                      ]}
                    >
                      {selectedKisiObj?.judul_kisi || 'Pilih Paket Kisi-Kisi Soal...'}
                    </Text>

                    {selectedKisiObj && (
                      <View style={{ marginTop: 6, gap: 4 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                          {Boolean(selectedKisiObj.subject_name || selectedKisiObj.mata_pelajaran) && (
                            <View style={styles.kisiMetaItem}>
                              <MaterialCommunityIcons name="book-open-variant" size={12} color="#059669" />
                              <Text style={styles.kisiMetaText}>
                                {selectedKisiObj.subject_name || selectedKisiObj.mata_pelajaran}
                              </Text>
                            </View>
                          )}

                          {Boolean(selectedKisiObj.kelas_name) && (
                            <View style={styles.kisiMetaItem}>
                              <MaterialCommunityIcons name="google-classroom" size={12} color="#059669" />
                              <Text style={styles.kisiMetaText}>{selectedKisiObj.kelas_name}</Text>
                            </View>
                          )}

                          {Boolean(selectedKisiObj.jenis_ujian) && (
                            <View style={styles.kisiTypeBadge}>
                              <Text style={styles.kisiTypeBadgeText}>{selectedKisiObj.jenis_ujian}</Text>
                            </View>
                          )}

                          {getKisiQuestionCount(selectedKisiObj) != null && (
                            <View style={styles.kisiCountPill}>
                              <MaterialCommunityIcons name="file-document-outline" size={10} color="#059669" />
                              <Text style={styles.kisiCountPillText}>
                                {getKisiQuestionCount(selectedKisiObj)} Soal
                              </Text>
                            </View>
                          )}

                          {Number(selectedKisiObj.alokasi_waktu_menit) > 0 && (
                            <View style={styles.kisiDurationBadge}>
                              <MaterialCommunityIcons name="clock-outline" size={10} color="#64748B" />
                              <Text style={styles.kisiDurationBadgeText}>
                                {selectedKisiObj.alokasi_waktu_menit} Menit
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    )}
                  </View>
                </View>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color={createModal.kisi_kisi_id ? '#059669' : '#94A3B8'}
                  style={{ marginTop: 8 }}
                />
              </TouchableOpacity>
            </View>

            {/* Input 3: Dropdown Pilih Kelas Sasaran */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Pilih Kelas Sasaran *</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setModalClassDropdownVisible(true)}
                style={[
                  styles.modalDropdownTrigger,
                  createModal.kelas_id ? styles.modalDropdownTriggerActive : null,
                ]}
              >
                <View style={styles.modalDropdownTriggerContent}>
                  <MaterialCommunityIcons
                    name="google-classroom"
                    size={20}
                    color={createModal.kelas_id ? '#059669' : '#94A3B8'}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.modalDropdownTriggerTitle,
                      createModal.kelas_id ? styles.modalDropdownTriggerTitleActive : null,
                      { marginLeft: 10 },
                    ]}
                  >
                    {selectedModalClassObj?.name || 'Pilih Kelas Sasaran...'}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#059669" />
              </TouchableOpacity>
            </View>

            {/* Input 4: Parameter Ujian (Durasi, KKM, Attempt) */}
            <View style={styles.formRowThree}>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Durasi (Menit)</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={createModal.durasi_menit}
                  onChangeText={(val) => setCreateModal((prev) => ({ ...prev, durasi_menit: val }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Nilai KKM</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  placeholder="Misal: 70"
                  value={createModal.nilai_kkm}
                  onChangeText={(val) => setCreateModal((prev) => ({ ...prev, nilai_kkm: val }))}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formLabel}>Percobaan</Text>
                <TextInput
                  style={styles.formInput}
                  keyboardType="numeric"
                  value={createModal.max_attempt}
                  onChangeText={(val) => setCreateModal((prev) => ({ ...prev, max_attempt: val }))}
                />
              </View>
            </View>

            {/* Input 5: Toggles Parameter Sistem */}
            <View style={styles.togglesCard}>
              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Acak Urutan Soal</Text>
                  <Text style={styles.toggleSub}>Setiap siswa menerima urutan nomor yang berbeda.</Text>
                </View>
                <Switch
                  value={createModal.acak_soal}
                  onValueChange={(val) => setCreateModal((prev) => ({ ...prev, acak_soal: val }))}
                  thumbColor={createModal.acak_soal ? '#059669' : '#CBD5E1'}
                  trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                />
              </View>

              <View style={styles.toggleDivider} />

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Acak Urutan Pilihan (A-E)</Text>
                  <Text style={styles.toggleSub}>Opsi jawaban diacak otomatis oleh sistem.</Text>
                </View>
                <Switch
                  value={createModal.acak_jawaban}
                  onValueChange={(val) => setCreateModal((prev) => ({ ...prev, acak_jawaban: val }))}
                  thumbColor={createModal.acak_jawaban ? '#059669' : '#CBD5E1'}
                  trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                />
              </View>

              <View style={styles.toggleDivider} />

              <View style={styles.toggleRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.toggleLabel}>Tampilkan Skor Langsung</Text>
                  <Text style={styles.toggleSub}>Siswa langsung melihat nilai setelah pengumpulan.</Text>
                </View>
                <Switch
                  value={createModal.tampilkan_nilai_langsung}
                  onValueChange={(val) =>
                    setCreateModal((prev) => ({ ...prev, tampilkan_nilai_langsung: val }))
                  }
                  thumbColor={createModal.tampilkan_nilai_langsung ? '#059669' : '#CBD5E1'}
                  trackColor={{ false: '#E2E8F0', true: '#A7F3D0' }}
                />
              </View>
            </View>

            {/* Input 6: Status Awal Paket Ujian */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Status Terbit Ujian</Text>
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 6 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCreateModal((prev) => ({ ...prev, status: 'published' }))}
                  style={[
                    styles.statusChoiceBtn,
                    createModal.status === 'published' && styles.statusChoiceBtnActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={16}
                    color={createModal.status === 'published' ? '#059669' : '#94A3B8'}
                  />
                  <Text
                    style={[
                      styles.statusChoiceText,
                      createModal.status === 'published' && styles.statusChoiceTextActive,
                    ]}
                  >
                    Langsung Publikasikan
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setCreateModal((prev) => ({ ...prev, status: 'draft' }))}
                  style={[
                    styles.statusChoiceBtn,
                    createModal.status === 'draft' && styles.statusChoiceBtnActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="file-outline"
                    size={16}
                    color={createModal.status === 'draft' ? '#059669' : '#94A3B8'}
                  />
                  <Text
                    style={[
                      styles.statusChoiceText,
                      createModal.status === 'draft' && styles.statusChoiceTextActive,
                    ]}
                  >
                    Simpan Sebagai Draft
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Input 7: Instruksi Pengerjaan */}
            <View style={styles.formGroup}>
              <Text style={styles.formLabel}>Petunjuk &amp; Instruksi Ujian</Text>
              <TextInput
                style={[styles.formInput, { height: 80, textAlignVertical: 'top' }]}
                multiline
                numberOfLines={3}
                placeholder="Tuliskan pesan atau petunjuk khusus untuk santri..."
                placeholderTextColor="#94A3B8"
                value={createModal.instruksi}
                onChangeText={(text) => setCreateModal((prev) => ({ ...prev, instruksi: text }))}
              />
            </View>

            {/* Tombol Simpan Form */}
            <TouchableOpacity
              activeOpacity={0.85}
              disabled={createModal.submitting}
              onPress={() => void handleSubmitExam()}
              style={styles.submitBtnForm}
            >
              {createModal.submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save-check" size={18} color="#FFFFFF" />
                  <Text style={styles.submitBtnFormText}>
                    {createModal.isEdit ? 'Simpan Perubahan Paket' : 'Terbitkan Sesi Ujian Sekarang'}
                  </Text>
                </>
              )}
            </TouchableOpacity>
          </ScrollView>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: MONITORING HASIL & PESERTA UJIAN SISWA
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={monitoringModal.visible}
        animationType="slide"
        onRequestClose={() => setMonitoringModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalRunnerContainer}>
          {/* Header Berwarna Hijau Zamrud */}
          <View style={[styles.coloredModalHeader, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.coloredModalHeaderRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setMonitoringModal((prev) => ({ ...prev, visible: false }))}
                style={styles.coloredModalCloseBtn}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text numberOfLines={1} style={styles.coloredModalTitle}>
                  Monitoring: {monitoringModal.exam?.judul_ujian}
                </Text>
                <Text numberOfLines={1} style={styles.coloredModalSub}>
                  {monitoringModal.exam?.kisi_kisi?.mata_pelajaran || 'Mata Pelajaran'} · KKM: {monitoringModal.exam?.nilai_kkm != null ? monitoringModal.exam.nilai_kkm : '-'}
                </Text>
              </View>
              <View style={styles.coloredModalIconBadge}>
                <MaterialCommunityIcons name="account-group" size={20} color="#FFFFFF" />
              </View>
            </View>
          </View>

          {monitoringModal.loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Memuat rekap hasil peserta ujian...</Text>
            </View>
          ) : (
            <ScrollView
              style={{ flex: 1 }}
              contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 30 }}
              showsVerticalScrollIndicator={false}
            >
              {monitoringModal.ringkasan && (
                <View style={styles.summaryResultBox}>
                  <View style={styles.summaryResultRow}>
                    <View style={styles.summaryStatItem}>
                      <Text style={styles.summaryStatLabel}>Total Peserta</Text>
                      <Text style={styles.summaryStatVal}>{monitoringModal.ringkasan.total_peserta || 0}</Text>
                    </View>
                    <View style={styles.summaryStatDivider} />
                    <View style={styles.summaryStatItem}>
                      <Text style={styles.summaryStatLabel}>Rata-Rata</Text>
                      <Text style={[styles.summaryStatVal, { color: '#059669' }]}>
                        {monitoringModal.ringkasan.rata_nilai || 0}
                      </Text>
                    </View>
                    <View style={styles.summaryStatDivider} />
                    <View style={styles.summaryStatItem}>
                      <Text style={styles.summaryStatLabel}>Tertinggi</Text>
                      <Text style={[styles.summaryStatVal, { color: '#2563EB' }]}>
                        {monitoringModal.ringkasan.nilai_tertinggi || 0}
                      </Text>
                    </View>
                    <View style={styles.summaryStatDivider} />
                    <View style={styles.summaryStatItem}>
                      <Text style={styles.summaryStatLabel}>Kelulusan</Text>
                      <Text style={[styles.summaryStatVal, { color: '#7C3AED' }]}>
                        {monitoringModal.ringkasan.persentase_kelulusan || 0}%
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              <Text style={styles.sectionSubTitle}>
                Peserta Selesai Mengerjakan ({monitoringModal.peserta.length} Siswa)
              </Text>

              {monitoringModal.peserta.length === 0 ? (
                <EmptyStateCard
                  icon="account-clock-outline"
                  title="Belum Ada Peserta"
                  description="Belum ada santri/siswa yang menyelesaikan sesi ujian CBT ini."
                />
              ) : (
                monitoringModal.peserta.map((p, idx) => (
                  <View key={p.sesi_id || idx} style={styles.participantItemCard}>
                    <View style={styles.participantAvatarSquircle}>
                      <Text style={styles.participantAvatarText}>
                        {(p.nama_siswa || 'S').charAt(0).toUpperCase()}
                      </Text>
                    </View>

                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text numberOfLines={1} style={styles.participantName}>
                        {p.nama_siswa}
                      </Text>
                      <Text style={styles.participantSub}>
                        NIS: {p.nis || '-'} · Selesai: {formatDate(p.waktu_selesai)}
                      </Text>
                      <Text style={styles.participantDetailScore}>
                        Benar: {p.jumlah_benar ?? 0} · Salah: {p.jumlah_salah ?? 0} · Kosong: {p.jumlah_kosong ?? 0}
                      </Text>
                    </View>

                    <View style={styles.participantScoreCol}>
                      <Text style={[styles.participantFinalScore, { color: p.is_lulus ? '#059669' : '#DC2626' }]}>
                        {p.nilai_final}
                      </Text>
                      <View style={[styles.passBadge, { backgroundColor: p.is_lulus ? '#ECFDF5' : '#FEF2F2' }]}>
                        <Text style={[styles.passBadgeText, { color: p.is_lulus ? '#059669' : '#DC2626' }]}>
                          {p.is_lulus ? 'Tuntas' : 'Remedial'}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))
              )}
            </ScrollView>
          )}
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL: SIMULASI CBT ENGINE GURU (PREVIEW SOAL INTERAKTIF)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={simulationModal.visible}
        animationType="slide"
        onRequestClose={() => setSimulationModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalRunnerContainer}>
          {/* Header Berwarna Hijau Zamrud untuk Halaman Ujian / Simulasi */}
          <View style={[styles.coloredModalHeader, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={StyleSheet.absoluteFill}
            />
            <View style={styles.coloredModalHeaderRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSimulationModal((prev) => ({ ...prev, visible: false }))}
                style={styles.coloredModalCloseBtn}
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={styles.simBadgeColored}>
                    <Text style={styles.simBadgeColoredText}>SIMULASI GURU</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.coloredModalTitle, { flex: 1 }]}>
                    {simulationModal.exam?.judul_ujian}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.coloredModalSub}>
                  Soal {simulationModal.currentIdx + 1} dari {simulationModal.questions.length || 0} Butir Soal
                </Text>
              </View>

              <View style={styles.simTimerBoxColored}>
                <MaterialCommunityIcons name="timer-outline" size={14} color="#FFFFFF" />
                <Text style={styles.simTimerTextColored}>{formatTimer(simulationModal.timerSeconds)}</Text>
              </View>
            </View>
          </View>

          {simulationModal.loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Memuat butir soal kisi-kisi ujian...</Text>
            </View>
          ) : simulationModal.questions.length === 0 ? (
            <EmptyStateCard
              icon="book-cross"
              title="Soal Belum Tersedia"
              description="Kisi-kisi ujian ini belum memiliki butir soal aktif di Bank Soal."
            />
          ) : (
            <View style={{ flex: 1 }}>
              {(() => {
                const q = simulationModal.questions[simulationModal.currentIdx];
                const selectedAns = simulationModal.answers[q?.id];

                return (
                  <ScrollView
                    style={{ flex: 1 }}
                    contentContainerStyle={{ padding: 16, paddingBottom: bottomInset + 80 }}
                    showsVerticalScrollIndicator={false}
                  >
                    <View style={styles.simQuestionHeaderRow}>
                      <Text style={styles.simQuestionNum}>Nomor {simulationModal.currentIdx + 1}</Text>
                      <View style={styles.simPointPill}>
                        <Text style={styles.simPointPillText}>Bobot: {q?.poin || 10} Poin</Text>
                      </View>
                    </View>

                    <View style={styles.simQuestionCard}>
                      <Text style={styles.simQuestionText}>{q?.pertanyaan}</Text>
                    </View>

                    {['A', 'B', 'C', 'D', 'E'].map((optKey) => {
                      const optText = q?.[`opsi_${optKey.toLowerCase()}`];
                      if (!optText) return null;
                      const isChosen = selectedAns === optKey;
                      const isKey = String(q?.kunci_jawaban || '').trim().toUpperCase() === optKey;

                      return (
                        <TouchableOpacity
                          key={optKey}
                          activeOpacity={0.8}
                          onPress={() => {
                            setSimulationModal((prev) => ({
                              ...prev,
                              answers: { ...prev.answers, [q.id]: optKey },
                            }));
                          }}
                          style={[
                            styles.simOptionCard,
                            isChosen && styles.simOptionCardChosen,
                            simulationModal.submitted && isKey && styles.simOptionCardKey,
                          ]}
                        >
                          <View
                            style={[
                              styles.simOptionCircle,
                              isChosen && styles.simOptionCircleChosen,
                              simulationModal.submitted && isKey && styles.simOptionCircleKey,
                            ]}
                          >
                            <Text
                              style={[
                                styles.simOptionCircleText,
                                isChosen && styles.simOptionCircleTextChosen,
                              ]}
                            >
                              {optKey}
                            </Text>
                          </View>
                          <Text style={styles.simOptionText}>{optText}</Text>
                        </TouchableOpacity>
                      );
                    })}

                    {simulationModal.submitted && q?.pembahasan && (
                      <View style={styles.pembahasanBox}>
                        <Text style={styles.pembahasanTitle}>Kunci: {q.kunci_jawaban}</Text>
                        <Text style={styles.pembahasanBody}>{q.pembahasan}</Text>
                      </View>
                    )}
                  </ScrollView>
                );
              })()}

              <View style={[styles.simBottomNav, { paddingBottom: Math.max(bottomInset, 16) }]}>
                <TouchableOpacity
                  disabled={simulationModal.currentIdx === 0}
                  onPress={() =>
                    setSimulationModal((prev) => ({
                      ...prev,
                      currentIdx: Math.max(0, prev.currentIdx - 1),
                    }))
                  }
                  style={[styles.simNavBtn, simulationModal.currentIdx === 0 && { opacity: 0.4 }]}
                >
                  <MaterialCommunityIcons name="chevron-left" size={18} color="#334155" />
                  <Text style={styles.simNavBtnText}>Sebelumnya</Text>
                </TouchableOpacity>

                {simulationModal.currentIdx < simulationModal.questions.length - 1 ? (
                  <TouchableOpacity
                    onPress={() =>
                      setSimulationModal((prev) => ({
                        ...prev,
                        currentIdx: Math.min(prev.questions.length - 1, prev.currentIdx + 1),
                      }))
                    }
                    style={[styles.simNavBtn, styles.simNavBtnNext]}
                  >
                    <Text style={[styles.simNavBtnText, { color: '#FFFFFF' }]}>Berikutnya</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity
                    onPress={() => {
                      setSimulationModal((prev) => ({ ...prev, submitted: true }));
                      setFeedbackModal({
                        visible: true,
                        type: 'success',
                        title: 'Simulasi Selesai',
                        message: 'Uji coba simulasi selesai. Kunci jawaban dan pembahasan kini ditampilkan.',
                      });
                    }}
                    style={[styles.simNavBtn, styles.simNavBtnFinish]}
                  >
                    <MaterialCommunityIcons name="check-all" size={18} color="#FFFFFF" />
                    <Text style={[styles.simNavBtnText, { color: '#FFFFFF' }]}>
                      {simulationModal.submitted ? 'Selesai' : 'Periksa Hasil'}
                    </Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}
        </View>
      </Modal>

      {/* ── Dropdown Modal 1: Filter Status Ujian ── */}
      <Modal
        visible={statusDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setStatusDropdownVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setStatusDropdownVisible(false)}
          style={styles.dropdownModalOverlay}
        >
          <View style={styles.dropdownModalCard}>
            <View style={styles.dropdownModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="filter-variant" size={18} color="#059669" />
                <Text style={styles.dropdownModalTitle}>Filter Status Ujian</Text>
              </View>
              <TouchableOpacity
                onPress={() => setStatusDropdownVisible(false)}
                style={styles.dropdownModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator={false}>
              {STATUS_TABS.map((tab) => {
                const isSelected = selectedStatus === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedStatus(tab.id);
                      setStatusDropdownVisible(false);
                    }}
                    style={[styles.dropdownOptionRow, isSelected && styles.dropdownOptionRowSelected]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        isSelected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {tab.label}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Dropdown Modal 2: Filter Kelas Ujian ── */}
      <Modal
        visible={classDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setClassDropdownVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setClassDropdownVisible(false)}
          style={styles.dropdownModalOverlay}
        >
          <View style={styles.dropdownModalCard}>
            <View style={styles.dropdownModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
                <Text style={styles.dropdownModalTitle}>Filter Kelas Sasaran</Text>
              </View>
              <TouchableOpacity
                onPress={() => setClassDropdownVisible(false)}
                style={styles.dropdownModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedClassId('semua');
                  setClassDropdownVisible(false);
                }}
                style={[
                  styles.dropdownOptionRow,
                  selectedClassId === 'semua' && styles.dropdownOptionRowSelected,
                ]}
              >
                <Text
                  style={[
                    styles.dropdownOptionText,
                    selectedClassId === 'semua' && styles.dropdownOptionTextSelected,
                  ]}
                >
                  Semua Kelas
                </Text>
                {selectedClassId === 'semua' && (
                  <MaterialCommunityIcons name="check-circle" size={20} color="#059669" />
                )}
              </TouchableOpacity>
              {classList.map((cls) => {
                const isSelected = selectedClassId === cls.id;
                return (
                  <TouchableOpacity
                    key={cls.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedClassId(cls.id);
                      setClassDropdownVisible(false);
                    }}
                    style={[
                      styles.dropdownOptionRow,
                      isSelected && styles.dropdownOptionRowSelected,
                    ]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        isSelected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {cls.name}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Dropdown Modal 3: Pilih Paket Kisi-Kisi Soal (Form Modal) ── */}
      <Modal
        visible={kisiDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setKisiDropdownVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setKisiDropdownVisible(false)}
          style={styles.dropdownModalOverlay}
        >
          <View style={[styles.dropdownModalCard, { maxHeight: '80%' }]}>
            <View style={styles.dropdownModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="clipboard-text" size={18} color="#059669" />
                <Text style={styles.dropdownModalTitle}>Pilih Paket Kisi-Kisi Soal</Text>
              </View>
              <TouchableOpacity
                onPress={() => setKisiDropdownVisible(false)}
                style={styles.dropdownModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.dropdownSearchBox}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
              <TextInput
                style={styles.dropdownSearchInput}
                placeholder="Cari kisi-kisi atau mata pelajaran..."
                placeholderTextColor="#94A3B8"
                value={kisiSearch}
                onChangeText={setKisiSearch}
              />
              {kisiSearch.length > 0 && (
                <TouchableOpacity onPress={() => setKisiSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={{ maxHeight: 380 }} showsVerticalScrollIndicator={false}>
              {filteredKisiOptions.length === 0 ? (
                <View style={{ padding: 28, alignItems: 'center' }}>
                  <MaterialCommunityIcons name="clipboard-text-off-outline" size={32} color="#94A3B8" />
                  <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600', marginTop: 8 }}>
                    Tidak ada paket kisi-kisi ditemukan
                  </Text>
                </View>
              ) : (
                filteredKisiOptions.map((k) => {
                  const isSelected = String(createModal.kisi_kisi_id) === String(k.id);
                  const qCount = getKisiQuestionCount(k);
                  const durasi = Number(k.alokasi_waktu_menit);
                  const subjectName = k.subject_name || k.mata_pelajaran || '';
                  const kelasName = k.kelas_name || '';
                  const semesterName = k.semester_name || k.semester?.nama_semester || k.semester?.name || '';
                  const tahunAjaran = k.tahun_ajaran || k.tahunAjaran?.name || '';

                  return (
                    <TouchableOpacity
                      key={k.id}
                      activeOpacity={0.7}
                      onPress={() => {
                        setCreateModal((prev) => ({
                          ...prev,
                          kisi_kisi_id: String(k.id),
                          judul_ujian: prev.judul_ujian ? prev.judul_ujian : k.judul_kisi,
                          durasi_menit: durasi > 0 && !prev.durasi_menit ? String(durasi) : prev.durasi_menit,
                          kelas_id: k.kelas_id && !prev.kelas_id ? String(k.kelas_id) : prev.kelas_id,
                        }));
                        setKisiDropdownVisible(false);
                      }}
                      style={[styles.kisiOptionCard, isSelected && styles.kisiOptionCardSelected]}
                    >
                      {/* Top Badges Row */}
                      <View style={styles.kisiTopBadgesRow}>
                        {Boolean(k.jenis_ujian) && (
                          <View style={styles.kisiTypeBadge}>
                            <Text style={styles.kisiTypeBadgeText}>{k.jenis_ujian}</Text>
                          </View>
                        )}

                        {qCount != null && (
                          <View style={[styles.kisiCountPill, isSelected && styles.kisiCountPillSelected]}>
                            <MaterialCommunityIcons
                              name="file-document-outline"
                              size={11}
                              color={isSelected ? '#047857' : '#059669'}
                            />
                            <Text style={[styles.kisiCountPillText, isSelected && styles.kisiCountPillTextSelected]}>
                              {qCount} Soal
                            </Text>
                          </View>
                        )}

                        {durasi > 0 && (
                          <View style={styles.kisiDurationBadge}>
                            <MaterialCommunityIcons name="clock-outline" size={10} color="#64748B" />
                            <Text style={styles.kisiDurationBadgeText}>{durasi} Menit</Text>
                          </View>
                        )}

                        <View style={{ flex: 1 }} />

                        {isSelected && (
                          <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                        )}
                      </View>

                      {/* Judul Kisi-Kisi Soal (Leluasa, Tidak Terhimpit) */}
                      <Text
                        numberOfLines={2}
                        style={[styles.kisiTitleText, isSelected && styles.kisiTitleTextSelected]}
                      >
                        {k.judul_kisi}
                      </Text>

                      {/* Meta Tags Row: Mapel, Kelas, Semester (Semua dinamis, tidak hardcode) */}
                      <View style={styles.kisiMetaRow}>
                        {Boolean(subjectName) && (
                          <View style={styles.kisiMetaItem}>
                            <MaterialCommunityIcons name="book-open-variant" size={12} color="#059669" />
                            <Text style={styles.kisiMetaText}>{subjectName}</Text>
                          </View>
                        )}

                        {Boolean(kelasName) && (
                          <View style={styles.kisiMetaItem}>
                            <MaterialCommunityIcons name="google-classroom" size={12} color="#059669" />
                            <Text style={styles.kisiMetaText}>{kelasName}</Text>
                          </View>
                        )}

                        {Boolean(semesterName) && (
                          <View style={styles.kisiMetaItem}>
                            <MaterialCommunityIcons name="calendar-range" size={12} color="#64748B" />
                            <Text style={styles.kisiMetaText}>{semesterName}</Text>
                          </View>
                        )}

                        {Boolean(tahunAjaran) && (
                          <View style={styles.kisiMetaItem}>
                            <MaterialCommunityIcons name="calendar-blank" size={12} color="#64748B" />
                            <Text style={styles.kisiMetaText}>{tahunAjaran}</Text>
                          </View>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── Dropdown Modal 4: Pilih Kelas Sasaran (Form Modal) ── */}
      <Modal
        visible={modalClassDropdownVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setModalClassDropdownVisible(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setModalClassDropdownVisible(false)}
          style={styles.dropdownModalOverlay}
        >
          <View style={styles.dropdownModalCard}>
            <View style={styles.dropdownModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
                <Text style={styles.dropdownModalTitle}>Pilih Kelas Sasaran</Text>
              </View>
              <TouchableOpacity
                onPress={() => setModalClassDropdownVisible(false)}
                style={styles.dropdownModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {classList.map((cls) => {
                const isSelected = String(createModal.kelas_id) === String(cls.id);
                return (
                  <TouchableOpacity
                    key={cls.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      setCreateModal((prev) => ({ ...prev, kelas_id: cls.id }));
                      setModalClassDropdownVisible(false);
                    }}
                    style={[styles.dropdownOptionRow, isSelected && styles.dropdownOptionRowSelected]}
                  >
                    <Text
                      style={[
                        styles.dropdownOptionText,
                        isSelected && styles.dropdownOptionTextSelected,
                      ]}
                    >
                      {cls.name}
                    </Text>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── App Feedback Modal ── */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          confirmText={feedbackModal.confirmText}
          cancelText={feedbackModal.cancelText}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#059669',
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
  },
  mainScrollContent: {
    paddingBottom: 40,
  },
  // ── Static Top Bar Bank Soal Style ──
  staticTopBarWrapper: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    paddingBottom: 16,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  staticTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 4,
  },
  heroSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
  },
  heroTitleCenterCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  heroModuleTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
  },
  heroModuleSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    fontFamily: 'Nunito_600SemiBold',
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
  },
  // ── 4 KPI Stats Cards Row: Sama Rata, Kompak, Tidak Memanjang Ke Atas ──
  kpiCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    paddingHorizontal: 16,
    marginTop: 14,
    marginBottom: 12,
  },
  kpiCardItem: {
    flex: 1,
    minWidth: 0,
    height: 82,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#0E5C44',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
  },
  kpiCardEmerald: {
    borderColor: '#6EE7B7',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
  },
  kpiCardSky: {
    borderColor: '#7DD3FC',
    shadowColor: '#0284C7',
    shadowOpacity: 0.12,
  },
  kpiCardPurple: {
    borderColor: '#DDD6FE',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.12,
  },
  kpiCardAmber: {
    borderColor: '#FCD34D',
    shadowColor: '#D97706',
    shadowOpacity: 0.12,
  },
  kpiIconSquircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 3,
  },
  kpiValueText: {
    fontSize: 15,
    fontWeight: '800',
    lineHeight: 18,
    fontFamily: Platform.OS === 'ios' ? 'System' : 'sans-serif-medium',
  },
  kpiLabelText: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 1,
    textAlign: 'center',
  },
  // ── Tombol Utama: Terbitkan Ujian & Bank Soal (Sama Rata Ukurannya) ──
  actionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  actionBtnHalf: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
  },
  actionBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingHorizontal: 12,
  },
  actionBtnPrimaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
  },
  actionBtnOutline: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
  },
  actionBtnSecondaryText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0E5C44',
    fontFamily: 'Poppins_700Bold',
  },
  // ── Search & Dropdown Filters ──
  containerBlock: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
  },
  dropdownFiltersRow: {
    flexDirection: 'row',
    gap: 8,
  },
  dropdownFilterBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 40,
  },
  dropdownFilterBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  dropdownFilterBtnText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    marginHorizontal: 6,
  },
  dropdownFilterBtnTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 12,
    gap: 8,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  countBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  countBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  examsList: {
    paddingHorizontal: 16,
    gap: 12,
  },
  examCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  subjectBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  statusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  examTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  metaClassGuru: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 10,
  },
  attrRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  attrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attrPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  featurePillsRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 10,
  },
  featurePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  featurePillText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
  },
  timeWindowBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    gap: 2,
    marginBottom: 12,
  },
  timeWindowText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  cardItemActionsContainer: {
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 12,
  },
  cardPrimaryActionsRow: {
    flexDirection: 'row',
    gap: 8,
  },
  cardSecondaryActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  btnActionTeacher: {
    height: 38,
    borderRadius: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    gap: 4,
  },
  btnMonitoring: {
    flex: 1,
    backgroundColor: '#059669',
  },
  btnSimulation: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  btnEdit: {
    flex: 1,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
  },
  btnToggleStatus: {
    flex: 2,
    borderWidth: 1,
    paddingHorizontal: 8,
  },
  btnToggleStatusDraft: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  btnToggleStatusPublish: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  btnDelete: {
    width: 38,
    height: 38,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: 0,
  },
  btnActionTeacherText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  kisiCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  kisiCountPillSelected: {
    backgroundColor: '#D1FAE5',
    borderColor: '#059669',
  },
  kisiCountPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  kisiCountPillTextSelected: {
    color: '#047857',
  },
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 8,
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  // Modal Styles
  modalRunnerContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  // Colored Modal Header Berwarna Hijau Zamrud
  coloredModalHeader: {
    width: '100%',
    position: 'relative',
    overflow: 'hidden',
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    paddingBottom: 16,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.18,
    shadowRadius: 10,
    elevation: 5,
  },
  coloredModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  coloredModalCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
  },
  coloredModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
  },
  coloredModalSub: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 1,
  },
  coloredModalIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomColor: '#E2E8F0',
    borderBottomWidth: 1,
  },
  modalCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalHeaderSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  summaryResultBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  summaryResultRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryStatItem: {
    flex: 1,
    alignItems: 'center',
  },
  summaryStatLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  summaryStatVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  summaryStatDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#CBD5E1',
  },
  sectionSubTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  participantItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  participantAvatarSquircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  participantAvatarText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  participantName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  participantSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  participantDetailScore: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  participantScoreCol: {
    alignItems: 'flex-end',
    marginLeft: 8,
  },
  participantFinalScore: {
    fontSize: 16,
    fontWeight: '900',
  },
  passBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  passBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },
  // Form Create Modal Styles
  formGroup: {
    marginBottom: 16,
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    marginBottom: 6,
  },
  formHint: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    height: 44,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  // Modal Dropdown Trigger Styles (Kisi-kisi & Kelas Sasaran)
  modalDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 10,
    minHeight: 48,
    marginTop: 6,
  },
  modalDropdownTriggerActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  modalDropdownTriggerContent: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingRight: 8,
  },
  modalDropdownTriggerTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: '#94A3B8',
  },
  modalDropdownTriggerTitleActive: {
    color: '#059669',
    fontWeight: '800',
  },
  modalDropdownTriggerSub: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
    fontWeight: '600',
  },
  kisiTriggerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kisiTriggerIconBoxActive: {
    backgroundColor: '#D1FAE5',
  },
  // Generic Dropdown Modal Styles (Pickers)
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dropdownModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  dropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  dropdownModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 38,
    marginTop: 10,
    marginBottom: 8,
  },
  dropdownSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
  },
  dropdownOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 2,
  },
  dropdownOptionRowSelected: {
    backgroundColor: '#ECFDF5',
  },
  dropdownOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dropdownOptionTextSelected: {
    color: '#059669',
    fontWeight: '800',
  },
  dropdownOptionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  kisiOptionCard: {
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kisiOptionCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  kisiTopBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  kisiTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  kisiTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#1D4ED8',
    textTransform: 'uppercase',
  },
  kisiDurationBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kisiDurationBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  kisiTitleText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 19,
    marginBottom: 6,
  },
  kisiTitleTextSelected: {
    color: '#047857',
    fontWeight: '800',
  },
  kisiMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 2,
  },
  kisiMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kisiMetaText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  formRowThree: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  togglesCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toggleDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 10,
  },
  toggleLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  toggleSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  statusChoiceBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  statusChoiceBtnActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  statusChoiceText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  statusChoiceTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  submitBtnForm: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    borderRadius: 14,
    height: 48,
    gap: 8,
    marginTop: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  submitBtnFormText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Simulasi Styles
  simBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  simBadgeText: {
    fontSize: 8,
    fontWeight: '900',
    color: '#92400E',
  },
  simTimerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  simTimerText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#059669',
  },
  simBadgeColored: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  simBadgeColoredText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  simTimerBoxColored: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    marginLeft: 8,
  },
  simTimerTextColored: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  simQuestionHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  simQuestionNum: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  simPointPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  simPointPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  simQuestionCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  simQuestionText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 22,
  },
  simOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  simOptionCardChosen: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  simOptionCardKey: {
    borderColor: '#2563EB',
    backgroundColor: '#EFF6FF',
  },
  simOptionCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  simOptionCircleChosen: {
    backgroundColor: '#059669',
  },
  simOptionCircleKey: {
    backgroundColor: '#2563EB',
  },
  simOptionCircleText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  simOptionCircleTextChosen: {
    color: '#FFFFFF',
  },
  simOptionText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  pembahasanBox: {
    marginTop: 14,
    padding: 12,
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  pembahasanTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1D4ED8',
    marginBottom: 4,
  },
  pembahasanBody: {
    fontSize: 12,
    fontWeight: '500',
    color: '#1E40AF',
    lineHeight: 18,
  },
  simBottomNav: {
    flexDirection: 'row',
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 10,
  },
  simNavBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  simNavBtnNext: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  simNavBtnFinish: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  simNavBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
});
