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
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData, unwrapCollection } from '../../services/mobileApiService';
import { getApiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useMobileConfigStore } from '../../stores/mobileConfigStore';
import { isTuRole, isTeacherRole, isPrincipalRole, isSuperAdminRole } from '../../utils/roles';
import { getDynamicAcademicYear, getDynamicAcademicSemester } from '../../utils/academicYear';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import EmptyStateCard from '../EmptyStateCard';
import InAppEmbedModal from '../InAppEmbedModal';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

const getSubjectStyle = (name?: string) => {
  const norm = (name || '').toLowerCase();
  if (norm.includes('matematik') || norm.includes('math') || norm.includes('hitung')) {
    return {
      bg: '#E0F2FE',
      color: '#2563EB',
      icon: 'file-document-edit-outline',
    };
  }
  if (norm.includes('indonesia') || norm.includes('bahasa') || norm.includes('inggris') || norm.includes('arab') || norm.includes('literasi')) {
    return {
      bg: '#DCFCE7',
      color: '#16A34A',
      icon: 'book-open-page-variant-outline',
    };
  }
  if (norm.includes('pai') || norm.includes('agama') || norm.includes('islam') || norm.includes('fiqih') || norm.includes('aqidah') || norm.includes('quran') || norm.includes('hadits') || norm.includes('tahfizh')) {
    return {
      bg: '#F3E8FF',
      color: '#9333EA',
      icon: 'book-open-variant',
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bg: '#FEF3C7',
      color: '#EA580C',
      icon: 'weather-sunny',
    };
  }
  if (norm.includes('ips') || norm.includes('sosial') || norm.includes('sejarah') || norm.includes('geografi') || norm.includes('ekonomi')) {
    return {
      bg: '#E0E7FF',
      color: '#4F46E5',
      icon: 'earth',
    };
  }
  if (norm.includes('seni') || norm.includes('sbk') || norm.includes('budaya') || norm.includes('musik')) {
    return {
      bg: '#FFE4E6',
      color: '#E11D48',
      icon: 'palette-outline',
    };
  }
  if (norm.includes('penjas') || norm.includes('olahraga') || norm.includes('pjok')) {
    return {
      bg: '#CCFBF1',
      color: '#0D9488',
      icon: 'soccer',
    };
  }
  return {
    bg: '#E6F4EA',
    color: '#059669',
    icon: 'book-open-variant',
  };
};

interface TeacherAssignmentWorkspaceProps {
  onBack?: () => void;
  initialTab?: 'assignments' | 'submissions';
}

