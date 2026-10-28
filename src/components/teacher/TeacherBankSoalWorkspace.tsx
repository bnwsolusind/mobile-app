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
import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';
import { getApiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useNotificationBadgeStore } from '../../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../../stores/navigationHistoryStore';
import { isTuRole } from '../../utils/roles';
import { TeacherStickyHeader } from '../TeacherStickyHeader';
import { TeacherHeroCard } from '../TeacherHeroCard';
import { useStickyScroll } from '../StudentStickyHeader';
import { AppFeedbackModal, FeedbackType } from '../AppFeedbackModal';

const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export type TeacherBankSoalItem = {
  id: string;
  kode_soal?: string;
  pertanyaan: string;
  tipe_soal: string;
  opsi_a?: string;
  opsi_b?: string;
  opsi_c?: string;
  opsi_d?: string;
  opsi_e?: string;
  kunci_jawaban?: string;
  pembahasan?: string;
  poin?: number;
  tingkat_kesulitan?: string;
  indikator?: string;
  gambar_path?: string;
  status?: boolean;
  mata_pelajaran_id?: string;
  kisi_kisi_id?: string;
  subject?: { id?: string; name?: string; code?: string };
  kisi_kisi?: {
    id?: string;
    judul_kisi?: string;
    jenis_ujian?: string;
    mata_pelajaran?: string;
    kelas?: string;
    guru?: string;
  };
};

const TIPE_SOAL_OPTIONS = [
  { value: 'pg', label: 'Pilihan Ganda', icon: 'radiobox-marked', color: '#059669', bg: '#ECFDF5' },
  { value: 'esai', label: 'Essay / Esai', icon: 'text-box-outline', color: '#7C3AED', bg: '#F5F3FF' },
  { value: 'benar_salah', label: 'Benar / Salah', icon: 'checkbox-marked-circle-outline', color: '#E11D48', bg: '#FFF1F2' },
  { value: 'menjodohkan', label: 'Menjodohkan', icon: 'swap-horizontal', color: '#D97706', bg: '#FFFBEB' },
];

const KESULITAN_OPTIONS = [
  { value: 'mudah', label: 'Mudah', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
  { value: 'sedang', label: 'Sedang', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
  { value: 'sulit', label: 'Sulit', color: '#DC2626', bg: '#FEF2F2', border: '#FECACA' },
];

interface TeacherBankSoalWorkspaceProps {
  navigation?: any;
  route?: any;
  onBack?: () => void;
}

export default function TeacherBankSoalWorkspace({
  navigation: propNavigation,
  route,
  onBack,
}: TeacherBankSoalWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const internalNavigation = useNavigation<any>();
  const navigation = propNavigation || internalNavigation;

  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isTu = isTuRole(userRoles);
  const pageTitle = isTu ? 'Kelola Bank Soal CBT' : 'Bank Soal CBT Guru';
  const pageSubtitle = isTu ? 'Pusat Bank Soal & Kisi-Kisi Sekolah' : 'Pusat Pengelolaan Butir Soal Guru';
  const teacherDisplayName: string = String(
    (user as any)?.name || (user as any)?.username || (isTu ? 'Staf Tata Usaha' : 'Guru Pengajar')
  );
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const { scrollY, handleMainScroll } = useStickyScroll();

  // State Data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [questions, setQuestions] = useState<TeacherBankSoalItem[]>([]);
  const [teacherOptions, setTeacherOptions] = useState<{
    kisi_kisi: any[];
    subjects: any[];
    kelas: any[];
    tipe_soal: any[];
    tingkat_kesulitan: any[];
  }>({
    kisi_kisi: [],
    subjects: [],
    kelas: [],
    tipe_soal: [],
    tingkat_kesulitan: [],
  });

  // Filter States
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('Semua');
  const [selectedClassId, setSelectedClassId] = useState<string>('Semua');
  const [selectedKisiId, setSelectedKisiId] = useState<string>(() => {
    return route?.params?.kisi_kisi_id ? String(route.params.kisi_kisi_id) : 'Semua';
  });
  const [selectedType, setSelectedType] = useState<string>('Semua');
  const [selectedDifficulty, setSelectedDifficulty] = useState<string>('Semua');

  // Pre-fill from route if navigated from ExamGridsScreen
  useEffect(() => {
    if (route?.params?.kisi_kisi_id) {
      setSelectedKisiId(String(route.params.kisi_kisi_id));
    }
    if (route?.params?.mapel_id) {
      setSelectedSubjectId(String(route.params.mapel_id));
    }
  }, [route?.params]);

  // View Mode: 'grouped' (per Kisi-kisi & Mapel) | 'flat' (Semua Soal)
  const [viewLayout, setViewLayout] = useState<'grouped' | 'flat'>('grouped');
  const [expandedGroups, setExpandedGroups] = useState<Record<string, boolean>>({});

  // Modals & Forms
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<TeacherBankSoalItem | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);

  // Form State
  const [formData, setFormData] = useState({
    kisi_kisi_id: '',
    mata_pelajaran_id: '',
    kode_soal: '',
    pertanyaan: '',
    tipe_soal: 'pg',
    opsi_a: '',
    opsi_b: '',
    opsi_c: '',
    opsi_d: '',
    opsi_e: '',
    kunci_jawaban: 'A',
    pembahasan: '',
    poin: '2.5',
    tingkat_kesulitan: 'sedang',
    indikator: '',
    status: true,
  });

  // Picker Modal State (Form)
  const [pickerModal, setPickerModal] = useState<{
    isOpen: boolean;
    type: 'kisi_kisi' | 'subject' | 'kelas' | null;
    title: string;
  }>({ isOpen: false, type: null, title: '' });
  const [pickerSearch, setPickerSearch] = useState('');

  // Filter Dropdown Modal State (Mapel & Kelas)
  const [filterDropdownModal, setFilterDropdownModal] = useState<{
    isOpen: boolean;
    type: 'subject' | 'kelas' | null;
    title: string;
  }>({ isOpen: false, type: null, title: '' });
  const [filterPickerSearch, setFilterPickerSearch] = useState('');

  // Delete Modal State
  const [deleteModalItem, setDeleteModalItem] = useState<TeacherBankSoalItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Detail Modal State
  const [detailModalItem, setDetailModalItem] = useState<TeacherBankSoalItem | null>(null);

  // Expanded explanations
  const [expandedExplanations, setExpandedExplanations] = useState<Record<string, boolean>>({});

  // Feedback Notification
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type: FeedbackType;
    title: string;
    message?: string;
  }>({ visible: false, type: 'info', title: '' });

  // 1. Load Options
  const loadOptions = useCallback(async () => {
    try {
      const res = await mobileApiService.getTeacherBankSoalOptions();
      const data = unwrapApiData<any>(res) || res?.data || res || {};
      setTeacherOptions({
        kisi_kisi: data.kisi_kisi || [],
        subjects: data.subjects || [],
        kelas: data.kelas || [],
        tipe_soal: data.tipe_soal || [],
        tingkat_kesulitan: data.tingkat_kesulitan || [],
      });
    } catch (err) {
      console.error('Error fetching bank soal options:', err);
    }
  }, []);

  // 2. Load Questions
  const loadQuestions = useCallback(async (isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const params: Record<string, any> = { per_page: 100 };
      if (selectedSubjectId !== 'Semua') params.mata_pelajaran_id = selectedSubjectId;
      if (selectedClassId !== 'Semua') params.kelas_id = selectedClassId;
      if (selectedKisiId !== 'Semua') params.kisi_kisi_id = selectedKisiId;
      if (selectedType !== 'Semua') params.tipe_soal = selectedType;
      if (selectedDifficulty !== 'Semua') params.tingkat_kesulitan = selectedDifficulty;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const response = await mobileApiService.getTeacherBankSoal(params);
      let items: TeacherBankSoalItem[] = [];
      if (response) {
        if (Array.isArray(response.data)) {
          items = response.data;
        } else if (response.data?.data && Array.isArray(response.data.data)) {
          items = response.data.data;
        } else if (Array.isArray(response)) {
          items = response;
        }
      }
      setQuestions(items);
    } catch (err: any) {
      console.error('Error loading teacher bank soal:', err);
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Soal',
        message: getApiErrorMessage(err, 'Terjadi kesalahan saat memuat daftar bank soal.'),
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedSubjectId, selectedClassId, selectedKisiId, selectedType, selectedDifficulty, searchQuery]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  useEffect(() => {
    void loadQuestions();
  }, [loadQuestions]);

  const handleRefresh = useCallback(() => {
    setRefreshing(true);
    void Promise.all([loadOptions(), loadQuestions(true)]);
  }, [loadOptions, loadQuestions]);

  // Back Navigation
  const handleBack = () => {
    if (onBack) {
      onBack();
      return;
    }
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, route?.params);
    if (handled) return;
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda');
    }
  };

  // Helper check quota for a kisi-kisi
  const checkKisiQuota = useCallback(
    (kisiId: string | number) => {
      if (!kisiId) return { isFull: false, current: 0, target: 0, judul: '' };
      const foundKisi = teacherOptions.kisi_kisi.find((k) => String(k.id) === String(kisiId));
      const targetQuota = Number(foundKisi?.jumlah_soal || 0);
      if (!targetQuota || targetQuota <= 0) {
        return { isFull: false, current: 0, target: 0, judul: foundKisi?.judul_kisi || 'Kisi-kisi' };
      }
      const existingCount = questions.filter((q) => String(q.kisi_kisi_id) === String(kisiId)).length;
      return {
        isFull: existingCount >= targetQuota,
        current: existingCount,
        target: targetQuota,
        judul: foundKisi?.judul_kisi || 'Kisi-kisi',
      };
    },
    [teacherOptions.kisi_kisi, questions]
  );

  // Open Create Modal
  const handleOpenCreateModal = (prefillKisiId?: string) => {
    const targetKisi = prefillKisiId || (selectedKisiId !== 'Semua' ? selectedKisiId : '');
    if (targetKisi) {
      const quota = checkKisiQuota(targetKisi);
      if (quota.isFull) {
        setFeedback({
          visible: true,
          type: 'info',
          title: 'Soal Sudah Lengkap',
          message: `Pembuatan butir soal pada paket "${quota.judul}" telah mencapai target kuota (${quota.current}/${quota.target} soal).\n\nSoal sudah lengkap, Anda hanya bisa edit dan hapus butir soal yang sudah ada.`,
        });
        return;
      }
    }

    setEditingItem(null);
    const foundKisi = teacherOptions.kisi_kisi.find((k) => String(k.id) === String(targetKisi));

    setFormData({
      kisi_kisi_id: targetKisi,
      mata_pelajaran_id: foundKisi?.mata_pelajaran_id ? String(foundKisi.mata_pelajaran_id) : (selectedSubjectId !== 'Semua' ? selectedSubjectId : ''),
      kode_soal: `SOAL-${String(questions.length + 1).padStart(2, '0')}`,
      pertanyaan: '',
      tipe_soal: 'pg',
      opsi_a: '',
      opsi_b: '',
      opsi_c: '',
      opsi_d: '',
      opsi_e: '',
      kunci_jawaban: 'A',
      pembahasan: '',
      poin: '2.5',
      tingkat_kesulitan: 'sedang',
      indikator: '',
      status: true,
    });
    setIsFormModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (item: TeacherBankSoalItem) => {
    setEditingItem(item);
    setFormData({
      kisi_kisi_id: item.kisi_kisi_id ? String(item.kisi_kisi_id) : '',
      mata_pelajaran_id: item.mata_pelajaran_id ? String(item.mata_pelajaran_id) : '',
      kode_soal: item.kode_soal || '',
      pertanyaan: item.pertanyaan || '',
      tipe_soal: item.tipe_soal || 'pg',
      opsi_a: item.opsi_a || '',
      opsi_b: item.opsi_b || '',
      opsi_c: item.opsi_c || '',
      opsi_d: item.opsi_d || '',
      opsi_e: item.opsi_e || '',
      kunci_jawaban: item.kunci_jawaban || 'A',
      pembahasan: item.pembahasan || '',
      poin: item.poin !== undefined ? String(item.poin) : '2.5',
      tingkat_kesulitan: item.tingkat_kesulitan || 'sedang',
      indikator: item.indikator || '',
      status: item.status !== false,
    });
    setIsFormModalOpen(true);
  };

  // Submit Form (Create / Edit)
  const handleSubmitForm = async (keepOpenAndNext = false) => {
    if (!formData.pertanyaan.trim()) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: editingItem ? 'Perubahan Gagal' : 'Penyimpanan Gagal',
        message: 'Teks pertanyaan butir soal belum diisi.\n\nPetunjuk: Silakan tuliskan narasi pertanyaan atau soal terlebih dahulu sebelum menyimpan.',
      });
      return;
    }

    if (formData.tipe_soal === 'pg' && (!formData.opsi_a.trim() || !formData.opsi_b.trim())) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: editingItem ? 'Perubahan Gagal' : 'Penyimpanan Gagal',
        message: 'Pilihan ganda memerlukan minimal Opsi A dan B terisi.\n\nPetunjuk: Masukkan teks pilihan jawaban A dan B terlebih dahulu sebelum menyimpan.',
      });
      return;
    }

    // Cek apakah kisi-kisi sudah penuh kuotanya saat membuat soal baru
    if (!editingItem && formData.kisi_kisi_id) {
      const quota = checkKisiQuota(formData.kisi_kisi_id);
      if (quota.isFull) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Soal Sudah Lengkap',
          message: `Paket kisi-kisi "${quota.judul}" telah memenuhi kuota pembuatan soal (${quota.current}/${quota.target} soal).\n\nSoal sudah lengkap, Anda hanya bisa edit dan hapus butir soal yang sudah ada.`,
        });
        return;
      }
    }

    setFormSubmitting(true);
    try {
      const payload: Record<string, any> = {
        pertanyaan: formData.pertanyaan.trim(),
        tipe_soal: formData.tipe_soal,
        poin: parseFloat(formData.poin) || 2.5,
        tingkat_kesulitan: formData.tingkat_kesulitan,
        status: formData.status,
      };

      if (formData.kisi_kisi_id) payload.kisi_kisi_id = formData.kisi_kisi_id;
      if (formData.mata_pelajaran_id) payload.mata_pelajaran_id = formData.mata_pelajaran_id;
      if (formData.kode_soal.trim()) payload.kode_soal = formData.kode_soal.trim();
      if (formData.indikator.trim()) payload.indikator = formData.indikator.trim();
      if (formData.pembahasan.trim()) payload.pembahasan = formData.pembahasan.trim();

      if (formData.tipe_soal === 'pg') {
        payload.opsi_a = formData.opsi_a.trim();
        payload.opsi_b = formData.opsi_b.trim();
        payload.opsi_c = formData.opsi_c.trim();
        payload.opsi_d = formData.opsi_d.trim();
        payload.opsi_e = formData.opsi_e.trim();
        payload.kunci_jawaban = (formData.kunci_jawaban || 'A').toUpperCase();
      } else {
        payload.kunci_jawaban = formData.kunci_jawaban.trim();
      }

      if (editingItem) {
        await mobileApiService.updateTeacherBankSoal(editingItem.id, payload);
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Perubahan Sukses',
          message: 'Perubahan data butir soal berhasil diperbarui di Bank Soal.',
        });
        setIsFormModalOpen(false);
        void loadQuestions(true);
      } else {
        await mobileApiService.createTeacherBankSoal(payload);
        if (keepOpenAndNext) {
          const nextCount = questions.length + 2;
          setFormData((prev) => ({
            ...prev,
            kode_soal: `SOAL-${String(nextCount).padStart(2, '0')}`,
            pertanyaan: '',
            opsi_a: '',
            opsi_b: '',
            opsi_c: '',
            opsi_d: '',
            opsi_e: '',
            kunci_jawaban: 'A',
            pembahasan: '',
            indikator: '',
          }));
          setFeedback({
            visible: true,
            type: 'success',
            title: 'Penyimpanan Sukses',
            message: 'Butir soal berhasil disimpan. Silakan lanjutkan mengisi butir soal berikutnya.',
          });
          void loadQuestions(false);
        } else {
          setFeedback({
            visible: true,
            type: 'success',
            title: 'Penyimpanan Sukses',
            message: 'Butir soal baru berhasil disimpan ke Bank Soal.',
          });
          setIsFormModalOpen(false);
          void loadQuestions(true);
        }
      }
    } catch (err: any) {
      console.error('Error submitting bank soal form:', err);
      const errDetail = getApiErrorMessage(err, 'Terjadi kendala saat memproses butir soal.');
      const hint = editingItem
        ? 'Pastikan Anda memiliki hak akses mengajar untuk mapel ini dan data kisi-kisi/mapel yang dipilih valid.'
        : 'Periksa kelengkapan formulir, pastikan jaringan internet stabil, dan coba simpan beberapa saat lagi.';
      setFeedback({
        visible: true,
        type: 'error',
        title: editingItem ? 'Perubahan Gagal' : 'Penyimpanan Gagal',
        message: `${errDetail}\n\nPetunjuk: ${hint}`,
      });
    } finally {
      setFormSubmitting(false);
    }
  };

  // Duplicate Question (Salin)
  const handleDuplicate = async (item: TeacherBankSoalItem) => {
    if (item.kisi_kisi_id) {
      const quota = checkKisiQuota(item.kisi_kisi_id);
      if (quota.isFull) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Soal Sudah Lengkap',
          message: `Tidak dapat menyalin soal ke paket "${quota.judul}" karena kuota pembuatan soal telah terpenuhi (${quota.current}/${quota.target} soal).\n\nSoal sudah lengkap, Anda hanya bisa edit dan hapus butir soal yang sudah ada.`,
        });
        return;
      }
    }

    try {
      await mobileApiService.duplicateTeacherBankSoal(item.id);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Salin Sukses',
        message: `Butir soal "${item.kode_soal || 'SOAL'}" berhasil disalin ke Bank Soal.`,
      });
      void loadQuestions(true);
    } catch (err: any) {
      console.error('Error duplicating question:', err);
      const errDetail = getApiErrorMessage(err, 'Tidak dapat menduplikasi butir soal.');
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Salin Gagal',
        message: `${errDetail}\n\nPetunjuk: Periksa koneksi internet Anda atau coba muat ulang halaman sebelum menyalin kembali.`,
      });
    }
  };

  // Delete Question (Hapus)
  const handleConfirmDelete = async () => {
    if (!deleteModalItem) return;
    setIsDeleting(true);
    try {
      await mobileApiService.deleteTeacherBankSoal(deleteModalItem.id);
      setDeleteModalItem(null);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Delete Sukses',
        message: 'Butir soal berhasil dihapus dari Bank Soal.',
      });
      void loadQuestions(true);
    } catch (err: any) {
      console.error('Error deleting question:', err);
      const errDetail = getApiErrorMessage(err, 'Tidak dapat menghapus butir soal.');
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Hapus Gagal',
        message: `${errDetail}\n\nPetunjuk: Butir soal mungkin sedang digunakan dalam ujian aktif atau terjadi kendala hak akses ke server.`,
      });
    } finally {
      setIsDeleting(false);
    }
  };

  // Toggle Solution Accordion
  const toggleExplanation = (id: string) => {
    setExpandedExplanations((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  // Selected names for form dropdown labels
  const selectedKisiObj = useMemo(() => {
    return teacherOptions.kisi_kisi.find((k) => String(k.id) === String(formData.kisi_kisi_id));
  }, [teacherOptions.kisi_kisi, formData.kisi_kisi_id]);

  const selectedSubjectObj = useMemo(() => {
    return teacherOptions.subjects.find((s) => String(s.id) === String(formData.mata_pelajaran_id));
  }, [teacherOptions.subjects, formData.mata_pelajaran_id]);

  const totalSantriCount = useMemo(() => {
    const sumFromClasses = teacherOptions.kelas.reduce((acc: number, c: any) => {
      return acc + Number(c.total_siswa || c.jumlah_siswa || c.students_count || c.siswa_count || 0);
    }, 0);
    return sumFromClasses > 0 ? sumFromClasses : questions.length;
  }, [teacherOptions.kelas, questions.length]);

  const selectedSubjectName = useMemo(() => {
    if (selectedSubjectId === 'Semua') return 'Semua Mapel';
    const found = teacherOptions.subjects.find((s) => String(s.id) === String(selectedSubjectId));
    return found?.nama_mapel || found?.name || 'Mata Pelajaran';
  }, [selectedSubjectId, teacherOptions.subjects]);

  const selectedClassName = useMemo(() => {
    if (selectedClassId === 'Semua') return 'Semua Rombel';
    const found = teacherOptions.kelas.find((c) => String(c.id) === String(selectedClassId));
    return found?.nama_kelas || found?.name || 'Rombel / Kelas';
  }, [selectedClassId, teacherOptions.kelas]);

  // Bidirectional Synchronization between Mapel and Rombel
  const handleSelectSubject = (subjectId: string) => {
    setSelectedSubjectId(subjectId);
    if (subjectId === 'Semua') {
      setSelectedClassId('Semua');
    } else {
      // Find matching class from kisi-kisi or teacher options
      const matchedKisi = teacherOptions.kisi_kisi.find(
        (k) =>
          String(k.mata_pelajaran_id) === String(subjectId) ||
          String(k.subject?.id) === String(subjectId) ||
          String(k.mata_pelajaran) === String(subjectId)
      );
      if (matchedKisi?.kelas_id) {
        setSelectedClassId(String(matchedKisi.kelas_id));
      } else if (matchedKisi?.kelas) {
        const matchedClass = teacherOptions.kelas.find(
          (c) =>
            String(c.id) === String(matchedKisi.kelas) ||
            c.nama_kelas === matchedKisi.kelas ||
            c.name === matchedKisi.kelas
        );
        if (matchedClass) {
          setSelectedClassId(String(matchedClass.id));
        }
      }
    }
  };

  const handleSelectClass = (classId: string) => {
    setSelectedClassId(classId);
    if (classId === 'Semua') {
      setSelectedSubjectId('Semua');
    } else {
      // Find matching subject from kisi-kisi
      const matchedKisi = teacherOptions.kisi_kisi.find(
        (k) =>
          String(k.kelas_id) === String(classId) ||
          String(k.kelas) === String(classId)
      );
      if (matchedKisi?.mata_pelajaran_id) {
        setSelectedSubjectId(String(matchedKisi.mata_pelajaran_id));
      } else if (matchedKisi?.subject?.id) {
        setSelectedSubjectId(String(matchedKisi.subject.id));
      }
    }
  };

  // Dynamic Badges helper
  const getTipeBadge = (tipe?: string) => {
    const found = TIPE_SOAL_OPTIONS.find((t) => t.value === tipe) || TIPE_SOAL_OPTIONS[0];
    return (
      <View style={[styles.badgePill, { backgroundColor: found.bg }]}>
        <MaterialCommunityIcons name={found.icon as any} size={11} color={found.color} style={{ marginRight: 3 }} />
        <Text style={[styles.badgePillText, { color: found.color }]}>{found.label}</Text>
      </View>
    );
  };

  const getDifficultyBadge = (difficulty?: string) => {
    const found = KESULITAN_OPTIONS.find((k) => k.value === difficulty) || KESULITAN_OPTIONS[1];
    return (
      <View style={[styles.badgePill, { backgroundColor: found.bg, borderColor: found.border, borderWidth: 1 }]}>
        <Text style={[styles.badgePillText, { color: found.color }]}>{found.label}</Text>
      </View>
    );
  };

  const toggleGroup = (groupId: string) => {
    setExpandedGroups((prev) => ({
      ...prev,
      [groupId]: !prev[groupId],
    }));
  };

  const expandAllGroups = () => {
    const all: Record<string, boolean> = {};
    groupedQuestions.forEach((g) => {
      all[g.kisi_kisi_id || 'unassigned'] = true;
    });
    setExpandedGroups(all);
  };

  const collapseAllGroups = () => {
    const all: Record<string, boolean> = {};
    groupedQuestions.forEach((g) => {
      all[g.kisi_kisi_id || 'unassigned'] = false;
    });
    setExpandedGroups(all);
  };

  const groupedQuestions = useMemo(() => {
    const map = new Map<string, {
      kisi_kisi_id: string;
      judul_kisi: string;
      mapel_name: string;
      kelas: string;
      jenis_ujian: string;
      target_jumlah_soal: number | null;
      items: TeacherBankSoalItem[];
      total_poin: number;
    }>();

    questions.forEach((item) => {
      const rawKisiId = item.kisi_kisi_id;
      const kisiId = rawKisiId ? String(rawKisiId) : 'unassigned';
      if (!map.has(kisiId)) {
        const kisiMeta = teacherOptions.kisi_kisi.find((k) => String(k.id) === String(kisiId)) || item.kisi_kisi || {};
        map.set(kisiId, {
          kisi_kisi_id: kisiId !== 'unassigned' ? kisiId : '',
          judul_kisi: kisiMeta.judul_kisi || item.kisi_kisi?.judul_kisi || (kisiId === 'unassigned' ? 'Soal Mandiri (Tanpa Kisi-kisi)' : `Kisi-kisi #${kisiId}`),
          mapel_name: item.subject?.name || kisiMeta.mata_pelajaran || item.kisi_kisi?.mata_pelajaran || 'Mata Pelajaran',
          kelas: kisiMeta.kelas || item.kisi_kisi?.kelas || '',
          jenis_ujian: kisiMeta.jenis_ujian || item.kisi_kisi?.jenis_ujian || '',
          target_jumlah_soal: Number(kisiMeta.jumlah_soal) || null,
          items: [],
          total_poin: 0,
        });
      }
      const grp = map.get(kisiId)!;
      grp.items.push(item);
      grp.total_poin += Number(item.poin || 0);
    });

    if (!searchQuery.trim() && selectedKisiId === 'Semua') {
      teacherOptions.kisi_kisi.forEach((k) => {
        const kId = String(k.id);
        if (!map.has(kId)) {
          if (selectedSubjectId !== 'Semua' && String(k.mata_pelajaran_id) !== String(selectedSubjectId)) {
            return;
          }
          if (selectedClassId !== 'Semua' && String(k.kelas_id) !== String(selectedClassId)) {
            return;
          }
          map.set(kId, {
            kisi_kisi_id: kId,
            judul_kisi: k.judul_kisi || `Kisi-kisi #${kId}`,
            mapel_name: k.mata_pelajaran || 'Mata Pelajaran',
            kelas: k.kelas || '',
            jenis_ujian: k.jenis_ujian || '',
            target_jumlah_soal: Number(k.jumlah_soal) || null,
            items: [],
            total_poin: 0,
          });
        }
      });
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.kisi_kisi_id === '') return 1;
      if (b.kisi_kisi_id === '') return -1;
      return b.items.length - a.items.length;
    });
  }, [questions, teacherOptions.kisi_kisi, searchQuery, selectedKisiId, selectedSubjectId, selectedClassId]);

  const renderQuestionCard = (item: TeacherBankSoalItem, idx: number) => {
    const isExplanationOpen = Boolean(expandedExplanations[item.id]);
    const optionsList = [
      { key: 'A', text: item.opsi_a },
      { key: 'B', text: item.opsi_b },
      { key: 'C', text: item.opsi_c },
      { key: 'D', text: item.opsi_d },
      { key: 'E', text: item.opsi_e },
    ].filter((o) => Boolean(o.text && o.text.trim()));

    return (
      <View key={item.id} style={styles.teacherQuestionCard}>
        {/* Top Row: Meta Badges */}
        <View style={styles.cardTopRow}>
          <View style={styles.cardTopLeftGroup}>
            <View style={styles.kodeSoalPill}>
              <Text style={styles.kodeSoalText}>{item.kode_soal || `SOAL-${idx + 1}`}</Text>
            </View>
            {getTipeBadge(item.tipe_soal)}
            {getDifficultyBadge(item.tingkat_kesulitan)}
          </View>
          <View style={styles.pointPill}>
            <Text style={styles.pointPillText}>{item.poin ?? 2.5} Poin</Text>
          </View>
        </View>

        {/* Question Content */}
        <Text style={styles.teacherQuestionText}>{item.pertanyaan}</Text>

        {/* Associated Info Row */}
        <View style={styles.cardInfoMetaRow}>
          {Boolean(item.kisi_kisi?.judul_kisi) && (
            <View style={styles.cardInfoTag}>
              <MaterialCommunityIcons name="file-document-outline" size={11} color="#0D9488" style={{ marginRight: 3 }} />
              <Text style={styles.cardInfoTagText} numberOfLines={1}>{item.kisi_kisi?.judul_kisi}</Text>
            </View>
          )}
          {Boolean(item.kisi_kisi?.kelas) && (
            <View style={[styles.cardInfoTag, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <MaterialCommunityIcons name="google-classroom" size={11} color="#0284C7" style={{ marginRight: 3 }} />
              <Text style={[styles.cardInfoTagText, { color: '#0369A1' }]}>{item.kisi_kisi?.kelas}</Text>
            </View>
          )}
          {Boolean(item.subject?.name || item.kisi_kisi?.mata_pelajaran) && (
            <View style={[styles.cardInfoTag, { backgroundColor: '#FDF4FF', borderColor: '#F0ABFC' }]}>
              <MaterialCommunityIcons name="book-open-page-variant" size={11} color="#A21CAF" style={{ marginRight: 3 }} />
              <Text style={[styles.cardInfoTagText, { color: '#A21CAF' }]}>
                {item.subject?.name || item.kisi_kisi?.mata_pelajaran}
              </Text>
            </View>
          )}
        </View>

        {/* Multiple Choice Preview (for PG) */}
        {optionsList.length > 0 && (
          <View style={styles.optionsPreviewList}>
            {optionsList.map((opt) => {
              const isCorrect = (item.kunci_jawaban || '').toUpperCase() === opt.key;
              return (
                <View
                  key={opt.key}
                  style={[
                    styles.optionPreviewItem,
                    isCorrect && styles.optionPreviewItemCorrect,
                  ]}
                >
                  <View
                    style={[
                      styles.optionKeyCircleMini,
                      isCorrect && styles.optionKeyCircleMiniCorrect,
                    ]}
                  >
                    <Text
                      style={[
                        styles.optionKeyTextMini,
                        isCorrect && styles.optionKeyTextMiniCorrect,
                      ]}
                    >
                      {opt.key}
                    </Text>
                  </View>
                  <Text
                    style={[
                      styles.optionPreviewContentText,
                      isCorrect && styles.optionPreviewContentTextCorrect,
                    ]}
                    numberOfLines={2}
                  >
                    {opt.text}
                  </Text>
                  {isCorrect && (
                    <MaterialCommunityIcons name="check-circle" size={15} color="#059669" style={{ marginLeft: 6 }} />
                  )}
                </View>
              );
            })}
          </View>
        )}

        {/* Accordion Toggle Kunci & Pembahasan */}
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => toggleExplanation(item.id)}
          style={styles.explanationToggleRow}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center' }}>
            <MaterialCommunityIcons
              name={isExplanationOpen ? 'eye-off-outline' : 'lightbulb-on-outline'}
              size={15}
              color="#0D6B42"
              style={{ marginRight: 5 }}
            />
            <Text style={styles.explanationToggleText}>
              {isExplanationOpen ? 'Sembunyikan Pembahasan' : 'Lihat Kunci & Pembahasan'}
            </Text>
          </View>
          <MaterialCommunityIcons
            name={isExplanationOpen ? 'chevron-up' : 'chevron-down'}
            size={18}
            color="#0D6B42"
          />
        </TouchableOpacity>

        {isExplanationOpen && (
          <View style={styles.explanationBodyBox}>
            <View style={styles.solutionHeaderLine}>
              <Text style={styles.solutionKeyLabel}>Kunci Resmi:</Text>
              <View style={styles.solutionKeyBadge}>
                <Text style={styles.solutionKeyBadgeText}>{item.kunci_jawaban || '-'}</Text>
              </View>
            </View>
            {Boolean(item.pembahasan) && (
              <Text style={styles.explanationParagraphText}>{item.pembahasan}</Text>
            )}
            {Boolean(item.indikator) && (
              <Text style={styles.indicatorParagraphText}>
                Indikator Capaian: {item.indikator}
              </Text>
            )}
          </View>
        )}

        {/* Action Buttons Row */}
        <View style={styles.cardActionsRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.cardActionButton, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}
            onPress={() => setDetailModalItem(item)}
          >
            <MaterialCommunityIcons name="eye-outline" size={15} color="#0284C7" />
            <Text style={[styles.cardActionButtonText, { color: '#0284C7' }]}>Detail</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.cardActionButton, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}
            onPress={() => handleOpenEditModal(item)}
          >
            <MaterialCommunityIcons name="pencil-outline" size={15} color="#D97706" />
            <Text style={[styles.cardActionButtonText, { color: '#D97706' }]}>Ubah</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.cardActionButton, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
            onPress={() => handleDuplicate(item)}
          >
            <MaterialCommunityIcons name="content-copy" size={15} color="#059669" />
            <Text style={[styles.cardActionButtonText, { color: '#059669' }]}>Salin</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.75}
            style={[styles.cardActionButton, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}
            onPress={() => setDeleteModalItem(item)}
          >
            <MaterialCommunityIcons name="trash-can-outline" size={15} color="#E11D48" />
            <Text style={[styles.cardActionButtonText, { color: '#E11D48' }]}>Hapus</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  };

  return (
    <View style={styles.container}>
      {/* ── Background Foliage Header Identik Standard Emas Sekolah ── */}
      <View style={[styles.topFoliageWrapper, { height: topInset + 64 }]}>
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0.40)', 'rgba(209, 250, 229, 0.60)', '#ECFDF5']}
          locations={[0, 0.5, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Top Bar Header Bersih (Satu Baris, Tanpa Tumpuk) ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 4 }]}>
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={handleBack}
          style={styles.cleanHeaderIconBtn}
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#004D32" />
        </TouchableOpacity>

        <View style={styles.cleanHeaderTitleCenter}>
          <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
            {pageTitle}
          </Text>
          <Text numberOfLines={1} style={styles.cleanHeaderSubtitle}>
            {pageSubtitle}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.cleanBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── Main Scroll View ── */}
      <View style={styles.sheetContainer}>
        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.mainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          showsVerticalScrollIndicator={false}
          onScroll={handleMainScroll}
          scrollEventThrottle={16}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor="#0E5C44"
              colors={['#0E5C44', '#10B981']}
            />
          }
        >
          <View style={styles.bodyContentWrapper}>
            {/* ── 4 KPI Stats Cards: 2x2 Equal Grid Standar Emas ── */}
            <View style={styles.kpiGridContainer}>
              {/* Row 1: Butir Soal (Emerald) & Mapel (Sky) */}
              <View style={styles.kpiGridRow}>
                <View style={[styles.kpiGridCard, styles.kpiCardEmerald]}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="database-outline" size={22} color="#059669" />
                  </View>
                  <View style={styles.kpiTextCol}>
                    <Text style={[styles.kpiValueLarge, { color: '#064E3B' }]}>{questions.length}</Text>
                    <Text style={[styles.kpiLabelModern, { color: '#047857' }]} numberOfLines={1}>
                      Butir Soal
                    </Text>
                  </View>
                </View>

                <View style={[styles.kpiGridCard, styles.kpiCardSky]}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#F0F9FF' }]}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={22} color="#0284C7" />
                  </View>
                  <View style={styles.kpiTextCol}>
                    <Text style={[styles.kpiValueLarge, { color: '#075985' }]}>
                      {teacherOptions.subjects.length}
                    </Text>
                    <Text style={[styles.kpiLabelModern, { color: '#0284C7' }]} numberOfLines={1}>
                      Mata Pelajaran
                    </Text>
                  </View>
                </View>
              </View>

              {/* Row 2: Kisi-kisi CBT (Amber) & Total Siswa (Purple) */}
              <View style={styles.kpiGridRow}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => navigation?.navigate('KisiKisi')}
                  style={[styles.kpiGridCard, styles.kpiCardAmber]}
                >
                  <View style={[styles.kpiIconBox, { backgroundColor: '#FFFBEB' }]}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#D97706" />
                  </View>
                  <View style={styles.kpiTextCol}>
                    <Text style={[styles.kpiValueLarge, { color: '#78350F' }]}>
                      {teacherOptions.kisi_kisi.length}
                    </Text>
                    <Text style={[styles.kpiLabelModern, { color: '#B45309' }]} numberOfLines={1}>
                      Kisi-kisi Aktif
                    </Text>
                  </View>
                </TouchableOpacity>

                <View style={[styles.kpiGridCard, styles.kpiCardPurple]}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
                    <MaterialCommunityIcons name="account-group-outline" size={22} color="#7C3AED" />
                  </View>
                  <View style={styles.kpiTextCol}>
                    <Text style={[styles.kpiValueLarge, { color: '#4C1D95' }]}>{totalSantriCount}</Text>
                    <Text style={[styles.kpiLabelModern, { color: '#7C3AED' }]} numberOfLines={1}>
                      Siswa Terdaftar
                    </Text>
                  </View>
                </View>
              </View>
            </View>

            {/* Active Kisi-kisi Prefill Banner (jika diarahkan dari halaman Kisi-Kisi) */}
            {selectedKisiId !== 'Semua' && (
              <View style={styles.activeKisiBanner}>
                <View style={styles.activeKisiBannerLeft}>
                  <MaterialCommunityIcons name="filter-check" size={18} color="#0E5C44" />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.activeKisiBannerTitle}>Memfilter Berdasarkan Kisi-Kisi</Text>
                    <Text style={styles.activeKisiBannerSub} numberOfLines={1}>
                      {route?.params?.judul_kisi ||
                        teacherOptions.kisi_kisi.find((k) => String(k.id) === selectedKisiId)?.judul_kisi ||
                        'Kisi-Kisi Terpilih'}
                    </Text>
                  </View>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedKisiId('Semua')}
                  style={styles.activeKisiBannerClearBtn}
                >
                  <MaterialCommunityIcons name="close" size={16} color="#0E5C44" />
                </TouchableOpacity>
              </View>
            )}

            {/* ── Dropdown Filters: Mata Pelajaran & Rombel Kelas (Saling Terhubung) ── */}
            <View style={styles.dropdownFiltersRow}>
              {/* Dropdown 1: Mata Pelajaran */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.dropdownFilterTrigger}
                onPress={() =>
                  setFilterDropdownModal({
                    isOpen: true,
                    type: 'subject',
                    title: 'Pilih Mata Pelajaran',
                  })
                }
              >
                <View style={styles.dropdownFilterLeft}>
                  <View style={[styles.dropdownFilterIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={15} color="#059669" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.dropdownFilterLabel}>Mata Pelajaran</Text>
                    <Text style={styles.dropdownFilterValue} numberOfLines={1}>
                      {selectedSubjectName}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
              </TouchableOpacity>

              {/* Dropdown 2: Rombel / Kelas */}
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.dropdownFilterTrigger}
                onPress={() =>
                  setFilterDropdownModal({
                    isOpen: true,
                    type: 'kelas',
                    title: 'Pilih Rombel / Kelas',
                  })
                }
              >
                <View style={styles.dropdownFilterLeft}>
                  <View style={[styles.dropdownFilterIconBox, { backgroundColor: '#F0F9FF' }]}>
                    <MaterialCommunityIcons name="google-classroom" size={15} color="#0284C7" />
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={styles.dropdownFilterLabel}>Rombel / Kelas</Text>
                    <Text style={styles.dropdownFilterValue} numberOfLines={1}>
                      {selectedClassName}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* ── Search Bar & Button Tambah di Sampingnya ── */}
            <View style={styles.searchAndAddRow}>
              <View style={styles.searchContainerFlex}>
                <MaterialCommunityIcons name="magnify" size={20} color="#059669" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInputFlex}
                  placeholder="Cari butir soal, kode, indikator..."
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  returnKeyType="search"
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.addBtnBesideSearch}
                onPress={() => handleOpenCreateModal()}
              >
                <LinearGradient
                  colors={['#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.addBtnGradBesideSearch}
                >
                  <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" style={{ marginRight: 2 }} />
                  <Text style={styles.addBtnTextBesideSearch}>Tambah</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* ── Section Header: Label Paket Kisi-kisi & Mapel dengan Tombol Grup/Semua di Bawahnya ── */}
            <View style={styles.packageHeaderBox}>
              <View style={styles.packageLabelRow}>
                <View>
                  <Text style={styles.actionHeaderTitle}>
                    {viewLayout === 'grouped' ? 'Paket Kisi-kisi & Mapel' : 'Daftar Butir Soal'}
                  </Text>
                  <Text style={styles.actionHeaderSubtitle}>
                    {viewLayout === 'grouped'
                      ? `${groupedQuestions.length} Paket Kisi-kisi Tersedia`
                      : `${questions.length} Butir Soal Tersedia`}
                  </Text>
                </View>
              </View>

              {/* Button Grup dan Semua diletakkan di bawah label */}
              <View style={styles.layoutSegmentedUnderLabel}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[styles.layoutSegmentBtnUnder, viewLayout === 'grouped' && styles.layoutSegmentBtnUnderActive]}
                  onPress={() => setViewLayout('grouped')}
                >
                  <MaterialCommunityIcons
                    name="folder-outline"
                    size={15}
                    color={viewLayout === 'grouped' ? '#FFFFFF' : '#059669'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.layoutSegmentTextUnder, viewLayout === 'grouped' && styles.layoutSegmentTextUnderActive]}>
                    Grup Kisi-kisi
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  style={[styles.layoutSegmentBtnUnder, viewLayout === 'flat' && styles.layoutSegmentBtnUnderActive]}
                  onPress={() => setViewLayout('flat')}
                >
                  <MaterialCommunityIcons
                    name="format-list-bulleted"
                    size={15}
                    color={viewLayout === 'flat' ? '#FFFFFF' : '#059669'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[styles.layoutSegmentTextUnder, viewLayout === 'flat' && styles.layoutSegmentTextUnderActive]}>
                    Semua Soal
                  </Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── Content States ── */}
            {loading && !refreshing ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#0E5C44" />
                <Text style={styles.loadingText}>Memuat repositori butir soal...</Text>
              </View>
            ) : viewLayout === 'flat' ? (
              /* ── FLAT VIEW: All questions list ── */
              questions.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <View style={styles.emptyIconCircle}>
                    <MaterialCommunityIcons name="database-outline" size={44} color="#0D6B42" />
                  </View>
                  <Text style={styles.emptyTitle}>Belum Ada Butir Soal</Text>
                  <Text style={styles.emptyDesc}>
                    {searchQuery
                      ? `Tidak ditemukan butir soal dengan kata kunci "${searchQuery}".`
                      : 'Belum ada butir soal dalam filter ini. Ketuk tombol "Tambah" untuk membuat butir soal baru.'}
                  </Text>
                  <TouchableOpacity
                    onPress={() => handleOpenCreateModal()}
                    style={styles.emptyActionBtn}
                  >
                    <Text style={styles.emptyActionBtnText}>Tambah Soal Pertama</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                questions.map((item, idx) => renderQuestionCard(item, idx))
              )
            ) : (
              /* ── GROUPED VIEW: Grouped by Kisi-kisi & Mapel ── */
              <View>
                {/* Bulk Accordion Controls */}
                <View style={styles.groupBulkActionRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="folder-multiple-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 12, fontWeight: '700', color: '#064E3B' }}>
                      {groupedQuestions.length} Paket Kisi-kisi
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <TouchableOpacity onPress={expandAllGroups}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#059669' }}>Buka Semua</Text>
                    </TouchableOpacity>
                    <Text style={{ color: '#A7F3D0' }}>|</Text>
                    <TouchableOpacity onPress={collapseAllGroups}>
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>Tutup Semua</Text>
                    </TouchableOpacity>
                  </View>
                </View>

                {groupedQuestions.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <View style={styles.emptyIconCircle}>
                      <MaterialCommunityIcons name="folder-outline" size={44} color="#0D6B42" />
                    </View>
                    <Text style={styles.emptyTitle}>Belum Ada Paket Kisi-kisi</Text>
                    <Text style={styles.emptyDesc}>
                      {searchQuery
                        ? `Tidak ditemukan paket dengan kata kunci "${searchQuery}".`
                        : 'Belum ada kisi-kisi atau soal yang terdaftar. Ketuk "Tambah" untuk mulai membuat soal.'}
                    </Text>
                    <TouchableOpacity
                      onPress={() => handleOpenCreateModal()}
                      style={styles.emptyActionBtn}
                    >
                      <Text style={styles.emptyActionBtnText}>Tambah Soal Baru</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  groupedQuestions.map((group) => {
                    const groupKey = group.kisi_kisi_id || 'unassigned';
                    const isExpanded = Boolean(expandedGroups[groupKey]);
                    const hasTarget = Boolean(group.target_jumlah_soal && group.target_jumlah_soal > 0);
                    const isComplete = hasTarget ? group.items.length >= (group.target_jumlah_soal || 0) : false;
                    const percent = hasTarget
                      ? Math.min(100, Math.round((group.items.length / (group.target_jumlah_soal || 1)) * 100))
                      : 100;

                    return (
                      <View key={groupKey} style={styles.groupCardContainer}>
                        {/* Group Header Card */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => toggleGroup(groupKey)}
                          style={styles.groupHeaderRow}
                        >
                          <View style={styles.groupTopInfoRow}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                              <View style={styles.groupIconSquircle}>
                                <MaterialCommunityIcons name="folder-text-outline" size={18} color="#059669" />
                              </View>
                              <View style={{ flex: 1, marginLeft: 8 }}>
                                <Text style={styles.groupTitleText} numberOfLines={1}>
                                  {group.judul_kisi}
                                </Text>
                                <Text style={styles.groupMapelSubtitle} numberOfLines={1}>
                                  {group.mapel_name}
                                </Text>
                              </View>
                            </View>

                            <View style={[styles.groupStatusPill, isComplete && styles.groupStatusPillComplete]}>
                              <Text style={[styles.groupStatusPillText, isComplete && styles.groupStatusPillTextComplete]}>
                                {hasTarget ? `${group.items.length}/${group.target_jumlah_soal} Soal` : `${group.items.length} Soal`}
                              </Text>
                            </View>
                          </View>

                          {/* Badges Row */}
                          <View style={styles.groupBadgesRow}>
                            {Boolean(group.kelas) && (
                              <View style={[styles.cardInfoTag, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
                                <MaterialCommunityIcons name="google-classroom" size={11} color="#0284C7" style={{ marginRight: 3 }} />
                                <Text style={[styles.cardInfoTagText, { color: '#0369A1' }]}>{group.kelas}</Text>
                              </View>
                            )}
                            {Boolean(group.jenis_ujian) && (
                              <View style={[styles.cardInfoTag, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                                <MaterialCommunityIcons name="school-outline" size={11} color="#D97706" style={{ marginRight: 3 }} />
                                <Text style={[styles.cardInfoTagText, { color: '#B45309', textTransform: 'uppercase' }]}>
                                  {group.jenis_ujian}
                                </Text>
                              </View>
                            )}
                            <View style={[styles.cardInfoTag, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                              <MaterialCommunityIcons name="star-outline" size={11} color="#059669" style={{ marginRight: 3 }} />
                              <Text style={[styles.cardInfoTagText, { color: '#047857' }]}>
                                Total {group.total_poin.toFixed(1)} Poin
                              </Text>
                            </View>
                          </View>

                          {/* Progress Bar (if target exists) */}
                          {hasTarget && (
                            <View style={styles.groupProgressRow}>
                              <View style={styles.groupProgressBar}>
                                <View
                                  style={[
                                    styles.groupProgressFill,
                                    { width: `${percent}%` },
                                    isComplete && { backgroundColor: '#10B981' },
                                  ]}
                                />
                              </View>
                              <Text style={styles.groupProgressText}>{percent}%</Text>
                            </View>
                          )}

                          {/* Group Action Row */}
                          <View style={styles.groupActionRow}>
                            <TouchableOpacity
                              activeOpacity={0.8}
                              style={[styles.groupAddBtn, isComplete && styles.groupAddBtnCompleted]}
                              onPress={(e) => {
                                e.stopPropagation();
                                if (isComplete) {
                                  setFeedback({
                                    visible: true,
                                    type: 'info',
                                    title: 'Soal Sudah Lengkap',
                                    message: `Pembuatan soal pada paket "${group.judul_kisi}" telah mencapai target kuota (${group.items.length}/${group.target_jumlah_soal} soal).\n\nSoal sudah lengkap, Anda hanya bisa edit dan hapus butir soal yang sudah ada.`,
                                  });
                                  return;
                                }
                                handleOpenCreateModal(group.kisi_kisi_id);
                              }}
                            >
                              <MaterialCommunityIcons name={isComplete ? "check-circle" : "plus"} size={14} color="#FFFFFF" />
                              <Text style={styles.groupAddBtnText}>{isComplete ? 'Soal Lengkap' : 'Tambah Soal'}</Text>
                            </TouchableOpacity>

                            <View style={styles.groupChevronBtn}>
                              <Text style={styles.groupChevronText}>
                                {isExpanded ? 'Tutup' : `Lihat (${group.items.length})`}
                              </Text>
                              <MaterialCommunityIcons
                                name={isExpanded ? 'chevron-up' : 'chevron-down'}
                                size={16}
                                color="#065F46"
                              />
                            </View>
                          </View>
                        </TouchableOpacity>

                        {/* Group Questions List Body */}
                        {isExpanded && (
                          <View style={{ padding: 10, backgroundColor: '#F8FAFC' }}>
                            {group.items.length === 0 ? (
                              <View style={styles.groupEmptyCard}>
                                <Text style={styles.groupEmptyText}>
                                  Belum ada butir soal pada kisi-kisi ini {hasTarget ? `(target ${group.target_jumlah_soal} soal)` : ''}.
                                </Text>
                                <TouchableOpacity
                                  style={styles.groupEmptyBtn}
                                  onPress={() => handleOpenCreateModal(group.kisi_kisi_id)}
                                >
                                  <Text style={styles.groupEmptyBtnText}>Buat Soal Pertama</Text>
                                </TouchableOpacity>
                              </View>
                            ) : (
                              group.items.map((item, idx) => renderQuestionCard(item, idx))
                            )}

                            {group.items.length > 0 && (
                              isComplete ? (
                                <View style={styles.quotaCompleteNoticeBox}>
                                  <MaterialCommunityIcons name="check-decagram" size={20} color="#059669" style={{ marginRight: 8 }} />
                                  <View style={{ flex: 1 }}>
                                    <Text style={styles.quotaCompleteNoticeTitle}>Soal Sudah Lengkap</Text>
                                    <Text style={styles.quotaCompleteNoticeText}>
                                      Kuota pembuatan soal pada paket ini telah terpenuhi ({group.items.length}/{group.target_jumlah_soal} soal). Anda hanya bisa mengedit dan menghapus butir soal.
                                    </Text>
                                  </View>
                                </View>
                              ) : (
                                <TouchableOpacity
                                  style={styles.groupBottomAddBtn}
                                  activeOpacity={0.8}
                                  onPress={() => handleOpenCreateModal(group.kisi_kisi_id)}
                                >
                                  <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#059669" />
                                  <Text style={styles.groupBottomAddText}>
                                    Tambah Soal Berikutnya ke Paket Ini
                                  </Text>
                                </TouchableOpacity>
                              )
                            )}
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </View>
        </Animated.ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════
          1. MODAL FORM TAMBAH / UBAH BUTIR SOAL
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={isFormModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => !formSubmitting && setIsFormModalOpen(false)}
      >
        <View style={styles.bottomSheetBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.bottomSheetDismissArea}
            onPress={() => !formSubmitting && setIsFormModalOpen(false)}
          />
          <View style={[styles.bottomSheetContainer, { maxHeight: '90%', overflow: 'hidden' }]}>
            {/* Header Berwarna Modal Form */}
            <View style={styles.coloredModalHeader}>
              <LinearGradient
                colors={['#047857', '#059669', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.bottomSheetDragHandleLight} />

              <View style={styles.coloredModalHeaderRow}>
                <View style={styles.coloredModalHeaderIconSquircle}>
                  <MaterialCommunityIcons
                    name={editingItem ? 'pencil-outline' : 'plus-circle-outline'}
                    size={20}
                    color="#FFFFFF"
                  />
                </View>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.coloredModalHeaderTitle}>
                    {editingItem ? 'Ubah Butir Soal' : 'Tambah Butir Soal Baru'}
                  </Text>
                  <Text style={styles.coloredModalHeaderSubtitle} numberOfLines={1}>
                    Penyusun: {teacherDisplayName}
                  </Text>
                </View>
                <TouchableOpacity
                  disabled={formSubmitting}
                  onPress={() => setIsFormModalOpen(false)}
                  style={styles.coloredModalCloseBtn}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            <ScrollView
              style={styles.bottomSheetBody}
              contentContainerStyle={{ paddingBottom: 36 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* Trigger Kisi-Kisi */}
              <View style={styles.formGroupSpaced}>
                <Text style={styles.formLabel}>Hubungkan ke Kisi-Kisi Ujian</Text>
                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.dropdownTrigger}
                  onPress={() => {
                    setPickerSearch('');
                    setPickerModal({ isOpen: true, type: 'kisi_kisi', title: 'Pilih Kisi-Kisi Ujian' });
                  }}
                >
                  <View style={styles.dropdownLeftWrap}>
                    <MaterialCommunityIcons name="clipboard-list-outline" size={19} color="#059669" />
                    <Text
                      style={selectedKisiObj ? styles.dropdownValueText : styles.dropdownPlaceholder}
                      numberOfLines={1}
                    >
                      {selectedKisiObj ? selectedKisiObj.judul_kisi : 'Pilih Kisi-Kisi (Opsional)...'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Trigger Mata Pelajaran */}
              <View style={styles.formGroupSpaced}>
                <Text style={styles.formLabel}>
                  Mata Pelajaran <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <TouchableOpacity
                  activeOpacity={0.75}
                  style={styles.dropdownTrigger}
                  onPress={() => {
                    setPickerSearch('');
                    setPickerModal({ isOpen: true, type: 'subject', title: 'Pilih Mata Pelajaran' });
                  }}
                >
                  <View style={styles.dropdownLeftWrap}>
                    <MaterialCommunityIcons name="book-open-variant" size={19} color="#0284C7" />
                    <Text
                      style={selectedSubjectObj ? styles.dropdownValueText : styles.dropdownPlaceholder}
                      numberOfLines={1}
                    >
                      {selectedSubjectObj ? (selectedSubjectObj.nama_mapel || selectedSubjectObj.name) : 'Pilih Mata Pelajaran...'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Tipe Soal Selector */}
              <View style={styles.formGroupSpaced}>
                <Text style={styles.formLabel}>Tipe Butir Soal</Text>
                <View style={styles.tipeSoalPillGroup}>
                  {TIPE_SOAL_OPTIONS.map((opt) => (
                    <TouchableOpacity
                      key={opt.value}
                      style={[
                        styles.tipeSoalPillOption,
                        formData.tipe_soal === opt.value && styles.tipeSoalPillOptionActive,
                      ]}
                      onPress={() => setFormData((prev) => ({ ...prev, tipe_soal: opt.value }))}
                    >
                      <Text
                        style={[
                          styles.tipeSoalPillOptionText,
                          formData.tipe_soal === opt.value && styles.tipeSoalPillOptionTextActive,
                        ]}
                      >
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>

              {/* Kode Soal & Poin */}
              <View style={styles.formRowTwoCols}>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.formLabel}>Kode Soal</Text>
                  <TextInput
                    style={styles.formTextInput}
                    placeholder="Contoh: SOAL-01"
                    placeholderTextColor="#94A3B8"
                    value={formData.kode_soal}
                    onChangeText={(txt) => setFormData((prev) => ({ ...prev, kode_soal: txt }))}
                  />
                </View>
                <View style={{ flex: 1, marginLeft: 8 }}>
                  <Text style={styles.formLabel}>Bobot Poin</Text>
                  <TextInput
                    style={styles.formTextInput}
                    placeholder="2.5"
                    placeholderTextColor="#94A3B8"
                    keyboardType="numeric"
                    value={formData.poin}
                    onChangeText={(txt) => setFormData((prev) => ({ ...prev, poin: txt }))}
                  />
                </View>
              </View>


              {/* Teks Pertanyaan */}
              <View style={styles.formGroupSpaced}>
                <Text style={styles.formLabel}>
                  Pertanyaan / Soal <Text style={{ color: '#EF4444' }}>*</Text>
                </Text>
                <TextInput
                  style={[styles.formTextInput, styles.multilineInput]}
                  placeholder="Tuliskan pertanyaan secara lengkap di sini..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  value={formData.pertanyaan}
                  onChangeText={(txt) => setFormData((prev) => ({ ...prev, pertanyaan: txt }))}
                />
              </View>

              {/* Opsi Pilihan Ganda (Jika PG) */}
              {formData.tipe_soal === 'pg' && (
                <View style={styles.pgOptionsBlock}>
                  <Text style={styles.formSubHeader}>Opsi Jawaban & Kunci</Text>
                  {(['A', 'B', 'C', 'D', 'E'] as const).map((key) => {
                    const fieldName = `opsi_${key.toLowerCase()}` as keyof typeof formData;
                    const isKey = formData.kunci_jawaban.toUpperCase() === key;
                    return (
                      <View key={key} style={styles.optionInputRow}>
                        <TouchableOpacity
                          style={[
                            styles.optionKeyRadio,
                            isKey && styles.optionKeyRadioActive,
                          ]}
                          onPress={() => setFormData((prev) => ({ ...prev, kunci_jawaban: key }))}
                        >
                          <Text style={[styles.optionKeyRadioText, isKey && styles.optionKeyRadioTextActive]}>
                            {key}
                          </Text>
                        </TouchableOpacity>
                        <TextInput
                          style={[styles.formTextInput, { flex: 1 }]}
                          placeholder={`Teks opsi ${key}...`}
                          placeholderTextColor="#94A3B8"
                          value={String(formData[fieldName] || '')}
                          onChangeText={(txt) => setFormData((prev) => ({ ...prev, [fieldName]: txt }))}
                        />
                      </View>
                    );
                  })}
                  <Text style={styles.optionHelpText}>
                    * Ketuk lingkaran huruf untuk menandai opsi sebagai kunci jawaban resmi.
                  </Text>
                </View>
              )}

              {/* Kunci Jawaban Non-PG */}
              {formData.tipe_soal !== 'pg' && (
                <View style={styles.formGroupSpaced}>
                  <Text style={styles.formLabel}>Kunci Jawaban / Pedoman Penilaian</Text>
                  <TextInput
                    style={[styles.formTextInput, styles.multilineInput]}
                    placeholder="Tuliskan kunci jawaban atau rubrik penilaian..."
                    placeholderTextColor="#94A3B8"
                    multiline
                    numberOfLines={2}
                    value={formData.kunci_jawaban}
                    onChangeText={(txt) => setFormData((prev) => ({ ...prev, kunci_jawaban: txt }))}
                  />
                </View>
              )}

              {/* Indikator */}
              <View style={styles.formGroupSpaced}>
                <Text style={styles.formLabel}>Indikator Capaian (Opsional)</Text>
                <TextInput
                  style={styles.formTextInput}
                  placeholder="Contoh: Disajikan teks, siswa dapat mengidentifikasi..."
                  placeholderTextColor="#94A3B8"
                  value={formData.indikator}
                  onChangeText={(txt) => setFormData((prev) => ({ ...prev, indikator: txt }))}
                />
              </View>

              {/* Pembahasan */}
              <View style={styles.formGroupSpaced}>
                <Text style={styles.formLabel}>Pembahasan & Analisis Soal (Opsional)</Text>
                <TextInput
                  style={[styles.formTextInput, styles.multilineInput]}
                  placeholder="Penjelasan pembahasan langkah demi langkah..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  value={formData.pembahasan}
                  onChangeText={(txt) => setFormData((prev) => ({ ...prev, pembahasan: txt }))}
                />
              </View>

              {/* Status Toggle */}
              <View style={styles.switchRow}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.switchTitle}>Status Butir Soal</Text>
                  <Text style={styles.switchSub}>
                    {formData.status ? 'Aktif (dapat digunakan dalam paket ujian)' : 'Nonaktif (disembunyikan)'}
                  </Text>
                </View>
                <Switch
                  value={formData.status}
                  onValueChange={(val) => setFormData((prev) => ({ ...prev, status: val }))}
                  trackColor={{ false: '#CBD5E1', true: '#86EFAC' }}
                  thumbColor={formData.status ? '#059669' : '#94A3B8'}
                />
              </View>

              {/* Submit Buttons */}
              {editingItem ? (
                <View style={styles.formSubmitRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    style={styles.cancelBtn}
                    onPress={() => setIsFormModalOpen(false)}
                    disabled={formSubmitting}
                  >
                    <Text style={styles.cancelBtnText}>Batal</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.submitBtn}
                    onPress={() => handleSubmitForm(false)}
                    disabled={formSubmitting}
                  >
                    <LinearGradient
                      colors={['#059669', '#047857']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.submitBtnGrad}
                    >
                      {formSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.submitBtnText}>Simpan Perubahan</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={styles.formActionGroupContainer}>
                  {/* Primary Full-width Button: Simpan & Lanjut Soal */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    style={styles.submitBtnFullWidth}
                    onPress={() => handleSubmitForm(true)}
                    disabled={formSubmitting}
                  >
                    <LinearGradient
                      colors={['#059669', '#047857']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.submitBtnGradSpacious}
                    >
                      {formSubmitting ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="plus-circle-outline" size={19} color="#FFFFFF" style={{ marginRight: 8 }} />
                          <Text style={styles.submitBtnTextSpacious} numberOfLines={1}>
                            Simpan &amp; Lanjut Soal #{questions.length + 2}
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>

                  {/* Secondary Buttons Row: Batal & Simpan Saja */}
                  <View style={styles.formSubmitRowSecondary}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.cancelBtn}
                      onPress={() => setIsFormModalOpen(false)}
                      disabled={formSubmitting}
                    >
                      <Text style={styles.cancelBtnText}>Batal</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      style={styles.saveOnlyBtn}
                      onPress={() => handleSubmitForm(false)}
                      disabled={formSubmitting}
                    >
                      <MaterialCommunityIcons name="content-save-check-outline" size={17} color="#047857" style={{ marginRight: 6 }} />
                      <Text style={styles.saveOnlyBtnText}>Simpan Saja</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          2. SUB-MODAL PICKER (SEARCHABLE BOTTOM SHEET)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={pickerModal.isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => setPickerModal({ isOpen: false, type: null, title: '' })}
      >
        <View style={styles.bottomSheetBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.bottomSheetDismissArea}
            onPress={() => setPickerModal({ isOpen: false, type: null, title: '' })}
          />
          <View style={[styles.bottomSheetContainer, { maxHeight: '80%' }]}>
            <View style={styles.bottomSheetDragHandle} />

            <View style={styles.bottomSheetHeader}>
              <Text style={styles.bottomSheetTitle}>{pickerModal.title}</Text>
              <TouchableOpacity
                onPress={() => setPickerModal({ isOpen: false, type: null, title: '' })}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search within picker */}
            <View style={styles.pickerSearchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Cari dalam daftar..."
                placeholderTextColor="#94A3B8"
                value={pickerSearch}
                onChangeText={setPickerSearch}
              />
              {Boolean(pickerSearch) && (
                <TouchableOpacity onPress={() => setPickerSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.bottomSheetBody} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
              {/* Option to clear for kisi-kisi */}
              {pickerModal.type === 'kisi_kisi' && (
                <TouchableOpacity
                  style={[styles.pickerListItem, !formData.kisi_kisi_id && styles.pickerListItemActive]}
                  onPress={() => {
                    setFormData((prev) => ({ ...prev, kisi_kisi_id: '' }));
                    setPickerModal({ isOpen: false, type: null, title: '' });
                  }}
                >
                  <Text style={styles.pickerClearOptionText}>(Tidak Terhubung ke Kisi-Kisi)</Text>
                  {!formData.kisi_kisi_id && (
                    <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                  )}
                </TouchableOpacity>
              )}

              {/* 1. Kisi-kisi Picker */}
              {pickerModal.type === 'kisi_kisi' &&
                teacherOptions.kisi_kisi
                  .filter((k) => (k.judul_kisi || '').toLowerCase().includes(pickerSearch.toLowerCase()))
                  .map((k) => {
                    const isSelected = String(formData.kisi_kisi_id) === String(k.id);
                    const quota = checkKisiQuota(k.id);
                    const isKisiFull = quota.isFull && (!editingItem || String(editingItem.kisi_kisi_id) !== String(k.id));
                    return (
                      <TouchableOpacity
                        key={k.id}
                        style={[
                          styles.pickerListItem,
                          isSelected && styles.pickerListItemActive,
                          isKisiFull && { opacity: 0.75, backgroundColor: '#F8FAFC' },
                        ]}
                        onPress={() => {
                          if (isKisiFull) {
                            setFeedback({
                              visible: true,
                              type: 'warning',
                              title: 'Soal Sudah Lengkap',
                              message: `Paket kisi-kisi "${k.judul_kisi}" telah memenuhi kuota pembuatan soal (${quota.current}/${quota.target} soal).\n\nSoal sudah lengkap, Anda hanya bisa edit dan hapus butir soal yang sudah ada.`,
                            });
                            return;
                          }
                          setFormData((prev) => ({
                            ...prev,
                            kisi_kisi_id: String(k.id),
                            mata_pelajaran_id: k.mata_pelajaran_id ? String(k.mata_pelajaran_id) : prev.mata_pelajaran_id,
                          }));
                          setPickerModal({ isOpen: false, type: null, title: '' });
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <Text style={[styles.pickerItemTitle, isSelected && styles.pickerItemTitleActive]}>
                              {k.judul_kisi}
                            </Text>
                            {quota.target > 0 && (
                              <View
                                style={{
                                  paddingHorizontal: 6,
                                  paddingVertical: 1.5,
                                  borderRadius: 6,
                                  backgroundColor: quota.isFull ? '#DCFCE7' : '#EFF6FF',
                                }}
                              >
                                <Text
                                  style={{
                                    fontSize: 9.5,
                                    fontWeight: '800',
                                    color: quota.isFull ? '#047857' : '#1D4ED8',
                                  }}
                                >
                                  {quota.isFull ? `Lengkap (${quota.current}/${quota.target})` : `${quota.current}/${quota.target} Soal`}
                                </Text>
                              </View>
                            )}
                          </View>
                          <Text style={styles.pickerItemSub}>
                            {k.jenis_ujian || 'Ujian'} {k.kelas_name ? `• ${k.kelas_name}` : ''}
                          </Text>
                        </View>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}

              {/* 2. Subjects Picker */}
              {pickerModal.type === 'subject' &&
                teacherOptions.subjects
                  .filter((s) => (s.nama_mapel || s.name || '').toLowerCase().includes(pickerSearch.toLowerCase()))
                  .map((s) => {
                    const isSelected = String(formData.mata_pelajaran_id) === String(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.pickerListItem, isSelected && styles.pickerListItemActive]}
                        onPress={() => {
                          setFormData((prev) => ({ ...prev, mata_pelajaran_id: String(s.id) }));
                          setPickerModal({ isOpen: false, type: null, title: '' });
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerItemTitle, isSelected && styles.pickerItemTitleActive]}>
                            {s.nama_mapel || s.name}
                          </Text>
                          {Boolean(s.code || s.kode_mapel) && (
                            <Text style={styles.pickerItemSub}>Kode: {s.code || s.kode_mapel}</Text>
                          )}
                        </View>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          2b. MODAL FILTER DROPDOWN (MATA PELAJARAN & ROMBEL/KELAS)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={filterDropdownModal.isOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          setFilterDropdownModal({ isOpen: false, type: null, title: '' });
          setFilterPickerSearch('');
        }}
      >
        <View style={styles.bottomSheetBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.bottomSheetDismissArea}
            onPress={() => {
              setFilterDropdownModal({ isOpen: false, type: null, title: '' });
              setFilterPickerSearch('');
            }}
          />
          <View style={[styles.bottomSheetContainer, { maxHeight: '80%' }]}>
            <View style={styles.bottomSheetDragHandle} />

            <View style={styles.bottomSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bottomSheetTitle}>{filterDropdownModal.title}</Text>
                <Text style={styles.bottomSheetSubtitle}>
                  {filterDropdownModal.type === 'subject'
                    ? 'Pilih mata pelajaran untuk memfilter bank soal'
                    : 'Pilih rombel / kelas untuk memfilter bank soal'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setFilterDropdownModal({ isOpen: false, type: null, title: '' });
                  setFilterPickerSearch('');
                }}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Search within filter */}
            <View style={styles.pickerSearchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder={filterDropdownModal.type === 'subject' ? 'Cari mata pelajaran...' : 'Cari rombel / kelas...'}
                placeholderTextColor="#94A3B8"
                value={filterPickerSearch}
                onChangeText={setFilterPickerSearch}
              />
              {Boolean(filterPickerSearch) && (
                <TouchableOpacity onPress={() => setFilterPickerSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView style={styles.bottomSheetBody} contentContainerStyle={{ paddingBottom: 28 }} keyboardShouldPersistTaps="handled">
              {/* Option: Semua */}
              <TouchableOpacity
                style={[
                  styles.pickerListItem,
                  (filterDropdownModal.type === 'subject' ? selectedSubjectId === 'Semua' : selectedClassId === 'Semua') &&
                    styles.pickerListItemActive,
                ]}
                onPress={() => {
                  if (filterDropdownModal.type === 'subject') {
                    handleSelectSubject('Semua');
                  } else {
                    handleSelectClass('Semua');
                  }
                  setFilterDropdownModal({ isOpen: false, type: null, title: '' });
                  setFilterPickerSearch('');
                }}
              >
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.pickerItemTitle,
                      (filterDropdownModal.type === 'subject' ? selectedSubjectId === 'Semua' : selectedClassId === 'Semua') &&
                        styles.pickerItemTitleActive,
                    ]}
                  >
                    {filterDropdownModal.type === 'subject' ? 'Semua Mata Pelajaran' : 'Semua Rombel / Kelas'}
                  </Text>
                  <Text style={styles.pickerItemSub}>Tampilkan seluruh butir soal tanpa batasan</Text>
                </View>
                {(filterDropdownModal.type === 'subject' ? selectedSubjectId === 'Semua' : selectedClassId === 'Semua') && (
                  <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                )}
              </TouchableOpacity>

              {/* Subject Options */}
              {filterDropdownModal.type === 'subject' &&
                teacherOptions.subjects
                  .filter((s) => (s.nama_mapel || s.name || '').toLowerCase().includes(filterPickerSearch.toLowerCase()))
                  .map((s) => {
                    const isSelected = String(selectedSubjectId) === String(s.id);
                    return (
                      <TouchableOpacity
                        key={s.id}
                        style={[styles.pickerListItem, isSelected && styles.pickerListItemActive]}
                        onPress={() => {
                          handleSelectSubject(String(s.id));
                          setFilterDropdownModal({ isOpen: false, type: null, title: '' });
                          setFilterPickerSearch('');
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerItemTitle, isSelected && styles.pickerItemTitleActive]}>
                            {s.nama_mapel || s.name}
                          </Text>
                          {Boolean(s.code || s.kode_mapel) && (
                            <Text style={styles.pickerItemSub}>Kode: {s.code || s.kode_mapel}</Text>
                          )}
                        </View>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}

              {/* Class/Rombel Options */}
              {filterDropdownModal.type === 'kelas' &&
                teacherOptions.kelas
                  .filter((c) => (c.nama_kelas || c.name || '').toLowerCase().includes(filterPickerSearch.toLowerCase()))
                  .map((c) => {
                    const isSelected = String(selectedClassId) === String(c.id);
                    return (
                      <TouchableOpacity
                        key={c.id}
                        style={[styles.pickerListItem, isSelected && styles.pickerListItemActive]}
                        onPress={() => {
                          handleSelectClass(String(c.id));
                          setFilterDropdownModal({ isOpen: false, type: null, title: '' });
                          setFilterPickerSearch('');
                        }}
                      >
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerItemTitle, isSelected && styles.pickerItemTitleActive]}>
                            {c.nama_kelas || c.name}
                          </Text>
                          {Boolean(c.tingkat || c.level) && (
                            <Text style={styles.pickerItemSub}>Tingkat: {c.tingkat || c.level}</Text>
                          )}
                        </View>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          3. MODAL DETAIL BUTIR SOAL
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(detailModalItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setDetailModalItem(null)}
      >
        <View style={styles.bottomSheetBackdrop}>
          <TouchableOpacity
            activeOpacity={1}
            style={styles.bottomSheetDismissArea}
            onPress={() => setDetailModalItem(null)}
          />
          <View style={[styles.bottomSheetContainer, { maxHeight: '85%' }]}>
            <View style={styles.bottomSheetDragHandle} />

            <View style={styles.bottomSheetHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.bottomSheetTitle}>Detail Butir Soal</Text>
                <Text style={styles.bottomSheetSubtitle}>
                  {detailModalItem?.kode_soal || 'SOAL-SYS'} • {detailModalItem?.poin ?? 2.5} Poin
                </Text>
              </View>
              <TouchableOpacity onPress={() => setDetailModalItem(null)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.bottomSheetBody} contentContainerStyle={{ paddingBottom: 32 }}>
              {detailModalItem && (
                <View>
                  <View style={{ flexDirection: 'row', gap: 6, marginBottom: 12 }}>
                    {getTipeBadge(detailModalItem.tipe_soal)}
                    {getDifficultyBadge(detailModalItem.tingkat_kesulitan)}
                  </View>

                  <Text style={styles.detailQuestionText}>{detailModalItem.pertanyaan}</Text>

                  {/* Multiple Choice Preview */}
                  {detailModalItem.tipe_soal === 'pg' && (
                    <View style={{ marginVertical: 12 }}>
                      <Text style={styles.detailSectionLabel}>Pilihan Jawaban:</Text>
                      {[
                        { key: 'A', text: detailModalItem.opsi_a },
                        { key: 'B', text: detailModalItem.opsi_b },
                        { key: 'C', text: detailModalItem.opsi_c },
                        { key: 'D', text: detailModalItem.opsi_d },
                        { key: 'E', text: detailModalItem.opsi_e },
                      ]
                        .filter((o) => Boolean(o.text))
                        .map((opt) => {
                          const isKey = (detailModalItem.kunci_jawaban || '').toUpperCase() === opt.key;
                          return (
                            <View
                              key={opt.key}
                              style={[
                                styles.detailOptionRow,
                                isKey && styles.detailOptionRowCorrect,
                              ]}
                            >
                              <Text style={[styles.detailOptionKey, isKey && { color: '#059669', fontWeight: '800' }]}>
                                {opt.key}.
                              </Text>
                              <Text style={[styles.detailOptionText, isKey && { color: '#065F46', fontWeight: '700' }]}>
                                {opt.text}
                              </Text>
                              {isKey && (
                                <MaterialCommunityIcons name="check-circle" size={16} color="#059669" style={{ marginLeft: 6 }} />
                              )}
                            </View>
                          );
                        })}
                    </View>
                  )}

                  <View style={styles.detailBox}>
                    <Text style={styles.detailSectionLabel}>Kunci Jawaban Resmi:</Text>
                    <Text style={styles.detailAnswerKeyText}>
                      {detailModalItem.kunci_jawaban || 'Belum ditentukan'}
                    </Text>
                  </View>

                  {Boolean(detailModalItem.pembahasan) && (
                    <View style={styles.detailBox}>
                      <Text style={styles.detailSectionLabel}>Pembahasan & Analisis:</Text>
                      <Text style={styles.detailParagraphText}>{detailModalItem.pembahasan}</Text>
                    </View>
                  )}

                  {Boolean(detailModalItem.indikator) && (
                    <View style={styles.detailBox}>
                      <Text style={styles.detailSectionLabel}>Indikator Capaian:</Text>
                      <Text style={styles.detailParagraphText}>{detailModalItem.indikator}</Text>
                    </View>
                  )}
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          4. MODAL KONFIRMASI HAPUS
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(deleteModalItem)}
        transparent
        animationType="fade"
        onRequestClose={() => !isDeleting && setDeleteModalItem(null)}
      >
        <View style={styles.deleteModalBackdrop}>
          <View style={styles.deleteModalBox}>
            <View style={styles.deleteModalTopLine} />
            <View style={styles.deleteModalContent}>
              <View style={styles.deleteModalIconCircle}>
                <MaterialCommunityIcons name="trash-can-outline" size={26} color="#E11D48" />
              </View>

              <Text style={styles.deleteModalTitle}>Konfirmasi Hapus Soal</Text>
              <Text style={styles.deleteModalDesc}>
                Apakah Anda yakin ingin menghapus butir soal{' '}
                <Text style={{ fontWeight: '800', color: '#1E293B' }}>
                  {deleteModalItem?.kode_soal || 'ini'}
                </Text>
                ? Butir soal ini akan diarsipkan (soft-delete).
              </Text>

              {Boolean(deleteModalItem?.pertanyaan) && (
                <View style={styles.deleteModalPreview}>
                  <Text numberOfLines={2} style={styles.deleteModalPreviewText}>
                    "{deleteModalItem?.pertanyaan}"
                  </Text>
                </View>
              )}

              <View style={styles.deleteModalActionsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.deleteModalCancelBtn}
                  onPress={() => setDeleteModalItem(null)}
                  disabled={isDeleting}
                >
                  <Text style={styles.deleteModalCancelText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.deleteModalConfirmBtn}
                  onPress={handleConfirmDelete}
                  disabled={isDeleting}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={styles.deleteModalConfirmText}>Ya, Hapus</Text>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          5. APP FEEDBACK MODAL (SUCCESS / ERROR)
         ══════════════════════════════════════════════════════════════ */}
      <AppFeedbackModal
        visible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onClose={() => setFeedback((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F4FAF7',
  },
  sheetContainer: {
    flex: 1,
    position: 'relative',
  },
  screen: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
  },
  topFoliageWrapper: {
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
    zIndex: 1,
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
    position: 'absolute',
    opacity: 0.22,
  },
  cleanTopHeader: {
    position: 'relative',
    zIndex: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cleanHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0E5C44',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.10,
    shadowRadius: 5,
    elevation: 3,
    borderWidth: 1.2,
    borderColor: 'rgba(14, 92, 68, 0.12)',
  },
  cleanHeaderTitleCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cleanHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
    textAlign: 'center',
  },
  cleanHeaderSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#0A6847',
    marginTop: 1,
    textAlign: 'center',
    opacity: 0.9,
  },
  cleanBellDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // ── 2x2 Equal Grid KPI Stats Cards ──
  kpiGridContainer: {
    gap: 10,
    marginTop: 6,
    marginBottom: 8,
  },
  kpiGridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  kpiGridCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    paddingVertical: 12,
    paddingHorizontal: 12,
    gap: 10,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 5,
    elevation: 2,
  },
  kpiIconBox: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiTextCol: {
    flex: 1,
    minWidth: 0,
  },
  kpiValueLarge: {
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: -0.3,
  },
  kpiLabelModern: {
    fontSize: 11,
    fontWeight: '700',
    marginTop: 1,
  },
  kpiCardEmerald: {
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
  },
  kpiCardSky: {
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
    shadowOpacity: 0.12,
  },
  kpiCardAmber: {
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOpacity: 0.12,
  },
  kpiCardPurple: {
    borderColor: '#DDD6FE',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.12,
  },

  activeKisiBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    marginTop: 10,
    marginBottom: 4,
  },
  activeKisiBannerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  activeKisiBannerTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0E5C44',
  },
  activeKisiBannerSub: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
    marginTop: 1,
  },
  activeKisiBannerClearBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#D1FAE5',
  },

  // ── Dropdown Filters (Mapel & Rombel Kelas) ──
  dropdownFiltersRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  dropdownFilterTrigger: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  dropdownFilterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    minWidth: 0,
    marginRight: 4,
  },
  dropdownFilterIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 7,
  },
  dropdownFilterLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dropdownFilterValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },

  // ── Search & Add Row (Button Tambah di Samping Field Search) ──
  searchAndAddRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  searchContainerFlex: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    height: 42,
  },
  searchInputFlex: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  addBtnBesideSearch: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 3,
  },
  addBtnGradBesideSearch: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    height: 42,
  },
  addBtnTextBesideSearch: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Section Header Box: Label & Tombol Grup / Semua di Bawahnya ──
  packageHeaderBox: {
    marginTop: 12,
    marginBottom: 10,
  },
  packageLabelRow: {
    marginBottom: 8,
  },
  layoutSegmentedUnderLabel: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    gap: 4,
  },
  layoutSegmentBtnUnder: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  layoutSegmentBtnUnderActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  layoutSegmentTextUnder: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  layoutSegmentTextUnderActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  filterSectionWrapper: {
    marginTop: 12,
  },
  filterSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  filterRowPills: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterPill: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterPillActive: {
    backgroundColor: '#0E5C44',
    borderColor: '#0E5C44',
  },
  filterPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  filterPillTextActive: {
    color: '#FFFFFF',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    marginTop: 14,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  actionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 16,
    marginBottom: 10,
  },
  actionHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  actionHeaderSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  createButtonPrimary: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  createButtonGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  createButtonText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    fontWeight: '600',
    color: '#0E5C44',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    paddingHorizontal: 20,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  emptyDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  emptyActionBtn: {
    marginTop: 14,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  emptyActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  teacherQuestionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0E5C44',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  cardTopLeftGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    flex: 1,
  },
  kodeSoalPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
  },
  kodeSoalText: {
    fontSize: 10.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '800',
    color: '#0F172A',
  },
  badgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  badgePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  pointPill: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
  },
  pointPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  teacherQuestionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
    lineHeight: 20,
    marginBottom: 8,
  },
  cardInfoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexWrap: 'wrap',
    marginBottom: 8,
  },
  cardInfoTag: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  cardInfoTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
    maxWidth: 150,
  },
  optionsPreviewList: {
    gap: 5,
    marginBottom: 8,
  },
  optionPreviewItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  optionPreviewItemCorrect: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  optionKeyCircleMini: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  optionKeyCircleMiniCorrect: {
    backgroundColor: '#059669',
  },
  optionKeyTextMini: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
  },
  optionKeyTextMiniCorrect: {
    color: '#FFFFFF',
  },
  optionPreviewContentText: {
    flex: 1,
    fontSize: 11.5,
    color: '#475569',
  },
  optionPreviewContentTextCorrect: {
    color: '#065F46',
    fontWeight: '700',
  },
  explanationToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 2,
  },
  explanationToggleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D6B42',
  },
  explanationBodyBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  solutionHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 4,
  },
  solutionKeyLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginRight: 6,
  },
  solutionKeyBadge: {
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  solutionKeyBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },
  explanationParagraphText: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
    marginTop: 4,
  },
  indicatorParagraphText: {
    fontSize: 10.5,
    color: '#0D9488',
    fontWeight: '600',
    marginTop: 4,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardActionButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    gap: 3,
  },
  cardActionButtonText: {
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Bottom Sheet Modal
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheetDismissArea: {
    flex: 1,
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 18,
    paddingTop: 10,
  },
  bottomSheetDragHandle: {
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 10,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  bottomSheetTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  bottomSheetSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  bottomSheetBody: {
    paddingTop: 14,
  },
  formGroupSpaced: {
    marginBottom: 14,
  },
  formLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  formTextInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  multilineInput: {
    minHeight: 74,
    textAlignVertical: 'top',
  },
  formRowTwoCols: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  dropdownValueText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    marginLeft: 8,
    flex: 1,
  },
  dropdownPlaceholder: {
    fontSize: 12.5,
    fontWeight: '500',
    color: '#94A3B8',
    marginLeft: 8,
    flex: 1,
  },
  tipeSoalPillGroup: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  tipeSoalPillOption: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tipeSoalPillOptionActive: {
    backgroundColor: '#0E5C44',
    borderColor: '#0E5C44',
  },
  tipeSoalPillOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  tipeSoalPillOptionTextActive: {
    color: '#FFFFFF',
  },
  difficultyPillGroup: {
    flexDirection: 'row',
    gap: 8,
  },
  difficultyPillItem: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  difficultyPillItemText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  pgOptionsBlock: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  formSubHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 10,
  },
  optionInputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  optionKeyRadio: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  optionKeyRadioActive: {
    backgroundColor: '#059669',
  },
  optionKeyRadioText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
  optionKeyRadioTextActive: {
    color: '#FFFFFF',
  },
  optionHelpText: {
    fontSize: 10.5,
    color: '#059669',
    fontStyle: 'italic',
    marginTop: 4,
  },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 16,
  },
  switchTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  switchSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  formSubmitRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  submitBtn: {
    flex: 2,
    borderRadius: 12,
    overflow: 'hidden',
  },
  submitBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Colored Modal Header
  coloredModalHeader: {
    paddingTop: 10,
    paddingBottom: 14,
    paddingHorizontal: 16,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  bottomSheetDragHandleLight: {
    width: 40,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.45)',
    alignSelf: 'center',
    marginBottom: 10,
  },
  coloredModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  coloredModalHeaderIconSquircle: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  coloredModalHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  coloredModalHeaderSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 2,
  },
  coloredModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // Form Action Group (Lega & Bebas Himpitan)
  formActionGroupContainer: {
    marginTop: 10,
    gap: 10,
  },
  submitBtnFullWidth: {
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnGradSpacious: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    paddingHorizontal: 16,
  },
  submitBtnTextSpacious: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  formSubmitRowSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  saveOnlyBtn: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#ECFDF5',
  },
  saveOnlyBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#047857',
  },

  // Picker Modal
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    height: 38,
    marginTop: 8,
    marginBottom: 4,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
  },
  pickerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerListItemActive: {
    backgroundColor: '#ECFDF5',
  },
  pickerItemTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  pickerItemTitleActive: {
    color: '#047857',
  },
  pickerItemSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  pickerClearOptionText: {
    fontSize: 12,
    fontStyle: 'italic',
    color: '#94A3B8',
  },

  // Detail Modal
  detailQuestionText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#0F172A',
    lineHeight: 21,
    marginBottom: 8,
  },
  detailSectionLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  detailOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    marginBottom: 4,
  },
  detailOptionRowCorrect: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
  },
  detailOptionKey: {
    fontSize: 12,
    fontWeight: '800',
    color: '#64748B',
    marginRight: 6,
  },
  detailOptionText: {
    fontSize: 12,
    color: '#334155',
    flex: 1,
  },
  detailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  detailAnswerKeyText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  detailParagraphText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },

  // Delete Modal
  deleteModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  deleteModalBox: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
    shadowColor: '#991B1B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  deleteModalTopLine: {
    height: 4,
    backgroundColor: '#E11D48',
  },
  deleteModalContent: {
    padding: 20,
    alignItems: 'center',
  },
  deleteModalIconCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  deleteModalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  deleteModalDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 12,
  },
  deleteModalPreview: {
    width: '100%',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
  },
  deleteModalPreviewText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#475569',
  },
  deleteModalActionsRow: {
    flexDirection: 'row',
    gap: 10,
    width: '100%',
  },
  deleteModalCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  deleteModalConfirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E11D48',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalConfirmText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // Layout Segmented Control
  layoutSegmentedControl: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 10,
    padding: 2,
    marginRight: 8,
  },
  layoutSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  layoutSegmentBtnActive: {
    backgroundColor: '#059669',
  },
  layoutSegmentText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginLeft: 3,
  },
  layoutSegmentTextActive: {
    color: '#FFFFFF',
  },
  // Group Accordion Styles
  groupBulkActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
  },
  groupCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
    overflow: 'hidden',
    shadowColor: '#0E5C44',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  groupHeaderRow: {
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
  },
  groupTopInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  groupIconSquircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  groupTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  groupMapelSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },
  groupStatusPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  groupStatusPillComplete: {
    backgroundColor: '#D1FAE5',
    borderColor: '#A7F3D0',
  },
  groupStatusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#B45309',
  },
  groupStatusPillTextComplete: {
    color: '#047857',
  },
  groupBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 6,
  },
  groupProgressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 2,
  },
  groupProgressBar: {
    flex: 1,
    height: 6,
    backgroundColor: '#E2E8F0',
    borderRadius: 3,
    overflow: 'hidden',
    marginRight: 8,
  },
  groupProgressFill: {
    height: '100%',
    borderRadius: 3,
    backgroundColor: '#F59E0B',
  },
  groupProgressText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
  },
  groupActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
  },
  groupAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  groupAddBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '700',
    marginLeft: 3,
  },
  groupChevronBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  groupChevronText: {
    color: '#065F46',
    fontSize: 11,
    fontWeight: '700',
    marginRight: 2,
  },
  groupEmptyCard: {
    padding: 16,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    marginVertical: 4,
  },
  groupEmptyText: {
    fontSize: 12,
    color: '#64748B',
    marginBottom: 8,
    textAlign: 'center',
  },
  groupEmptyBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  groupEmptyBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  groupBottomAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    backgroundColor: '#F0FDF4',
    borderTopWidth: 1,
    borderTopColor: '#DCFCE7',
    borderRadius: 10,
    marginTop: 8,
  },
  groupBottomAddText: {
    color: '#059669',
    fontSize: 12,
    fontWeight: '700',
    marginLeft: 5,
  },
  groupAddBtnCompleted: {
    backgroundColor: '#047857',
  },
  quotaCompleteNoticeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  quotaCompleteNoticeTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  quotaCompleteNoticeText: {
    fontSize: 11,
    color: '#047857',
    marginTop: 1,
    lineHeight: 15,
  },
});