export default function TeacherAssignmentWorkspace({
  onBack,
  initialTab = 'assignments',
}: TeacherAssignmentWorkspaceProps) {
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const config = useMobileConfigStore((state) => state.config);

  // ── Role & Scoping Tata Usaha (TU) vs Guru Pengampu ──
  const isTu = isTuRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);
  const isPrincipal = isPrincipalRole(user?.roles || []);
  const isStaff = isTu || isPrincipal || isSuperAdminRole(user?.roles || []);

  const currentUserUnitId = useMemo(() => {
    return (
      (user as any)?.education_unit_id ||
      (user as any)?.unit_id ||
      (user as any)?.unit?.id ||
      (user as any)?.employee?.unit_id ||
      (user?.metadata as any)?.unit_id ||
      (user?.metadata as any)?.education_unit_id ||
      null
    );
  }, [user]);

  const currentUserUnitName = useMemo(() => {
    return (
      (user as any)?.education_unit?.nama_unit ||
      (user as any)?.education_unit?.name ||
      (user as any)?.unit?.name ||
      (typeof (user as any)?.unit === 'string' ? (user as any)?.unit : '') ||
      (user?.metadata as any)?.unit_name ||
      (user as any)?.employee?.unit?.name ||
      'Unit Pendidikan'
    );
  }, [user]);

  // ── Master Education Units untuk Kop Surat Dinamis & Resolusi Metadata Unit ──
  const [masterEducationUnits, setMasterEducationUnits] = useState<any[]>([]);

  useEffect(() => {
    let isMounted = true;
    mobileApiService.getEducationUnits({ per_page: 50 })
      .then((res: any) => {
        if (!isMounted) return;
        const list = Array.isArray(res?.data) ? res.data : (Array.isArray(res) ? res : (res?.data?.data || []));
        if (list.length > 0) {
          setMasterEducationUnits(list);
        }
      })
      .catch(() => {});
    return () => {
      isMounted = false;
    };
  }, []);

  // ── State Options & 5 KPI Stats LMS Penugasan (Selaras Web Dashboard) ──
  const [tuOptions, setTuOptions] = useState<{
    guru: any[];
    kelas: any[];
    subjects: any[];
    modul_ajar: any[];
    semesters: any[];
    tahun_ajaran: any[];
  }>({
    guru: [],
    kelas: [],
    subjects: [],
    modul_ajar: [],
    semesters: [],
    tahun_ajaran: [],
  });

  const foundationName = useMemo(() => {
    return (
      (config as any)?.foundation_name ||
      config?.branding?.school_name ||
      (config as any)?.app_name ||
      config?.branding?.app_name ||
      'Yayasan Pendidikan'
    );
  }, [config]);

  const activeYearObj = useMemo(() => {
    return (
      tuOptions.tahun_ajaran.find((t: any) => t.is_active || t.active) ||
      tuOptions.tahun_ajaran[0] ||
      null
    );
  }, [tuOptions.tahun_ajaran]);

  const activeSemesterObj = useMemo(() => {
    return (
      tuOptions.semesters.find((s: any) => s.is_active || s.active) ||
      tuOptions.semesters[0] ||
      null
    );
  }, [tuOptions.semesters]);

  const academicYear = useMemo(() => {
    return getDynamicAcademicYear(activeYearObj || user);
  }, [activeYearObj, user]);

  const academicSemester = useMemo(() => {
    const semName = activeSemesterObj?.label || activeSemesterObj?.name;
    if (semName) return String(semName);
    const dynSem = getDynamicAcademicSemester(user);
    return dynSem === 'Ganjil' ? '1 - Ganjil' : '2 - Genap';
  }, [activeSemesterObj, user]);

  const teacherName =
    (user as any)?.name ||
    (user as any)?.nama_lengkap ||
    ((user as any)?.employee?.nama_lengkap || (user as any)?.employee?.name) ||
    'Petugas Tata Usaha';

  const teacherNip =
    (user as any)?.nip ||
    (user as any)?.niy ||
    (user as any)?.employee?.nip ||
    (user as any)?.employee?.niy ||
    '—';

  const resolvedKopUnit = useMemo(() => {
    const unitTarget = currentUserUnitName || '';
    const uTargetLower = unitTarget.toLowerCase();

    // 1. Prioritas Utama: Cari di masterEducationUnits dari database
    const matchedUnit = masterEducationUnits.find((u: any) => {
      if (currentUserUnitId && String(u.id) === String(currentUserUnitId)) {
        return true;
      }
      const uName = String(u.name || u.nama_unit || '').toLowerCase();
      const uCode = String(u.code || u.kode_unit || '').toLowerCase();
      const uLevel = String(u.level || u.jenjang || '').toLowerCase();
      return (
        (uTargetLower && (uName === uTargetLower || uName.includes(uTargetLower) || uTargetLower.includes(uName))) ||
        (uCode && uTargetLower.includes(uCode)) ||
        (uLevel && uTargetLower.startsWith(uLevel))
      );
    });

    if (matchedUnit) {
      const meta = matchedUnit.metadata || {};
      const addr =
        meta.address ||
        matchedUnit.alamat ||
        matchedUnit.address ||
        matchedUnit.description ||
        config?.branding?.address ||
        'Pusat Pendidikan Terpadu';

      const contactItems: string[] = [];
      const phone =
        meta.phone ||
        matchedUnit.telepon ||
        matchedUnit.phone ||
        config?.branding?.contact?.phone ||
        (config as any)?.contact?.phone;
      const email =
        meta.email ||
        matchedUnit.email ||
        config?.branding?.contact?.email ||
        (config as any)?.contact?.email;
      const npsn = meta.npsn || matchedUnit.npsn;
      const akreditasi = meta.accreditation || matchedUnit.akreditasi;
      const website =
        meta.website ||
        matchedUnit.website ||
        config?.branding?.contact?.website ||
        (config as any)?.contact?.website;

      if (phone) contactItems.push(`Telp: ${phone}`);
      if (email) contactItems.push(`Email: ${email}`);
      if (npsn) contactItems.push(`NPSN: ${npsn}`);
      if (akreditasi) contactItems.push(`Akreditasi ${akreditasi}`);

      return {
        unitName: (matchedUnit.name || matchedUnit.nama_unit || unitTarget).toUpperCase(),
        address: addr,
        contact: contactItems.length > 0 ? contactItems.join(' • ') : (website ? `Website: ${website}` : 'Layanan Terpadu'),
        logoUrl: matchedUnit.logo_url || config?.branding?.logo_url || null,
      };
    }

    // 2. Fallback Dinamis dari metadata profil pengguna / konfigurasi branding
    const userUnitMeta =
      (user as any)?.unit?.metadata ||
      (user as any)?.employee?.unit?.metadata ||
      (user?.metadata as any)?.unit ||
      {};
    const fallbackAddr =
      userUnitMeta.address ||
      (user as any)?.unit?.address ||
      (user as any)?.education_unit?.address ||
      config?.branding?.address ||
      'Kompleks Pendidikan Islam Terpadu';

    const fallbackParts: string[] = [];
    const fbPhone =
      userUnitMeta.phone ||
      (user as any)?.unit?.phone ||
      config?.branding?.contact?.phone ||
      (config as any)?.contact?.phone;
    const fbEmail =
      userUnitMeta.email ||
      (user as any)?.unit?.email ||
      config?.branding?.contact?.email ||
      (config as any)?.contact?.email;
    const fbNpsn = userUnitMeta.npsn || (user as any)?.unit?.npsn;
    const fbWeb = userUnitMeta.website || config?.branding?.contact?.website;

    if (fbPhone) fallbackParts.push(`Telp: ${fbPhone}`);
    if (fbEmail) fallbackParts.push(`Email: ${fbEmail}`);
    if (fbNpsn) fallbackParts.push(`NPSN: ${fbNpsn}`);

    return {
      unitName: (unitTarget || config?.branding?.school_name || 'Unit Pendidikan').toUpperCase(),
      address: fallbackAddr,
      contact: fallbackParts.length > 0 ? fallbackParts.join(' • ') : (fbWeb ? `Website: ${fbWeb}` : 'Layanan Terpadu'),
      logoUrl: config?.branding?.logo_url || null,
    };
  }, [currentUserUnitName, currentUserUnitId, masterEducationUnits, user, config]);

  const formatDate = (dateStr?: string) => {
    if (!dateStr) return '—';
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      });
    } catch {
      return String(dateStr);
    }
  };

  const [tuStats, setTuStats] = useState<{
    total: number;
    published: number;
    draft: number;
    total_pengumpulan: number;
    total_dinilai: number;
  }>({
    total: 0,
    published: 0,
    draft: 0,
    total_pengumpulan: 0,
    total_dinilai: 0,
  });

  // ── Multi-Filter State (Status, Kelas, Mapel, Guru, Tipe) ──
  const [selectedStatusFilter, setSelectedStatusFilter] = useState<string>('all');
  const [selectedKelasFilter, setSelectedKelasFilter] = useState<string>('all');
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');
  const [selectedGuruFilter, setSelectedGuruFilter] = useState<string>('all');
  const [selectedTipeFilter, setSelectedTipeFilter] = useState<string>('all');

  // ── State Form Tambahan Khusus TU (Guru Pengampu, Kelas Unit, Mapel Unit) ──
  const [formGuruId, setFormGuruId] = useState<string>('');
  const [formClassId, setFormClassId] = useState<string>('');
  const [formSubjectId, setFormSubjectId] = useState<string>('');
  const [formNilaiMaksimal, setFormNilaiMaksimal] = useState<string>('100');
  const [formTipe, setFormTipe] = useState<'individu' | 'kelompok'>('individu');

  // ── Modal State Terpadu (Picker Form, Picker Filter, Cetak A4, Detail Tugas) ──
  const [showGuruPickerModal, setShowGuruPickerModal] = useState<boolean>(false);
  const [showClassPickerModal, setShowClassPickerModal] = useState<boolean>(false);
  const [showSubjectPickerModal, setShowSubjectPickerModal] = useState<boolean>(false);
  const [showFilterKelasModal, setShowFilterKelasModal] = useState<boolean>(false);
  const [showFilterSubjectModal, setShowFilterSubjectModal] = useState<boolean>(false);
  const [showFilterGuruModal, setShowFilterGuruModal] = useState<boolean>(false);
  const [printPaperModalVisible, setPrintPaperModalVisible] = useState<boolean>(false);
  const [detailAssignmentModal, setDetailAssignmentModal] = useState<any | null>(null);

  // Scroll & Sticky Header Animation
  const scrollY = useRef(new Animated.Value(0)).current;
  const handleMainScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY]
  );

  const [isStickyActive, setIsStickyActive] = useState<boolean>(false);

  useEffect(() => {
    const id = scrollY.addListener(({ value }) => {
      if (value > 65 && !isStickyActive) {
        setIsStickyActive(true);
      } else if (value <= 65 && isStickyActive) {
        setIsStickyActive(false);
      }
    });
    return () => {
      scrollY.removeListener(id);
    };
  }, [scrollY, isStickyActive]);

  const stickyOpacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [50, 95],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  const stickyTranslateY = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [50, 95],
      outputRange: [-15, 0],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  // Subtabs: 'assignments' (Daftar Tugas) | 'submissions' (Pemeriksaan Tugas Siswa)
  const [activeTab, setActiveTab] = useState<'assignments' | 'submissions'>(initialTab);

  // Loading & Refreshing States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);

  // Schedules (classes & subjects assigned to this teacher)
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('all');

  // Assignments & Submissions State
  const [assignments, setAssignments] = useState<any[]>([]);
  const [submissions, setSubmissions] = useState<any[]>([]);
  const [selectedAssignmentFilter, setSelectedAssignmentFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [createModalVisible, setCreateModalVisible] = useState<boolean>(false);
  const [editingAssignment, setEditingAssignment] = useState<any | null>(null);
  const [gradeModalVisible, setGradeModalVisible] = useState<boolean>(false);
  const [selectedSubmission, setSelectedSubmission] = useState<any | null>(null);

  // Form State: Buat / Ubah Tugas (Selaras 100% dengan Web Dashboard)
  const [formTitle, setFormTitle] = useState<string>('');
  const [formInstruction, setFormInstruction] = useState<string>('');
  const [formScheduleId, setFormScheduleId] = useState<string>('');
  const [formDeadline, setFormDeadline] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0]; // Format Tanggal Manual: YYYY-MM-DD
  });
  const [formBobot, setFormBobot] = useState<string>('100');
  const [formJenisTugas, setFormJenisTugas] = useState<string>('tertulis');
  const [formSurah, setFormSurah] = useState<string>('');
  const [formAyatAwal, setFormAyatAwal] = useState<string>('');
  const [formAyatAkhir, setFormAyatAkhir] = useState<string>('');
  const [formMinWords, setFormMinWords] = useState<string>('150');
  const [formMaxGroupMembers, setFormMaxGroupMembers] = useState<string>('4');
  const [formLinkLampiran, setFormLinkLampiran] = useState<string>('');

  // In-App Embed Modal State
  const [embedModalVisible, setEmbedModalVisible] = useState<boolean>(false);
  const [embedTargetUrl, setEmbedTargetUrl] = useState<string | null>(null);
  const [embedTargetTitle, setEmbedTargetTitle] = useState<string>('Pratinjau Berkas & Tautan');

  const handleOpenEmbedUrl = (url?: string | null, title?: string) => {
    if (!url) return;
    setEmbedTargetUrl(url);
    setEmbedTargetTitle(title || 'Pratinjau Berkas & Tautan');
    setEmbedModalVisible(true);
  };
  const [formTipeJawaban, setFormTipeJawaban] = useState<'both' | 'online' | 'upload'>('both');
  const [formMateriId, setFormMateriId] = useState<string>('');
  const [formDurasiMenit, setFormDurasiMenit] = useState<string>('30');
  const [formNilaiKkm, setFormNilaiKkm] = useState<string>('75');
  const [formIzinTerlambat, setFormIzinTerlambat] = useState<boolean>(true);
  const [formStatus, setFormStatus] = useState<'published' | 'draft'>('published');
  const [pickedAttachment, setPickedAttachment] = useState<{ uri: string; name: string; type: string; size?: number } | null>(null);
  const [existingFileUrl, setExistingFileUrl] = useState<string | null>(null);
  const [teacherMaterials, setTeacherMaterials] = useState<any[]>([]);
  const [showMateriPickerModal, setShowMateriPickerModal] = useState<boolean>(false);

  // State Bank Soal / Butir Soal (Selaras 100% dengan Web Dashboard)
  const [soalList, setSoalList] = useState<Array<{
    tipe: 'pg' | 'esai' | 'benar_salah' | 'menjodohkan';
    pertanyaan: string;
    opsi_a?: string;
    opsi_b?: string;
    opsi_c?: string;
    opsi_d?: string;
    opsi_e?: string;
    kunci_jawaban: string;
    poin: number;
    tingkat_kesulitan: 'mudah' | 'sedang' | 'sulit';
    indikator?: string;
    pembahasan?: string;
    matchingPairs?: Array<{ kiri: string; kanan: string }>;
  }>>([]);
  const [editingSoalIdx, setEditingSoalIdx] = useState<number | null>(null);
  const [soalForm, setSoalForm] = useState<{
    tipe: 'pg' | 'esai' | 'benar_salah' | 'menjodohkan';
    pertanyaan: string;
    opsi_a: string;
    opsi_b: string;
    opsi_c: string;
    opsi_d: string;
    opsi_e: string;
    kunci_jawaban: string;
    poin: number;
    tingkat_kesulitan: 'mudah' | 'sedang' | 'sulit';
    indikator: string;
    pembahasan: string;
    matchingPairs: Array<{ kiri: string; kanan: string }>;
  }>({
    tipe: 'pg',
    pertanyaan: '',
    opsi_a: '',
    opsi_b: '',
    opsi_c: '',
    opsi_d: '',
    opsi_e: '',
    kunci_jawaban: 'A',
    poin: 2,
    tingkat_kesulitan: 'sedang',
    indikator: '',
    pembahasan: '',
    matchingPairs: [{ kiri: '', kanan: '' }, { kiri: '', kanan: '' }],
  });

  // Dropdown States
  const [showFilterScheduleDropdown, setShowFilterScheduleDropdown] = useState<boolean>(false);
  const [showFormScheduleDropdown, setShowFormScheduleDropdown] = useState<boolean>(false);

  // Computed Dropdown Labels
  const currentFilterScheduleLabel = useMemo(() => {
    if (selectedScheduleId === 'all') return 'Semua Kelas & Mapel';
    const found = schedules.find((s) => String(s.id) === String(selectedScheduleId));
    if (!found) return 'Semua Kelas & Mapel';
    return `${found.kelas?.nama_kelas || found.kelas?.name || 'Kelas'} - ${found.subject?.name || found.subject?.nama_mapel || 'Mapel'}`;
  }, [selectedScheduleId, schedules]);

  const currentFormScheduleLabel = useMemo(() => {
    const found = schedules.find((s) => String(s.id) === String(formScheduleId));
    if (!found) return 'Pilih Rombel & Mata Pelajaran...';
    return `${found.kelas?.nama_kelas || found.kelas?.name || 'Kelas'} - ${found.subject?.name || found.subject?.nama_mapel || 'Mapel'}`;
  }, [formScheduleId, schedules]);

  // ── Computed Labels untuk Form dan Filter TU ──
  const currentFormClassLabel = useMemo(() => {
    if (!formClassId) return 'Pilih Kelas Sasaran...';
    const found = tuOptions.kelas.find((k) => String(k.value || k.id) === String(formClassId));
    return found ? (found.nama_kelas || found.label || found.name) : 'Kelas Sasaran';
  }, [formClassId, tuOptions.kelas]);

  const currentFormSubjectLabel = useMemo(() => {
    if (!formSubjectId) return 'Pilih Mata Pelajaran...';
    const found = tuOptions.subjects.find((s) => String(s.value || s.id) === String(formSubjectId));
    return found ? (found.nama_mapel || found.label || found.name) : 'Mata Pelajaran';
  }, [formSubjectId, tuOptions.subjects]);

  const currentFormGuruLabel = useMemo(() => {
    if (!formGuruId) return 'Pilih Guru Pengampu...';
    const found = tuOptions.guru.find((g) => String(g.value || g.id) === String(formGuruId));
    return found ? (found.nama_lengkap || found.nama || found.label || found.name) : 'Guru Pengampu';
  }, [formGuruId, tuOptions.guru]);

  const currentFilterKelasLabel = useMemo(() => {
    if (selectedKelasFilter === 'all') return 'Semua Kelas';
    const found = tuOptions.kelas.find((k) => String(k.value || k.id) === String(selectedKelasFilter));
    return found ? (found.nama_kelas || found.label || found.name) : 'Semua Kelas';
  }, [selectedKelasFilter, tuOptions.kelas]);

  const currentFilterSubjectLabel = useMemo(() => {
    if (selectedSubjectFilter === 'all') return 'Semua Mapel';
    const found = tuOptions.subjects.find((s) => String(s.value || s.id) === String(selectedSubjectFilter));
    return found ? (found.nama_mapel || found.label || found.name) : 'Semua Mapel';
  }, [selectedSubjectFilter, tuOptions.subjects]);

  const currentFilterGuruLabel = useMemo(() => {
    if (selectedGuruFilter === 'all') return 'Semua Guru';
    const found = tuOptions.guru.find((g) => String(g.value || g.id) === String(selectedGuruFilter));
    return found ? (found.nama_lengkap || found.nama || found.label || found.name) : 'Semua Guru';
  }, [selectedGuruFilter, tuOptions.guru]);

  // Materi Pembelajaran yang cocok dengan rombel & mapel terpilih
  const availableMaterialsForForm = useMemo(() => {
    if (isTu || isStaff) {
      if (!formSubjectId) return teacherMaterials;
      return teacherMaterials.filter((m) => {
        const mSubj = String(m.subject_id || m.mata_pelajaran_id || m.modul_ajar?.mata_pelajaran_id || '');
        return !mSubj || mSubj === String(formSubjectId);
      });
    }
    if (!formScheduleId) return teacherMaterials;
    const activeSched = schedules.find((s) => String(s.id) === String(formScheduleId));
    if (!activeSched) return teacherMaterials;
    const targetClassId = String(activeSched.kelas_id || activeSched.class_id || '');
    const targetSubjectId = String(activeSched.subject_id || '');
    return teacherMaterials.filter((m) => {
      const mClass = String(m.class_id || m.kelas_id || m.modul_ajar?.kelas_id || '');
      const mSubj = String(m.subject_id || m.mata_pelajaran_id || m.modul_ajar?.mata_pelajaran_id || '');
      const matchClass = !targetClassId || !mClass || mClass === targetClassId;
      const matchSubj = !targetSubjectId || !mSubj || mSubj === targetSubjectId;
      return matchClass && matchSubj;
    });
  }, [isTu, isStaff, formSubjectId, formScheduleId, schedules, teacherMaterials]);

  const selectedMateriLabel = useMemo(() => {
    if (!formMateriId) return 'Tugas Mandiri (Tanpa Tautan Modul Belajar)';
    const found = teacherMaterials.find((m) => String(m.id) === String(formMateriId));
    if (!found) return 'Materi Pembelajaran';
    return `${found.judul || found.title || 'Materi'} (${found.status === 'published' ? 'Published' : 'Draft'})`;
  }, [formMateriId, teacherMaterials]);

  // Form State: Input Nilai Submission
  const [gradeScore, setGradeScore] = useState<string>('');
  const [gradeNotes, setGradeNotes] = useState<string>('');

  // Feedback Notification
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    itemName?: string;
    category?: string;
    dateStr?: string;
    actionLabel?: string;
    cancelLabel?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  // Stable refs to prevent cascading re-renders and infinite effect loops
  const schedulesRef = useRef<any[]>([]);
  schedulesRef.current = schedules;

  const selectedScheduleIdRef = useRef<string>('all');
  selectedScheduleIdRef.current = selectedScheduleId;

  const selectedAssignmentFilterRef = useRef<string>('all');
  selectedAssignmentFilterRef.current = selectedAssignmentFilter;

  const isInitialMount = useRef<boolean>(true);

  // ── Fetch Data LMS Penugasan Terpadu (Untuk Tata Usaha / Staff) ──
  const loadLmsData = useCallback(async () => {
    try {
      const params: any = {
        unit_pendidikan_id: currentUserUnitId || undefined,
        per_page: 50,
      };
      if (selectedKelasFilter !== 'all') params.kelas_id = selectedKelasFilter;
      if (selectedSubjectFilter !== 'all') params.mata_pelajaran_id = selectedSubjectFilter;
      if (selectedGuruFilter !== 'all') params.guru_id = selectedGuruFilter;
      if (selectedStatusFilter !== 'all') params.status = selectedStatusFilter;
      if (selectedTipeFilter !== 'all') params.tipe = selectedTipeFilter;
      if (searchQuery.trim()) params.search = searchQuery.trim();

      const [resList, resStats, resOpts, resMaterials, resUnits] = await Promise.allSettled([
        mobileApiService.getLmsPenugasanList(params),
        mobileApiService.getLmsPenugasanStats({ unit_pendidikan_id: currentUserUnitId || undefined }),
        mobileApiService.getLmsPenugasanOptions({ unit_pendidikan_id: currentUserUnitId || undefined }),
        mobileApiService.getLmsMateriList({ unit_pendidikan_id: currentUserUnitId || undefined, per_page: 50 }),
        mobileApiService.getEducationUnits({ per_page: 50 }),
      ]);

      let list: any[] = [];
      if (resList.status === 'fulfilled') {
        const raw = resList.value;
        const rawList = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : (raw?.data?.data || []));
        // Kunci ketat sesuai unit pendidikan wewenang TU
        list = rawList.filter((item: any) => {
          if (!item) return false;
          if (currentUserUnitId) {
            const itemUnitId = item.unit_pendidikan_id || item.unit_id || item.kelas?.unit_pendidikan_id || item.modul_ajar?.unit_pendidikan_id || item.subject?.unit_pendidikan_id;
            if (itemUnitId) return String(itemUnitId) === String(currentUserUnitId);
          }
          return true;
        });
        setAssignments(list);
      }

      if (resStats.status === 'fulfilled') {
        const s = resStats.value?.data || resStats.value || {};
        const publishedCount = list.filter((a) => a.is_published || a.status === 'dipublikasikan').length;
        const draftCount = list.filter((a) => !a.is_published && a.status !== 'dipublikasikan').length;
        setTuStats({
          total: s.total !== undefined ? Number(s.total) : list.length,
          published: s.published !== undefined ? Number(s.published) : (s.dipublikasikan !== undefined ? Number(s.dipublikasikan) : publishedCount),
          draft: s.draft !== undefined ? Number(s.draft) : draftCount,
          total_pengumpulan: s.total_pengumpulan !== undefined ? Number(s.total_pengumpulan) : (s.pengumpulan !== undefined ? Number(s.pengumpulan) : 0),
          total_dinilai: s.total_dinilai !== undefined ? Number(s.total_dinilai) : (s.dinilai !== undefined ? Number(s.dinilai) : 0),
        });
      }

      if (resOpts.status === 'fulfilled') {
        const opts = resOpts.value?.data || resOpts.value || {};
        const guruOpts = (opts.guru || []).filter((g: any) => {
          if (!g) return false;
          const uId = g.unit_pendidikan_id || g.unit_id;
          return !currentUserUnitId || !uId || String(uId) === String(currentUserUnitId);
        });
        const kelasOpts = (opts.kelas || []).filter((k: any) => {
          if (!k) return false;
          const uId = k.unit_pendidikan_id || k.unit_id;
          return !currentUserUnitId || !uId || String(uId) === String(currentUserUnitId);
        });
        const subjOpts = (opts.subjects || []).filter((s: any) => {
          if (!s) return false;
          const uId = s.unit_pendidikan_id || s.unit_id;
          return !currentUserUnitId || !uId || String(uId) === String(currentUserUnitId);
        });
        const modOpts = (opts.modul_ajar || []).filter((m: any) => {
          if (!m) return false;
          const uId = m.unit_pendidikan_id || m.unit_id;
          return !currentUserUnitId || !uId || String(uId) === String(currentUserUnitId);
        });
        setTuOptions({
          guru: guruOpts,
          kelas: kelasOpts,
          subjects: subjOpts,
          modul_ajar: modOpts,
          semesters: opts.semesters || [],
          tahun_ajaran: opts.tahun_ajaran || [],
        });

        if (!formClassId && kelasOpts.length > 0) setFormClassId(String(kelasOpts[0].value || kelasOpts[0].id));
        if (!formSubjectId && subjOpts.length > 0) setFormSubjectId(String(subjOpts[0].value || subjOpts[0].id));
        if (!formGuruId && guruOpts.length > 0) setFormGuruId(String(guruOpts[0].value || guruOpts[0].id));
      }

      if (resMaterials.status === 'fulfilled') {
        const mRaw = resMaterials.value;
        const mList = Array.isArray(mRaw?.data) ? mRaw.data : (Array.isArray(mRaw) ? mRaw : []);
        setTeacherMaterials(mList);
      }

      if (resUnits.status === 'fulfilled') {
        const uRaw = resUnits.value;
        const uList = Array.isArray(uRaw?.data) ? uRaw.data : (Array.isArray(uRaw) ? uRaw : (uRaw?.data?.data || []));
        if (uList.length > 0) {
          setMasterEducationUnits(uList);
        }
      }

      // Agregasi kiriman santri dari seluruh tugas yang dimuat
      const aggSubs: any[] = [];
      list.forEach((asn) => {
        if (Array.isArray(asn.pengumpulan)) {
          asn.pengumpulan.forEach((p: any) => {
            aggSubs.push({
              ...p,
              penugasan: asn,
              assignment: asn,
            });
          });
        }
      });
      setSubmissions(aggSubs);
      return list;
    } catch (e) {
      console.error('Gagal memuat data LMS Penugasan TU:', e);
      return [];
    }
  }, [currentUserUnitId, selectedKelasFilter, selectedSubjectFilter, selectedGuruFilter, selectedStatusFilter, selectedTipeFilter, searchQuery, formClassId, formSubjectId, formGuruId]);

  // Load teacher schedules (sekali saat inisialisasi untuk guru)
  const loadSchedules = useCallback(async () => {
    try {
      const res = await mobileApiService.getTeacherSchedules();
      const list = unwrapCollection(res);
      setSchedules(list);
      setFormScheduleId((prev) => (prev ? prev : list.length > 0 ? String(list[0].id) : ''));
      return list;
    } catch {
      return [];
    }
  }, []);

  // Load teacher assignments
  const loadAssignments = useCallback(async (scheduleIdParam?: string, schedulesListParam?: any[]) => {
    try {
      const activeScheduleId = scheduleIdParam !== undefined ? scheduleIdParam : selectedScheduleIdRef.current;
      const activeSchedules = schedulesListParam || schedulesRef.current;
      const params: Record<string, any> = { per_page: 50 };
      if (activeScheduleId !== 'all') {
        const found = activeSchedules.find((s) => String(s.id) === String(activeScheduleId));
        if (found) {
          params.class_id = found.kelas_id || found.class_id;
          params.subject_id = found.subject_id;
        }
      }
      const res = await mobileApiService.getTeacherAssignments(params);
      const list = unwrapCollection(res);
      setAssignments(list);
      return list;
    } catch {
      setAssignments([]);
      return [];
    }
  }, []);

  // Load teacher submissions
  const loadSubmissions = useCallback(async (assignmentFilterParam?: string, scheduleIdParam?: string, schedulesListParam?: any[]) => {
    try {
      const activeAssignmentFilter = assignmentFilterParam !== undefined ? assignmentFilterParam : selectedAssignmentFilterRef.current;
      const activeScheduleId = scheduleIdParam !== undefined ? scheduleIdParam : selectedScheduleIdRef.current;
      const activeSchedules = schedulesListParam || schedulesRef.current;
      const params: Record<string, any> = { per_page: 100 };
      if (activeAssignmentFilter !== 'all') {
        params.assignment_id = activeAssignmentFilter;
      }
      if (activeScheduleId !== 'all') {
        const found = activeSchedules.find((s) => String(s.id) === String(activeScheduleId));
        if (found) {
          params.class_id = found.kelas_id || found.class_id;
          params.subject_id = found.subject_id;
        }
      }
      const res = await mobileApiService.getTeacherSubmissions(params);
      const list = unwrapCollection(res);
      setSubmissions(list);
      return list;
    } catch {
      setSubmissions([]);
      return [];
    }
  }, []);

  // Load teacher materials (untuk tautan materi belajar di tugas)
  const loadTeacherMaterials = useCallback(async () => {
    try {
      const res = await mobileApiService.getTeacherMaterials({ per_page: 100 });
      const list = unwrapCollection(res);
      setTeacherMaterials(list);
      return list;
    } catch {
      setTeacherMaterials([]);
      return [];
    }
  }, []);

  // Initial load - Mendukung TU vs Guru
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setLoading(true);
      try {
        if (isTu || isStaff) {
          await loadLmsData();
        } else {
          const schList = await loadSchedules();
          if (!isMounted) return;
          await Promise.allSettled([
            loadAssignments(selectedScheduleIdRef.current, schList),
            loadSubmissions(selectedAssignmentFilterRef.current, selectedScheduleIdRef.current, schList),
            loadTeacherMaterials(),
          ]);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
          setRefreshing(false);
        }
      }
    };
    void init();
    return () => {
      isMounted = false;
    };
  }, [isTu, isStaff, loadLmsData, loadSchedules, loadAssignments, loadSubmissions, loadTeacherMaterials]);

  // Filter change - Re-fetch assignments & submissions saat filter berubah (skip initial mount)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    let isMounted = true;
    const applyFilter = async () => {
      if (isTu || isStaff) {
        await loadLmsData();
      } else {
        await Promise.allSettled([
          loadAssignments(selectedScheduleId),
          loadSubmissions(selectedAssignmentFilter, selectedScheduleId),
        ]);
      }
    };
    void applyFilter();
    return () => {
      isMounted = false;
    };
  }, [isTu, isStaff, loadLmsData, selectedScheduleId, selectedAssignmentFilter, selectedStatusFilter, selectedKelasFilter, selectedSubjectFilter, selectedGuruFilter, selectedTipeFilter]);

  // Refresh handler (Pull to refresh)
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      if (isTu || isStaff) {
        await loadLmsData();
      } else {
        const schList = await loadSchedules();
        await Promise.allSettled([
          loadAssignments(selectedScheduleIdRef.current, schList),
          loadSubmissions(selectedAssignmentFilterRef.current, selectedScheduleIdRef.current, schList),
          loadTeacherMaterials(),
        ]);
      }
    } finally {
      setRefreshing(false);
    }
  }, [isTu, isStaff, loadLmsData, loadSchedules, loadAssignments, loadSubmissions, loadTeacherMaterials]);

  // Preset Deadline Cepat (3 Hari, 1 Minggu, 2 Minggu) - Format Manual Tanggal YYYY-MM-DD
  const applyPresetDeadline = (days: number) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatted = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
    setFormDeadline(formatted);
  };

  // ── Helper Form Butir Soal (Bank Soal Builder) ──
  const resetSoalForm = () => {
    setEditingSoalIdx(null);
    setSoalForm({
      tipe: 'pg',
      pertanyaan: '',
      opsi_a: '',
      opsi_b: '',
      opsi_c: '',
      opsi_d: '',
      opsi_e: '',
      kunci_jawaban: 'A',
      poin: 2,
      tingkat_kesulitan: 'sedang',
      indikator: '',
      pembahasan: '',
      matchingPairs: [{ kiri: '', kanan: '' }, { kiri: '', kanan: '' }],
    });
  };

  const handleSoalTypeChange = (tipe: 'pg' | 'esai' | 'benar_salah' | 'menjodohkan') => {
    let defaultKunci = '';
    if (tipe === 'pg') defaultKunci = 'A';
    if (tipe === 'benar_salah') defaultKunci = 'Benar';
    setSoalForm((prev) => ({
      ...prev,
      tipe,
      kunci_jawaban: defaultKunci,
      poin: tipe === 'esai' ? 5 : 2,
    }));
  };

  const handleAddSoal = () => {
    if (!soalForm.pertanyaan.trim()) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Teks Soal Kosong ⚠️',
        message: 'Isi teks pertanyaan terlebih dahulu sebelum menambahkan soal.',
      });
      return;
    }
    if (soalForm.tipe === 'pg' && (!soalForm.opsi_a.trim() || !soalForm.opsi_b.trim())) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Opsi Tidak Lengkap ⚠️',
        message: 'Pilihan Ganda membutuhkan minimal opsi A dan B.',
      });
      return;
    }
    const newSoal = {
      ...soalForm,
      matchingPairs: soalForm.tipe === 'menjodohkan'
        ? soalForm.matchingPairs.filter((p) => p.kiri.trim() && p.kanan.trim())
        : undefined,
    };
    if (editingSoalIdx !== null) {
      setSoalList((prev) => prev.map((s, i) => (i === editingSoalIdx ? newSoal : s)));
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Soal Diperbarui! ✏️',
        message: `Butir soal #${editingSoalIdx + 1} berhasil diperbarui.`,
      });
    } else {
      setSoalList((prev) => [...prev, newSoal]);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Soal Ditambahkan! ✨',
        message: `Butir soal #${soalList.length + 1} berhasil ditambahkan.`,
      });
    }
    resetSoalForm();
  };

  const handleEditSoal = (idx: number) => {
    const s = soalList[idx];
    setEditingSoalIdx(idx);
    setSoalForm({
      ...s,
      opsi_a: s.opsi_a || '',
      opsi_b: s.opsi_b || '',
      opsi_c: s.opsi_c || '',
      opsi_d: s.opsi_d || '',
      opsi_e: s.opsi_e || '',
      indikator: s.indikator || '',
      pembahasan: s.pembahasan || '',
      matchingPairs: s.matchingPairs && s.matchingPairs.length > 0
        ? s.matchingPairs
        : [{ kiri: '', kanan: '' }, { kiri: '', kanan: '' }],
    });
  };

  const handleDeleteSoal = (idx: number) => {
    setSoalList((prev) => prev.filter((_, i) => i !== idx));
    if (editingSoalIdx === idx) resetSoalForm();
  };

  const getAutoTipe = (nextSoalCount: number): 'pg' | 'esai' => {
    const mod = nextSoalCount % 20;
    return mod < 10 ? 'pg' : 'esai';
  };

  const handlePrepareNewSoal = () => {
    const nextIdx = soalList.length;
    const autoTipe = getAutoTipe(nextIdx);
    const autoKunci = autoTipe === 'pg' ? 'A' : '';
    setEditingSoalIdx(null);
    setSoalForm({
      tipe: autoTipe,
      pertanyaan: '',
      opsi_a: '',
      opsi_b: '',
      opsi_c: '',
      opsi_d: '',
      opsi_e: '',
      kunci_jawaban: autoKunci,
      poin: autoTipe === 'esai' ? 5 : 2,
      tingkat_kesulitan: 'sedang',
      indikator: '',
      pembahasan: '',
      matchingPairs: [{ kiri: '', kanan: '' }, { kiri: '', kanan: '' }],
    });
  };

  // Pilih Lampiran Dokumen / Lembar Soal Guru
  const handlePickAttachment = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedAttachment({
          uri: asset.uri,
          name: asset.name,
          type: asset.mimeType || 'application/octet-stream',
          size: asset.size,
        });
      }
    } catch {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memilih Dokumen',
        message: 'Tidak dapat membuka berkas dokumen lampiran tugas.',
      });
    }
  };

  // Modal Open Handlers
  const handleOpenCreateAssignment = () => {
    setEditingAssignment(null);
    setFormTitle('');
    setFormInstruction('');
    if (schedules.length > 0) {
      setFormScheduleId(String(schedules[0].id));
    }
    if (isTu || isStaff) {
      if (tuOptions.kelas.length > 0) setFormClassId(String(tuOptions.kelas[0].value || tuOptions.kelas[0].id));
      if (tuOptions.subjects.length > 0) setFormSubjectId(String(tuOptions.subjects[0].value || tuOptions.subjects[0].id));
      if (tuOptions.guru.length > 0) setFormGuruId(String(tuOptions.guru[0].value || tuOptions.guru[0].id));
      setFormNilaiMaksimal('100');
      setFormTipe('individu');
    }
    const d = new Date();
    d.setDate(d.getDate() + 7);
    const pad = (n: number) => String(n).padStart(2, '0');
    setFormDeadline(`${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`);
    setFormBobot('100');
    setFormJenisTugas('tugas');
    setFormTipeJawaban('both');
    setFormMateriId('');
    setFormDurasiMenit('30');
    setFormNilaiKkm('75');
    setFormIzinTerlambat(true);
    setFormStatus('published');
    setPickedAttachment(null);
    setExistingFileUrl(null);
    setSoalList([]);
    resetSoalForm();
    setShowFormScheduleDropdown(false);
    setShowMateriPickerModal(false);
    setCreateModalVisible(true);
  };

  const handleOpenEditAssignment = (assignment: any) => {
    setEditingAssignment(assignment);
    setFormTitle(assignment.judul || assignment.title || assignment.judul_tugas || '');
    setFormInstruction(assignment.instruksi || assignment.deskripsi || '');
    if (isTu || isStaff) {
      setFormClassId(String(assignment.kelas_id || assignment.class_id || assignment.kelas?.id || ''));
      setFormSubjectId(String(assignment.mata_pelajaran_id || assignment.subject_id || assignment.subject?.id || ''));
      setFormGuruId(String(assignment.guru_id || assignment.guru?.id || ''));
      setFormMateriId(String(assignment.modul_ajar_id || assignment.modul_ajar?.id || assignment.materi_id || ''));
      setFormTipe(assignment.tipe || assignment.tipe_tugas || 'individu');
      setFormNilaiMaksimal(String(assignment.nilai_maksimal || 100));
    }
    const matchedSched = schedules.find(
      (s) =>
        String(s.kelas_id || s.class_id) === String(assignment.class_id || assignment.kelas_id) &&
        String(s.subject_id || s.mata_pelajaran_id) === String(assignment.subject_id || assignment.mata_pelajaran_id)
    );
    if (matchedSched) {
      setFormScheduleId(String(matchedSched.id));
    } else if (schedules.length > 0) {
      setFormScheduleId(String(schedules[0].id));
    }
    const rawDl = assignment.deadline || assignment.due_date || assignment.tanggal_selesai || '';
    setFormDeadline(rawDl.includes('T') ? rawDl.split('T')[0] : (rawDl.includes(' ') ? rawDl.split(' ')[0] : rawDl));
    setFormBobot(String(assignment.bobot || assignment.bobot_persen || 100));
    setFormJenisTugas((assignment.jenis_tugas === 'quiz' || assignment.jenis_soal === 'quiz') ? 'quiz' : (assignment.jenis_tugas === 'proyek' ? 'proyek' : 'tugas'));
    setFormTipeJawaban((assignment.tipe_tugas === 'online' || assignment.tipe_tugas === 'online_text') ? 'online' : (assignment.tipe_tugas === 'upload' || assignment.tipe_tugas === 'file_upload') ? 'upload' : 'both');
    setFormMateriId(assignment.materi_id ? String(assignment.materi_id) : (assignment.modul_ajar_id ? String(assignment.modul_ajar_id) : ''));
    setFormDurasiMenit(String(assignment.durasi_menit || 30));
    setFormNilaiKkm(String(assignment.nilai_kkm || 75));
    setFormIzinTerlambat(assignment.izin_kumpul_terlambat !== false);
    setFormStatus(assignment.status === 'draft' || assignment.is_published === false ? 'draft' : 'published');
    setPickedAttachment(null);
    setExistingFileUrl(assignment.file_lampiran_url || assignment.file_lampiran || assignment.lampiran || null);
    
    // Parse soal_json jika ada
    try {
      const raw = assignment.soal_json || assignment.deskripsi || '';
      if (raw && typeof raw === 'string' && raw.trim().startsWith('[')) {
        const parsed = JSON.parse(raw);
        setSoalList(Array.isArray(parsed) ? parsed : []);
      } else if (Array.isArray(assignment.soal_json)) {
        setSoalList(assignment.soal_json);
      } else {
        setSoalList([]);
      }
    } catch {
      setSoalList([]);
    }
    resetSoalForm();

    setShowFormScheduleDropdown(false);
    setShowMateriPickerModal(false);
    setCreateModalVisible(true);
  };

  // Submit Buat / Ubah Tugas
  const handleSaveAssignment = async () => {
    if (!formTitle.trim()) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Perhatian ⚠️',
        message: 'Judul tugas wajib diisi.',
      });
      return;
    }
    if (!formInstruction.trim()) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Perhatian ⚠️',
        message: 'Instruksi pengerjaan tugas wajib diisi.',
      });
      return;
    }

    const cleanDeadline = formDeadline.trim().length === 10
      ? `${formDeadline.trim()} 23:59:00`
      : formDeadline.trim();

    const derivedJenis = soalList.length > 0
      ? (soalList.some((s) => s.tipe === 'pg') && soalList.some((s) => s.tipe === 'esai')
          ? 'campuran'
          : soalList.some((s) => s.tipe === 'pg')
          ? 'objektif'
          : 'essay')
      : (formJenisTugas === 'quiz' ? 'quiz' : 'essay');

    const soalJsonStr = soalList.length > 0 ? JSON.stringify(soalList) : '';

    setSubmitting(true);
    try {
      if (isTu || isStaff) {
        // Mode Tata Usaha / Staff (Full Scoping LMS & Role TU)
        const targetClass = formClassId || (tuOptions.kelas[0]?.value || tuOptions.kelas[0]?.id);
        const targetSubject = formSubjectId || (tuOptions.subjects[0]?.value || tuOptions.subjects[0]?.id);
        const targetGuru = formGuruId || (tuOptions.guru[0]?.value || tuOptions.guru[0]?.id);

        if (!targetClass) {
          setFeedback({
            visible: true,
            type: 'warning',
            title: 'Perhatian ⚠️',
            message: 'Silakan pilih kelas sasaran penugasan.',
          });
          setSubmitting(false);
          return;
        }

        const payload: any = {
          judul: formTitle.trim(),
          judul_tugas: formTitle.trim(),
          deskripsi: formInstruction.trim(),
          instruksi: formInstruction.trim(),
          kelas_id: targetClass,
          mata_pelajaran_id: targetSubject,
          guru_id: targetGuru || undefined,
          modul_ajar_id: formMateriId || null,
          deadline: cleanDeadline,
          tanggal_selesai: cleanDeadline,
          bobot_persen: parseFloat(formBobot) || 10,
          nilai_maksimal: parseFloat(formNilaiMaksimal) || 100,
          tipe: formTipe || 'individu',
          tipe_tugas: formTipe || 'individu',
          jenis_tugas: formJenisTugas,
          metadata: {
            surah: formSurah,
            ayat_awal: formAyatAwal,
            ayat_akhir: formAyatAkhir,
            min_words: formMinWords,
            max_group_members: formMaxGroupMembers,
          },
          link_lampiran: formLinkLampiran || undefined,
          izin_kumpul_terlambat: formIzinTerlambat,
          status: formStatus === 'draft' ? 'draft' : 'dipublikasikan',
          lampiran: pickedAttachment?.name || formLinkLampiran || undefined,
        };

        const executeSaveTu = async () => {
          setSubmitting(true);
          try {
            if (editingAssignment) {
              await mobileApiService.updateLmsPenugasan(String(editingAssignment.id), payload);
              setFeedback({
                visible: true,
                type: 'success',
                title: 'Tugas Berhasil Diperbarui! ✏️',
                message: `Perubahan tugas "${formTitle.trim()}" berhasil disimpan ke sistem.`,
              });
            } else {
              await mobileApiService.createLmsPenugasan(payload);
              setFeedback({
                visible: true,
                type: 'success',
                title: formStatus === 'draft' ? 'Draf Berhasil Disimpan 📄' : 'Tugas Berhasil Diterbitkan! ✨',
                message: formStatus === 'draft'
                  ? `Tugas "${formTitle.trim()}" disimpan sebagai draf.`
                  : `Tugas "${formTitle.trim()}" telah diterbitkan dan dapat diakses siswa.`,
              });
            }
            setCreateModalVisible(false);
            setEditingAssignment(null);
            setFormTitle('');
            setFormInstruction('');
            setPickedAttachment(null);
            await loadLmsData();
          } catch (err: any) {
            setFeedback({
              visible: true,
              type: 'error',
              title: editingAssignment ? 'Gagal Memperbarui Tugas' : 'Gagal Membuat Tugas',
              message: getApiErrorMessage(err, 'Terjadi kendala saat memproses penugasan.'),
            });
          } finally {
            setSubmitting(false);
          }
        };

        const clsName = tuOptions.kelas.find((k: any) => String(k.value || k.id) === String(targetClass))?.label || 'Semua Kelas';
        const subjName = tuOptions.subjects.find((s: any) => String(s.value || s.id) === String(targetSubject))?.label || 'Mata Pelajaran';

        setFeedback({
          visible: true,
          type: 'confirm',
          title: editingAssignment ? 'Konfirmasi Perubahan Tugas ✏️' : (formStatus === 'draft' ? 'Konfirmasi Simpan Draf 📄' : 'Konfirmasi Terbitkan Tugas ✨'),
          message: editingAssignment
            ? `Simpan perubahan pada tugas "${formTitle.trim()}"? Pastikan data sudah sesuai.`
            : (formStatus === 'draft'
                ? `Simpan tugas "${formTitle.trim()}" sebagai draf sementara?`
                : `Terbitkan tugas "${formTitle.trim()}" agar dapat dikerjakan siswa?`),
          itemName: formTitle.trim(),
          category: `Kelas ${clsName} • ${subjName}`,
          actionLabel: editingAssignment ? 'Ya, Perbarui' : 'Ya, Simpan',
          cancelLabel: 'Batal',
          onConfirm: executeSaveTu,
        });
        setSubmitting(false);
        return;
      }

      // Mode Guru Pengampu (Personal Workspace)
      const targetSchedule = schedules.find((s) => String(s.id) === String(formScheduleId)) || schedules[0];
      if (!targetSchedule) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Perhatian ⚠️',
          message: 'Pilih kelas dan mata pelajaran penugasan.',
        });
        setSubmitting(false);
        return;
      }

      const classId = targetSchedule.kelas_id || targetSchedule.class_id;
      const subjectId = targetSchedule.subject_id;

      if (!classId || !subjectId) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Perhatian ⚠️',
          message: 'Data kelas atau mata pelajaran tidak valid.',
        });
        setSubmitting(false);
        return;
      }

      let payload: any;
      if (pickedAttachment) {
        const fd = new FormData();
        fd.append('judul', formTitle.trim());
        fd.append('instruksi', formInstruction.trim());
        fd.append('class_id', classId);
        fd.append('subject_id', subjectId);
        fd.append('deadline', cleanDeadline);
        fd.append('bobot', String(parseFloat(formBobot) || 100));
        fd.append('tipe_tugas', formTipeJawaban);
        fd.append('jenis_tugas', formJenisTugas);
        fd.append('jenis_soal', derivedJenis);
        if (soalJsonStr) {
          fd.append('soal_json', soalJsonStr);
          fd.append('deskripsi', soalJsonStr);
        }
        if (formMateriId) {
          fd.append('materi_id', formMateriId);
        }
        if (formJenisTugas === 'quiz') {
          fd.append('durasi_menit', formDurasiMenit);
          fd.append('nilai_kkm', formNilaiKkm);
        }
        fd.append('metadata', JSON.stringify({
          surah: formSurah,
          ayat_awal: formAyatAwal,
          ayat_akhir: formAyatAkhir,
          min_words: formMinWords,
          max_group_members: formMaxGroupMembers,
        }));
        if (formLinkLampiran) fd.append('link_lampiran', formLinkLampiran);
        fd.append('izin_kumpul_terlambat', formIzinTerlambat ? '1' : '0');
        fd.append('status', formStatus);
        fd.append('file_lampiran', {
          uri: pickedAttachment.uri,
          name: pickedAttachment.name,
          type: pickedAttachment.type,
        } as any);
        payload = fd;
      } else {
        payload = {
          judul: formTitle.trim(),
          instruksi: formInstruction.trim(),
          class_id: classId,
          subject_id: subjectId,
          deadline: cleanDeadline,
          bobot: parseFloat(formBobot) || 100,
          tipe_tugas: formTipeJawaban,
          jenis_tugas: formJenisTugas,
          metadata: {
            surah: formSurah,
            ayat_awal: formAyatAwal,
            ayat_akhir: formAyatAkhir,
            min_words: formMinWords,
            max_group_members: formMaxGroupMembers,
          },
          link_lampiran: formLinkLampiran || undefined,
          jenis_soal: derivedJenis,
          soal_json: soalJsonStr || null,
          deskripsi: soalJsonStr || formInstruction.trim(),
          materi_id: formMateriId || null,
          durasi_menit: formJenisTugas === 'quiz' ? Number(formDurasiMenit) : undefined,
          nilai_kkm: formJenisTugas === 'quiz' ? Number(formNilaiKkm) : undefined,
          izin_kumpul_terlambat: formIzinTerlambat,
          status: formStatus,
        };
      }

      const executeSaveGuru = async () => {
        setSubmitting(true);
        try {
          if (editingAssignment) {
            await mobileApiService.updateTeacherAssignment(String(editingAssignment.id), payload);
            const updatedTitle = formTitle.trim();
            setCreateModalVisible(false);
            setEditingAssignment(null);
            setFormTitle('');
            setFormInstruction('');
            setPickedAttachment(null);
            setFeedback({
              visible: true,
              type: 'success',
              title: 'Tugas Berhasil Diperbarui! ✏️',
              message: `Perubahan tugas "${updatedTitle}" berhasil disimpan ke sistem.`,
            });
          } else {
            await mobileApiService.createTeacherAssignment(payload);
            const createdTitle = formTitle.trim();
            setCreateModalVisible(false);
            setFormTitle('');
            setFormInstruction('');
            setPickedAttachment(null);
            setFeedback({
              visible: true,
              type: 'success',
              title: formStatus === 'draft' ? 'Draf Berhasil Disimpan 📄' : 'Tugas Berhasil Diterbitkan! ✨',
              message: formStatus === 'draft'
                ? `Tugas "${createdTitle}" disimpan sebagai draf.`
                : `Tugas "${createdTitle}" telah diterbitkan dan dapat diakses santri.`,
            });
          }
          await loadAssignments();
        } catch (err: any) {
          setFeedback({
            visible: true,
            type: 'error',
            title: editingAssignment ? 'Gagal Memperbarui Tugas' : 'Gagal Membuat Tugas',
            message: getApiErrorMessage(err, 'Terjadi kendala saat memproses penugasan.'),
          });
        } finally {
          setSubmitting(false);
        }
      };

      const schedCls = targetSchedule?.class?.name || targetSchedule?.kelas?.nama_kelas || 'Kelas';
      const schedSubj = targetSchedule?.subject?.name || targetSchedule?.subject?.nama_mapel || 'Mata Pelajaran';

      setFeedback({
        visible: true,
        type: 'confirm',
        title: editingAssignment ? 'Konfirmasi Perubahan Tugas ✏️' : (formStatus === 'draft' ? 'Konfirmasi Simpan Draf 📄' : 'Konfirmasi Terbitkan Tugas ✨'),
        message: editingAssignment
          ? `Simpan perubahan pada tugas "${formTitle.trim()}"?`
          : (formStatus === 'draft'
              ? `Simpan tugas "${formTitle.trim()}" sebagai draf sementara?`
              : `Terbitkan tugas "${formTitle.trim()}" agar dapat dikerjakan santri?`),
        itemName: formTitle.trim(),
        category: `Kelas ${schedCls} • ${schedSubj}`,
        actionLabel: editingAssignment ? 'Ya, Perbarui' : 'Ya, Simpan',
        cancelLabel: 'Batal',
        onConfirm: executeSaveGuru,
      });
      setSubmitting(false);
      return;
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: editingAssignment ? 'Gagal Memperbarui Tugas' : 'Gagal Membuat Tugas',
        message: getApiErrorMessage(err, 'Terjadi kendala saat memproses penugasan.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Submit Penilaian Tugas Siswa
  const handleSaveGrade = async () => {
    if (!selectedSubmission?.id) return;
    const scoreNum = parseFloat(gradeScore);
    if (isNaN(scoreNum) || scoreNum < 0 || scoreNum > 100) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Nilai Tidak Valid ⚠️',
        message: 'Nilai harus berupa angka antara 0 hingga 100.',
      });
      return;
    }

    setSubmitting(true);
    try {
      if (isTu || isStaff) {
        const penugasanId = selectedSubmission.penugasan_id || selectedSubmission.penugasan?.id || selectedSubmission.assignment_id;
        const studentId = selectedSubmission.siswa_id || selectedSubmission.student?.id || selectedSubmission.siswa?.id;
        if (penugasanId && studentId) {
          await mobileApiService.gradeLmsPenugasan(String(penugasanId), {
            siswa_id: studentId,
            nilai_guru: scoreNum,
            catatan_guru: gradeNotes.trim() || undefined,
            status: 'dinilai',
          });
        } else {
          await mobileApiService.gradeTeacherSubmission(String(selectedSubmission.id), {
            nilai: scoreNum,
            catatan_guru: gradeNotes.trim() || undefined,
          });
        }
      } else {
        await mobileApiService.gradeTeacherSubmission(String(selectedSubmission.id), {
          nilai: scoreNum,
          catatan_guru: gradeNotes.trim() || undefined,
        });
      }

      setGradeModalVisible(false);
      setSelectedSubmission(null);
      setGradeScore('');
      setGradeNotes('');
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Nilai Berhasil Disimpan! ✨',
        message: 'Hasil evaluasi dan catatan telah tersimpan ke sistem.',
      });
      if (isTu || isStaff) {
        await loadLmsData();
      } else {
        await loadSubmissions();
      }
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Nilai',
        message: getApiErrorMessage(err, 'Terjadi kendala saat menyimpan nilai tugas.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // 1-Tap Toggle Publish / Draft
  const handleTogglePublish = async (item: any) => {
    try {
      setSubmitting(true);
      if (isTu || isStaff) {
        await mobileApiService.togglePublishLmsPenugasan(String(item.id));
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Status Diperbarui ✨',
          message: `Status tugas "${item.judul || item.title || item.judul_tugas}" berhasil diubah.`,
        });
        await loadLmsData();
      }
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Mengubah Status',
        message: getApiErrorMessage(err, 'Terjadi kendala saat mengubah status publikasi tugas.'),
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Bagikan / Cetak Ringkasan Laporan Penugasan A4
  const handleShareA4Report = async () => {
    try {
      const summaryText = `*LAPORAN REKAPITULASI PENUGASAN LMS*\n${resolvedKopUnit.unitName}\nNomor: -\nTanggal: ${formatDate(new Date().toISOString())}\n\n*Ringkasan Metrik:*\n• Total Tugas: ${tuStats.total}\n• Dipublikasikan: ${tuStats.published}\n• Draf: ${tuStats.draft}\n• Total Pengumpulan: ${tuStats.total_pengumpulan}\n• Sudah Dinilai: ${tuStats.total_dinilai}\n\nPetugas TU: ${teacherName}\n${foundationName}`;
      await Share.share({
        title: `Laporan Penugasan LMS - ${currentUserUnitName}`,
        message: summaryText,
      });
    } catch {
      // Ignored
    }
  };

  // Delete Assignment dengan Konfirmasi Modal Bergaya Terpadu
  const handleDeleteAssignment = (assignment: any) => {
    const title = assignment.judul || assignment.title || assignment.judul_tugas || 'Tugas';
    const subName = assignment.subject?.nama_mapel || assignment.subject?.name || 'Mata Pelajaran';
    const clsName = assignment.kelas?.nama_kelas || assignment.class?.name || 'Kelas';

    setFeedback({
      visible: true,
      type: 'confirm',
      title: 'Hapus Penugasan 🗑️',
      message: `Apakah Anda yakin ingin menghapus tugas "${title}"? Tindakan ini akan menghapus tugas dari sistem.`,
      itemName: title,
      category: `${subName} • ${clsName}`,
      actionLabel: 'Ya, Hapus',
      cancelLabel: 'Batal',
      onConfirm: async () => {
        try {
          if (isTu || isStaff) {
            await mobileApiService.deleteLmsPenugasan(String(assignment.id));
            setFeedback({
              visible: true,
              type: 'success',
              title: 'Tugas Berhasil Dihapus! 🗑️',
              message: `Tugas "${title}" berhasil dihapus dari sistem.`,
            });
            await loadLmsData();
          } else {
            await mobileApiService.deleteTeacherAssignment(String(assignment.id));
            setFeedback({
              visible: true,
              type: 'success',
              title: 'Tugas Berhasil Dihapus! 🗑️',
              message: `Tugas "${title}" berhasil dihapus dari sistem.`,
            });
            await loadAssignments();
          }
        } catch (err: any) {
          setFeedback({
            visible: true,
            type: 'error',
            title: 'Gagal Menghapus',
            message: getApiErrorMessage(err, 'Gagal menghapus penugasan.'),
          });
        }
      },
    });
  };

  // Filtered Assignments (Multi-dimensi selaras web-dashboard)
  const filteredAssignments = useMemo(() => {
    return assignments.filter((item) => {
      const q = searchQuery.toLowerCase();
      const title = String(item.judul || item.title || item.judul_tugas || '').toLowerCase();
      const mapel = String(item.subject?.nama_mapel || item.subject?.name || item.mata_pelajaran?.nama_mapel || '').toLowerCase();
      const kelas = String(item.kelas?.nama_kelas || item.kelas?.name || item.class?.name || '').toLowerCase();
      const guru = String(item.guru?.nama || item.guru?.nama_lengkap || '').toLowerCase();

      const matchesSearch = !q || title.includes(q) || mapel.includes(q) || kelas.includes(q) || guru.includes(q);

      // Status filter
      const itemStatus = item.status === 'draft' || item.is_published === false ? 'draft' : 'dipublikasikan';
      const matchesStatus = selectedStatusFilter === 'all' || itemStatus === selectedStatusFilter;

      // Kelas filter
      const itemClassId = String(item.kelas_id || item.class_id || item.kelas?.id || '');
      const matchesKelas = selectedKelasFilter === 'all' || itemClassId === String(selectedKelasFilter);

      // Subject filter
      const itemSubjectId = String(item.mata_pelajaran_id || item.subject_id || item.subject?.id || '');
      const matchesSubject = selectedSubjectFilter === 'all' || itemSubjectId === String(selectedSubjectFilter);

      // Guru filter (khusus TU)
      const itemGuruId = String(item.guru_id || item.guru?.id || '');
      const matchesGuru = selectedGuruFilter === 'all' || itemGuruId === String(selectedGuruFilter);

      // Tipe filter
      const itemTipe = String(item.tipe || item.tipe_tugas || 'individu').toLowerCase();
      const matchesTipe = selectedTipeFilter === 'all' || itemTipe === selectedTipeFilter;

      return matchesSearch && matchesStatus && matchesKelas && matchesSubject && matchesGuru && matchesTipe;
    });
  }, [assignments, searchQuery, selectedStatusFilter, selectedKelasFilter, selectedSubjectFilter, selectedGuruFilter, selectedTipeFilter]);

  // Filtered Submissions
  const filteredSubmissions = useMemo(() => {
    return submissions.filter((item) => {
      const q = searchQuery.toLowerCase();
      const studentName = String(item.student?.nama_lengkap || item.student?.full_name || item.siswa?.nama || item.siswa?.name || item.santri?.nama_lengkap || '').toLowerCase();
      const nis = String(item.student?.nis || item.student?.nisn || item.siswa?.nisn || item.siswa?.nis || '').toLowerCase();
      const taskTitle = String(item.penugasan?.judul || item.assignment?.title || item.penugasan?.judul_tugas || '').toLowerCase();
      
      const matchesSearch = !q || studentName.includes(q) || nis.includes(q) || taskTitle.includes(q);
      if (selectedAssignmentFilter !== 'all') {
        const pId = String(item.penugasan_id || item.assignment_id || item.penugasan?.id || '');
        if (pId !== String(selectedAssignmentFilter)) return false;
      }
      return matchesSearch;
    });
  }, [submissions, searchQuery, selectedAssignmentFilter]);

  return (
    <View style={styles.container}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK HALAMAN BAHAN AJAR & JADWAL, JERNIH & CRISP) ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            'rgba(240, 253, 244, 0)',
            'rgba(240, 253, 244, 0.50)',
            '#F0FDF4',
          ]}
          locations={[0.45, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── 1. STICKY HEADER (Muncul hanya saat di-scroll) ── */}
      <Animated.View
        pointerEvents={isStickyActive ? 'auto' : 'none'}
        style={[
          styles.stickyHeaderContainer,
          {
            paddingTop: insets.top + 6,
            opacity: stickyOpacity,
            transform: [{ translateY: stickyTranslateY }],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(240, 253, 244, 0.97)', 'rgba(236, 253, 245, 0.95)', 'rgba(240, 253, 244, 0.97)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stickyDecorCircle1} />
        <View style={styles.stickyDecorCircle2} />

        {/* Baris Atas Sticky: Tombol Back, Judul & Mini Counter, Tombol Buat */}
        <View style={styles.stickyTopRow}>
          <View style={styles.stickyTitleGroup}>
            {onBack && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onBack}
                style={styles.stickySquircleBtn}
                accessibilityLabel="Kembali"
              >
                <MaterialCommunityIcons name="arrow-left" size={18} color="#059669" />
              </TouchableOpacity>
            )}
            <View style={styles.stickyTitleTextCol}>
              <Text numberOfLines={1} style={styles.stickyTitle}>
                Workspace Penugasan
              </Text>
              <Text numberOfLines={1} style={styles.stickySubtitle}>
                {assignments.length} Tugas · {submissions.length} Kiriman Santri
              </Text>
            </View>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            {(isTu || isStaff) && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setPrintPaperModalVisible(true)}
                style={styles.stickyPrintBtn}
                accessibilityLabel="Cetak Rekap A4"
              >
                <MaterialCommunityIcons name="printer-outline" size={15} color="#047857" />
              </TouchableOpacity>
            )}
            {activeTab === 'assignments' && (!isPrincipal || isTeacher) && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleOpenCreateAssignment}
                style={styles.stickyCreateBtn}
                accessibilityLabel="Buat Tugas Baru"
              >
                <MaterialCommunityIcons name="plus" size={16} color="#047857" />
                <Text style={styles.stickyCreateBtnText}>Buat</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Tab Switcher Sticky: Berubah terletak di sticky header saat di-scroll */}
        <View style={styles.stickyTabBarContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('assignments')}
            style={[
              styles.stickyTabButton,
              activeTab === 'assignments' && styles.stickyTabButtonActive,
            ]}
          >
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={14}
              color={activeTab === 'assignments' ? '#FFFFFF' : '#065F46'}
              style={{ marginRight: 6 }}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.stickyTabButtonText,
                activeTab === 'assignments' && styles.stickyTabButtonTextActive,
              ]}
            >
              Daftar Tugas ({assignments.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('submissions')}
            style={[
              styles.stickyTabButton,
              activeTab === 'submissions' && styles.stickyTabButtonActive,
            ]}
          >
            <MaterialCommunityIcons
              name="account-check-outline"
              size={14}
              color={activeTab === 'submissions' ? '#FFFFFF' : '#065F46'}
              style={{ marginRight: 6 }}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.stickyTabButtonText,
                activeTab === 'submissions' && styles.stickyTabButtonTextActive,
              ]}
            >
              Kiriman Santri ({submissions.length})
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── 2. SCROLLVIEW UTAMA ── */}
      <Animated.ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.mainScrollContent,
          { paddingBottom: Math.max(insets.bottom + 120, 140) },
        ]}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />
        }
      >
        {/* 2a. Header Statis Workspace (di paling atas saat belum scroll) — TANPA TAB */}
        <View style={[styles.staticTopBarWrapper, { paddingTop: insets.top + 8 }]}>
          {/* Transparent — no gradient needed, bg inherited from container */}
          <View style={styles.staticDecorCircle1} />
          <View style={styles.staticDecorCircle2} />

          <View style={styles.staticTopBarRow}>
            {onBack && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={onBack}
                style={styles.staticSquircleBackBtn}
                accessibilityRole="button"
                accessibilityLabel="Kembali"
              >
                <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
              </TouchableOpacity>
            )}
            <View style={styles.staticTitleCol}>
              <Text numberOfLines={1} style={styles.staticTitle}>
                Workspace Penugasan LMS
              </Text>
              {isTu || isStaff ? (
                <View style={styles.tuHeaderBadgeRow}>
                  <View style={styles.tuRolePill}>
                    <MaterialCommunityIcons name="shield-account" size={11} color="#047857" style={{ marginRight: 4 }} />
                    <Text numberOfLines={1} style={styles.tuRolePillText}>
                      {isPrincipal ? 'KEPALA SEKOLAH' : 'TATA USAHA'} · {currentUserUnitName.toUpperCase()}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={styles.staticSubtitle}>
                    {academicYear} · Smt {academicSemester}
                  </Text>
                </View>
              ) : (
                <Text numberOfLines={1} style={styles.staticSubtitle}>
                  Kelola tugas, jadwal tenggat, dan evaluasi jawaban santri
                </Text>
              )}
            </View>

            {(isTu || isStaff) && (
              <View style={styles.staticHeaderActionCol}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setPrintPaperModalVisible(true)}
                  style={styles.staticPrintPaperBtn}
                  accessibilityLabel="Cetak Laporan Rekap A4"
                >
                  <MaterialCommunityIcons name="printer-outline" size={14} color="#047857" style={{ marginRight: 4 }} />
                  <Text style={styles.staticPrintPaperBtnText}>Rekap A4</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>
        </View>

        {/* 2b. Badan Halaman Konten (Body) */}
        <View style={styles.bodyContentWrapper}>
          {/* Card Ringkasan Metrik: 5 KPI CARDS MODERN untuk TU vs 3 Kartu Guru */}
          {isTu || isStaff ? (
            <View style={styles.kpiContainer}>
              {/* Baris 1: 3 Kartu (Total Tugas, Dipublikasikan, Draf) */}
              <View style={styles.kpiRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedStatusFilter('all')}
                  style={[styles.kpiCard, styles.kpiCardEmerald, selectedStatusFilter === 'all' && styles.kpiCardActiveRing]}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#047857' }]}>Total Tugas</Text>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={16} color="#059669" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#065F46' }]}>{tuStats.total}</Text>
                  <Text style={[styles.kpiSub, { color: '#047857' }]}>Seluruh Unit</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedStatusFilter('dipublikasikan')}
                  style={[styles.kpiCard, styles.kpiCardSky, selectedStatusFilter === 'dipublikasikan' && styles.kpiCardActiveRing]}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#0284C7' }]}>Terbit</Text>
                    <MaterialCommunityIcons name="send-check-outline" size={16} color="#0284C7" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#075985' }]}>{tuStats.published}</Text>
                  <Text style={[styles.kpiSub, { color: '#0284C7' }]}>Dapat Diakses</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedStatusFilter('draft')}
                  style={[styles.kpiCard, styles.kpiCardAmber, selectedStatusFilter === 'draft' && styles.kpiCardActiveRing]}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#D97706' }]}>Draf</Text>
                    <MaterialCommunityIcons name="file-document-edit-outline" size={16} color="#D97706" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#B45309' }]}>{tuStats.draft}</Text>
                  <Text style={[styles.kpiSub, { color: '#D97706' }]}>Belum Terbit</Text>
                </TouchableOpacity>
              </View>

              {/* Baris 2: 2 Kartu (Total Pengumpulan & Total Dinilai) */}
              <View style={styles.kpiRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setActiveTab('submissions')}
                  style={[styles.kpiCard, styles.kpiCardPurple, { flex: 1 }]}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#7C3AED' }]}>Terkumpul</Text>
                    <MaterialCommunityIcons name="account-arrow-up-outline" size={16} color="#7C3AED" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#5B21B6' }]}>{tuStats.total_pengumpulan}</Text>
                  <Text style={[styles.kpiSub, { color: '#7C3AED' }]}>Jawaban Santri</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setActiveTab('submissions')}
                  style={[styles.kpiCard, styles.kpiCardTeal, { flex: 1 }]}
                >
                  <View style={styles.kpiTop}>
                    <Text style={[styles.kpiLabel, { color: '#0D9488' }]}>Sudah Dinilai</Text>
                    <MaterialCommunityIcons name="check-decagram-outline" size={16} color="#0D9488" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#115E59' }]}>{tuStats.total_dinilai}</Text>
                  <Text style={[styles.kpiSub, { color: '#0D9488' }]}>Hasil Tersimpan</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            <View style={styles.metricsCardWrapper}>
              <LinearGradient
                colors={['rgba(255, 255, 255, 0.94)', 'rgba(236, 253, 245, 0.88)']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.metricsGradient}
              >
                <View style={styles.metricCol}>
                  <View style={styles.metricTopRow}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={16} color="#059669" />
                    <Text style={styles.metricValWhite}>{assignments.length}</Text>
                  </View>
                  <Text style={styles.metricLblWhite}>Tugas Aktif</Text>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricCol}>
                  <View style={styles.metricTopRow}>
                    <MaterialCommunityIcons name="account-check-outline" size={16} color="#059669" />
                    <Text style={styles.metricValWhite}>{submissions.length}</Text>
                  </View>
                  <Text style={styles.metricLblWhite}>Kiriman Santri</Text>
                </View>

                <View style={styles.metricDivider} />

                <View style={styles.metricCol}>
                  <View style={styles.metricTopRow}>
                    <MaterialCommunityIcons name="google-classroom" size={16} color="#059669" />
                    <Text style={styles.metricValWhite}>{schedules.length}</Text>
                  </View>
                  <Text style={styles.metricLblWhite}>Rombel Aktif</Text>
                </View>
              </LinearGradient>
            </View>
          )}

          {/* Tab Selector di Bodi (Daftar Tugas vs Kiriman Santri) */}
          <View style={styles.bodyTabBarContainer}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('assignments')}
              style={[
                styles.bodyTabButton,
                activeTab === 'assignments' && styles.bodyTabButtonActive,
              ]}
            >
              <MaterialCommunityIcons
                name="clipboard-text-outline"
                size={16}
                color={activeTab === 'assignments' ? '#FFFFFF' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.bodyTabButtonText,
                  activeTab === 'assignments' && styles.bodyTabButtonTextActive,
                ]}
              >
                Daftar Tugas ({assignments.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('submissions')}
              style={[
                styles.bodyTabButton,
                activeTab === 'submissions' && styles.bodyTabButtonActive,
              ]}
            >
              <MaterialCommunityIcons
                name="account-check-outline"
                size={16}
                color={activeTab === 'submissions' ? '#FFFFFF' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.bodyTabButtonText,
                  activeTab === 'submissions' && styles.bodyTabButtonTextActive,
                ]}
              >
                Kiriman Santri ({submissions.length})
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filter Section: Pencarian, Tombol Buat, dan Multi-Dimensi Toolbar TU */}
          <View style={styles.filterSection}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={20} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder={activeTab === 'assignments' ? 'Cari tugas, guru, atau mapel...' : 'Cari santri atau tugas...'}
                  placeholderTextColor="#94A3B8"
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  style={styles.searchInput}
                />
                {searchQuery ? (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>

              {activeTab === 'assignments' && (!isPrincipal || isTeacher) && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleOpenCreateAssignment}
                  style={styles.createTaskBtn}
                >
                  <MaterialCommunityIcons name="plus" size={18} color="#FFFFFF" />
                  <Text style={styles.createTaskBtnText}>Buat</Text>
                </TouchableOpacity>
              )}
            </View>

            {/* Khusus TU / Staff: Filter Horizontal Chips (Status, Kelas, Mapel, Guru, Reset) */}
            {isTu || isStaff ? (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.filterChipsScrollContent}
                style={styles.filterChipsScrollView}
              >
                {/* Filter Status: Terbit vs Draf */}
                {['all', 'dipublikasikan', 'draft'].map((st) => {
                  const isSel = selectedStatusFilter === st;
                  const label = st === 'all' ? 'Semua Status' : st === 'dipublikasikan' ? 'Dipublikasikan' : 'Draf';
                  return (
                    <TouchableOpacity
                      key={`st-${st}`}
                      activeOpacity={0.8}
                      onPress={() => setSelectedStatusFilter(st)}
                      style={[styles.filterChip, isSel && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                        {label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}

                {/* Chip Filter Kelas */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowFilterKelasModal(true)}
                  style={[styles.filterChipDropdown, selectedKelasFilter !== 'all' && styles.filterChipActive]}
                >
                  <MaterialCommunityIcons
                    name="school-outline"
                    size={13}
                    color={selectedKelasFilter !== 'all' ? '#FFFFFF' : '#047857'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.filterChipText, selectedKelasFilter !== 'all' && styles.filterChipTextActive]}
                  >
                    {currentFilterKelasLabel}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={14}
                    color={selectedKelasFilter !== 'all' ? '#FFFFFF' : '#64748B'}
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>

                {/* Chip Filter Mapel */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowFilterSubjectModal(true)}
                  style={[styles.filterChipDropdown, selectedSubjectFilter !== 'all' && styles.filterChipActive]}
                >
                  <MaterialCommunityIcons
                    name="book-open-outline"
                    size={13}
                    color={selectedSubjectFilter !== 'all' ? '#FFFFFF' : '#047857'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.filterChipText, selectedSubjectFilter !== 'all' && styles.filterChipTextActive]}
                  >
                    {currentFilterSubjectLabel}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={14}
                    color={selectedSubjectFilter !== 'all' ? '#FFFFFF' : '#64748B'}
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>

                {/* Chip Filter Guru */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowFilterGuruModal(true)}
                  style={[styles.filterChipDropdown, selectedGuruFilter !== 'all' && styles.filterChipActive]}
                >
                  <MaterialCommunityIcons
                    name="account-tie-outline"
                    size={13}
                    color={selectedGuruFilter !== 'all' ? '#FFFFFF' : '#047857'}
                    style={{ marginRight: 4 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={[styles.filterChipText, selectedGuruFilter !== 'all' && styles.filterChipTextActive]}
                  >
                    {currentFilterGuruLabel}
                  </Text>
                  <MaterialCommunityIcons
                    name="chevron-down"
                    size={14}
                    color={selectedGuruFilter !== 'all' ? '#FFFFFF' : '#64748B'}
                    style={{ marginLeft: 2 }}
                  />
                </TouchableOpacity>

                {/* Tombol Reset Filter jika ada yang aktif */}
                {(selectedStatusFilter !== 'all' || selectedKelasFilter !== 'all' || selectedSubjectFilter !== 'all' || selectedGuruFilter !== 'all' || searchQuery.trim()) && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedStatusFilter('all');
                      setSelectedKelasFilter('all');
                      setSelectedSubjectFilter('all');
                      setSelectedGuruFilter('all');
                      setSearchQuery('');
                    }}
                    style={styles.filterChipReset}
                  >
                    <MaterialCommunityIcons name="refresh" size={13} color="#E11D48" style={{ marginRight: 3 }} />
                    <Text style={styles.filterChipResetText}>Reset</Text>
                  </TouchableOpacity>
                )}
              </ScrollView>
            ) : (
              /* Dropdown Pemilihan Kelas & Mapel Guru Biasa */
              schedules.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setShowFilterScheduleDropdown(true)}
                  style={styles.filterDropdownTrigger}
                >
                  <View style={styles.filterDropdownTriggerLeft}>
                    <View style={styles.dropdownIconCircle}>
                      <MaterialCommunityIcons name="google-classroom" size={16} color="#047857" />
                    </View>
                    <View style={styles.dropdownLabelCol}>
                      <Text style={styles.dropdownSubLabel}>Filter Rombel & Mapel</Text>
                      <Text style={styles.dropdownMainLabel} numberOfLines={1}>
                        {currentFilterScheduleLabel}
                      </Text>
                    </View>
                  </View>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#047857" />
                </TouchableOpacity>
              )
            )}
          </View>

          {/* List Card Data Berdasarkan Tab Aktif */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Memuat penugasan dan kiriman santri...</Text>
            </View>
          ) : activeTab === 'assignments' ? (
            filteredAssignments.length === 0 ? (
              <EmptyStateCard
                icon="clipboard-text-off-outline"
                title="Belum Ada Penugasan"
                description="Anda belum menerbitkan tugas pada rombel ini. Klik tombol 'Buat' di atas untuk memulai."
              />
            ) : (
              filteredAssignments.map((item, idx) => {
                const subjectName = item.subject?.name || item.subject?.nama_mapel || 'Mata Pelajaran';
                const subjStyle = getSubjectStyle(subjectName);
                const className = item.kelas?.nama_kelas || item.kelas?.name || item.class?.name || 'Kelas';
                const submissionCount = item.submissions_count ?? item.pengumpulan_count ?? 0;
                const deadlineStr = item.deadline ? new Date(item.deadline).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit',
                }) : 'Tidak ada tenggat';
                const jenis = item.jenis_tugas || 'tugas';
                const tipeJawaban = item.tipe_tugas || 'both';
                const hasAttachment = Boolean(item.file_lampiran || item.file_lampiran_url);
                const isDraft = item.status === 'draft';
                const materiJudul = item.materi?.judul || item.materi?.title || item.modul_ajar?.judul;

                const jenisBadgeConfig = jenis === 'quiz'
                  ? { label: 'Kuis', icon: 'lightning-bolt', bg: '#F5F3FF', border: '#DDD6FE', text: '#7C3AED' }
                  : jenis === 'proyek'
                  ? { label: 'Proyek', icon: 'palette-outline', bg: '#FFFBEB', border: '#FDE68A', text: '#D97706' }
                  : { label: 'Tugas', icon: 'clipboard-text-outline', bg: '#ECFDF5', border: '#A7F3D0', text: '#059669' };

                const formatJawabanLabel = tipeJawaban === 'online'
                  ? 'Teks Online'
                  : tipeJawaban === 'upload'
                  ? 'Unggah Berkas'
                  : 'Teks & Berkas';

                return (
                  <View
                    key={item.id || idx}
                    style={[
                      styles.assignmentCard,
                      { borderLeftWidth: 4, borderLeftColor: isDraft ? '#94A3B8' : subjStyle.color },
                    ]}
                  >
                    <View style={styles.assignmentCardHeader}>
                      <View style={styles.assignmentBadgeRow}>
                        <View
                          style={[
                            styles.subjectBadge,
                            { backgroundColor: subjStyle.bg, borderColor: subjStyle.color + '35' },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={subjStyle.icon as any}
                            size={12}
                            color={subjStyle.color}
                            style={{ marginRight: 4 }}
                          />
                          <Text
                            numberOfLines={1}
                            style={[styles.subjectBadgeText, { color: subjStyle.color }]}
                          >
                            {subjectName}
                          </Text>
                        </View>
                        <View style={styles.classBadge}>
                          <MaterialCommunityIcons name="school" size={12} color="#475569" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.classBadgeText}>{className}</Text>
                        </View>

                        {/* Badge Guru Pengampu (khusus TU / Staff) */}
                        {(isTu || isStaff || item.guru) && (
                          <View style={styles.cardTeacherBadge}>
                            <MaterialCommunityIcons name="account-tie" size={12} color="#0D9488" style={{ marginRight: 3 }} />
                            <Text numberOfLines={1} style={styles.cardTeacherBadgeText}>
                              {item.guru?.nama_lengkap || item.guru?.nama || item.guru?.name || 'Guru Unit'}
                            </Text>
                          </View>
                        )}

                        {/* Badge Jenis Tugas (Tugas, Kuis, Proyek) */}
                        <View
                          style={[
                            styles.cardTaskTypeBadge,
                            { backgroundColor: jenisBadgeConfig.bg, borderColor: jenisBadgeConfig.border },
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={jenisBadgeConfig.icon as any}
                            size={11}
                            color={jenisBadgeConfig.text}
                            style={{ marginRight: 3 }}
                          />
                          <Text style={[styles.cardTaskTypeBadgeText, { color: jenisBadgeConfig.text }]}>
                            {jenisBadgeConfig.label}
                          </Text>
                        </View>

                        {/* 1-Tap Toggle Publish Button (Draf vs Terbit) */}
                        {(isTu || isStaff) ? (
                          <TouchableOpacity
                            activeOpacity={0.75}
                            disabled={submitting}
                            onPress={() => handleTogglePublish(item)}
                            style={[
                              styles.cardTogglePublishBtn,
                              isDraft ? styles.cardTogglePublishBtnDraft : styles.cardTogglePublishBtnLive,
                            ]}
                            accessibilityLabel={isDraft ? "Terbitkan Tugas" : "Jadikan Draf"}
                          >
                            <MaterialCommunityIcons
                              name={isDraft ? "file-upload-outline" : "eye-outline"}
                              size={11}
                              color={isDraft ? "#D97706" : "#047857"}
                              style={{ marginRight: 3 }}
                            />
                            <Text style={[
                              styles.cardTogglePublishBtnText,
                              isDraft ? { color: '#B45309' } : { color: '#047857' },
                            ]}>
                              {isDraft ? 'Terbitkan' : 'Terbit'}
                            </Text>
                          </TouchableOpacity>
                        ) : isDraft ? (
                          <View style={styles.cardDraftBadge}>
                            <MaterialCommunityIcons name="file-document-edit-outline" size={11} color="#64748B" style={{ marginRight: 3 }} />
                            <Text style={styles.cardDraftBadgeText}>Draf</Text>
                          </View>
                        ) : null}
                      </View>
                    </View>

                    <Text numberOfLines={2} style={styles.assignmentTitle}>
                      {item.judul || item.title || 'Tugas Tanpa Judul'}
                    </Text>

                    {/* Chips Metadata: Format Pengumpulan, Lampiran Berkas, Modul Materi, dan Info Kuis */}
                    <View style={styles.assignmentMetaChipsRow}>
                      <View style={styles.assignmentMetaChip}>
                        <MaterialCommunityIcons name="format-list-checks" size={12} color="#64748B" style={{ marginRight: 4 }} />
                        <Text style={styles.assignmentMetaChipText}>{formatJawabanLabel}</Text>
                      </View>

                      {hasAttachment && (
                        <View style={[styles.assignmentMetaChip, styles.assignmentMetaChipAttachment]}>
                          <MaterialCommunityIcons name="paperclip" size={12} color="#0284C7" style={{ marginRight: 3 }} />
                          <Text style={[styles.assignmentMetaChipText, { color: '#0369A1', fontWeight: '700' }]}>Ada Berkas</Text>
                        </View>
                      )}

                      {jenis === 'quiz' && (item.durasi_menit || item.nilai_kkm) && (
                        <View style={[styles.assignmentMetaChip, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}>
                          <MaterialCommunityIcons name="timer-outline" size={12} color="#7C3AED" style={{ marginRight: 3 }} />
                          <Text style={[styles.assignmentMetaChipText, { color: '#6D28D9', fontWeight: '700' }]}>
                            {item.durasi_menit ? `${item.durasi_menit}m` : ''}
                            {item.durasi_menit && item.nilai_kkm ? ' · ' : ''}
                            {item.nilai_kkm ? `KKM ${item.nilai_kkm}` : ''}
                          </Text>
                        </View>
                      )}

                      {materiJudul ? (
                        <View style={[styles.assignmentMetaChip, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                          <MaterialCommunityIcons name="book-open-outline" size={12} color="#059669" style={{ marginRight: 3 }} />
                          <Text numberOfLines={1} style={[styles.assignmentMetaChipText, { color: '#047857', maxWidth: 140 }]}>
                            {materiJudul}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {(item.instruksi || item.deskripsi) ? (
                      <Text numberOfLines={2} style={styles.assignmentInstruction}>
                        {item.instruksi || item.deskripsi}
                      </Text>
                    ) : null}

                    <View
                      style={[
                        styles.assignmentFooter,
                        {
                          backgroundColor: subjStyle.bg,
                          borderTopColor: subjStyle.color + '25',
                          borderTopWidth: 1.2,
                          marginHorizontal: -14,
                          marginBottom: -14,
                          paddingHorizontal: 14,
                          paddingVertical: 10,
                          borderBottomLeftRadius: 18,
                          borderBottomRightRadius: 18,
                        },
                      ]}
                    >
                      <View style={styles.deadlineBox}>
                        <MaterialCommunityIcons name="clock-outline" size={14} color={subjStyle.color} style={{ marginRight: 4 }} />
                        <Text
                          numberOfLines={1}
                          style={[styles.deadlineText, { color: subjStyle.color, fontWeight: '700' }]}
                        >
                          Tenggat: {deadlineStr}
                        </Text>
                      </View>

                      <View style={styles.footerActionGroup}>
                        {(!isPrincipal || isTeacher) && (
                          <>
                            <TouchableOpacity
                              activeOpacity={0.75}
                              onPress={() => handleOpenEditAssignment(item)}
                              style={styles.editIconButton}
                              accessibilityLabel="Ubah Tugas"
                            >
                              <MaterialCommunityIcons name="pencil-outline" size={15} color="#0284C7" />
                            </TouchableOpacity>

                            <TouchableOpacity
                              activeOpacity={0.75}
                              onPress={() => handleDeleteAssignment(item)}
                              style={styles.deleteIconButton}
                              accessibilityLabel="Hapus Tugas"
                            >
                              <MaterialCommunityIcons name="trash-can-outline" size={15} color="#E11D48" />
                            </TouchableOpacity>
                          </>
                        )}

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            setSelectedAssignmentFilter(String(item.id));
                            setActiveTab('submissions');
                          }}
                          style={[styles.viewSubmissionsBtn, { backgroundColor: subjStyle.color }]}
                        >
                          <MaterialCommunityIcons name="file-check-outline" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.viewSubmissionsBtnText}>
                            Periksa ({submissionCount})
                          </Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            filteredSubmissions.length === 0 ? (
              <EmptyStateCard
                icon="account-clock-outline"
                title="Belum Ada Kiriman Tugas"
                description="Santri belum mengumpulkan jawaban pada penugasan yang dipilih."
              />
            ) : (
              filteredSubmissions.map((sub, idx) => {
                const studentName = sub.student?.nama_lengkap || sub.student?.full_name || sub.santri?.nama_lengkap || 'Santri';
                const nis = sub.student?.nis || sub.student?.nisn || sub.santri?.nis || '—';
                const taskTitle = sub.penugasan?.judul || sub.assignment?.title || 'Tugas';
                const isGraded = sub.status === 'dinilai' || sub.status === 'graded' || (sub.nilai_guru !== null && sub.nilai_guru !== undefined);
                const score = sub.nilai_guru ?? sub.nilai ?? '—';
                const submittedAt = sub.created_at ? new Date(sub.created_at).toLocaleDateString('id-ID', {
                  day: 'numeric',
                  month: 'short',
                  hour: '2-digit',
                  minute: '2-digit',
                }) : '—';

                return (
                  <View key={sub.id || idx} style={styles.submissionCard}>
                    <View style={styles.submissionTopRow}>
                      <View style={styles.submissionStudentCol}>
                        <Text numberOfLines={1} style={styles.submissionStudentName}>{studentName}</Text>
                        <Text numberOfLines={1} style={styles.submissionStudentMeta}>NIS: {nis} · {taskTitle}</Text>
                      </View>

                      <View style={[styles.statusPill, isGraded ? styles.statusPillGraded : styles.statusPillPending]}>
                        <MaterialCommunityIcons
                          name={isGraded ? 'check-circle' : 'clock-alert-outline'}
                          size={12}
                          color={isGraded ? '#059669' : '#D97706'}
                          style={{ marginRight: 4 }}
                        />
                        <Text numberOfLines={1} style={[styles.statusPillText, isGraded ? styles.statusPillTextGraded : styles.statusPillTextPending]}>
                          {isGraded ? `Nilai: ${score}` : 'Perlu Dinilai'}
                        </Text>
                      </View>
                    </View>

                    {/* Submission Text or File */}
                    {sub.jawaban_teks ? (
                      <View style={styles.answerTextBox}>
                        <Text numberOfLines={3} style={styles.answerText}>
                          "{sub.jawaban_teks}"
                        </Text>
                      </View>
                    ) : null}

                    {/* Metadata Pengumpulan (Metode Tahfizh / Anggota Kelompok) */}
                    {(sub.metadata?.tahfizh_mode || sub.metadata?.group_members) && (
                      <View style={{ backgroundColor: '#F8FAFC', borderRadius: 8, padding: 8, marginVertical: 4, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        {sub.metadata?.tahfizh_mode && (
                          <Text style={{ fontSize: 11, color: '#047857', fontWeight: '700' }}>
                            Metode: {sub.metadata.tahfizh_mode === 'langsung' ? 'Setoran Tatap Muka di Kelas' : sub.metadata.tahfizh_mode === 'audio' ? 'Rekaman Audio Suara' : 'Tautan Video'}
                          </Text>
                        )}
                        {sub.metadata?.group_members && (
                          <Text style={{ fontSize: 11, color: '#3730A3', fontWeight: '600', marginTop: 2 }}>
                            Anggota: {sub.metadata.group_members}
                          </Text>
                        )}
                      </View>
                    )}

                    {/* Tombol Pratinjau Berkas & Tautan Santri (In-App Embed Modal) */}
                    {(sub.file_path || sub.file_url || sub.url_link) ? (
                      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginVertical: 5 }}>
                        {(sub.file_path || sub.file_url) ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => handleOpenEmbedUrl(sub.file_path || sub.file_url, `Berkas: ${studentName}`)}
                            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
                          >
                            <MaterialCommunityIcons name="paperclip" size={13} color="#059669" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#047857' }}>Lihat Berkas (In-App)</Text>
                          </TouchableOpacity>
                        ) : null}
                        {sub.url_link ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => handleOpenEmbedUrl(sub.url_link, `Tautan: ${studentName}`)}
                            style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8 }}
                          >
                            <MaterialCommunityIcons name="link-variant" size={13} color="#2563EB" style={{ marginRight: 4 }} />
                            <Text style={{ fontSize: 11, fontWeight: '700', color: '#1D4ED8' }}>Buka Tautan (In-App)</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    ) : null}

                    {sub.catatan_guru ? (
                      <View style={styles.teacherNoteBox}>
                        <Text style={styles.teacherNoteLabel}>Catatan Guru:</Text>
                        <Text numberOfLines={2} style={styles.teacherNoteText}>{sub.catatan_guru}</Text>
                      </View>
                    ) : null}

                    <View style={styles.submissionBottomRow}>
                      <View style={styles.submittedTimeBox}>
                        <MaterialCommunityIcons name="clock-time-four-outline" size={13} color="#94A3B8" style={{ marginRight: 4 }} />
                        <Text numberOfLines={1} style={styles.submittedTimeText}>Dikirim: {submittedAt}</Text>
                      </View>

                      {isPrincipal && !isTeacher ? (
                        <View style={[styles.gradeActionBtn, isGraded ? { backgroundColor: '#059669' } : { backgroundColor: '#F59E0B' }]}>
                          <MaterialCommunityIcons name={isGraded ? "check-circle" : "clock-outline"} size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.gradeActionBtnText}>
                            {isGraded ? `Nilai: ${sub.nilai_guru ?? sub.nilai}` : 'Belum Dinilai'}
                          </Text>
                        </View>
                      ) : (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            setSelectedSubmission(sub);
                            setGradeScore(String(sub.nilai_guru ?? sub.nilai ?? ''));
                            setGradeNotes(String(sub.catatan_guru ?? ''));
                            setGradeModalVisible(true);
                          }}
                          style={[styles.gradeActionBtn, isGraded && { backgroundColor: '#059669' }]}
                        >
                          <MaterialCommunityIcons name={isGraded ? "pencil-box-outline" : "star-outline"} size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.gradeActionBtnText}>
                            {isGraded ? 'Ubah Nilai' : 'Beri Nilai'}
                          </Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  </View>
                );
              })
            )
          )}
        </View>
      </Animated.ScrollView>

      {/* 4. Modal Buat / Edit Tugas (Popup Modal Serasi dengan Bahan Ajar & Modul) */}
      <Modal
        visible={createModalVisible}
        animationType="slide"
        transparent={true}
        onRequestClose={() => {
          setCreateModalVisible(false);
          setEditingAssignment(null);
        }}
      >
        <View style={styles.modalOverlay}>
          <View style={styles.modalContentNoPad}>
            {/* Header Berwarna Gradasi Emerald Sesuai Modal Bahan Ajar & Modul */}
            <View style={styles.modalHeaderColored}>
              <LinearGradient
                colors={['#047857', '#059669', '#10B981']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={StyleSheet.absoluteFill}
              />
              <View style={styles.modalHeaderDecorCircle1} />
              <View style={styles.modalHeaderDecorCircle2} />
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={styles.modalHeaderSubjectBadge}>
                  <MaterialCommunityIcons name="shield-check" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.modalHeaderSubjectBadgeText}>PORTAL GURU SIT</Text>
                </View>
                <Text style={styles.modalTitleWhite}>
                  {editingAssignment ? 'Ubah Penugasan Santri ✏️' : 'Terbitkan Tugas Baru ✨'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setCreateModalVisible(false);
                  setEditingAssignment(null);
                }}
                style={styles.modalCloseBtnWhite}
                accessibilityLabel="Tutup"
              >
                <MaterialCommunityIcons name="close" size={18} color="#047857" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={[styles.modalBody, { paddingHorizontal: 18, paddingTop: 14 }]}
              contentContainerStyle={{ paddingBottom: 24 }}
              showsVerticalScrollIndicator={false}
              keyboardShouldPersistTaps="handled"
            >
              {/* 1. Pemilihan 8 Jenis Penugasan */}
              <Text style={styles.formLabel}>Jenis Penugasan *</Text>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 12 }}>
                {[
                  { key: 'tertulis', label: 'Tertulis', icon: 'lead-pencil', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' },
                  { key: 'quiz', label: 'Kuis CBT', icon: 'lightning-bolt', color: '#7C3AED', bg: '#F5F3FF', border: '#DDD6FE' },
                  { key: 'esai', label: 'Esai', icon: 'text-box-outline', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' },
                  { key: 'dokumen', label: 'Dokumen', icon: 'file-pdf-box', color: '#DC2626', bg: '#FEF2F2', border: '#FECDD3' },
                  { key: 'praktik', label: 'Praktik', icon: 'video-outline', color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' },
                  { key: 'tahfizh', label: 'Tahfizh', icon: 'book-open-variant', color: '#0D9488', bg: '#F0FDFA', border: '#99F6E4' },
                  { key: 'literasi', label: 'Literasi', icon: 'book-outline', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' },
                  { key: 'proyek', label: 'Proyek', icon: 'account-group', color: '#4F46E5', bg: '#EEF2FF', border: '#C7D2FE' },
                ].map((item) => {
                  const isSelected = formJenisTugas === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      activeOpacity={0.8}
                      onPress={() => setFormJenisTugas(item.key)}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        paddingHorizontal: 10,
                        paddingVertical: 7,
                        borderRadius: 10,
                        borderWidth: 1.5,
                        borderColor: isSelected ? item.color : '#E2E8F0',
                        backgroundColor: isSelected ? item.bg : '#FFFFFF',
                      }}
                    >
                      <MaterialCommunityIcons
                        name={item.icon as any}
                        size={14}
                        color={isSelected ? item.color : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={{
                          fontSize: 11,
                          fontWeight: isSelected ? '800' : '600',
                          color: isSelected ? item.color : '#475569',
                        }}
                      >
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Dynamic Settings per Jenis Tugas */}
              {formJenisTugas === 'tahfizh' && (
                <View style={{ backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#059669" />
                    <Text style={{ fontSize: 12, fontWeight: '800', color: '#065F46' }}>Target Setoran Tahfizh Al-Qur'an:</Text>
                  </View>
                  <Text style={styles.formSubLabel}>Nama Surah Target</Text>
                  <TextInput
                    value={formSurah}
                    onChangeText={setFormSurah}
                    placeholder="Contoh: Al-Mulk, An-Naba', Al-Kahfi..."
                    placeholderTextColor="#94A3B8"
                    style={[styles.formInput, { marginBottom: 8 }]}
                  />
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formSubLabel}>Ayat Awal</Text>
                      <TextInput
                        value={formAyatAwal}
                        onChangeText={setFormAyatAwal}
                        placeholder="1"
                        keyboardType="numeric"
                        placeholderTextColor="#94A3B8"
                        style={styles.formInput}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formSubLabel}>Ayat Akhir</Text>
                      <TextInput
                        value={formAyatAkhir}
                        onChangeText={setFormAyatAkhir}
                        placeholder="30"
                        keyboardType="numeric"
                        placeholderTextColor="#94A3B8"
                        style={styles.formInput}
                      />
                    </View>
                  </View>
                </View>
              )}

              {formJenisTugas === 'esai' && (
                <View style={{ backgroundColor: '#F0F9FF', borderWidth: 1.5, borderColor: '#BAE6FD', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#0369A1', marginBottom: 6 }}>Pengaturan Esai:</Text>
                  <Text style={styles.formSubLabel}>Batas Minimal Kata</Text>
                  <TextInput
                    value={formMinWords}
                    onChangeText={setFormMinWords}
                    placeholder="Contoh: 150"
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                    style={styles.formInput}
                  />
                </View>
              )}

              {formJenisTugas === 'proyek' && (
                <View style={{ backgroundColor: '#EEF2FF', borderWidth: 1.5, borderColor: '#C7D2FE', borderRadius: 12, padding: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#3730A3', marginBottom: 6 }}>Pengaturan Kelompok:</Text>
                  <Text style={styles.formSubLabel}>Maksimal Anggota per Kelompok</Text>
                  <TextInput
                    value={formMaxGroupMembers}
                    onChangeText={setFormMaxGroupMembers}
                    placeholder="Contoh: 4 atau 5 siswa"
                    keyboardType="numeric"
                    placeholderTextColor="#94A3B8"
                    style={styles.formInput}
                  />
                </View>
              )}

              {/* 2. Pemilihan Guru Pengampu, Kelas Sasaran, dan Mapel (Khusus TU / Staff vs Guru Biasa) */}
              {isTu || isStaff ? (
                <>
                  <Text style={styles.formLabel}>Guru Pengampu *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowGuruPickerModal(true)}
                    style={styles.formDropdownTrigger}
                  >
                    <View style={styles.formDropdownTriggerLeft}>
                      <View style={[styles.dropdownIconCircle, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <MaterialCommunityIcons name="account-tie" size={16} color="#047857" />
                      </View>
                      <View style={styles.dropdownLabelCol}>
                        <Text style={styles.dropdownSubLabel}>Pengampu Tugas</Text>
                        <Text style={styles.dropdownMainLabel} numberOfLines={1}>
                          {currentFormGuruLabel}
                        </Text>
                      </View>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#047857" />
                  </TouchableOpacity>

                  <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.formLabel}>Kelas Sasaran *</Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setShowClassPickerModal(true)}
                        style={styles.formDropdownTrigger}
                      >
                        <View style={styles.formDropdownTriggerLeft}>
                          <View style={styles.dropdownIconCircle}>
                            <MaterialCommunityIcons name="school" size={16} color="#047857" />
                          </View>
                          <View style={styles.dropdownLabelCol}>
                            <Text style={styles.dropdownSubLabel}>Kelas</Text>
                            <Text style={styles.dropdownMainLabel} numberOfLines={1}>
                              {currentFormClassLabel}
                            </Text>
                          </View>
                        </View>
                        <MaterialCommunityIcons name="chevron-down" size={18} color="#047857" />
                      </TouchableOpacity>
                    </View>

                    <View style={{ flex: 1.2 }}>
                      <Text style={styles.formLabel}>Mata Pelajaran *</Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setShowSubjectPickerModal(true)}
                        style={styles.formDropdownTrigger}
                      >
                        <View style={styles.formDropdownTriggerLeft}>
                          <View style={[styles.dropdownIconCircle, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                            <MaterialCommunityIcons name="book-open-outline" size={16} color="#2563EB" />
                          </View>
                          <View style={styles.dropdownLabelCol}>
                            <Text style={styles.dropdownSubLabel}>Mapel</Text>
                            <Text style={styles.dropdownMainLabel} numberOfLines={1}>
                              {currentFormSubjectLabel}
                            </Text>
                          </View>
                        </View>
                        <MaterialCommunityIcons name="chevron-down" size={18} color="#2563EB" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Tipe Penugasan: Individu vs Kelompok */}
                  <Text style={[styles.formLabel, { marginTop: 10 }]}>Format Kelompok / Individu *</Text>
                  <View style={styles.formTaskTypeGroup}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setFormTipe('individu')}
                      style={[styles.formTaskTypeBtn, formTipe === 'individu' && styles.formTaskTypeBtnActiveEmerald]}
                    >
                      <MaterialCommunityIcons
                        name="account-outline"
                        size={15}
                        color={formTipe === 'individu' ? '#047857' : '#64748B'}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.formTaskTypeBtnText, formTipe === 'individu' && styles.formTaskTypeBtnTextActiveEmerald]}>
                        Tugas Individu
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setFormTipe('kelompok')}
                      style={[styles.formTaskTypeBtn, formTipe === 'kelompok' && styles.formTaskTypeBtnActiveAmber]}
                    >
                      <MaterialCommunityIcons
                        name="account-group-outline"
                        size={15}
                        color={formTipe === 'kelompok' ? '#D97706' : '#64748B'}
                        style={{ marginRight: 5 }}
                      />
                      <Text style={[styles.formTaskTypeBtnText, formTipe === 'kelompok' && styles.formTaskTypeBtnTextActiveAmber]}>
                        Tugas Kelompok
                      </Text>
                    </TouchableOpacity>
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.formLabel}>Pilih Rombel & Mata Pelajaran *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowFormScheduleDropdown(true)}
                    style={styles.formDropdownTrigger}
                  >
                    <View style={styles.formDropdownTriggerLeft}>
                      <View style={styles.dropdownIconCircle}>
                        <MaterialCommunityIcons name="google-classroom" size={16} color="#047857" />
                      </View>
                      <View style={styles.dropdownLabelCol}>
                        <Text style={styles.dropdownSubLabel}>Rombel Sasaran</Text>
                        <Text style={styles.dropdownMainLabel} numberOfLines={1}>
                          {currentFormScheduleLabel}
                        </Text>
                      </View>
                    </View>
                    <MaterialCommunityIcons
                      name="chevron-down"
                      size={20}
                      color="#047857"
                    />
                  </TouchableOpacity>
                </>
              )}

              {/* 3. Tautkan Modul Materi Belajar (Opsional) */}
              <Text style={styles.formLabel}>Tautkan Materi Belajar (Opsional)</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowMateriPickerModal(true)}
                style={styles.formDropdownTrigger}
              >
                <View style={styles.formDropdownTriggerLeft}>
                  <View style={[styles.dropdownIconCircle, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                    <MaterialCommunityIcons name="book-open-page-variant-outline" size={16} color="#059669" />
                  </View>
                  <View style={styles.dropdownLabelCol}>
                    <Text style={styles.dropdownSubLabel}>Referensi Modul Santri</Text>
                    <Text style={styles.dropdownMainLabel} numberOfLines={1}>
                      {selectedMateriLabel}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color="#059669"
                />
              </TouchableOpacity>

              {/* 4. Judul Penugasan */}
              <Text style={styles.formLabel}>Judul Penugasan *</Text>
              <TextInput
                placeholder="Contoh: Tugas Rangkuman Bab 3 Fiqih Shalat"
                placeholderTextColor="#94A3B8"
                value={formTitle}
                onChangeText={setFormTitle}
                style={styles.formInput}
              />

              {/* 5. Format Pengumpulan Jawaban Santri */}
              <Text style={styles.formLabel}>Format Pengumpulan Santri *</Text>
              <View style={styles.formSubmissionTypeRow}>
                {[
                  { key: 'both', label: 'Teks & Berkas', icon: 'file-document-edit-outline', desc: 'Bebas ketik jawaban atau lampirkan berkas' },
                  { key: 'online', label: 'Teks Online Saja', icon: 'keyboard-outline', desc: 'Santri hanya mengetik jawaban di aplikasi' },
                  { key: 'upload', label: 'Unggah Berkas Saja', icon: 'file-upload-outline', desc: 'Wajib mengunggah berkas PDF atau gambar' },
                ].map((fmt) => {
                  const isActive = formTipeJawaban === fmt.key;
                  return (
                    <TouchableOpacity
                      key={fmt.key}
                      activeOpacity={0.8}
                      onPress={() => setFormTipeJawaban(fmt.key as any)}
                      style={[styles.formFmtCard, isActive && styles.formFmtCardActive]}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                        <MaterialCommunityIcons
                          name={fmt.icon as any}
                          size={15}
                          color={isActive ? '#047857' : '#64748B'}
                          style={{ marginRight: 6 }}
                        />
                        <Text style={[styles.formFmtCardTitle, isActive && styles.formFmtCardTitleActive]}>
                          {fmt.label}
                        </Text>
                      </View>
                      <Text style={styles.formFmtCardDesc} numberOfLines={1}>{fmt.desc}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* 6. Lampiran Dokumen / Lembar Soal Guru */}
              <Text style={styles.formLabel}>Lampiran Dokumen / Lembar Soal (Opsional)</Text>
              {pickedAttachment ? (
                <View style={styles.pickedFileBox}>
                  <View style={styles.pickedFileLeft}>
                    <View style={styles.pickedFileIconBadge}>
                      <MaterialCommunityIcons name="file-pdf-box" size={20} color="#0284C7" />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text numberOfLines={1} style={styles.pickedFileName}>{pickedAttachment.name}</Text>
                      <Text style={styles.pickedFileSize}>
                        {pickedAttachment.size ? `${(pickedAttachment.size / 1024).toFixed(1)} KB` : 'Dokumen Baru Terpilih'}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => setPickedAttachment(null)}
                    style={styles.pickedFileRemoveBtn}
                    accessibilityLabel="Hapus Dokumen"
                  >
                    <MaterialCommunityIcons name="trash-can-outline" size={17} color="#E11D48" />
                  </TouchableOpacity>
                </View>
              ) : existingFileUrl ? (
                <View style={styles.pickedFileBox}>
                  <View style={styles.pickedFileLeft}>
                    <View style={[styles.pickedFileIconBadge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                      <MaterialCommunityIcons name="file-check-outline" size={20} color="#059669" />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text numberOfLines={1} style={styles.pickedFileName}>Berkas Lampiran Tersimpan</Text>
                      <Text style={styles.pickedFileSize}>Klik 'Ganti Berkas' untuk mengganti dokumen</Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handlePickAttachment}
                    style={styles.pickedFileChangeBtn}
                  >
                    <Text style={styles.pickedFileChangeBtnText}>Ganti</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePickAttachment}
                  style={styles.formUploadBtn}
                >
                  <MaterialCommunityIcons name="cloud-upload-outline" size={22} color="#047857" style={{ marginRight: 10 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formUploadBtnTitle}>Pilih Berkas Lampiran / Lembar Soal</Text>
                    <Text style={styles.formUploadBtnSubtitle}>Mendukung PDF, Word (DOCX), atau Foto Soal</Text>
                  </View>
                </TouchableOpacity>
              )}

              {/* 7. Pengaturan Khusus Kuis Santri */}
              {formJenisTugas === 'quiz' && (
                <View style={styles.quizConfigCard}>
                  <View style={styles.quizConfigHeader}>
                    <MaterialCommunityIcons name="lightning-bolt" size={16} color="#7C3AED" style={{ marginRight: 6 }} />
                    <Text style={styles.quizConfigTitle}>Pengaturan Khusus Kuis Santri</Text>
                  </View>
                  <View style={{ flexDirection: 'row', gap: 12 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quizConfigFieldLabel}>Durasi Pengerjaan (Menit)</Text>
                      <TextInput
                        placeholder="Contoh: 45"
                        placeholderTextColor="#94A3B8"
                        value={formDurasiMenit}
                        onChangeText={setFormDurasiMenit}
                        keyboardType="numeric"
                        style={styles.quizConfigInput}
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.quizConfigFieldLabel}>Nilai KKM Minimal</Text>
                      <TextInput
                        placeholder="Contoh: 75"
                        placeholderTextColor="#94A3B8"
                        value={formNilaiKkm}
                        onChangeText={setFormNilaiKkm}
                        keyboardType="numeric"
                        style={styles.quizConfigInput}
                      />
                    </View>
                  </View>
                </View>
              )}

              {/* 8. Instruksi Pengerjaan */}
              <Text style={styles.formLabel}>Instruksi Pengerjaan *</Text>
              <TextInput
                placeholder="Tuliskan petunjuk pengerjaan soal secara rinci..."
                placeholderTextColor="#94A3B8"
                value={formInstruction}
                onChangeText={setFormInstruction}
                multiline
                numberOfLines={4}
                style={[styles.formInput, { height: 85, textAlignVertical: 'top' }]}
              />

              {/* ── 8B. FORM BUTIR SOAL (BANK-SOAL BUILDER) ── */}
              <View style={styles.soalBuilderCard}>
                {/* Header Builder */}
                <View style={styles.soalBuilderHeader}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                      <View style={styles.soalBuilderIconBadge}>
                        <Text style={styles.soalBuilderIconBadgeText}>S</Text>
                      </View>
                      <Text style={styles.soalBuilderTitle}>Form Butir Soal</Text>
                    </View>
                    <Text style={styles.soalBuilderSubtitle}>
                      Tambahkan butir soal satu per satu (PG, Essay, Benar/Salah, Menjodohkan).
                    </Text>
                  </View>
                  {editingSoalIdx !== null && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={resetSoalForm}
                      style={styles.cancelEditSoalBtn}
                    >
                      <Text style={styles.cancelEditSoalBtnText}>✕ Batal Edit #{editingSoalIdx + 1}</Text>
                    </TouchableOpacity>
                  )}
                </View>

                <View style={{ padding: 14 }}>
                  {/* Auto-Tipe Suggestion Badge */}
                  {editingSoalIdx === null && (
                    <View style={styles.autoTypeBadgeBox}>
                      <Text style={styles.autoTypeBadgeText}>
                        ✨ Soal #{soalList.length + 1}: Disarankan{' '}
                        <Text style={{ fontWeight: '800' }}>
                          {getAutoTipe(soalList.length) === 'pg' ? '🔘 Pilihan Ganda' : '📝 Essay / Esai'}
                        </Text>
                      </Text>
                    </View>
                  )}

                  {/* Pilihan 4 Tipe Soal */}
                  <Text style={[styles.formLabel, { marginTop: 4, marginBottom: 8 }]}>Pilih Tipe Soal *</Text>
                  <View style={styles.soalTypeGrid}>
                    {[
                      { id: 'pg', label: 'Pilihan Ganda', icon: 'radiobox-marked', emoji: '🔘' },
                      { id: 'esai', label: 'Essay / Esai', icon: 'text-box-outline', emoji: '📝' },
                      { id: 'benar_salah', label: 'Benar / Salah', icon: 'toggle-switch-outline', emoji: '✅' },
                      { id: 'menjodohkan', label: 'Menjodohkan', icon: 'swap-horizontal-bold', emoji: '🔗' },
                    ].map((t) => {
                      const isSelected = soalForm.tipe === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          activeOpacity={0.8}
                          onPress={() => handleSoalTypeChange(t.id as any)}
                          style={[styles.soalTypeCard, isSelected && styles.soalTypeCardActive]}
                        >
                          <Text style={{ fontSize: 16, marginRight: 6 }}>{t.emoji}</Text>
                          <Text style={[styles.soalTypeCardLabel, isSelected && styles.soalTypeCardLabelActive]}>
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>

                  {/* Teks Pertanyaan */}
                  <Text style={[styles.formLabel, { marginTop: 10 }]}>Teks Pertanyaan / Soal *</Text>
                  <TextInput
                    placeholder="Tuliskan butir soal atau teks pertanyaan di sini..."
                    placeholderTextColor="#94A3B8"
                    value={soalForm.pertanyaan}
                    onChangeText={(txt) => setSoalForm((p) => ({ ...p, pertanyaan: txt }))}
                    multiline
                    numberOfLines={3}
                    style={[styles.formInput, { height: 75, textAlignVertical: 'top', marginBottom: 12 }]}
                  />

                  {/* Opsi Dinamis: Pilihan Ganda */}
                  {soalForm.tipe === 'pg' && (
                    <View style={styles.dynamicSoalBoxPg}>
                      <Text style={styles.dynamicSoalBoxTitle}>Opsi Jawaban & Kunci PG (Klik bulatan huruf untuk set kunci)</Text>
                      {(['a', 'b', 'c', 'd', 'e'] as const).map((opt) => {
                        const optKey = opt.toUpperCase();
                        const isCorrect = soalForm.kunci_jawaban === optKey;
                        const fieldName = `opsi_${opt}` as 'opsi_a' | 'opsi_b' | 'opsi_c' | 'opsi_d' | 'opsi_e';
                        return (
                          <View key={opt} style={styles.pgOptionRow}>
                            <TouchableOpacity
                              activeOpacity={0.75}
                              onPress={() => setSoalForm((p) => ({ ...p, kunci_jawaban: optKey }))}
                              style={[styles.pgKeyRadioBtn, isCorrect && styles.pgKeyRadioBtnActive]}
                            >
                              <Text style={[styles.pgKeyRadioText, isCorrect && styles.pgKeyRadioTextActive]}>
                                {optKey}
                              </Text>
                            </TouchableOpacity>
                            <TextInput
                              placeholder={`Teks Opsi ${optKey}${opt === 'a' || opt === 'b' ? ' (Wajib)' : ' (Opsional)'}`}
                              placeholderTextColor="#94A3B8"
                              value={soalForm[fieldName]}
                              onChangeText={(val) => setSoalForm((p) => ({ ...p, [fieldName]: val }))}
                              style={styles.pgOptionInput}
                            />
                          </View>
                        );
                      })}
                    </View>
                  )}

                  {/* Opsi Dinamis: Essay */}
                  {soalForm.tipe === 'esai' && (
                    <View style={styles.dynamicSoalBoxEsai}>
                      <Text style={[styles.dynamicSoalBoxTitle, { color: '#6D28D9' }]}>
                        Pedoman Penskoran / Kunci Acuan Jawaban Essay
                      </Text>
                      <TextInput
                        placeholder="Tuliskan kunci acuan, poin penting, atau kata kunci jawaban siswa..."
                        placeholderTextColor="#94A3B8"
                        value={soalForm.kunci_jawaban}
                        onChangeText={(val) => setSoalForm((p) => ({ ...p, kunci_jawaban: val }))}
                        multiline
                        numberOfLines={3}
                        style={[styles.formInput, { height: 70, textAlignVertical: 'top', backgroundColor: '#FFFFFF', marginBottom: 0 }]}
                      />
                    </View>
                  )}

                  {/* Opsi Dinamis: Benar / Salah */}
                  {soalForm.tipe === 'benar_salah' && (
                    <View style={styles.dynamicSoalBoxBs}>
                      <Text style={[styles.dynamicSoalBoxTitle, { color: '#1D4ED8' }]}>
                        Kunci Jawaban Benar / Salah
                      </Text>
                      <View style={{ flexDirection: 'row', gap: 10 }}>
                        {['Benar', 'Salah'].map((val) => {
                          const isKey = soalForm.kunci_jawaban === val;
                          return (
                            <TouchableOpacity
                              key={val}
                              activeOpacity={0.8}
                              onPress={() => setSoalForm((p) => ({ ...p, kunci_jawaban: val }))}
                              style={[styles.bsOptionBtn, isKey && styles.bsOptionBtnActive]}
                            >
                              <Text style={{ fontSize: 16, marginRight: 6 }}>{val === 'Benar' ? '✅' : '❌'}</Text>
                              <Text style={[styles.bsOptionText, isKey && styles.bsOptionTextActive]}>
                                {val}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  )}

                  {/* Opsi Dinamis: Menjodohkan */}
                  {soalForm.tipe === 'menjodohkan' && (
                    <View style={styles.dynamicSoalBoxJodoh}>
                      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                        <Text style={[styles.dynamicSoalBoxTitle, { color: '#B45309', marginBottom: 0 }]}>
                          Pasangan Menjodohkan
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => setSoalForm((p) => ({
                            ...p,
                            matchingPairs: [...p.matchingPairs, { kiri: '', kanan: '' }],
                          }))}
                          style={styles.addPairBtn}
                        >
                          <Text style={styles.addPairBtnText}>+ Pasangan</Text>
                        </TouchableOpacity>
                      </View>
                      {soalForm.matchingPairs.map((pair, idx) => (
                        <View key={idx} style={styles.pairRow}>
                          <Text style={styles.pairNumberText}>{idx + 1}.</Text>
                          <TextInput
                            placeholder="Item Kiri"
                            placeholderTextColor="#94A3B8"
                            value={pair.kiri}
                            onChangeText={(t) => {
                              const updated = soalForm.matchingPairs.map((mp, i) => i === idx ? { ...mp, kiri: t } : mp);
                              setSoalForm((p) => ({ ...p, matchingPairs: updated }));
                            }}
                            style={styles.pairInput}
                          />
                          <Text style={{ color: '#94A3B8', fontWeight: '700' }}>→</Text>
                          <TextInput
                            placeholder="Item Kanan"
                            placeholderTextColor="#94A3B8"
                            value={pair.kanan}
                            onChangeText={(t) => {
                              const updated = soalForm.matchingPairs.map((mp, i) => i === idx ? { ...mp, kanan: t } : mp);
                              setSoalForm((p) => ({ ...p, matchingPairs: updated }));
                            }}
                            style={styles.pairInput}
                          />
                          {soalForm.matchingPairs.length > 1 && (
                            <TouchableOpacity
                              onPress={() => {
                                const filtered = soalForm.matchingPairs.filter((_, i) => i !== idx);
                                setSoalForm((p) => ({ ...p, matchingPairs: filtered }));
                              }}
                              style={styles.removePairBtn}
                            >
                              <MaterialCommunityIcons name="close" size={16} color="#E11D48" />
                            </TouchableOpacity>
                          )}
                        </View>
                      ))}
                    </View>
                  )}

                  {/* Poin Soal (Default Tingkat Kesulitan: Sedang) */}
                  <View style={{ marginTop: 10 }}>
                    <Text style={styles.formLabel}>Poin Soal</Text>
                    <TextInput
                      placeholder="2"
                      placeholderTextColor="#94A3B8"
                      value={String(soalForm.poin)}
                      onChangeText={(t) => setSoalForm((p) => ({ ...p, poin: parseFloat(t) || 0 }))}
                      keyboardType="numeric"
                      style={styles.formInput}
                    />
                  </View>

                  {/* Tombol Simpan / Perbarui Butir Soal */}
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={handleAddSoal}
                    style={[styles.addSoalSubmitBtn, editingSoalIdx !== null && { backgroundColor: '#D97706' }]}
                  >
                    <MaterialCommunityIcons
                      name={editingSoalIdx !== null ? 'pencil-circle-outline' : 'plus-circle-outline'}
                      size={18}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.addSoalSubmitBtnText}>
                      {editingSoalIdx !== null
                        ? `Perbarui Soal #${editingSoalIdx + 1}`
                        : `Simpan Soal #${soalList.length + 1}`}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* ── Mini List Butir Soal yang Sudah Dimasukkan ── */}
                <View style={styles.soalListTableContainer}>
                  <View style={styles.soalListTableHeader}>
                    <Text style={styles.soalListTableHeaderTitle}>
                      📋 Daftar Soal ({soalList.length} Soal)
                    </Text>
                    {soalList.length > 0 && (
                      <View style={styles.totalPoinBadge}>
                        <Text style={styles.totalPoinBadgeText}>
                          Total Poin: {soalList.reduce((acc, s) => acc + (Number(s.poin) || 0), 0).toFixed(1)}
                        </Text>
                      </View>
                    )}
                  </View>

                  {soalList.length === 0 ? (
                    <View style={styles.emptySoalListBox}>
                      <MaterialCommunityIcons name="clipboard-outline" size={28} color="#94A3B8" />
                      <Text style={styles.emptySoalListText}>
                        Belum ada soal. Isi formulir di atas lalu tekan "Simpan Soal" untuk menambah butir soal.
                      </Text>
                    </View>
                  ) : (
                    <View style={{ padding: 10, gap: 8 }}>
                      {soalList.map((soal, idx) => {
                        const tipeBadge = {
                          pg: { bg: '#ECFDF5', border: '#A7F3D0', text: '#047857', label: '🔘 PG' },
                          esai: { bg: '#F5F3FF', border: '#DDD6FE', text: '#7C3AED', label: '📝 Essay' },
                          benar_salah: { bg: '#EFF6FF', border: '#BFDBFE', text: '#1D4ED8', label: '✅ B/S' },
                          menjodohkan: { bg: '#FFFBEB', border: '#FDE68A', text: '#D97706', label: '🔗 Jodoh' },
                        }[soal.tipe] || { bg: '#F1F5F9', border: '#CBD5E1', text: '#475569', label: soal.tipe };

                        const isEditing = editingSoalIdx === idx;
                        return (
                          <View
                            key={idx}
                            style={[
                              styles.soalItemCard,
                              isEditing && { borderColor: '#D97706', backgroundColor: '#FFFBEB' },
                            ]}
                          >
                            <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                              <View style={styles.soalItemNumBadge}>
                                <Text style={styles.soalItemNumText}>{idx + 1}</Text>
                              </View>
                              <View style={{ flex: 1 }}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                                  <View style={[styles.soalItemTypeBadge, { backgroundColor: tipeBadge.bg, borderColor: tipeBadge.border }]}>
                                    <Text style={[styles.soalItemTypeBadgeText, { color: tipeBadge.text }]}>{tipeBadge.label}</Text>
                                  </View>
                                  <Text style={styles.soalItemPoinText}>{soal.poin} Poin</Text>
                                  {soal.kunci_jawaban ? (
                                    <Text style={styles.soalItemKunciText}>Kunci: {soal.kunci_jawaban}</Text>
                                  ) : null}
                                </View>
                                <Text numberOfLines={2} style={styles.soalItemPertanyaanText}>
                                  {soal.pertanyaan}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.soalItemActionRow}>
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => handleEditSoal(idx)}
                                style={styles.editSoalMiniBtn}
                              >
                                <MaterialCommunityIcons name="pencil-outline" size={13} color="#0284C7" />
                                <Text style={styles.editSoalMiniBtnText}>Edit</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                activeOpacity={0.7}
                                onPress={() => handleDeleteSoal(idx)}
                                style={styles.deleteSoalMiniBtn}
                              >
                                <MaterialCommunityIcons name="trash-can-outline" size={13} color="#E11D48" />
                                <Text style={styles.deleteSoalMiniBtnText}>Hapus</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              </View>

              {/* 9. Tenggat Waktu & Tombol Preset Cepat (Format Tanggal Manual YYYY-MM-DD) */}
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 2 }}>
                <Text style={styles.formLabel}>Tenggat Waktu (Format: YYYY-MM-DD) *</Text>
                <View style={styles.deadlinePresetRow}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => applyPresetDeadline(3)}
                    style={styles.deadlinePresetChip}
                  >
                    <Text style={styles.deadlinePresetChipText}>+3 Hari</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => applyPresetDeadline(7)}
                    style={styles.deadlinePresetChip}
                  >
                    <Text style={styles.deadlinePresetChipText}>+1 Minggu</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => applyPresetDeadline(14)}
                    style={styles.deadlinePresetChip}
                  >
                    <Text style={styles.deadlinePresetChipText}>+2 Minggu</Text>
                  </TouchableOpacity>
                </View>
              </View>
              <TextInput
                placeholder="2026-10-05"
                placeholderTextColor="#94A3B8"
                value={formDeadline}
                onChangeText={setFormDeadline}
                style={styles.formInput}
              />

              {/* 10. Toleransi Keterlambatan Pengumpulan */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setFormIzinTerlambat(!formIzinTerlambat)}
                style={styles.formToggleRow}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 10 }}>
                  <View style={[styles.toggleIconCircle, formIzinTerlambat && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <MaterialCommunityIcons
                      name="clock-check-outline"
                      size={18}
                      color={formIzinTerlambat ? '#047857' : '#64748B'}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.toggleRowTitle}>Toleransi Keterlambatan</Text>
                    <Text style={styles.toggleRowDesc}>Izinkan santri tetap kumpul setelah tenggat lewat (ditandai terlambat)</Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name={formIzinTerlambat ? 'toggle-switch' : 'toggle-switch-off-outline'}
                  size={34}
                  color={formIzinTerlambat ? '#047857' : '#94A3B8'}
                />
              </TouchableOpacity>

              {/* 11. Bobot Penilaian, Nilai Maksimal, & Status Publikasi */}
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 4 }}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formLabel}>Bobot (%)</Text>
                  <TextInput
                    placeholder="100"
                    placeholderTextColor="#94A3B8"
                    value={formBobot}
                    onChangeText={setFormBobot}
                    keyboardType="numeric"
                    style={styles.formInput}
                  />
                </View>
                {(isTu || isStaff) && (
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Nilai Maks</Text>
                    <TextInput
                      placeholder="100"
                      placeholderTextColor="#94A3B8"
                      value={formNilaiMaksimal}
                      onChangeText={setFormNilaiMaksimal}
                      keyboardType="numeric"
                      style={styles.formInput}
                    />
                  </View>
                )}
                <View style={{ flex: 1.3 }}>
                  <Text style={styles.formLabel}>Status Publikasi</Text>
                  <View style={styles.formStatusRadioRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setFormStatus('published')}
                      style={[styles.formStatusRadioBtn, formStatus === 'published' && styles.formStatusRadioBtnActive]}
                    >
                      <MaterialCommunityIcons
                        name="send-check-outline"
                        size={13}
                        color={formStatus === 'published' ? '#047857' : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.formStatusRadioText, formStatus === 'published' && styles.formStatusRadioTextActive]}>
                        Terbitkan
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setFormStatus('draft')}
                      style={[styles.formStatusRadioBtn, formStatus === 'draft' && styles.formStatusRadioBtnDraftActive]}
                    >
                      <MaterialCommunityIcons
                        name="file-edit-outline"
                        size={13}
                        color={formStatus === 'draft' ? '#475569' : '#64748B'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.formStatusRadioText, formStatus === 'draft' && styles.formStatusRadioTextDraftActive]}>
                        Draf
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Tombol Simpan Form Dirapikan Sesuai Modal Bahan Ajar */}
            <View style={[styles.formActionsRow, { paddingHorizontal: 18, paddingBottom: Math.max(insets.bottom, 16) + 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => {
                  setCreateModalVisible(false);
                  setEditingAssignment(null);
                }}
                style={styles.formCancelBtn}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={17} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.formCancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSaveAssignment}
                disabled={submitting}
                style={styles.formSubmitBtn}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.formSubmitBtnText}>
                      {editingAssignment ? 'Simpan Perubahan' : 'Terbitkan Tugas'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Pop-up Picker Jadwal Form (Modal Terpisah agar Rapi & Tidak Mengganggu Konten) */}
      <Modal
        visible={showFormScheduleDropdown}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowFormScheduleDropdown(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowFormScheduleDropdown(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={styles.pickerHeaderIconBadge}>
                  <MaterialCommunityIcons name="google-classroom" size={18} color="#047857" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Pilih Rombel & Mapel</Text>
                  <Text style={styles.pickerModalSubtitle}>Tentukan kelas sasaran penugasan</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowFormScheduleDropdown(false)}
                style={styles.pickerCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              {schedules.map((sch) => {
                const isSelected = String(sch.id) === String(formScheduleId);
                const clsName = sch.kelas?.nama_kelas || sch.kelas?.name || 'Kelas';
                const mapelName = sch.subject?.name || sch.subject?.nama_mapel || 'Mapel';
                const subjStyle = getSubjectStyle(mapelName);
                return (
                  <TouchableOpacity
                    key={String(sch.id)}
                    activeOpacity={0.75}
                    onPress={() => {
                      setFormScheduleId(String(sch.id));
                      setShowFormScheduleDropdown(false);
                    }}
                    style={[
                      styles.pickerOptionItem,
                      isSelected && styles.pickerOptionItemActive,
                    ]}
                  >
                    <View style={styles.pickerOptionLeft}>
                      <MaterialCommunityIcons
                        name={isSelected ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={isSelected ? '#047857' : '#94A3B8'}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.pickerOptionText,
                            isSelected && styles.pickerOptionTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {clsName}
                        </Text>
                        <Text style={styles.pickerOptionSubText} numberOfLines={1}>
                          {mapelName}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.pickerSubjectMiniBadge,
                        { backgroundColor: subjStyle.bg },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.pickerSubjectMiniBadgeText, { color: subjStyle.color }]}
                      >
                        {mapelName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* Pop-up Picker Materi Belajar (Tautkan Modul Referensi Guru) */}
      <Modal
        visible={showMateriPickerModal}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowMateriPickerModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowMateriPickerModal(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={[styles.pickerHeaderIconBadge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.pickerModalTitle}>Tautkan Materi Belajar</Text>
                  <Text style={styles.pickerModalSubtitle}>Pilih modul materi sebagai acuan santri</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowMateriPickerModal(false)}
                style={styles.pickerCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              {/* Opsi Tanpa Tautan Modul */}
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  setFormMateriId('');
                  setShowMateriPickerModal(false);
                }}
                style={[
                  styles.pickerOptionItem,
                  !formMateriId && styles.pickerOptionItemActive,
                ]}
              >
                <View style={styles.pickerOptionLeft}>
                  <MaterialCommunityIcons
                    name={!formMateriId ? 'check-circle' : 'circle-outline'}
                    size={18}
                    color={!formMateriId ? '#047857' : '#94A3B8'}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        styles.pickerOptionText,
                        !formMateriId && styles.pickerOptionTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      Tugas Mandiri (Tanpa Modul)
                    </Text>
                    <Text style={styles.pickerOptionSubText} numberOfLines={1}>
                      Tugas berdiri sendiri tanpa referensi materi
                    </Text>
                  </View>
                </View>
              </TouchableOpacity>

              {/* Daftar Materi yang Tersedia */}
              {availableMaterialsForForm.map((m) => {
                const isSelected = String(m.id) === String(formMateriId);
                const judul = m.judul || m.title || 'Materi Belajar';
                const bab = m.bab || m.pertemuan ? `Pertemuan/Bab: ${m.bab || m.pertemuan}` : 'Materi Terbit';
                return (
                  <TouchableOpacity
                    key={String(m.id)}
                    activeOpacity={0.75}
                    onPress={() => {
                      setFormMateriId(String(m.id));
                      setShowMateriPickerModal(false);
                    }}
                    style={[
                      styles.pickerOptionItem,
                      isSelected && styles.pickerOptionItemActive,
                    ]}
                  >
                    <View style={styles.pickerOptionLeft}>
                      <MaterialCommunityIcons
                        name={isSelected ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={isSelected ? '#047857' : '#94A3B8'}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.pickerOptionText,
                            isSelected && styles.pickerOptionTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {judul}
                        </Text>
                        <Text style={styles.pickerOptionSubText} numberOfLines={1}>
                          {bab}
                        </Text>
                      </View>
                    </View>
                    <View style={[styles.pickerSubjectMiniBadge, { backgroundColor: '#ECFDF5' }]}>
                      <Text style={[styles.pickerSubjectMiniBadgeText, { color: '#047857' }]}>
                        Modul
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* 5. Modal Beri Nilai Siswa */}
      <Modal
        visible={gradeModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setGradeModalVisible(false)}
      >
        <View style={styles.gradeModalBackdrop}>
          <View style={styles.gradeModalCard}>
            <View style={styles.gradeModalHeader}>
              <View>
                <Text style={styles.gradeModalTitle}>Penilaian Tugas Santri</Text>
                <Text style={styles.gradeModalSubtitle}>
                  {selectedSubmission?.student?.nama_lengkap || selectedSubmission?.student?.full_name || 'Santri'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setGradeModalVisible(false)}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.gradeModalBody}>
              <Text style={styles.inputLabel}>Nilai Akhir (Skala 0 - 100) *</Text>
              <TextInput
                placeholder="Misal: 95"
                placeholderTextColor="#94A3B8"
                value={gradeScore}
                onChangeText={setGradeScore}
                keyboardType="numeric"
                maxLength={3}
                style={[styles.textInput, { fontSize: 22, fontWeight: '800', textAlign: 'center' }]}
              />

              <Text style={[styles.inputLabel, { marginTop: 12 }]}>Catatan / Masukan Guru (Opsional)</Text>
              <TextInput
                placeholder="Contoh: Penjelasan sangat baik dan referensi lengkap. Pertahankan!"
                placeholderTextColor="#94A3B8"
                value={gradeNotes}
                onChangeText={setGradeNotes}
                multiline
                numberOfLines={3}
                style={[styles.textInput, { height: 80, textAlignVertical: 'top' }]}
              />

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={submitting}
                onPress={handleSaveGrade}
                style={[styles.submitModalBtn, { marginTop: 16 }]}
              >
                {submitting ? (
                  <ActivityIndicator color="#FFFFFF" size="small" />
                ) : (
                  <Text style={styles.submitModalBtnText}>Simpan Nilai Santri</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* 6. Feedback Modal Toast */}
      {feedback && (
        <AppFeedbackModal
          visible={feedback.visible}
          type={feedback.type}
          title={feedback.title}
          message={feedback.message}
          itemName={feedback.itemName}
          category={feedback.category}
          dateStr={feedback.dateStr}
          actionLabel={feedback.actionLabel}
          cancelLabel={feedback.cancelLabel}
          confirmText={feedback.confirmText}
          cancelText={feedback.cancelText}
          onConfirm={feedback.onConfirm}
          onClose={() => setFeedback(null)}
        />
      )}

      {/* 7. Modal Pop-up Picker Filter Jadwal Halaman Utama (Non-Expand Pop-up) */}
      <Modal
        visible={showFilterScheduleDropdown}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowFilterScheduleDropdown(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowFilterScheduleDropdown(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={styles.pickerHeaderIconBadge}>
                  <MaterialCommunityIcons name="google-classroom" size={18} color="#047857" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Pilih Rombel & Mata Pelajaran</Text>
                  <Text style={styles.pickerModalSubtitle}>Filter daftar penugasan guru</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowFilterScheduleDropdown(false)}
                style={styles.pickerCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  setSelectedScheduleId('all');
                  setShowFilterScheduleDropdown(false);
                }}
                style={[
                  styles.pickerOptionItem,
                  selectedScheduleId === 'all' && styles.pickerOptionItemActive,
                ]}
              >
                <View style={styles.pickerOptionLeft}>
                  <MaterialCommunityIcons
                    name={selectedScheduleId === 'all' ? 'check-circle' : 'circle-outline'}
                    size={18}
                    color={selectedScheduleId === 'all' ? '#047857' : '#94A3B8'}
                    style={{ marginRight: 10 }}
                  />
                  <Text
                    style={[
                      styles.pickerOptionText,
                      selectedScheduleId === 'all' && styles.pickerOptionTextActive,
                    ]}
                  >
                    Semua Kelas & Mapel
                  </Text>
                </View>
                {selectedScheduleId === 'all' && (
                  <View style={styles.activeCheckBadge}>
                    <Text style={styles.activeCheckBadgeText}>Aktif</Text>
                  </View>
                )}
              </TouchableOpacity>

              {schedules.map((sch) => {
                const isSelected = String(sch.id) === String(selectedScheduleId);
                const clsName = sch.kelas?.nama_kelas || sch.kelas?.name || 'Kelas';
                const mapelName = sch.subject?.name || sch.subject?.nama_mapel || 'Mapel';
                const subjStyle = getSubjectStyle(mapelName);
                return (
                  <TouchableOpacity
                    key={String(sch.id)}
                    activeOpacity={0.75}
                    onPress={() => {
                      setSelectedScheduleId(String(sch.id));
                      setShowFilterScheduleDropdown(false);
                    }}
                    style={[
                      styles.pickerOptionItem,
                      isSelected && styles.pickerOptionItemActive,
                    ]}
                  >
                    <View style={styles.pickerOptionLeft}>
                      <MaterialCommunityIcons
                        name={isSelected ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={isSelected ? '#047857' : '#94A3B8'}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text
                          style={[
                            styles.pickerOptionText,
                            isSelected && styles.pickerOptionTextActive,
                          ]}
                          numberOfLines={1}
                        >
                          {clsName}
                        </Text>
                        <Text style={styles.pickerOptionSubText} numberOfLines={1}>
                          {mapelName}
                        </Text>
                      </View>
                    </View>
                    <View
                      style={[
                        styles.pickerSubjectMiniBadge,
                        { backgroundColor: subjStyle.bg },
                      ]}
                    >
                      <Text
                        numberOfLines={1}
                        style={[styles.pickerSubjectMiniBadgeText, { color: subjStyle.color }]}
                      >
                        {mapelName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 8. MODAL PICKER GURU PENGAMPU FORM (KHUSUS TU) ── */}
      <Modal
        visible={showGuruPickerModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowGuruPickerModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowGuruPickerModal(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={[styles.pickerHeaderIconBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <MaterialCommunityIcons name="account-tie" size={18} color="#047857" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Pilih Guru Pengampu</Text>
                  <Text style={styles.pickerModalSubtitle}>Tentukan pendidik penanggung jawab penugasan</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowGuruPickerModal(false)} style={styles.pickerCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              {tuOptions.guru.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Tidak ada data guru pada unit ini.</Text>
                </View>
              ) : (
                tuOptions.guru.map((g) => {
                  const gId = String(g.value || g.id);
                  const isSel = gId === String(formGuruId);
                  const gName = g.nama_lengkap || g.nama || g.label || g.name || 'Guru';
                  const gNip = g.nip || g.niy || '';
                  return (
                    <TouchableOpacity
                      key={`g-${gId}`}
                      activeOpacity={0.75}
                      onPress={() => {
                        setFormGuruId(gId);
                        setShowGuruPickerModal(false);
                      }}
                      style={[styles.pickerOptionItem, isSel && styles.pickerOptionItemActive]}
                    >
                      <View style={styles.pickerOptionLeft}>
                        <MaterialCommunityIcons
                          name={isSel ? 'check-circle' : 'circle-outline'}
                          size={18}
                          color={isSel ? '#047857' : '#94A3B8'}
                          style={{ marginRight: 10 }}
                        />
                        <View style={{ flex: 1 }}>
                          <Text style={[styles.pickerOptionText, isSel && styles.pickerOptionTextActive]}>
                            {gName}
                          </Text>
                          {gNip ? (
                            <Text style={styles.pickerOptionSubText}>NIP: {gNip}</Text>
                          ) : null}
                        </View>
                      </View>
                      <View style={[styles.pickerSubjectMiniBadge, { backgroundColor: '#ECFDF5' }]}>
                        <Text style={[styles.pickerSubjectMiniBadgeText, { color: '#047857' }]}>Pengampu</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 9. MODAL PICKER KELAS FORM (KHUSUS TU) ── */}
      <Modal
        visible={showClassPickerModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowClassPickerModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowClassPickerModal(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={styles.pickerHeaderIconBadge}>
                  <MaterialCommunityIcons name="school" size={18} color="#047857" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Pilih Kelas Sasaran</Text>
                  <Text style={styles.pickerModalSubtitle}>Tentukan rombel penerima penugasan</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowClassPickerModal(false)} style={styles.pickerCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              {tuOptions.kelas.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Tidak ada rombel pada unit ini.</Text>
                </View>
              ) : (
                tuOptions.kelas.map((k) => {
                  const kId = String(k.value || k.id);
                  const isSel = kId === String(formClassId);
                  const kName = k.nama_kelas || k.label || k.name || 'Kelas';
                  return (
                    <TouchableOpacity
                      key={`k-${kId}`}
                      activeOpacity={0.75}
                      onPress={() => {
                        setFormClassId(kId);
                        setShowClassPickerModal(false);
                      }}
                      style={[styles.pickerOptionItem, isSel && styles.pickerOptionItemActive]}
                    >
                      <View style={styles.pickerOptionLeft}>
                        <MaterialCommunityIcons
                          name={isSel ? 'check-circle' : 'circle-outline'}
                          size={18}
                          color={isSel ? '#047857' : '#94A3B8'}
                          style={{ marginRight: 10 }}
                        />
                        <Text style={[styles.pickerOptionText, isSel && styles.pickerOptionTextActive]}>
                          {kName}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 10. MODAL PICKER MAPEL FORM (KHUSUS TU) ── */}
      <Modal
        visible={showSubjectPickerModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSubjectPickerModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowSubjectPickerModal(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={[styles.pickerHeaderIconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <MaterialCommunityIcons name="book-open-outline" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Pilih Mata Pelajaran</Text>
                  <Text style={styles.pickerModalSubtitle}>Tentukan disiplin ilmu penugasan</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowSubjectPickerModal(false)} style={styles.pickerCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              {tuOptions.subjects.length === 0 ? (
                <View style={{ padding: 20, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#64748B' }}>Tidak ada mapel pada unit ini.</Text>
                </View>
              ) : (
                tuOptions.subjects.map((s) => {
                  const sId = String(s.value || s.id);
                  const isSel = sId === String(formSubjectId);
                  const sName = s.nama_mapel || s.label || s.name || 'Mapel';
                  const sStyle = getSubjectStyle(sName);
                  return (
                    <TouchableOpacity
                      key={`s-${sId}`}
                      activeOpacity={0.75}
                      onPress={() => {
                        setFormSubjectId(sId);
                        setShowSubjectPickerModal(false);
                      }}
                      style={[styles.pickerOptionItem, isSel && styles.pickerOptionItemActive]}
                    >
                      <View style={styles.pickerOptionLeft}>
                        <MaterialCommunityIcons
                          name={isSel ? 'check-circle' : 'circle-outline'}
                          size={18}
                          color={isSel ? '#047857' : '#94A3B8'}
                          style={{ marginRight: 10 }}
                        />
                        <Text style={[styles.pickerOptionText, isSel && styles.pickerOptionTextActive]}>
                          {sName}
                        </Text>
                      </View>
                      <View style={[styles.pickerSubjectMiniBadge, { backgroundColor: sStyle.bg }]}>
                        <Text style={[styles.pickerSubjectMiniBadgeText, { color: sStyle.color }]}>
                          {sName}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 11. MODAL FILTER KELAS (TOOLBAR TU) ── */}
      <Modal
        visible={showFilterKelasModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFilterKelasModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowFilterKelasModal(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={styles.pickerHeaderIconBadge}>
                  <MaterialCommunityIcons name="school" size={18} color="#047857" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Filter Kelas</Text>
                  <Text style={styles.pickerModalSubtitle}>Saring tugas berdasarkan rombel</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowFilterKelasModal(false)} style={styles.pickerCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  setSelectedKelasFilter('all');
                  setShowFilterKelasModal(false);
                }}
                style={[styles.pickerOptionItem, selectedKelasFilter === 'all' && styles.pickerOptionItemActive]}
              >
                <View style={styles.pickerOptionLeft}>
                  <MaterialCommunityIcons
                    name={selectedKelasFilter === 'all' ? 'check-circle' : 'circle-outline'}
                    size={18}
                    color={selectedKelasFilter === 'all' ? '#047857' : '#94A3B8'}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.pickerOptionText, selectedKelasFilter === 'all' && styles.pickerOptionTextActive]}>
                    Semua Kelas
                  </Text>
                </View>
              </TouchableOpacity>

              {tuOptions.kelas.map((k) => {
                const kId = String(k.value || k.id);
                const isSel = kId === String(selectedKelasFilter);
                const kName = k.nama_kelas || k.label || k.name || 'Kelas';
                return (
                  <TouchableOpacity
                    key={`fk-${kId}`}
                    activeOpacity={0.75}
                    onPress={() => {
                      setSelectedKelasFilter(kId);
                      setShowFilterKelasModal(false);
                    }}
                    style={[styles.pickerOptionItem, isSel && styles.pickerOptionItemActive]}
                  >
                    <View style={styles.pickerOptionLeft}>
                      <MaterialCommunityIcons
                        name={isSel ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={isSel ? '#047857' : '#94A3B8'}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[styles.pickerOptionText, isSel && styles.pickerOptionTextActive]}>
                        {kName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 12. MODAL FILTER MAPEL (TOOLBAR TU) ── */}
      <Modal
        visible={showFilterSubjectModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFilterSubjectModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowFilterSubjectModal(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={[styles.pickerHeaderIconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <MaterialCommunityIcons name="book-open-outline" size={18} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Filter Mata Pelajaran</Text>
                  <Text style={styles.pickerModalSubtitle}>Saring tugas berdasarkan mapel</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowFilterSubjectModal(false)} style={styles.pickerCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  setSelectedSubjectFilter('all');
                  setShowFilterSubjectModal(false);
                }}
                style={[styles.pickerOptionItem, selectedSubjectFilter === 'all' && styles.pickerOptionItemActive]}
              >
                <View style={styles.pickerOptionLeft}>
                  <MaterialCommunityIcons
                    name={selectedSubjectFilter === 'all' ? 'check-circle' : 'circle-outline'}
                    size={18}
                    color={selectedSubjectFilter === 'all' ? '#047857' : '#94A3B8'}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.pickerOptionText, selectedSubjectFilter === 'all' && styles.pickerOptionTextActive]}>
                    Semua Mapel
                  </Text>
                </View>
              </TouchableOpacity>

              {tuOptions.subjects.map((s) => {
                const sId = String(s.value || s.id);
                const isSel = sId === String(selectedSubjectFilter);
                const sName = s.nama_mapel || s.label || s.name || 'Mapel';
                const sStyle = getSubjectStyle(sName);
                return (
                  <TouchableOpacity
                    key={`fs-${sId}`}
                    activeOpacity={0.75}
                    onPress={() => {
                      setSelectedSubjectFilter(sId);
                      setShowFilterSubjectModal(false);
                    }}
                    style={[styles.pickerOptionItem, isSel && styles.pickerOptionItemActive]}
                  >
                    <View style={styles.pickerOptionLeft}>
                      <MaterialCommunityIcons
                        name={isSel ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={isSel ? '#047857' : '#94A3B8'}
                        style={{ marginRight: 10 }}
                      />
                      <Text style={[styles.pickerOptionText, isSel && styles.pickerOptionTextActive]}>
                        {sName}
                      </Text>
                    </View>
                    <View style={[styles.pickerSubjectMiniBadge, { backgroundColor: sStyle.bg }]}>
                      <Text style={[styles.pickerSubjectMiniBadgeText, { color: sStyle.color }]}>
                        {sName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 13. MODAL FILTER GURU (TOOLBAR TU) ── */}
      <Modal
        visible={showFilterGuruModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowFilterGuruModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowFilterGuruModal(false)}
          style={styles.pickerModalBackdrop}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalCard}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <View style={[styles.pickerHeaderIconBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                  <MaterialCommunityIcons name="account-tie" size={18} color="#047857" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Filter Guru Pengampu</Text>
                  <Text style={styles.pickerModalSubtitle}>Saring tugas berdasarkan pendidik</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowFilterGuruModal(false)} style={styles.pickerCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalScroll} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => {
                  setSelectedGuruFilter('all');
                  setShowFilterGuruModal(false);
                }}
                style={[styles.pickerOptionItem, selectedGuruFilter === 'all' && styles.pickerOptionItemActive]}
              >
                <View style={styles.pickerOptionLeft}>
                  <MaterialCommunityIcons
                    name={selectedGuruFilter === 'all' ? 'check-circle' : 'circle-outline'}
                    size={18}
                    color={selectedGuruFilter === 'all' ? '#047857' : '#94A3B8'}
                    style={{ marginRight: 10 }}
                  />
                  <Text style={[styles.pickerOptionText, selectedGuruFilter === 'all' && styles.pickerOptionTextActive]}>
                    Semua Guru
                  </Text>
                </View>
              </TouchableOpacity>

              {tuOptions.guru.map((g) => {
                const gId = String(g.value || g.id);
                const isSel = gId === String(selectedGuruFilter);
                const gName = g.nama_lengkap || g.nama || g.label || g.name || 'Guru';
                const gNip = g.nip || g.niy || '';
                return (
                  <TouchableOpacity
                    key={`fg-${gId}`}
                    activeOpacity={0.75}
                    onPress={() => {
                      setSelectedGuruFilter(gId);
                      setShowFilterGuruModal(false);
                    }}
                    style={[styles.pickerOptionItem, isSel && styles.pickerOptionItemActive]}
                  >
                    <View style={styles.pickerOptionLeft}>
                      <MaterialCommunityIcons
                        name={isSel ? 'check-circle' : 'circle-outline'}
                        size={18}
                        color={isSel ? '#047857' : '#94A3B8'}
                        style={{ marginRight: 10 }}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={[styles.pickerOptionText, isSel && styles.pickerOptionTextActive]}>
                          {gName}
                        </Text>
                        {gNip ? (
                          <Text style={styles.pickerOptionSubText}>NIP: {gNip}</Text>
                        ) : null}
                      </View>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 14. MODAL PRATINJAU DOKUMEN CETAK A4 REKAPITULASI RESMI TATA USAHA ── */}
      <Modal
        visible={printPaperModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setPrintPaperModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNoPad, { maxHeight: '94%' }]}>
            <View style={styles.printTopBar}>
              <View style={{ flex: 1 }}>
                <Text style={styles.printTopBarTitle}>Pratinjau Dokumen Cetak A4</Text>
                <Text style={styles.printTopBarSub}>
                  Laporan Rekapitulasi Penugasan LMS · {currentUserUnitName}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setPrintPaperModalVisible(false)}
                style={styles.modalCloseBtnWhite}
                accessibilityLabel="Tutup"
              >
                <MaterialCommunityIcons name="close" size={18} color="#047857" />
              </TouchableOpacity>
            </View>

            <ScrollView
              style={[styles.modalBody, { backgroundColor: '#E2E8F0', padding: 12 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* LEMBAR KERTAS A4 SIMULASI RESMI */}
              <View style={styles.paperSheetContainer}>
                {/* 1. KOP SURAT RESMI YAYASAN & UNIT SEKOLAH */}
                <View style={styles.kopSuratHeader}>
                  <View style={styles.kopLogoBox}>
                    {resolvedKopUnit.logoUrl ? (
                      <Image
                        source={{ uri: resolvedKopUnit.logoUrl }}
                        style={{ width: 34, height: 34, borderRadius: 8 }}
                        resizeMode="contain"
                      />
                    ) : (
                      <MaterialCommunityIcons name="school" size={32} color="#047857" />
                    )}
                  </View>
                  <View style={styles.kopTextCol}>
                    <Text style={styles.kopYayasanText}>{foundationName}</Text>
                    <Text style={styles.kopSekolahText}>{resolvedKopUnit.unitName}</Text>
                    <Text style={styles.kopAlamatText}>{resolvedKopUnit.address}</Text>
                    <Text style={styles.kopKontakText}>{resolvedKopUnit.contact}</Text>
                  </View>
                </View>

                {/* Garis Ganda Kop Surat */}
                <View style={styles.kopDoubleLine1} />
                <View style={styles.kopDoubleLine2} />

                {/* 2. JUDUL DOKUMEN & NOMOR */}
                <View style={styles.docTitleBlock}>
                  <Text style={styles.docMainTitle}>
                    LAPORAN REKAPITULASI PENUGASAN LMS TERPADU
                  </Text>
                  <Text style={styles.docNumberText}>
                    Nomor: -
                  </Text>
                </View>

                {/* 3. METADATA INFORMASI */}
                <View style={styles.docMetaGrid}>
                  <View style={styles.docMetaRow}>
                    <Text style={styles.docMetaKey}>Unit Pendidikan</Text>
                    <Text style={styles.docMetaVal}>: {currentUserUnitName}</Text>
                  </View>
                  <View style={styles.docMetaRow}>
                    <Text style={styles.docMetaKey}>Tahun Ajaran</Text>
                    <Text style={styles.docMetaVal}>
                      : {academicYear} (Semester {academicSemester})
                    </Text>
                  </View>
                  <View style={styles.docMetaRow}>
                    <Text style={styles.docMetaKey}>Petugas TU</Text>
                    <Text style={styles.docMetaVal}>: {teacherName} (Tata Usaha)</Text>
                  </View>
                  <View style={styles.docMetaRow}>
                    <Text style={styles.docMetaKey}>Tanggal Cetak</Text>
                    <Text style={styles.docMetaVal}>: {formatDate(new Date().toISOString())}</Text>
                  </View>
                </View>

                {/* 4. RINGKASAN MINI KPI (5 METRIK) */}
                <View style={styles.docKpiRow}>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{tuStats.total}</Text>
                    <Text style={styles.docKpiBoxLbl}>Total Tugas</Text>
                  </View>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{tuStats.published}</Text>
                    <Text style={styles.docKpiBoxLbl}>Terbit</Text>
                  </View>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{tuStats.draft}</Text>
                    <Text style={styles.docKpiBoxLbl}>Draf</Text>
                  </View>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{tuStats.total_pengumpulan}</Text>
                    <Text style={styles.docKpiBoxLbl}>Kiriman</Text>
                  </View>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{tuStats.total_dinilai}</Text>
                    <Text style={styles.docKpiBoxLbl}>Dinilai</Text>
                  </View>
                </View>

                {/* 5. TABEL DAFTAR PENUGASAN */}
                <View style={styles.docTableWrap}>
                  <View style={styles.docTableHead}>
                    <Text style={[styles.docTh, { width: 24, textAlign: 'center' }]}>No</Text>
                    <Text style={[styles.docTh, { flex: 1.4 }]}>Judul Tugas & Guru</Text>
                    <Text style={[styles.docTh, { flex: 1.1 }]}>Mapel & Kelas</Text>
                    <Text style={[styles.docTh, { width: 62, textAlign: 'center' }]}>Tenggat</Text>
                    <Text style={[styles.docTh, { width: 48, textAlign: 'center' }]}>Status</Text>
                    <Text style={[styles.docTh, { width: 44, textAlign: 'center' }]}>Kumpul</Text>
                  </View>

                  {filteredAssignments.length === 0 ? (
                    <View style={{ padding: 14, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>
                        Belum ada data penugasan pada unit ini.
                      </Text>
                    </View>
                  ) : (
                    filteredAssignments.slice(0, 30).map((asn, idx) => {
                      const tTitle = asn.judul || asn.title || asn.judul_tugas || '-';
                      const gName = asn.guru?.nama_lengkap || asn.guru?.nama || asn.guru?.name || 'Guru';
                      const mName = asn.subject?.nama_mapel || asn.subject?.name || '-';
                      const kName = asn.kelas?.nama_kelas || asn.kelas?.name || '-';
                      const dlStr = formatDate(asn.deadline || asn.due_date);
                      const isPub = asn.status === 'dipublikasikan' || asn.status === 'published' || asn.is_published;
                      const subsCount = asn.submissions_count ?? asn.pengumpulan_count ?? (Array.isArray(asn.pengumpulan) ? asn.pengumpulan.length : 0);

                      return (
                        <View key={`doc-${asn.id || idx}`} style={styles.docTableRow}>
                          <Text style={[styles.docTd, { width: 24, textAlign: 'center' }]}>{idx + 1}</Text>
                          <View style={{ flex: 1.4, paddingRight: 4 }}>
                            <Text numberOfLines={2} style={[styles.docTd, { fontWeight: '700' }]}>{tTitle}</Text>
                            <Text numberOfLines={1} style={{ fontSize: 7.5, color: '#0D9488', fontWeight: '600' }}>{gName}</Text>
                          </View>
                          <View style={{ flex: 1.1, paddingRight: 4 }}>
                            <Text numberOfLines={1} style={[styles.docTd, { fontWeight: '600' }]}>{mName}</Text>
                            <Text numberOfLines={1} style={{ fontSize: 7.5, color: '#64748B' }}>{kName}</Text>
                          </View>
                          <Text style={[styles.docTd, { width: 62, textAlign: 'center', fontSize: 8 }]}>{dlStr}</Text>
                          <Text style={[styles.docTd, { width: 48, textAlign: 'center', fontWeight: '700', color: isPub ? '#059669' : '#D97706' }]}>
                            {isPub ? 'Terbit' : 'Draf'}
                          </Text>
                          <Text style={[styles.docTd, { width: 44, textAlign: 'center', fontWeight: '700' }]}>
                            {subsCount}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>

                {/* 6. KOLOM TANDA TANGAN RESMI */}
                <View style={styles.docSignatureRow}>
                  <View style={styles.docSignCol}>
                    <Text style={styles.docSignLabel}>Mengetahui,</Text>
                    <Text style={styles.docSignTitle}>Kepala Sekolah</Text>
                    <View style={styles.docSignSpace} />
                    <Text style={styles.docSignName}>_______________________</Text>
                    <Text style={styles.docSignNip}>NIP. —</Text>
                  </View>

                  <View style={styles.docSignCol}>
                    <Text style={styles.docSignLabel}>Dibuat & Diverifikasi,</Text>
                    <Text style={styles.docSignTitle}>Petugas Tata Usaha</Text>
                    <View style={styles.docSignSpace} />
                    <Text style={styles.docSignName}>{teacherName}</Text>
                    <Text style={styles.docSignNip}>NIP. {teacherNip}</Text>
                  </View>
                </View>
              </View>
            </ScrollView>

            {/* Action Bar Cetak A4 */}
            <View style={[styles.printActionsRow, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setPrintPaperModalVisible(false)}
                style={styles.printCancelBtn}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={17} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.printCancelBtnText}>Tutup</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleShareA4Report}
                style={styles.printShareBtn}
              >
                <MaterialCommunityIcons name="share-variant-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.printShareBtnText}>Bagikan / Ekspor Laporan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      {/* IN-APP EMBED VIEWER MODAL (TIDAK KELUAR DARI APLIKASI) */}
      <InAppEmbedModal
        visible={embedModalVisible}
        url={embedTargetUrl}
        title={embedTargetTitle}
        onClose={() => setEmbedModalVisible(false)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
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
  // ── Sticky Header Styles ──
  stickyHeaderContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 99,
    paddingBottom: 10,
    paddingHorizontal: 14,
    borderBottomLeftRadius: 20,
    borderBottomRightRadius: 20,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 6,
  },
  stickyDecorCircle1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  stickyDecorCircle2: {
    position: 'absolute',
    bottom: -15,
    left: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  stickyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  stickyTitleGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  stickySquircleBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  stickyTitleTextCol: {
    flex: 1,
  },
  stickyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
  },
  stickySubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },
  stickyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 3,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  stickyCreateBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#047857',
  },
  stickyTabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 3,
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  stickyTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 9,
  },
  stickyTabButtonActive: {
    backgroundColor: '#059669',
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  stickyTabButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  stickyTabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  // ── Main Scroll & Static Top Bar ──
  screen: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
  },
  staticTopBarWrapper: {
    paddingBottom: 18,
    paddingHorizontal: 16,
    overflow: 'hidden',
    backgroundColor: 'transparent',
  },
  staticDecorCircle1: {
    position: 'absolute',
    top: -25,
    right: -25,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
  },
  staticDecorCircle2: {
    position: 'absolute',
    bottom: -35,
    left: 20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
  },
  staticTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  staticSquircleBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.1,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  staticTitleCol: {
    flex: 1,
  },
  staticTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  staticSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 2,
  },
  // ── Body Content Wrapper ──
  bodyContentWrapper: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },
  // ── Metrics Card (Tugas · Kiriman · Rombel) ──
  metricsCardWrapper: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    elevation: 2,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
  },
  metricsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 12,
    paddingHorizontal: 8,
  },
  metricCol: {
    alignItems: 'center',
    flex: 1,
  },
  metricTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  metricValWhite: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
  },
  metricLblWhite: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  metricDivider: {
    width: 1,
    height: 26,
    backgroundColor: '#A7F3D0',
  },
  // ── Body Tab Bar Switcher ──
  bodyTabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    gap: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 3,
    elevation: 1,
  },
  bodyTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'transparent',
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
    color: '#065F46',
  },
  bodyTabButtonTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterSection: {
    paddingHorizontal: 0,
    paddingTop: 2,
    paddingBottom: 4,
    backgroundColor: 'transparent',
    marginBottom: 8,
  },
  searchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  searchBar: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
  },
  createTaskBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 15,
    height: 44,
    borderRadius: 14,
    gap: 4,
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
  },
  createTaskBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  filterDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  filterDropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  dropdownIconCircle: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  dropdownLabelCol: {
    flex: 1,
  },
  dropdownSubLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  dropdownMainLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  listScrollView: {
    flex: 1,
  },
  listContentContainer: {
    padding: 16,
    paddingBottom: 90,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 30,
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 10,
  },
  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  assignmentCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  assignmentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    maxWidth: '55%',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  classBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#D1FAE5',
    maxWidth: '45%',
  },
  classBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#065F46',
  },
  cardActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  footerActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  editIconButton: {
    width: 29,
    height: 29,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#0284C750',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  deleteIconButton: {
    width: 29,
    height: 29,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E11D4850',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  assignmentTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    lineHeight: 20,
  },
  assignmentInstruction: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  assignmentFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  deadlineBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  deadlineText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    flexShrink: 1,
  },
  viewSubmissionsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    flexShrink: 0,
  },
  viewSubmissionsBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  submissionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  submissionTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  submissionStudentCol: {
    flex: 1,
    marginRight: 8,
  },
  submissionStudentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  submissionStudentMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusPillGraded: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusPillPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusPillTextGraded: {
    color: '#047857',
  },
  statusPillTextPending: {
    color: '#B45309',
  },
  answerTextBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    borderLeftWidth: 3,
    borderLeftColor: '#059669',
    marginBottom: 8,
  },
  answerText: {
    fontSize: 12,
    color: '#334155',
    fontStyle: 'italic',
    lineHeight: 18,
  },
  teacherNoteBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  teacherNoteLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  teacherNoteText: {
    fontSize: 11,
    color: '#166534',
    marginTop: 2,
  },
  submissionBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 4,
  },
  submittedTimeBox: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  submittedTimeText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
    flexShrink: 1,
  },
  gradeActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9,
    flexShrink: 0,
  },
  gradeActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  // ── Modal Popup Styles (Serasi dengan Bahan Ajar & Modul) ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContentNoPad: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  modalHeaderColored: {
    position: 'relative',
    overflow: 'hidden',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 18,
    paddingTop: 18,
    paddingBottom: 16,
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
  },
  modalHeaderDecorCircle1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  modalHeaderDecorCircle2: {
    position: 'absolute',
    bottom: -15,
    left: 40,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  modalHeaderSubjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    alignSelf: 'flex-start',
    marginBottom: 6,
  },
  modalHeaderSubjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  modalTitleWhite: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  modalCloseBtnWhite: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  modalBody: {
    paddingVertical: 14,
  },
  formLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 8,
  },
  formSubLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
    marginTop: 4,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 10,
  },
  formActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
  },
  formCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCancelBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
  },
  formSubmitBtn: {
    flex: 1.6,
    height: 46,
    borderRadius: 12,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  formSubmitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  inputLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  textInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 16,
  },
  formDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    marginBottom: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  formDropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pickerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
    zIndex: 999,
  },
  pickerModalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '75%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 18,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
    overflow: 'hidden',
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  pickerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  pickerHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  pickerModalSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  pickerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerModalScroll: {
    maxHeight: 340,
  },
  pickerOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 11,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  pickerOptionItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  pickerOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pickerOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  pickerOptionTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  pickerOptionSubText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  pickerSubjectMiniBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    maxWidth: '40%',
  },
  pickerSubjectMiniBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  activeCheckBadge: {
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeCheckBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  submitModalBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 13,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    elevation: 3,
  },
  submitModalBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gradeModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  gradeModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  gradeModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 10,
  },
  gradeModalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  gradeModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  gradeModalBody: {},

  // Badge Jenis Tugas & Draf di Kartu
  cardTaskTypeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  cardTaskTypeBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  cardDraftBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
  },
  cardDraftBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  assignmentMetaChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  assignmentMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  assignmentMetaChipAttachment: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  assignmentMetaChipText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },

  // Form: Segmented Jenis Penugasan
  formTaskTypeGroup: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 3,
    gap: 4,
    marginBottom: 16,
  },
  formTaskTypeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    backgroundColor: 'transparent',
  },
  formTaskTypeBtnActiveEmerald: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  formTaskTypeBtnActivePurple: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  formTaskTypeBtnActiveAmber: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  formTaskTypeBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  formTaskTypeBtnTextActiveEmerald: {
    fontWeight: '800',
    color: '#047857',
  },
  formTaskTypeBtnTextActivePurple: {
    fontWeight: '800',
    color: '#7C3AED',
  },
  formTaskTypeBtnTextActiveAmber: {
    fontWeight: '800',
    color: '#D97706',
  },

  // Form: Format Pengumpulan Jawaban Santri
  formSubmissionTypeRow: {
    gap: 8,
    marginBottom: 16,
  },
  formFmtCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  formFmtCardActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  formFmtCardTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  formFmtCardTitleActive: {
    color: '#047857',
    fontWeight: '800',
  },
  formFmtCardDesc: {
    fontSize: 11,
    color: '#64748B',
    paddingLeft: 21,
  },

  // Form: Lampiran Dokumen
  pickedFileBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 13,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 16,
  },
  pickedFileLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  pickedFileIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pickedFileName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  pickedFileSize: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  pickedFileRemoveBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickedFileChangeBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  pickedFileChangeBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  formUploadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderColor: '#86EFAC',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 16,
  },
  formUploadBtnTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#047857',
  },
  formUploadBtnSubtitle: {
    fontSize: 10.5,
    color: '#059669',
    marginTop: 1,
  },

  // Form: Konfigurasi Khusus Kuis
  quizConfigCard: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  quizConfigHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  quizConfigTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#6D28D9',
  },
  quizConfigFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#5B21B6',
    marginBottom: 4,
  },
  quizConfigInput: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#C4B5FD',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    fontSize: 13,
    fontWeight: '700',
    color: '#4C1D95',
  },

  // Form: Tenggat Waktu Preset Chips
  deadlinePresetRow: {
    flexDirection: 'row',
    gap: 6,
  },
  deadlinePresetChip: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  deadlinePresetChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },

  // Form: Toggle Toleransi Keterlambatan
  formToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 14,
  },
  toggleIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  toggleRowTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  toggleRowDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

  // Form: Status Publikasi Radio
  formStatusRadioRow: {
    flexDirection: 'row',
    gap: 6,
    height: 42,
  },
  formStatusRadioBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
  },
  formStatusRadioBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  formStatusRadioBtnDraftActive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#64748B',
  },
  formStatusRadioText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  formStatusRadioTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  formStatusRadioTextDraftActive: {
    color: '#334155',
    fontWeight: '800',
  },

  // ── Form Butir Soal (Bank Soal Builder) Styles ──
  soalBuilderCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  soalBuilderHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  soalBuilderIconBadge: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soalBuilderIconBadgeText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  soalBuilderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  soalBuilderSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  cancelEditSoalBtn: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  cancelEditSoalBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  autoTypeBadgeBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 12,
  },
  autoTypeBadgeText: {
    fontSize: 11,
    color: '#047857',
  },
  soalTypeGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  soalTypeCard: {
    width: '48%',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 9,
  },
  soalTypeCardActive: {
    borderColor: '#047857',
    backgroundColor: '#ECFDF5',
  },
  soalTypeCardLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  soalTypeCardLabelActive: {
    color: '#047857',
    fontWeight: '800',
  },
  dynamicSoalBoxPg: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    gap: 8,
    marginBottom: 12,
  },
  dynamicSoalBoxEsai: {
    backgroundColor: '#F5F3FF',
    borderWidth: 1,
    borderColor: '#DDD6FE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  dynamicSoalBoxBs: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  dynamicSoalBoxJodoh: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  dynamicSoalBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
    marginBottom: 6,
  },
  pgOptionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  pgKeyRadioBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pgKeyRadioBtnActive: {
    backgroundColor: '#047857',
  },
  pgKeyRadioText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  pgKeyRadioTextActive: {
    color: '#FFFFFF',
  },
  pgOptionInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0F172A',
  },
  bsOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 10,
  },
  bsOptionBtnActive: {
    backgroundColor: '#1D4ED8',
    borderColor: '#1D4ED8',
  },
  bsOptionText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  bsOptionTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  addPairBtn: {
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 7,
    backgroundColor: '#D97706',
  },
  addPairBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  pairRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  pairNumberText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#D97706',
    width: 16,
  },
  pairInput: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 11.5,
    color: '#0F172A',
  },
  removePairBtn: {
    padding: 4,
  },
  difficultyChip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
  },
  difficultyChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  difficultyChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  difficultyChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  addSoalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#047857',
    borderRadius: 12,
    paddingVertical: 10,
    marginTop: 12,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  addSoalSubmitBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  soalListTableContainer: {
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  soalListTableHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  soalListTableHeaderTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  totalPoinBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  totalPoinBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  emptySoalListBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptySoalListText: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 6,
  },
  soalItemCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
  },
  soalItemNumBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  soalItemNumText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
  },
  soalItemTypeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  soalItemTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  soalItemPoinText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  soalItemKunciText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  soalItemPertanyaanText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 16,
  },
  soalItemActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 6,
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  editSoalMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    gap: 3,
  },
  editSoalMiniBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0284C7',
  },
  deleteSoalMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 6,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    gap: 3,
  },
  deleteSoalMiniBtnText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E11D48',
  },

  // ── Tambahan Styles Khusus Tata Usaha (TU) LMS Penugasan ──
  stickyPrintBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  tuHeaderBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  tuRolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  tuRolePillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  staticHeaderActionCol: {
    justifyContent: 'center',
    alignItems: 'flex-end',
  },
  staticPrintPaperBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  staticPrintPaperBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },

  // ── 5 KPI Cards Modern (Emerald, Sky, Amber, Purple, Teal) ──
  kpiContainer: {
    marginBottom: 12,
    gap: 8,
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiCardEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  kpiCardSky: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  kpiCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kpiCardPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  kpiCardTeal: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
  kpiCardActiveRing: {
    borderWidth: 2,
    borderColor: '#047857',
  },
  kpiTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 10,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
  },
  kpiSub: {
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 1,
  },

  // ── Filter Chips Toolbar TU ──
  filterChipsScrollView: {
    marginTop: 10,
  },
  filterChipsScrollContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 10,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterChipDropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  filterChipReset: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 20,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  filterChipResetText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#E11D48',
  },

  // ── Card Assignment Extras (Guru Badge & 1-tap Toggle) ──
  cardTeacherBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 130,
  },
  cardTeacherBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  cardTogglePublishBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardTogglePublishBtnDraft: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  cardTogglePublishBtnLive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  cardTogglePublishBtnText: {
    fontSize: 10,
    fontWeight: '800',
  },

  // ── Dokumen Resmi A4 Styles ──
  printTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#047857',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopLeftRadius: 18,
    borderTopRightRadius: 18,
  },
  printTopBarTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  printTopBarSub: {
    fontSize: 11,
    color: '#A7F3D0',
    marginTop: 2,
  },
  paperSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  kopSuratHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 8,
  },
  kopLogoBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kopTextCol: {
    flex: 1,
  },
  kopYayasanText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  kopSekolahText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  kopAlamatText: {
    fontSize: 8.5,
    color: '#475569',
    marginTop: 2,
    lineHeight: 12,
  },
  kopKontakText: {
    fontSize: 8,
    color: '#64748B',
    marginTop: 1,
  },
  kopDoubleLine1: {
    height: 2,
    backgroundColor: '#0F172A',
    marginTop: 6,
  },
  kopDoubleLine2: {
    height: 0.8,
    backgroundColor: '#0F172A',
    marginTop: 2,
    marginBottom: 12,
  },
  docTitleBlock: {
    alignItems: 'center',
    marginBottom: 12,
  },
  docMainTitle: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  docNumberText: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  docMetaGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 3,
  },
  docMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  docMetaKey: {
    width: 105,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  docMetaVal: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: '600',
    color: '#0F172A',
  },
  docKpiRow: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  docKpiBox: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 6,
    paddingVertical: 6,
    paddingHorizontal: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  docKpiBoxVal: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  docKpiBoxLbl: {
    fontSize: 7.5,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 1,
    textAlign: 'center',
  },
  docTableWrap: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    overflow: 'hidden',
    marginBottom: 14,
  },
  docTableHead: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingVertical: 5,
    paddingHorizontal: 4,
  },
  docTh: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#334155',
  },
  docTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 0.6,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  docTd: {
    fontSize: 8,
    color: '#1E293B',
  },
  docSignatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    marginTop: 10,
    marginBottom: 6,
  },
  docSignCol: {
    alignItems: 'center',
    width: 140,
  },
  docSignLabel: {
    fontSize: 8,
    color: '#64748B',
  },
  docSignTitle: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  docSignSpace: {
    height: 40,
  },
  docSignName: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0F172A',
    textDecorationLine: 'underline',
  },
  docSignNip: {
    fontSize: 7.5,
    color: '#64748B',
    marginTop: 1,
  },
  printActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  printCancelBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  printCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  printShareBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#047857',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  printShareBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
