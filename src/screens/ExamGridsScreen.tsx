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
import { useNavigation } from '@react-navigation/native';
import { useAuthStore } from '../stores/authStore';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import {
  getProfileImageUrl,
  getStudentAvatarSource,
  isGirlStudent,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';

import { isParentRole, isStudentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const getSubjectMeta = (subjectName?: string) => {
  const s = (subjectName || '').toLowerCase();
  if (s.includes('matematika') || s.includes('mtk') || s.includes('hitung') || s.includes('aljabar')) {
    return { icon: 'calculator-variant' as const, color: '#2563EB', bg: '#EFF6FF' };
  }
  if (s.includes('ipa') || s.includes('fisika') || s.includes('biologi') || s.includes('kimia') || s.includes('sains')) {
    return { icon: 'flask-outline' as const, color: '#059669', bg: '#ECFDF5' };
  }
  if (s.includes('qur') || s.includes('tahfizh') || s.includes('hadits') || s.includes('pai') || s.includes('fiqih') || s.includes('akidah') || s.includes('islam') || s.includes('syariah')) {
    return { icon: 'book-open-page-variant' as const, color: '#047857', bg: '#D1FAE5' };
  }
  if (s.includes('arab')) {
    return { icon: 'translate' as const, color: '#D97706', bg: '#FEF3C7' };
  }
  if (s.includes('inggris') || s.includes('english')) {
    return { icon: 'earth' as const, color: '#7C3AED', bg: '#F3E8FF' };
  }
  if (s.includes('indonesia') || s.includes('literasi') || s.includes('bahasa')) {
    return { icon: 'book-outline' as const, color: '#0284C7', bg: '#E0F2FE' };
  }
  if (s.includes('ips') || s.includes('sejarah') || s.includes('geografi') || s.includes('pkn') || s.includes('sosial')) {
    return { icon: 'compass-outline' as const, color: '#EA580C', bg: '#FFEDD5' };
  }
  if (s.includes('olahraga') || s.includes('penjas') || s.includes('pjok')) {
    return { icon: 'soccer' as const, color: '#16A34A', bg: '#DCFCE7' };
  }
  if (s.includes('komputer') || s.includes('tik') || s.includes('informatika')) {
    return { icon: 'laptop' as const, color: '#4F46E5', bg: '#EEF2FF' };
  }
  if (s.includes('seni') || s.includes('budaya') || s.includes('sbk') || s.includes('prakarya')) {
    return { icon: 'palette-outline' as const, color: '#DB2777', bg: '#FCE7F3' };
  }
  return { icon: 'file-document-edit-outline' as const, color: '#047857', bg: '#ECFDF5' };
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

type ExamGridItem = {
  id: string;
  judul_kisi?: string;
  jenis_ujian?: string;
  mata_pelajaran_id?: string;
  cp_id?: string;
  tp_id?: string;
  kelas_id?: string;
  semester_id?: string;
  tahun_ajaran_id?: string;
  kurikulum_id?: string;
  guru_id?: string;
  jumlah_soal?: number;
  alokasi_waktu_menit?: number;
  kompetensi_dasar?: string;
  level_kognitif?: string;
  distribusi_bobot?: Record<string, any> | Array<any> | string;
  status?: boolean;
  bank_soal_count?: number;
  ujian_count?: number;
  subject?: { id?: string; name?: string; code?: string; nama_mapel?: string };
  kelas?: { id?: string; name?: string; nama_kelas?: string; tingkat?: string };
  guru?: { id?: string; name?: string; full_name?: string; nama_lengkap?: string };
  cp?: { id?: string; kode_cp?: string; nama_cp?: string };
  tp?: { id?: string; kode_tp?: string; nama_tp?: string };
  semester?: { id?: string; name?: string; nama_semester?: string };
  tahun_ajaran?: { id?: string; name?: string };
};

export interface FormattedBobotItem {
  key: string;
  label: string;
  subLabel: string;
  percentage: number;
  color: string;
  bgColor: string;
  borderColor: string;
  iconName: string;
}

const BOBOT_METADATA_MAP: Record<
  string,
  { label: string; subLabel: string; color: string; bgColor: string; borderColor: string; icon: string }
> = {
  pg: {
    label: 'Pilihan Ganda',
    subLabel: 'Soal Objektif (PG)',
    color: '#059669',
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    icon: 'radiobox-marked',
  },
  pilihan_ganda: {
    label: 'Pilihan Ganda',
    subLabel: 'Soal Objektif (PG)',
    color: '#059669',
    bgColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    icon: 'radiobox-marked',
  },
  isian: {
    label: 'Isian Singkat',
    subLabel: 'Jawaban Pendek',
    color: '#0284C7',
    bgColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    icon: 'form-textbox',
  },
  isian_singkat: {
    label: 'Isian Singkat',
    subLabel: 'Jawaban Pendek',
    color: '#0284C7',
    bgColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    icon: 'form-textbox',
  },
  esai: {
    label: 'Esai / Uraian',
    subLabel: 'Analisis & Elaborasi',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    icon: 'text-box-outline',
  },
  uraian: {
    label: 'Esai / Uraian',
    subLabel: 'Analisis & Elaborasi',
    color: '#7C3AED',
    bgColor: '#F5F3FF',
    borderColor: '#DDD6FE',
    icon: 'text-box-outline',
  },
  menjodohkan: {
    label: 'Menjodohkan',
    subLabel: 'Pasangan Kategori',
    color: '#D97706',
    bgColor: '#FFFBEB',
    borderColor: '#FDE68A',
    icon: 'swap-horizontal',
  },
  benar_salah: {
    label: 'Benar / Salah',
    subLabel: 'Validasi Logika',
    color: '#E11D48',
    bgColor: '#FFF1F2',
    borderColor: '#FECDD3',
    icon: 'checkbox-marked-circle-outline',
  },
};

const parseDistribusiBobot = (raw: any): FormattedBobotItem[] => {
  if (!raw) return [];
  let parsed = raw;

  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
      try {
        parsed = JSON.parse(trimmed);
      } catch {
        return [];
      }
    } else {
      return [];
    }
  }

  const items: FormattedBobotItem[] = [];

  if (Array.isArray(parsed)) {
    parsed.forEach((item, idx) => {
      if (item && typeof item === 'object') {
        const key = String(item.key || item.tipe || item.jenis || item.label || `item_${idx}`).toLowerCase();
        const rawVal = item.value ?? item.bobot ?? item.persentase ?? item.pct ?? 0;
        const numVal = parseFloat(String(rawVal)) || 0;
        const meta = BOBOT_METADATA_MAP[key] || {
          label: String(item.label || item.tipe || key),
          subLabel: 'Komposisi Soal',
          color: '#059669',
          bgColor: '#ECFDF5',
          borderColor: '#A7F3D0',
          icon: 'format-list-checks',
        };
        items.push({
          key,
          label: meta.label,
          subLabel: meta.subLabel,
          percentage: numVal,
          color: meta.color,
          bgColor: meta.bgColor,
          borderColor: meta.borderColor,
          iconName: meta.icon,
        });
      }
    });
  } else if (parsed && typeof parsed === 'object') {
    Object.entries(parsed).forEach(([key, val]) => {
      const lowerKey = key.toLowerCase();
      const numVal = parseFloat(String(val)) || 0;
      const meta = BOBOT_METADATA_MAP[lowerKey] || {
        label: key.replace(/[_-]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
        subLabel: 'Komposisi Soal',
        color: '#059669',
        bgColor: '#ECFDF5',
        borderColor: '#A7F3D0',
        icon: 'format-list-checks',
      };
      items.push({
        key: lowerKey,
        label: meta.label,
        subLabel: meta.subLabel,
        percentage: numVal,
        color: meta.color,
        bgColor: meta.bgColor,
        borderColor: meta.borderColor,
        iconName: meta.icon,
      });
    });
  }

  return items;
};

export default function ExamGridsScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const navigation = useNavigation<any>();
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isStudent = isStudentRole(userRoles);
  const isTeacher = isTeacherRole(userRoles);
  const isStaff = isTuRole(userRoles) || isPrincipalRole(userRoles) || isSuperAdminRole(userRoles);
  const isTeacherOnly = (isTeacher || isStaff) && !isParent;

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const studentScrollRef = useRef<ScrollView>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    return fromStore ? String(fromStore) : undefined;
  });
  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const handledParamIdRef = useRef<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);

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
  const [grids, setGrids] = useState<ExamGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('Semua');
  const [activeModalItem, setActiveModalItem] = useState<ExamGridItem | null>(null);
  const [showChildSelectorModal, setShowChildSelectorModal] = useState(false);

  // ── State Khusus Role Guru LMS ──
  const incomingClassId = route?.params?.kelas_id || route?.params?.class_id;
  const [selectedClass, setSelectedClass] = useState<string>(() => (incomingClassId ? String(incomingClassId) : 'Semua'));
  const [selectedExamType, setSelectedExamType] = useState<string>('Semua');
  const [selectedStatus, setSelectedStatus] = useState<string>('Semua');
  const [teacherStats, setTeacherStats] = useState({
    total: 0,
    aktif: 0,
    nonaktif: 0,
    total_soal_target: 0,
    uh: 0,
    pts: 0,
    pas: 0,
  });
  const [teacherOptions, setTeacherOptions] = useState<{
    subjects: any[];
    kelas: any[];
    semesters: any[];
    tahun_ajaran: any[];
    kurikulum: any[];
    capaian_pembelajaran: any[];
    tujuan_pembelajaran: any[];
    jenis_ujian_options: any[];
    level_kognitif_options: any[];
  }>({
    subjects: [],
    kelas: [],
    semesters: [],
    tahun_ajaran: [],
    kurikulum: [],
    capaian_pembelajaran: [],
    tujuan_pembelajaran: [],
    jenis_ujian_options: [],
    level_kognitif_options: [],
  });

  // Modal Form Tambah / Edit Kisi-kisi Guru
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingGridItem, setEditingGridItem] = useState<ExamGridItem | null>(null);
  const [formSubmitting, setFormSubmitting] = useState(false);
  const [formDistribusiError, setFormDistribusiError] = useState('');
  const [formData, setFormData] = useState({
    judul_kisi: '',
    mata_pelajaran_id: '',
    kelas_id: '',
    semester_id: '',
    tahun_ajaran_id: '',
    kurikulum_id: '',
    cp_id: '',
    tp_id: '',
    jenis_ujian: '',
    jumlah_soal: 20,
    alokasi_waktu_menit: 60,
    kompetensi_dasar: '',
    level_kognitif: '',
    distribusi_bobot: { pg: 60, isian: 20, esai: 20 } as Record<string, number>,
    status: true,
  });

  // Auto-set default jenis_ujian dan level_kognitif dari opsi backend jika belum terpilih
  useEffect(() => {
    if (teacherOptions.jenis_ujian_options?.length > 0 && !formData.jenis_ujian) {
      const first = teacherOptions.jenis_ujian_options[0];
      const val = typeof first === 'string' ? first : (first.id || first.value || first.code || first.nama);
      if (val) setFormData((prev) => ({ ...prev, jenis_ujian: String(val) }));
    }
  }, [teacherOptions.jenis_ujian_options, formData.jenis_ujian]);

  useEffect(() => {
    if (teacherOptions.level_kognitif_options?.length > 0 && !formData.level_kognitif) {
      const first = teacherOptions.level_kognitif_options[0];
      const val = typeof first === 'string' ? first : (first.id || first.value || first.code || first.nama);
      if (val) setFormData((prev) => ({ ...prev, level_kognitif: String(val) }));
    }
  }, [teacherOptions.level_kognitif_options, formData.level_kognitif]);

  // Modal Dropdown Selector (Bottom Sheet Picker)
  const [pickerModal, setPickerModal] = useState<{
    isOpen: boolean;
    type: 'subject' | 'kelas' | 'cp' | 'tp' | 'jenis_ujian' | 'level_kognitif' | 'filter_kelas' | 'filter_subject' | null;
    title: string;
  }>({
    isOpen: false,
    type: null,
    title: '',
  });
  const [loadingDropdownOptions, setLoadingDropdownOptions] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');

  // Modal Konfirmasi Hapus Guru
  const [deleteModal, setDeleteModal] = useState<{
    isOpen: boolean;
    item: ExamGridItem | null;
    isSubmitting: boolean;
  }>({
    isOpen: false,
    item: null,
    isSubmitting: false,
  });

  // In-app Alert / Toast Feedback
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Official AppFeedbackModal (Dialog Sukses, Gagal, Salin & Hapus)
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    actionLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  } | null>(null);

  const showFeedback = (
    title: string,
    message: string,
    type: FeedbackType = 'success',
    actionLabel?: string
  ) => {
    setFeedbackModal({
      visible: true,
      type,
      title,
      message,
      actionLabel,
    });
  };

  // 1. Load Children if parent with offline cache (seluruh anak ditampilkan)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
      const childCacheKey = offlineCache.buildKey('exam_grids_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          setChildren(cached);
          if (!selectedChildId) {
            const initId = targetChildId
              ? String(targetChildId)
              : String(cached[0]?.id || cached[0]?.student_id);
            setSelectedChildId(initId);
            const foundIdx = cached.findIndex((c: any) => String(c.id || c.student_id) === initId);
            if (foundIdx >= 0) setActiveChildIndex(foundIdx);
          }
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && list.length > 0) {
            setChildren(list);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
              const foundIdx = list.findIndex((c: any) => String(c.id || c.student_id) === String(targetChildId));
              if (foundIdx >= 0) setActiveChildIndex(foundIdx);
            } else if (!selectedChildId) {
              const fallbackId = globalActiveChildId || String(list[0]?.id || list[0]?.student_id);
              setSelectedChildId(fallbackId);
              const fIdx = list.findIndex((c: any) => String(c.id || c.student_id) === fallbackId);
              setActiveChildIndex(fIdx >= 0 ? fIdx : 0);
            }
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, globalActiveChildId]);

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

  // Carousel INFINITE seimbang & ringan: hanya 3 card yang dirender
  // ([sebelumnya, aktif, berikutnya]), anak aktif selalu di TENGAH sehingga
  // kiri-kanan seimbang (1 vs 1). Geser ke ujung mana pun lanjut memutar.
  const studentLoopCount = children.length > 1 ? children.length : 0;
  const safeCenter = studentLoopCount === 0
    ? 0
    : ((activeChildIndex % studentLoopCount) + studentLoopCount) % studentLoopCount;

  const loopWindow = useMemo(() => {
    if (studentLoopCount === 0) return { list: children, realIdx: [0] };
    const n = studentLoopCount;
    const prev = (safeCenter - 1 + n) % n;
    const next = (safeCenter + 1) % n;
    return {
      list: [children[prev], children[safeCenter], children[next]],
      realIdx: [prev, safeCenter, next],
    };
  }, [children, studentLoopCount, safeCenter]);

  const centerLoopOffset = studentSnapInterval;

  // Kembali ke tengah (tanpa animasi) — tak terlihat karena card yang tampil sama
  const recenterLoop = (): void => {
    if (studentLoopCount === 0) return;
    studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
  };

  const syncLoopChildId = (realIdx: number): void => {
    const selChild = children[realIdx];
    const sid = selChild?.id || selChild?.student_id;
    if (sid) {
      const strSid = String(sid);
      setSelectedChildId(strSid);
      useActiveChildStore.getState().setActiveChildId(strSid);
    }
  };

  const goToLoopChild = (targetRealIndex: number): void => {
    if (studentLoopCount === 0) {
      if (children.length === 1) {
        setActiveChildIndex(0);
        syncLoopChildId(0);
      }
      return;
    }
    const n = studentLoopCount;
    const normTarget = ((targetRealIndex % n) + n) % n;
    if (normTarget === safeCenter) return;

    let delta = normTarget - safeCenter;
    if (delta > n / 2) delta -= n;
    if (delta < -n / 2) delta += n;

    if (delta === 1) {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset * 2, animated: true });
      setTimeout(() => {
        setActiveChildIndex(normTarget);
        syncLoopChildId(normTarget);
        recenterLoop();
      }, 240);
    } else if (delta === -1) {
      studentScrollRef.current?.scrollTo({ x: 0, animated: true });
      setTimeout(() => {
        setActiveChildIndex(normTarget);
        syncLoopChildId(normTarget);
        recenterLoop();
      }, 240);
    } else {
      setActiveChildIndex(normTarget);
      syncLoopChildId(normTarget);
      recenterLoop();
    }
  };

  // Route params sync (hanya sekali saat parameter route baru terdeteksi)
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId && children.length > 0 && handledParamIdRef.current !== String(incomingId)) {
      handledParamIdRef.current = String(incomingId);
      const foundIdx = children.findIndex((c: any) => String(c.id || c.student_id) === String(incomingId));
      if (foundIdx >= 0) {
        goToLoopChild(foundIdx);
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, children]);

  // Sinkronkan activeChildIndex jika selectedChildId berubah dari luar (route params / store)
  useEffect(() => {
    if (children.length > 0 && selectedChildId) {
      const idx = children.findIndex(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (idx >= 0 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
      }
    }
  }, [selectedChildId, children, activeChildIndex]);

  // Posisikan ke tengah setiap kali jumlah anak / lebar card berubah
  useEffect(() => {
    if (studentLoopCount === 0) return;
    requestAnimationFrame(() => {
      studentScrollRef.current?.scrollTo({ x: centerLoopOffset, animated: false });
    });
  }, [studentLoopCount, studentSnapInterval, centerLoopOffset]);

  const teacherStatsRef = useRef(teacherStats);
  useEffect(() => {
    teacherStatsRef.current = teacherStats;
  }, [teacherStats]);
  const hasMountedRef = useRef(false);

  // Load Metadata Opsi & Statistik Guru
  const loadTeacherMeta = useCallback(async () => {
    if (!isTeacherOnly) return;
    try {
      const [resStats, resOpts] = await Promise.allSettled([
        mobileApiService.getTeacherExamGridStats(),
        mobileApiService.getTeacherExamGridOptions(),
      ]);
      if (resStats.status === 'fulfilled' && resStats.value?.data) {
        setTeacherStats(resStats.value.data);
      }
      if (resOpts.status === 'fulfilled') {
        const optsData = resOpts.value?.data || resOpts.value;
        setTeacherOptions({
          subjects: Array.isArray(optsData?.subjects) ? optsData.subjects : [],
          kelas: Array.isArray(optsData?.kelas) ? optsData.kelas : [],
          semesters: Array.isArray(optsData?.semesters) ? optsData.semesters : [],
          tahun_ajaran: Array.isArray(optsData?.tahun_ajaran) ? optsData.tahun_ajaran : [],
          kurikulum: Array.isArray(optsData?.kurikulum) ? optsData.kurikulum : [],
          capaian_pembelajaran: Array.isArray(optsData?.capaian_pembelajaran) ? optsData.capaian_pembelajaran : [],
          tujuan_pembelajaran: Array.isArray(optsData?.tujuan_pembelajaran) ? optsData.tujuan_pembelajaran : [],
          jenis_ujian_options: Array.isArray(optsData?.jenis_ujian_options) ? optsData.jenis_ujian_options : [],
          level_kognitif_options: Array.isArray(optsData?.level_kognitif_options) ? optsData.level_kognitif_options : [],
        });
      }
    } catch {
      // offline fallback or ignore
    }
  }, [isTeacherOnly]);

  // 2. Load Real Exam Grids from Backend Database with offline cache
  const loadExamGrids = useCallback(async () => {
    setError('');
    const targetChildId = isParent ? selectedChildId : undefined;
    const cacheKey = offlineCache.buildKey('exam_grids', user?.id, targetChildId || 'teacher');

    // Baca cache dulu
    const cached = await offlineCache.get<{ grids: ExamGridItem[]; student: any; stats?: any }>(cacheKey);
    if (cached) {
      if (cached.grids) setGrids(cached.grids);
      if (cached.student) setStudentInfo(cached.student);
    }

    try {
      const params: Record<string, any> = { per_page: 50 };
      if (isTeacherOnly && selectedClass !== 'Semua') {
        params.kelas_id = selectedClass;
      }
      if (isTeacherOnly && selectedExamType !== 'Semua') {
        params.jenis_ujian = selectedExamType;
      }

      const response = isTeacherOnly
        ? await mobileApiService.getTeacherExamGrids(params)
        : await mobileApiService.getPortalExamGrids(targetChildId);
      const raw = unwrapApiData<any>(response);
      const records = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
      setGrids(records);

      const resolvedStudent = response?.student || raw?.student || response?.data?.student;
      let finalStudent: any = null;
      if (resolvedStudent) {
        finalStudent = resolvedStudent;
        setStudentInfo(resolvedStudent);
      } else if (isStudent) {
        const currentUser = useAuthStore.getState().user;
        finalStudent = currentUser?.student || currentUser;
        setStudentInfo((prev: any) => prev || finalStudent);
      }

      void offlineCache.set(cacheKey, { grids: records, student: finalStudent, stats: teacherStatsRef.current });
    } catch (err) {
      if (!cached) {
        setError(getApiErrorMessage(err, 'Daftar kisi-kisi ujian belum berhasil dimuat.'));
        setGrids([]);
      }
    }
  }, [isParent, isStudent, isTeacher, isTeacherOnly, selectedChildId, selectedClass, selectedExamType, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (isStudent) {
        try {
          const profRes = await mobileApiService.getPortalProfile();
          const profData = unwrapApiData<any>(profRes) || profRes?.data || profRes;
          if (profData) setStudentInfo(profData);
        } catch {
          const currentUser = useAuthStore.getState().user;
          setStudentInfo((prev: any) => prev || currentUser?.student || currentUser);
        }
      }
      if (isTeacherOnly) {
        await loadTeacherMeta();
      }
      await loadExamGrids();
    } finally {
      setLoading(false);
      hasMountedRef.current = true;
    }
  }, [isStudent, isTeacherOnly, loadExamGrids, loadTeacherMeta]);

  // Initial load saat screen pertama kali dibuka
  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Memuat ulang daftar kisi-kisi saat filter berubah setelah initial mount
  useEffect(() => {
    if (!hasMountedRef.current) return;
    void loadExamGrids();
  }, [selectedChildId, selectedClass, selectedExamType, loadExamGrids]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (isParent) {
        const res = await mobileApiService.getPortalChildren();
        const list = unwrapApiData<any[]>(res) || [];
        setChildren(list);
      }
      if (isTeacherOnly) {
        await loadTeacherMeta();
      }
      await loadExamGrids();
    } finally {
      setRefreshing(false);
    }
  };

  // ── Handler CRUD Guru & Chained Dropdowns ──
  const handleSelectSubject = async (subjectId: string) => {
    setFormData((prev) => ({
      ...prev,
      mata_pelajaran_id: subjectId,
      cp_id: '',
      tp_id: '',
    }));
    setPickerModal({ isOpen: false, type: null, title: '' });
    setLoadingDropdownOptions(true);
    try {
      const res = await mobileApiService.getTeacherExamGridOptions({ mata_pelajaran_id: subjectId });
      const opts = res?.data || res;
      setTeacherOptions((prev) => ({
        ...prev,
        capaian_pembelajaran: Array.isArray(opts?.capaian_pembelajaran) ? opts.capaian_pembelajaran : [],
        tujuan_pembelajaran: [],
      }));
    } catch {
      // offline fallback or ignore
    } finally {
      setLoadingDropdownOptions(false);
    }
  };

  const handleSelectCp = async (cpId: string) => {
    const selectedCp = teacherOptions.capaian_pembelajaran.find((c) => String(c.id) === String(cpId));
    setFormData((prev) => ({
      ...prev,
      cp_id: cpId,
      tp_id: '',
      kompetensi_dasar: prev.kompetensi_dasar.trim() ? prev.kompetensi_dasar : (selectedCp?.deskripsi || selectedCp?.nama_cp || ''),
    }));
    setPickerModal({ isOpen: false, type: null, title: '' });

    if (cpId) {
      setLoadingDropdownOptions(true);
      try {
        const res = await mobileApiService.getTeacherExamGridOptions({
          mata_pelajaran_id: formData.mata_pelajaran_id,
          cp_id: cpId,
        });
        const opts = res?.data || res;
        setTeacherOptions((prev) => ({
          ...prev,
          tujuan_pembelajaran: Array.isArray(opts?.tujuan_pembelajaran) ? opts.tujuan_pembelajaran : [],
        }));
      } catch {
        // fallback
      } finally {
        setLoadingDropdownOptions(false);
      }
    } else {
      setTeacherOptions((prev) => ({ ...prev, tujuan_pembelajaran: [] }));
    }
  };

  const handleSelectTp = (tpId: string) => {
    const selectedTp = teacherOptions.tujuan_pembelajaran.find((t) => String(t.id) === String(tpId));
    setFormData((prev) => ({
      ...prev,
      tp_id: tpId,
      kompetensi_dasar: prev.kompetensi_dasar.trim() ? prev.kompetensi_dasar : (selectedTp?.deskripsi || selectedTp?.nama_tp || ''),
    }));
    setPickerModal({ isOpen: false, type: null, title: '' });
  };

  const handleOpenFormModal = (item?: ExamGridItem) => {
    setFormDistribusiError('');
    if (item) {
      setEditingGridItem(item);
      const bobotObj = typeof item.distribusi_bobot === 'object' && !Array.isArray(item.distribusi_bobot)
        ? (item.distribusi_bobot as Record<string, number>)
        : { pg: 60, isian: 20, esai: 20 };
      const targetSubjId = item.mata_pelajaran_id || item.subject?.id || '';
      const targetCpId = item.cp_id || '';
      setFormData({
        judul_kisi: item.judul_kisi || '',
        mata_pelajaran_id: targetSubjId,
        kelas_id: item.kelas_id || item.kelas?.id || '',
        semester_id: item.semester_id || '',
        tahun_ajaran_id: item.tahun_ajaran_id || '',
        kurikulum_id: item.kurikulum_id || '',
        cp_id: targetCpId,
        tp_id: item.tp_id || '',
        jenis_ujian: item.jenis_ujian || 'UH',
        jumlah_soal: item.jumlah_soal || 20,
        alokasi_waktu_menit: item.alokasi_waktu_menit || 60,
        kompetensi_dasar: item.kompetensi_dasar || '',
        level_kognitif: item.level_kognitif || 'C1 - Mengingat',
        distribusi_bobot: {
          pg: Number(bobotObj.pg ?? (bobotObj as any).pilihan_ganda ?? 60),
          isian: Number(bobotObj.isian ?? (bobotObj as any).isian_singkat ?? 20),
          esai: Number(bobotObj.esai ?? (bobotObj as any).uraian ?? 20),
        },
        status: item.status !== undefined ? Boolean(item.status) : true,
      });

      // Muat chained CP dan TP untuk item yang diedit
      if (targetSubjId) {
        setLoadingDropdownOptions(true);
        mobileApiService.getTeacherExamGridOptions({
          mata_pelajaran_id: targetSubjId,
          cp_id: targetCpId || undefined,
        })
          .then((res) => {
            const opts = res?.data || res;
            setTeacherOptions((prev) => ({
              ...prev,
              capaian_pembelajaran: Array.isArray(opts?.capaian_pembelajaran) ? opts.capaian_pembelajaran : prev.capaian_pembelajaran,
              tujuan_pembelajaran: Array.isArray(opts?.tujuan_pembelajaran) ? opts.tujuan_pembelajaran : prev.tujuan_pembelajaran,
            }));
          })
          .catch(() => {})
          .finally(() => setLoadingDropdownOptions(false));
      }
    } else {
      setEditingGridItem(null);
      const firstSubjectId = teacherOptions.subjects[0]?.id || '';
      const firstClassId = (selectedClass !== 'Semua' ? selectedClass : teacherOptions.kelas[0]?.id) || '';
      setFormData({
        judul_kisi: '',
        mata_pelajaran_id: firstSubjectId,
        kelas_id: firstClassId,
        semester_id: teacherOptions.semesters[0]?.id || '',
        tahun_ajaran_id: teacherOptions.tahun_ajaran[0]?.id || '',
        kurikulum_id: teacherOptions.kurikulum[0]?.id || '',
        cp_id: '',
        tp_id: '',
        jenis_ujian: teacherOptions.jenis_ujian_options[0]?.id || teacherOptions.jenis_ujian_options[0]?.nama || '',
        jumlah_soal: 20,
        alokasi_waktu_menit: 60,
        kompetensi_dasar: '',
        level_kognitif: teacherOptions.level_kognitif_options[0]?.id || teacherOptions.level_kognitif_options[0]?.nama || '',
        distribusi_bobot: { pg: 60, isian: 20, esai: 20 },
        status: true,
      });

      // Muat chained CP untuk mapel pertama yang terpilih otomatis
      if (firstSubjectId) {
        setLoadingDropdownOptions(true);
        mobileApiService.getTeacherExamGridOptions({ mata_pelajaran_id: firstSubjectId })
          .then((res) => {
            const opts = res?.data || res;
            setTeacherOptions((prev) => ({
              ...prev,
              capaian_pembelajaran: Array.isArray(opts?.capaian_pembelajaran) ? opts.capaian_pembelajaran : [],
              tujuan_pembelajaran: [],
            }));
          })
          .catch(() => {})
          .finally(() => setLoadingDropdownOptions(false));
      }
    }
    setIsFormModalOpen(true);
  };

  const handleFormSubmit = async () => {
    if (!formData.judul_kisi.trim()) {
      showToast('Judul kisi-kisi wajib diisi.', 'error');
      showFeedback('Data Belum Lengkap', 'Judul kisi-kisi evaluasi ujian wajib diisi sebelum menyimpan.', 'warning', 'Mengerti');
      return;
    }
    if (!formData.mata_pelajaran_id) {
      showToast('Mata pelajaran wajib dipilih.', 'error');
      showFeedback('Mata Pelajaran Kosong', 'Silakan pilih mata pelajaran untuk kisi-kisi ini.', 'warning', 'Pilih Mapel');
      return;
    }
    const totBobot = (Number(formData.distribusi_bobot.pg) || 0) +
      (Number(formData.distribusi_bobot.isian) || 0) +
      (Number(formData.distribusi_bobot.esai) || 0);
    if (totBobot > 0 && totBobot !== 100) {
      setFormDistribusiError(`Total bobot harus 100% (saat ini ${totBobot}%).`);
      showFeedback('Distribusi Bobot Tidak Sesuai', `Total bobot soal (PG + Isian + Esai) harus tepat 100% (saat ini ${totBobot}%).`, 'warning', 'Sesuaikan');
      return;
    }

    setFormSubmitting(true);
    try {
      const payload: Record<string, any> = {
        judul_kisi: formData.judul_kisi.trim(),
        mata_pelajaran_id: formData.mata_pelajaran_id,
        jenis_ujian: formData.jenis_ujian,
        jumlah_soal: Number(formData.jumlah_soal) || 20,
        alokasi_waktu_menit: Number(formData.alokasi_waktu_menit) || 60,
        kompetensi_dasar: formData.kompetensi_dasar.trim(),
        level_kognitif: formData.level_kognitif,
        distribusi_bobot: formData.distribusi_bobot,
        status: formData.status,
      };
      if (formData.kelas_id) payload.kelas_id = formData.kelas_id;
      if (formData.semester_id) payload.semester_id = formData.semester_id;
      if (formData.tahun_ajaran_id) payload.tahun_ajaran_id = formData.tahun_ajaran_id;
      if (formData.kurikulum_id) payload.kurikulum_id = formData.kurikulum_id;
      if (formData.cp_id) payload.cp_id = formData.cp_id;
      if (formData.tp_id) payload.tp_id = formData.tp_id;

      const isEdit = Boolean(editingGridItem);
      if (isEdit) {
        await mobileApiService.updateTeacherExamGrid(editingGridItem!.id, payload);
        showToast('Kisi-kisi berhasil diperbarui.');
      } else {
        await mobileApiService.createTeacherExamGrid(payload);
        showToast('Kisi-kisi baru berhasil dibuat.');
      }
      setIsFormModalOpen(false);
      void loadExamGrids();
      void loadTeacherMeta();

      // Tampilkan notifikasi dialog berhasil secara resmi
      setTimeout(() => {
        showFeedback(
          isEdit ? 'Perubahan Berhasil' : 'Penyimpanan Berhasil',
          isEdit
            ? `Perubahan pada kisi-kisi "${payload.judul_kisi}" telah berhasil disimpan ke database.`
            : `Dokumen kisi-kisi baru "${payload.judul_kisi}" telah berhasil ditambahkan ke rencana evaluasi.`,
          'success',
          'Alhamdulillah'
        );
      }, 300);
    } catch (err: any) {
      const errorMsg = getApiErrorMessage(err, 'Gagal menyimpan kisi-kisi ke server.');
      showToast(errorMsg, 'error');
      showFeedback(
        editingGridItem ? 'Penyimpanan Perubahan Gagal' : 'Penyimpanan Kisi-Kisi Gagal',
        errorMsg,
        'error',
        'Tutup'
      );
    } finally {
      setFormSubmitting(false);
    }
  };

  const handleDuplicate = async (item: ExamGridItem) => {
    try {
      await mobileApiService.duplicateTeacherExamGrid(item.id);
      showToast('Kisi-kisi berhasil diduplikasi.');
      void loadExamGrids();
      void loadTeacherMeta();
      showFeedback(
        'Salin Berhasil',
        `Kisi-kisi "${item.judul_kisi || 'Kisi-Kisi'}" telah berhasil disalin sebagai draf kisi-kisi baru.`,
        'success',
        'Alhamdulillah'
      );
    } catch (err: any) {
      const errorMsg = getApiErrorMessage(err, 'Gagal menduplikasi kisi-kisi.');
      showToast(errorMsg, 'error');
      showFeedback(
        'Salin Gagal',
        errorMsg,
        'error',
        'Tutup'
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteModal.item) return;
    const targetTitle = deleteModal.item.judul_kisi || 'Kisi-Kisi';
    setDeleteModal((prev) => ({ ...prev, isSubmitting: true }));
    try {
      await mobileApiService.deleteTeacherExamGrid(deleteModal.item.id);
      showToast('Kisi-kisi berhasil dihapus.');
      setDeleteModal({ isOpen: false, item: null, isSubmitting: false });
      void loadExamGrids();
      void loadTeacherMeta();
      setTimeout(() => {
        showFeedback(
          'Delete Berhasil',
          `Dokumen kisi-kisi "${targetTitle}" telah berhasil dihapus dari sistem.`,
          'success',
          'Mengerti'
        );
      }, 300);
    } catch (err: any) {
      const errorMsg = getApiErrorMessage(err, 'Gagal menghapus kisi-kisi.');
      showToast(errorMsg, 'error');
      setDeleteModal((prev) => ({ ...prev, isSubmitting: false }));
      setTimeout(() => {
        showFeedback(
          'Gagal Menghapus',
          errorMsg,
          'error',
          'Tutup'
        );
      }, 250);
    }
  };

  const handleGoToBankSoal = (item: ExamGridItem) => {
    navigation?.navigate('BankSoal', {
      kisi_kisi_id: item.id,
      judul_kisi: item.judul_kisi,
      mata_pelajaran_id: item.mata_pelajaran_id || item.subject?.id,
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
  const activeStudentName = useMemo(() => {
    return resolveStudentDisplay(headerStudent, user).firstName || headerStudent?.name || 'Siswa';
  }, [headerStudent, user]);

  const isTu = isTuRole(userRoles);
  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

  const pageTitle = isTu
    ? 'Kelola Kisi-Kisi Ujian'
    : isTeacherOnly
    ? 'Kisi-Kisi Ujian Guru'
    : 'Kisi-Kisi Ujian';
  const pageSubtitle = isTu
    ? 'Pusat Cetak Biru & Evaluasi Sekolah'
    : isTeacherOnly
    ? 'Pusat Cetak Biru & Distribusi Bobot Soal'
    : (activeStudentName ? `Cakupan materi & indikator soal ${activeStudentName}` : 'Cakupan Materi & Indikator Soal');

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(headerStudent);
  }, [headerStudent]);

  const studentFullName = useMemo(() => {
    return (
      (typeof headerStudent?.name === 'string' && headerStudent.name) ||
      (typeof headerStudent?.nama_lengkap === 'string' && headerStudent.nama_lengkap) ||
      (typeof headerStudent?.full_name === 'string' && headerStudent.full_name) ||
      'Ananda'
    );
  }, [headerStudent]);

  const studentUnit = useMemo(() => {
    return (
      (typeof headerStudent?.unit?.name === 'string' && headerStudent.unit.name) ||
      (typeof headerStudent?.unit_name === 'string' && headerStudent.unit_name) ||
      (typeof headerStudent?.education_unit?.name === 'string' && headerStudent.education_unit.name) ||
      (typeof headerStudent?.education_unit_name === 'string' && headerStudent.education_unit_name) ||
      (typeof headerStudent?.unit === 'string' && headerStudent.unit) ||
      ''
    );
  }, [headerStudent]);

  const studentClass = useMemo(() => {
    return (
      (typeof headerStudent?.kelas?.nama_kelas === 'string' && headerStudent.kelas.nama_kelas) ||
      (typeof headerStudent?.kelas?.name === 'string' && headerStudent.kelas.name) ||
      (typeof headerStudent?.class?.name === 'string' && headerStudent.class.name) ||
      (typeof headerStudent?.class_name === 'string' && headerStudent.class_name) ||
      (typeof headerStudent?.kelas === 'string' && headerStudent.kelas) ||
      ''
    );
  }, [headerStudent]);

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini (Single Source of Truth via studentAttendanceHelper)
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent);
  }, [headerStudent]);

  const totalTargetSoal = useMemo(() => {
    return grids.reduce((acc, g) => acc + (Number(g.jumlah_soal) || 0), 0);
  }, [grids]);


  // Dynamic Subjects from real DB data or teacher options
  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    grids.forEach((g) => {
      const name = g.subject?.name || g.subject?.nama_mapel;
      if (name) set.add(name);
    });
    if (isTeacherOnly && teacherOptions.subjects?.length > 0) {
      teacherOptions.subjects.forEach((s) => {
        const name = s.nama_mapel || s.name;
        if (name) set.add(name);
      });
    }
    return ['Semua', ...Array.from(set)];
  }, [grids, isTeacherOnly, teacherOptions.subjects]);

  // Dynamic Classes for Teacher
  const classOptions = useMemo(() => {
    const map = new Map<string, string>();
    grids.forEach((g) => {
      const cId = g.kelas_id || g.kelas?.id;
      const cName = g.kelas?.nama_kelas || g.kelas?.name;
      if (cId && cName) {
        map.set(String(cId), String(cName));
      }
    });
    if (isTeacherOnly && teacherOptions.kelas?.length > 0) {
      teacherOptions.kelas.forEach((k) => {
        const cId = k.id;
        const cName = k.nama_kelas || k.name;
        if (cId && cName) {
          map.set(String(cId), String(cName));
        }
      });
    }
    return [
      { id: 'Semua', label: 'Semua Kelas' },
      ...Array.from(map.entries()).map(([id, label]) => ({ id, label })),
    ];
  }, [grids, isTeacherOnly, teacherOptions.kelas]);

  // Dynamic Exam Types 100% dari backend options & database
  const examTypeOptions = useMemo(() => {
    const set = new Set<string>();
    if (Array.isArray(teacherOptions.jenis_ujian_options) && teacherOptions.jenis_ujian_options.length > 0) {
      teacherOptions.jenis_ujian_options.forEach((typ: any) => {
        const val = typeof typ === 'string' ? typ : (typ?.id || typ?.value || typ?.code || typ?.nama || typ?.label);
        if (val) set.add(String(val).trim());
      });
    }
    grids.forEach((g) => {
      if (g.jenis_ujian) set.add(String(g.jenis_ujian).trim());
    });
    return ['Semua', ...Array.from(set)];
  }, [grids, teacherOptions.jenis_ujian_options]);

  // Filtered Grids
  const filteredGrids = useMemo(() => {
    return grids.filter((g) => {
      const title = g.judul_kisi || '';
      const subjectName = g.subject?.name || g.subject?.nama_mapel || '';
      const teacherName = g.guru?.nama_lengkap || g.guru?.full_name || g.guru?.name || '';
      const examType = (g.jenis_ujian || '').toUpperCase();
      const itemClassId = String(g.kelas_id || g.kelas?.id || '');

      const matchesSearch =
        !search.trim() ||
        title.toLowerCase().includes(search.trim().toLowerCase()) ||
        subjectName.toLowerCase().includes(search.trim().toLowerCase()) ||
        teacherName.toLowerCase().includes(search.trim().toLowerCase()) ||
        (g.kompetensi_dasar || '').toLowerCase().includes(search.trim().toLowerCase());

      const matchesSubject =
        selectedSubject === 'Semua' ||
        subjectName.toLowerCase() === selectedSubject.toLowerCase();

      const matchesExamType =
        selectedExamType === 'Semua' ||
        examType === selectedExamType.toUpperCase() ||
        (selectedExamType === 'PTS' && ['PTS', 'UTS'].includes(examType)) ||
        (selectedExamType === 'PAS' && ['PAS', 'UAS'].includes(examType));

      const matchesClass =
        selectedClass === 'Semua' || itemClassId === String(selectedClass);

      const matchesStatus =
        selectedStatus === 'Semua' ||
        (selectedStatus === 'Aktif' && g.status !== false) ||
        (selectedStatus === 'Nonaktif' && g.status === false);

      return matchesSearch && matchesSubject && matchesExamType && matchesClass && matchesStatus;
    });
  }, [grids, search, selectedSubject, selectedExamType, selectedClass, selectedStatus]);

  const currentClassLabel = useMemo(() => {
    if (selectedClass === 'Semua') return 'Semua Kelas';
    const found = classOptions.find((c) => String(c.id) === String(selectedClass));
    return found ? found.label : selectedClass;
  }, [selectedClass, classOptions]);

  const currentSubjectLabel = useMemo(() => {
    if (selectedSubject === 'Semua') return 'Semua Mapel';
    return selectedSubject;
  }, [selectedSubject]);

  const examTypeTabs = useMemo(() => {
    const tabs: { id: string; label: string; count: number }[] = [
      { id: 'Semua', label: 'Semua', count: grids.length },
    ];

    const availableSet = new Set<string>();
    if (Array.isArray(teacherOptions.jenis_ujian_options) && teacherOptions.jenis_ujian_options.length > 0) {
      teacherOptions.jenis_ujian_options.forEach((o: any) => {
        const val = typeof o === 'string' ? o : (o.id || o.value || o.code || o.nama);
        if (val) availableSet.add(String(val).trim());
      });
    }
    grids.forEach((g) => {
      if (g.jenis_ujian) availableSet.add(String(g.jenis_ujian).trim());
    });

    availableSet.forEach((typ) => {
      const count = grids.filter((g) => {
        const cur = (g.jenis_ujian || '').toUpperCase();
        const target = typ.toUpperCase();
        return cur === target ||
          (target === 'PTS' && cur === 'UTS') ||
          (target === 'PAS' && cur === 'UAS');
      }).length;
      tabs.push({ id: typ, label: typ, count });
    });

    return tabs;
  }, [grids, teacherOptions.jenis_ujian_options]);

  const selectedSubjectItem = teacherOptions.subjects.find(
    (s) => String(s.id) === String(formData.mata_pelajaran_id)
  );
  const selectedClassFormItem = teacherOptions.kelas.find(
    (k) => String(k.id) === String(formData.kelas_id)
  );
  const selectedCpItem = teacherOptions.capaian_pembelajaran.find(
    (c) => String(c.id) === String(formData.cp_id)
  );
  const selectedTpItem = teacherOptions.tujuan_pembelajaran.find(
    (t) => String(t.id) === String(formData.tp_id)
  );
  const selectedExamTypeFormLabel = (() => {
    const cur = formData.jenis_ujian;
    const found = teacherOptions.jenis_ujian_options?.find((o: any) =>
      (typeof o === 'string' ? o : o.id || o.value || o.code) === cur
    );
    if (!found) return cur || 'UH';
    return typeof found === 'string' ? found : found.nama || found.label || found.name || found.value || cur;
  })();

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK HALAMAN BANK SOAL & CBT, JERNIH & CRISP) ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN UTAMA & BANK SOAL (TOMBOL KARTU PUTIH MINT GREEN SHADOW) ── */}
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

        <View style={styles.cleanHeaderTitleCenter}>
          <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
            {pageTitle}
          </Text>
          <Text numberOfLines={1} style={styles.cleanHeaderSubtitle}>
            {pageSubtitle}
          </Text>
        </View>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── Main Sheet Container ── */}
      <View style={styles.sheetContainer}>
        <Animated.ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.cleanMainScrollContent, { paddingBottom: isTeacherOnly ? Math.max(bottomInset + 140, 160) : Math.max(bottomInset + 72, 94) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0E5C44"
              colors={['#0E5C44', '#10B981']}
            />
          }
        >
          <View style={styles.cleanScrollInner}>
            <View style={styles.bodyContentWrapper}>
              {/* ── OPEN PROFILE ROW (IDENTIK BANK SOAL & CBT) ── */}
              {!isTeacherOnly ? (
                <View style={styles.studentProfileRow}>
                  {/* 60x60 Avatar with Mint Ring (Klik untuk lihat KTS Siswa Terpilih) */}
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

                    {/* Baris 2: Unit Pendidikan */}
                    {studentUnit ? (
                      <View style={styles.studentMetaRow}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#047857" style={{ marginRight: 4 }} />
                        <Text numberOfLines={1} style={styles.studentProfileUnitText}>
                          {studentUnit}
                        </Text>
                      </View>
                    ) : null}

                    {/* Baris 3: Kelas Siswa */}
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
              ) : null}

              {/* ── 4 KPI Stats Cards: 2x2 Equal Grid Standar Emas ── */}
              <View style={styles.kpiGridContainer}>
                {/* Row 1: Dokumen Kisi-Kisi (Emerald) & Target Soal (Sky) */}
                <View style={styles.kpiGridRow}>
                  <View style={[styles.kpiGridCard, styles.kpiCardEmerald]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#059669" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#064E3B' }]}>{grids.length}</Text>
                      <Text style={[styles.kpiLabelModern, { color: '#047857' }]} numberOfLines={1}>
                        Total Kisi-Kisi
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiGridCard, styles.kpiCardSky]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#F0F9FF' }]}>
                      <MaterialCommunityIcons name="target" size={22} color="#0284C7" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#075985' }]}>
                        {totalTargetSoal}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#0284C7' }]} numberOfLines={1}>
                        Target Butir Soal
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Row 2: Mata Pelajaran (Amber) & Rombel / Dokumen Aktif (Purple) */}
                <View style={styles.kpiGridRow}>
                  <View style={[styles.kpiGridCard, styles.kpiCardAmber]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#FFFBEB' }]}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={22} color="#D97706" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#78350F' }]}>
                        {Math.max(subjectOptions.length - 1, 0)}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#B45309' }]} numberOfLines={1}>
                        Mata Pelajaran
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiGridCard, styles.kpiCardPurple]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
                      <MaterialCommunityIcons name={isTeacherOnly ? "google-classroom" : "school-outline"} size={22} color="#7C3AED" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#4C1D95' }]}>
                        {isTeacherOnly ? Math.max(classOptions.length - 1, 0) : filteredGrids.length}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#7C3AED' }]} numberOfLines={1}>
                        {isTeacherOnly ? 'Rombel Kelas' : 'Kisi Siap Ujian'}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>

              {/* Filter Pills Row Jenis Ujian (Semua, UH, PTS, PAS, dll. 100% Dinamis) */}
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 10, gap: 8 }}
              >
                {examTypeTabs.map((tab) => {
                  const isSelected = selectedExamType === tab.id;
                  const isUH = tab.id.toUpperCase() === 'UH';
                  const isPTS = tab.id.toUpperCase() === 'PTS' || tab.id.toUpperCase() === 'UTS';
                  const isPAS = tab.id.toUpperCase() === 'PAS' || tab.id.toUpperCase() === 'UAS';
                  const tabColor = isSelected ? '#059669' : isUH ? '#7C3AED' : isPTS ? '#D97706' : isPAS ? '#0284C7' : '#0F172A';
                  return (
                    <TouchableOpacity
                      key={tab.id}
                      activeOpacity={0.8}
                      onPress={() => setSelectedExamType(tab.id)}
                      style={[
                        styles.kpiFilterPill,
                        isSelected && { backgroundColor: tabColor, borderColor: tabColor },
                      ]}
                    >
                      <Text style={[styles.kpiFilterPillText, isSelected && { color: '#FFFFFF' }]}>
                        {tab.label} ({tab.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Search Bar Modern */}
              <View style={styles.searchContainerModern}>
                <MaterialCommunityIcons name="magnify" size={20} color="#059669" style={styles.searchIcon} />
                <TextInput
                  style={styles.searchInputModern}
                  placeholder={isTeacherOnly ? "Cari judul kisi-kisi, KD, level kognitif..." : "Cari judul kisi-kisi atau mapel..."}
                  placeholderTextColor="#94A3B8"
                  value={search}
                  onChangeText={setSearch}
                />
                {search.trim().length > 0 && (
                  <TouchableOpacity onPress={() => setSearch('')} style={styles.clearSearchBtn}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              {/* Filter Dropdown Guru (Rombel & Mapel) */}
              {isTeacherOnly && (
                <View style={styles.filterDropdownRowModern}>
                  {/* Dropdown Rombel Kelas */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setPickerSearch('');
                      setPickerModal({ isOpen: true, type: 'filter_kelas', title: 'Pilih Rombel / Kelas' });
                    }}
                    style={[
                      styles.filterDropdownTriggerModern,
                      selectedClass !== 'Semua' && styles.filterDropdownTriggerActiveClass,
                    ]}
                  >
                    <MaterialCommunityIcons name="google-classroom" size={15} color="#0284C7" />
                    <Text numberOfLines={1} style={styles.filterDropdownValueModern}>
                      {currentClassLabel}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={16} color="#64748B" />
                  </TouchableOpacity>

                  {/* Dropdown Mapel */}
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setPickerSearch('');
                      setPickerModal({ isOpen: true, type: 'filter_subject', title: 'Pilih Mata Pelajaran' });
                    }}
                    style={[
                      styles.filterDropdownTriggerModern,
                      selectedSubject !== 'Semua' && styles.filterDropdownTriggerActiveMapel,
                    ]}
                  >
                    <MaterialCommunityIcons name="book-open-page-variant" size={15} color="#059669" />
                    <Text numberOfLines={1} style={styles.filterDropdownValueModern}>
                      {currentSubjectLabel}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={16} color="#64748B" />
                  </TouchableOpacity>
                </View>
              )}

              {/* ══════════════════════════════════════════════════════════════
                  SECTION: DAFTAR KISI-KISI UJIAN (100% REAL DATABASE)
                 ══════════════════════════════════════════════════════════════ */}
              <View style={[styles.sectionHeaderRow, { marginBottom: 12, paddingHorizontal: 4 }]}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <Text style={styles.sectionTitle}>Daftar Kisi-Kisi Ujian</Text>
                </View>
                <View style={styles.countBadgeModern}>
                  <Text style={styles.countBadgeModernText}>
                    {filteredGrids.length} dari {grids.length} Dokumen
                  </Text>
                </View>
              </View>

              {loading && !refreshing ? (
                <View style={styles.centerLoading}>
                  <ActivityIndicator size="large" color="#059669" />
                  <Text style={styles.loadingText}>Memuat kisi-kisi ujian dari database...</Text>
                </View>
              ) : error ? (
                <View style={styles.errorBox}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#DC2626" />
                  <Text style={styles.errorText}>{error}</Text>
                  <TouchableOpacity onPress={() => void loadAll()} style={styles.retryBtn}>
                    <Text style={styles.retryBtnText}>Muat Ulang</Text>
                  </TouchableOpacity>
                </View>
              ) : filteredGrids.length === 0 ? (
                <View style={styles.emptyBox}>
                  <MaterialCommunityIcons name="book-open-blank-variant" size={48} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>
                    {isTeacherOnly ? 'Belum Ada Kisi-Kisi Disusun' : 'Belum Ada Kisi-Kisi'}
                  </Text>
                  <Text style={styles.emptySubtitle}>
                    {isTeacherOnly
                      ? (search || selectedSubject !== 'Semua' || selectedExamType !== 'Semua' || selectedClass !== 'Semua'
                        ? 'Tidak ditemukan kisi-kisi yang sesuai dengan kriteria pencarian atau filter yang dipilih.'
                        : 'Anda belum menyusun kisi-kisi ujian. Tekan tombol "+ Buat Baru" di atas untuk menambahkan cetak biru evaluasi.')
                      : (search || selectedSubject !== 'Semua'
                        ? 'Tidak ditemukan kisi-kisi yang sesuai dengan kata kunci atau filter yang dipilih.'
                        : 'Dewan guru belum mempublikasikan kisi-kisi ujian untuk kelas ini.')}
                  </Text>
                  {isTeacherOnly && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenFormModal()}
                      style={[styles.heroCreateBtn, { marginTop: 14 }]}
                    >
                      <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" />
                      <Text style={styles.heroCreateBtnText}>Buat Kisi-Kisi Baru</Text>
                    </TouchableOpacity>
                  )}
                </View>
              ) : (
                <View style={styles.gridsList}>
                  {filteredGrids.map((item) => {
                    const subjectName = item.subject?.name || item.subject?.nama_mapel || 'Mata Pelajaran';
                    const teacherName = item.guru?.nama_lengkap || item.guru?.full_name || item.guru?.name || user?.name || 'Dewan Guru';
                    const examType = item.jenis_ujian || 'Ujian';
                    const className = item.kelas?.nama_kelas || item.kelas?.name;
                    const bankCount = item.bank_soal_count ?? 0;
                    const targetSoal = item.jumlah_soal || 0;
                    const subjectMeta = getSubjectMeta(subjectName);

                    return (
                      <View key={item.id} style={styles.gridCard}>
                        {/* Baris 1: Full-width Header Badges (Subject Badge di kiri, Jenis Ujian & Status di kanan) */}
                        <View style={styles.cardHeaderRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                            <View style={styles.subjectBadge}>
                              <MaterialCommunityIcons name="book-open-page-variant" size={13} color="#059669" />
                              <Text numberOfLines={1} style={styles.subjectBadgeText}>
                                {subjectName}
                              </Text>
                            </View>
                            {className && (
                              <View style={styles.classBadge}>
                                <MaterialCommunityIcons name="google-classroom" size={12} color="#0284C7" />
                                <Text numberOfLines={1} style={styles.classBadgeText}>
                                  {className}
                                </Text>
                              </View>
                            )}
                          </View>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                            <View style={styles.examTypeBadge}>
                              <Text style={styles.examTypeBadgeText}>{examType}</Text>
                            </View>
                            {item.status !== undefined && (
                              <View style={[styles.statusMiniBadge, item.status ? styles.statusMiniActive : styles.statusMiniInactive]}>
                                <Text style={[styles.statusMiniText, { color: item.status ? '#059669' : '#94A3B8' }]}>
                                  {item.status ? 'Aktif' : 'Nonaktif'}
                                </Text>
                              </View>
                            )}
                          </View>
                        </View>

                        {/* Baris 2: Icon Box 46x46 + Judul Kisi-Kisi & Guru */}
                        <View style={styles.gridCardBodyRow}>
                          <View style={[styles.gridSubjectIconBox, { backgroundColor: subjectMeta.bg }]}>
                            <MaterialCommunityIcons name={subjectMeta.icon as any} size={24} color={subjectMeta.color} />
                          </View>

                          <View style={styles.gridTitleMetaCol}>
                            <Text style={styles.gridTitle} numberOfLines={2}>
                              {item.judul_kisi || 'Kisi-Kisi Evaluasi Belajar'}
                            </Text>
                            <View style={styles.infoMetaRow}>
                              <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                              <Text numberOfLines={1} style={styles.infoMetaText}>
                                {isTeacherOnly ? `Penyusun: ${teacherName}` : `Guru: ${teacherName}`}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Baris 3: 3-column Spec Grid Card (Durasi, Target Soal, Level Kognitif) */}
                        <View style={styles.gridSpecsCard}>
                          <View style={styles.gridSpecItem}>
                            <MaterialCommunityIcons name="clock-outline" size={15} color="#059669" />
                            <View style={{ marginLeft: 6 }}>
                              <Text style={styles.gridSpecLabel}>Durasi</Text>
                              <Text style={styles.gridSpecValue}>{item.alokasi_waktu_menit ? `${item.alokasi_waktu_menit} Menit` : '60 Menit'}</Text>
                            </View>
                          </View>

                          <View style={styles.gridSpecDivider} />

                          <View style={styles.gridSpecItem}>
                            <MaterialCommunityIcons name="format-list-numbered" size={15} color="#2563EB" />
                            <View style={{ marginLeft: 6 }}>
                              <Text style={styles.gridSpecLabel}>Target</Text>
                              <Text style={styles.gridSpecValue}>{item.jumlah_soal ? `${item.jumlah_soal} Soal` : '- Soal'}</Text>
                            </View>
                          </View>

                          <View style={styles.gridSpecDivider} />

                          <View style={styles.gridSpecItem}>
                            <MaterialCommunityIcons name="brain" size={15} color="#7C3AED" />
                            <View style={{ marginLeft: 6 }}>
                              <Text style={styles.gridSpecLabel}>Kognitif</Text>
                              <Text style={styles.gridSpecValue} numberOfLines={1}>{(item.level_kognitif || 'C1 - C3').split(' ')[0]}</Text>
                            </View>
                          </View>
                        </View>

                        {/* Kesiapan Bank Soal (Khusus Guru) */}
                        {isTeacherOnly && (
                          <View style={styles.teacherProgressBox}>
                            <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                              <Text style={styles.teacherProgressLabel}>Kesiapan Bank Soal:</Text>
                              <Text style={styles.teacherProgressVal}>
                                {bankCount}/{targetSoal} Butir Soal {targetSoal > 0 ? `(${Math.min(100, Math.round((bankCount / targetSoal) * 100))}%)` : ''}
                              </Text>
                            </View>
                            <View style={styles.teacherProgressBarBg}>
                              <View
                                style={[
                                  styles.teacherProgressBarFill,
                                  {
                                    width: `${targetSoal > 0 ? Math.min(100, Math.round((bankCount / targetSoal) * 100)) : 0}%`,
                                    backgroundColor: bankCount >= targetSoal && targetSoal > 0 ? '#10B981' : bankCount > 0 ? '#F59E0B' : '#EF4444',
                                  },
                                ]}
                              />
                            </View>
                          </View>
                        )}

                        {/* Distribusi Bobot Soal (Jika Ada) */}
                        {(() => {
                          const cardBobot = parseDistribusiBobot(item.distribusi_bobot);
                          if (cardBobot.length === 0) return null;
                          return (
                            <View style={styles.cardBobotRow}>
                              <View style={styles.cardBobotHeader}>
                                <MaterialCommunityIcons name="chart-arc" size={13} color="#059669" />
                                <Text style={styles.cardBobotPrefix}>Bobot:</Text>
                              </View>
                              <View style={styles.cardBobotBadgesWrap}>
                                {cardBobot.map((b) => (
                                  <View
                                    key={`card-bobot-${b.key}`}
                                    style={[
                                      styles.cardBobotChip,
                                      { backgroundColor: b.bgColor, borderColor: b.borderColor },
                                    ]}
                                  >
                                    <Text style={[styles.cardBobotChipText, { color: b.color }]}>
                                      {b.key === 'pg' || b.key === 'pilihan_ganda'
                                        ? 'PG'
                                        : b.key === 'isian' || b.key === 'isian_singkat'
                                        ? 'Isian'
                                        : b.key === 'esai' || b.key === 'uraian'
                                        ? 'Esai'
                                        : b.label}{' '}
                                      {b.percentage}%
                                    </Text>
                                  </View>
                                ))}
                              </View>
                            </View>
                          );
                        })()}

                        {/* Baris Aksi */}
                        {isTeacherOnly ? (
                          <View style={styles.teacherCardActionsCol}>
                            <View style={styles.teacherActionRowPrimary}>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => handleGoToBankSoal(item)}
                                style={styles.teacherActionBtnBankSoal}
                              >
                                <MaterialCommunityIcons name="database-plus-outline" size={16} color="#B45309" />
                                <Text style={styles.teacherActionBtnBankSoalText}>
                                  Bank Soal ({bankCount}/{targetSoal})
                                </Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setActiveModalItem(item)}
                                style={styles.teacherActionBtnDetail}
                              >
                                <MaterialCommunityIcons name="eye-outline" size={16} color="#047857" />
                                <Text style={styles.teacherActionBtnDetailText}>Rincian</Text>
                              </TouchableOpacity>
                            </View>

                            <View style={styles.teacherActionRowSecondary}>
                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => handleOpenFormModal(item)}
                                style={[styles.teacherActionBtnManage, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                              >
                                <MaterialCommunityIcons name="pencil-outline" size={14} color="#1D4ED8" />
                                <Text style={[styles.teacherActionBtnManageText, { color: '#1D4ED8' }]}>Ubah</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => void handleDuplicate(item)}
                                style={[styles.teacherActionBtnManage, { backgroundColor: '#F5F3FF', borderColor: '#DDD6FE' }]}
                              >
                                <MaterialCommunityIcons name="content-copy" size={14} color="#6D28D9" />
                                <Text style={[styles.teacherActionBtnManageText, { color: '#6D28D9' }]}>Salin</Text>
                              </TouchableOpacity>

                              <TouchableOpacity
                                activeOpacity={0.8}
                                onPress={() => setDeleteModal({ isOpen: true, item, isSubmitting: false })}
                                style={[styles.teacherActionBtnManage, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}
                              >
                                <MaterialCommunityIcons name="trash-can-outline" size={14} color="#BE123C" />
                                <Text style={[styles.teacherActionBtnManageText, { color: '#BE123C' }]}>Hapus</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setActiveModalItem(item)}
                            style={styles.studentDetailBtn}
                          >
                            <View style={styles.studentDetailBtnLeft}>
                              <MaterialCommunityIcons name="file-document-outline" size={17} color="#047857" />
                              <Text style={styles.studentDetailBtnText}>Lihat Rincian Kisi-Kisi</Text>
                            </View>
                            <MaterialCommunityIcons name="chevron-right" size={18} color="#059669" />
                          </TouchableOpacity>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </Animated.ScrollView>

        {/* ── FLOATING ACTION BUTTON (FAB) BUAT KISI-KISI BARU (GURU / TU) ── */}
        {isTeacherOnly && (
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => handleOpenFormModal()}
            style={[styles.teacherFab, { bottom: Math.max(bottomInset + 80, 100) }]}
          >
            <LinearGradient
              colors={['#059669', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.teacherFabGradient}
            >
              <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
              <Text style={styles.teacherFabText}>Buat Kisi-Kisi</Text>
            </LinearGradient>
          </TouchableOpacity>
        )}
      </View>

      {/* MODAL PEMILIH ANAK (BOTTOM SHEET BOTTOM SHEET PICKER SINKRON STORE) */}
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
                  (typeof c.unit?.name === 'string' && c.unit.name) ||
                  (typeof c.unit_name === 'string' && c.unit_name) ||
                  (typeof c.education_unit?.name === 'string' && c.education_unit.name) ||
                  (typeof c.education_unit_name === 'string' && c.education_unit_name) ||
                  (typeof c.unit === 'string' && c.unit) ||
                  '';
                const cClass =
                  (typeof c.kelas?.nama_kelas === 'string' && c.kelas.nama_kelas) ||
                  (typeof c.kelas?.name === 'string' && c.kelas.name) ||
                  (typeof c.class?.name === 'string' && c.class.name) ||
                  (typeof c.class_name === 'string' && c.class_name) ||
                  (typeof c.kelas === 'string' && c.kelas) ||
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
                          isSelected && { color: '#0D6B42', fontWeight: '800' },
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

      {/* ══════════════════════════════════════════════════════════════
          MODAL RINCIAN KISI-KISI
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(activeModalItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModalItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.modalSubjectBadge}>
                  <Text style={styles.modalSubjectBadgeText}>
                    {activeModalItem?.subject?.name || 'Mata Pelajaran'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>{activeModalItem?.judul_kisi}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveModalItem(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Meta Grid */}
              <View style={styles.modalMetaGrid}>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>JENIS UJIAN</Text>
                  <Text style={styles.modalMetaValue}>{activeModalItem?.jenis_ujian || '-'}</Text>
                </View>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>DURASI WAKTU</Text>
                  <Text style={styles.modalMetaValue}>
                    {activeModalItem?.alokasi_waktu_menit ? `${activeModalItem.alokasi_waktu_menit} Menit` : '-'}
                  </Text>
                </View>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>JUMLAH SOAL</Text>
                  <Text style={styles.modalMetaValue}>
                    {activeModalItem?.jumlah_soal ? `${activeModalItem.jumlah_soal} Butir` : '-'}
                  </Text>
                </View>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>LEVEL KOGNITIF</Text>
                  <Text style={styles.modalMetaValue}>{activeModalItem?.level_kognitif || 'L1 - L3'}</Text>
                </View>
              </View>

              {/* Teacher Info */}
              <View style={styles.modalSectionBox}>
                <Text style={styles.modalSectionHeader}>Guru Pengampu</Text>
                <Text style={styles.modalSectionContent}>
                  {activeModalItem?.guru?.nama_lengkap ||
                    activeModalItem?.guru?.full_name ||
                    activeModalItem?.guru?.name ||
                    'Dewan Guru'}
                </Text>
              </View>

              {/* Kompetensi Dasar / Capaian Pembelajaran */}
              <View style={styles.modalSectionBox}>
                <Text style={styles.modalSectionHeader}>Kompetensi Dasar & Capaian Materi</Text>
                <Text style={styles.modalSectionContent}>
                  {activeModalItem?.kompetensi_dasar ||
                    'Sesuai dengan silabus kurikulum dan tujuan pembelajaran yang telah ditetapkan.'}
                </Text>
              </View>

              {/* Distribusi Bobot Soal (Visual Cards & Progress Bar) */}
              {(() => {
                const bobotItems = parseDistribusiBobot(activeModalItem?.distribusi_bobot);
                if (bobotItems.length === 0) return null;
                const totalBobot = bobotItems.reduce((acc, curr) => acc + curr.percentage, 0);

                return (
                  <View style={styles.modalSectionBox}>
                    <View style={styles.bobotSectionHeaderRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalSectionHeader}>Distribusi Bobot Soal</Text>
                        <Text style={styles.bobotSectionSub}>
                          Proporsi bobot penilaian berdasarkan tipe butir soal
                        </Text>
                      </View>
                      <View
                        style={[
                          styles.bobotTotalBadge,
                          totalBobot === 100 ? styles.bobotTotalBadgeValid : styles.bobotTotalBadgeCustom,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={totalBobot === 100 ? 'check-decagram' : 'information-outline'}
                          size={13}
                          color={totalBobot === 100 ? '#059669' : '#D97706'}
                        />
                        <Text
                          style={[
                            styles.bobotTotalBadgeText,
                            { color: totalBobot === 100 ? '#059669' : '#D97706' },
                          ]}
                        >
                          Total {totalBobot}%
                        </Text>
                      </View>
                    </View>

                    {/* Segmented Visual Progress Bar */}
                    {totalBobot > 0 && (
                      <View style={styles.bobotSegmentedBar}>
                        {bobotItems
                          .filter((b) => b.percentage > 0)
                          .map((b, idx) => (
                            <View
                              key={`seg-${idx}`}
                              style={{
                                flex: b.percentage,
                                backgroundColor: b.color,
                                height: 6,
                              }}
                            />
                          ))}
                      </View>
                    )}

                    {/* Grid of Bobot Cards */}
                    <View style={styles.bobotCardsGrid}>
                      {bobotItems.map((b) => (
                        <View
                          key={b.key}
                          style={[
                            styles.bobotCardItem,
                            { backgroundColor: b.bgColor, borderColor: b.borderColor },
                          ]}
                        >
                          <View style={styles.bobotCardTopRow}>
                            <View style={[styles.bobotIconCircle, { backgroundColor: b.color }]}>
                              <MaterialCommunityIcons name={b.iconName as any} size={13} color="#FFFFFF" />
                            </View>
                            <Text style={[styles.bobotPercentBadge, { color: b.color }]}>
                              {b.percentage}%
                            </Text>
                          </View>
                          <Text style={styles.bobotCardLabel} numberOfLines={1}>
                            {b.label}
                          </Text>
                          <Text style={styles.bobotCardSub} numberOfLines={1}>
                            {b.subLabel}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                );
              })()}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setActiveModalItem(null)}
                style={styles.modalDoneBtn}
              >
                <Text style={styles.modalDoneBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL FORM TAMBAH / UBAH KISI-KISI GURU (ZERO HARDCODE)
         ══════════════════════════════════════════════════════════════ */}
      {/* ══════════════════════════════════════════════════════════════
          MODAL FORM TAMBAH / UBAH KISI-KISI GURU (BOTTOM SHEET MODAL)
         ══════════════════════════════════════════════════════════════ */}
      {isTeacherOnly && (
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
            <View style={styles.bottomSheetContainer}>
              {/* Drag handle */}
              <View style={styles.bottomSheetDragHandle} />

              {/* Modal Header */}
              <View style={styles.bottomSheetHeader}>
                <View style={{ flex: 1, paddingRight: 8 }}>
                  <Text style={styles.bottomSheetTitle}>
                    {editingGridItem ? 'Ubah Kisi-Kisi Evaluasi' : 'Buat Kisi-Kisi Baru'}
                  </Text>
                  <Text style={styles.formTeacherLockedNote}>
                    Penyusun: {user?.name || 'Dewan Guru'} (Akun Anda Terverifikasi)
                  </Text>
                </View>
                <TouchableOpacity
                  disabled={formSubmitting}
                  onPress={() => setIsFormModalOpen(false)}
                  style={styles.modalCloseBtn}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* Form Body ScrollView */}
              <ScrollView
                style={styles.bottomSheetBody}
                contentContainerStyle={{ paddingBottom: 28 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* 1. Judul Kisi-Kisi */}
                <View style={styles.formGroupSpaced}>
                  <Text style={styles.formLabel}>
                    Judul Kisi-Kisi <Text style={{ color: '#EF4444' }}>*</Text>
                  </Text>
                  <TextInput
                    style={styles.formTextInput}
                    placeholder="Contoh: Kisi-Kisi Ulangan Harian Bab 1"
                    placeholderTextColor="#94A3B8"
                    value={formData.judul_kisi}
                    onChangeText={(txt) => setFormData((prev) => ({ ...prev, judul_kisi: txt }))}
                  />
                </View>

                {/* 2. Mata Pelajaran (Dropdown Trigger) */}
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
                      <MaterialCommunityIcons name="book-open-variant" size={19} color="#059669" />
                      <Text
                        style={selectedSubjectItem ? styles.dropdownValueText : styles.dropdownPlaceholder}
                        numberOfLines={1}
                      >
                        {selectedSubjectItem ? (selectedSubjectItem.nama_mapel || selectedSubjectItem.name) : 'Pilih Mata Pelajaran...'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* 3. Kelas / Rombongan Belajar (Dropdown Trigger) */}
                <View style={styles.formGroupSpaced}>
                  <Text style={styles.formLabel}>Rombongan Belajar (Kelas)</Text>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.dropdownTrigger}
                    onPress={() => {
                      setPickerSearch('');
                      setPickerModal({ isOpen: true, type: 'kelas', title: 'Pilih Rombongan Belajar (Kelas)' });
                    }}
                  >
                    <View style={styles.dropdownLeftWrap}>
                      <MaterialCommunityIcons name="google-classroom" size={19} color="#0284C7" />
                      <Text
                        style={selectedClassFormItem ? styles.dropdownValueText : styles.dropdownPlaceholder}
                        numberOfLines={1}
                      >
                        {selectedClassFormItem ? (selectedClassFormItem.nama_kelas || selectedClassFormItem.name) : 'Pilih Rombongan Belajar...'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* 4. Jenis Ujian (Dropdown Trigger) */}
                <View style={styles.formGroupSpaced}>
                  <Text style={styles.formLabel}>Jenis Evaluasi / Ujian</Text>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.dropdownTrigger}
                    onPress={() => {
                      setPickerSearch('');
                      setPickerModal({ isOpen: true, type: 'jenis_ujian', title: 'Pilih Jenis Ujian' });
                    }}
                  >
                    <View style={styles.dropdownLeftWrap}>
                      <MaterialCommunityIcons name="clipboard-text-outline" size={19} color="#D97706" />
                      <Text style={styles.dropdownValueText} numberOfLines={1}>
                        {selectedExamTypeFormLabel}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* 5. Alokasi Waktu & Jumlah Soal */}
                <View style={[styles.formGroupSpaced, { flexDirection: 'row', gap: 12 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Jumlah Soal</Text>
                    <TextInput
                      style={styles.formTextInput}
                      keyboardType="numeric"
                      value={String(formData.jumlah_soal)}
                      onChangeText={(txt) => setFormData((prev) => ({ ...prev, jumlah_soal: Number(txt) || 0 }))}
                    />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formLabel}>Alokasi (Menit)</Text>
                    <TextInput
                      style={styles.formTextInput}
                      keyboardType="numeric"
                      value={String(formData.alokasi_waktu_menit)}
                      onChangeText={(txt) => setFormData((prev) => ({ ...prev, alokasi_waktu_menit: Number(txt) || 0 }))}
                    />
                  </View>
                </View>

                {/* 6. Level Kognitif (Dropdown Trigger) */}
                <View style={styles.formGroupSpaced}>
                  <Text style={styles.formLabel}>Level Kognitif Utama</Text>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.dropdownTrigger}
                    onPress={() => {
                      setPickerSearch('');
                      setPickerModal({ isOpen: true, type: 'level_kognitif', title: 'Pilih Level Kognitif' });
                    }}
                  >
                    <View style={styles.dropdownLeftWrap}>
                      <MaterialCommunityIcons name="brain" size={19} color="#7C3AED" />
                      <Text style={styles.dropdownValueText} numberOfLines={1}>
                        {formData.level_kognitif || 'Pilih Level Kognitif...'}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* 7. Capaian Pembelajaran (CP) [Opsional Dropdown] */}
                <View style={styles.formGroupSpaced}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <Text style={styles.formLabel}>Capaian Pembelajaran (CP)</Text>
                    <Text style={styles.formOptionalBadge}>Opsional</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={styles.dropdownTrigger}
                    onPress={() => {
                      setPickerSearch('');
                      setPickerModal({ isOpen: true, type: 'cp', title: 'Pilih Capaian Pembelajaran (CP)' });
                    }}
                  >
                    <View style={styles.dropdownLeftWrap}>
                      <MaterialCommunityIcons name="target" size={19} color="#059669" />
                      <Text
                        style={selectedCpItem ? styles.dropdownValueText : styles.dropdownPlaceholder}
                        numberOfLines={1}
                      >
                        {selectedCpItem
                          ? `${selectedCpItem.kode_cp ? `[${selectedCpItem.kode_cp}] ` : ''}${selectedCpItem.nama_cp || selectedCpItem.label}`
                          : (loadingDropdownOptions
                            ? 'Memuat data CP...'
                            : (teacherOptions.capaian_pembelajaran.length > 0
                              ? 'Pilih Capaian Pembelajaran (CP)...'
                              : 'Belum ada CP untuk mapel ini'))}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                  </TouchableOpacity>
                  {teacherOptions.capaian_pembelajaran.length === 0 && (
                    <View style={styles.formNoticeBox}>
                      <MaterialCommunityIcons name="information-outline" size={15} color="#B45309" />
                      <Text style={styles.formNoticeText}>
                        Master CP belum tersedia untuk mapel ini. Anda dapat langsung mengisikan indikator kompetensi materi di bawah.
                      </Text>
                    </View>
                  )}
                </View>

                {/* 8. Tujuan Pembelajaran (TP) [Opsional Dropdown] */}
                <View style={styles.formGroupSpaced}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                    <Text style={styles.formLabel}>Tujuan Pembelajaran (TP)</Text>
                    <Text style={styles.formOptionalBadge}>Opsional</Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.75}
                    disabled={!formData.cp_id}
                    style={[styles.dropdownTrigger, !formData.cp_id && styles.dropdownTriggerDisabled]}
                    onPress={() => {
                      setPickerSearch('');
                      setPickerModal({ isOpen: true, type: 'tp', title: 'Pilih Tujuan Pembelajaran (TP)' });
                    }}
                  >
                    <View style={styles.dropdownLeftWrap}>
                      <MaterialCommunityIcons
                        name="checkbox-marked-circle-outline"
                        size={19}
                        color={formData.cp_id ? '#059669' : '#94A3B8'}
                      />
                      <Text
                        style={selectedTpItem ? styles.dropdownValueText : styles.dropdownPlaceholder}
                        numberOfLines={1}
                      >
                        {selectedTpItem
                          ? `${selectedTpItem.kode_tp ? `[${selectedTpItem.kode_tp}] ` : ''}${selectedTpItem.deskripsi || selectedTpItem.nama_tp || selectedTpItem.label}`
                          : (!formData.cp_id
                            ? 'Pilih CP terlebih dahulu'
                            : (loadingDropdownOptions
                              ? 'Memuat data TP...'
                              : (teacherOptions.tujuan_pembelajaran.length > 0
                                ? 'Pilih Tujuan Pembelajaran (TP)...'
                                : 'Tidak ada TP untuk CP ini')))}
                      </Text>
                    </View>
                    <MaterialCommunityIcons name="chevron-down" size={20} color={formData.cp_id ? '#64748B' : '#CBD5E1'} />
                  </TouchableOpacity>
                </View>

                {/* 9. Kompetensi Dasar / Capaian Materi */}
                <View style={styles.formGroupSpaced}>
                  <Text style={styles.formLabel}>Kompetensi Dasar / Capaian Materi</Text>
                  <TextInput
                    style={[styles.formTextInput, { minHeight: 76, textAlignVertical: 'top' }]}
                    multiline
                    placeholder="Tuliskan kompetensi dasar, capaian materi, atau indikator soal..."
                    placeholderTextColor="#94A3B8"
                    value={formData.kompetensi_dasar}
                    onChangeText={(txt) => setFormData((prev) => ({ ...prev, kompetensi_dasar: txt }))}
                  />
                </View>

                {/* 10. Distribusi Bobot Soal (PG, Isian, Esai = 100%) */}
                <View style={styles.formGroupSpaced}>
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                    <Text style={styles.formLabel}>Distribusi Bobot Soal (%)</Text>
                    {(() => {
                      const tot = (Number(formData.distribusi_bobot.pg) || 0) +
                        (Number(formData.distribusi_bobot.isian) || 0) +
                        (Number(formData.distribusi_bobot.esai) || 0);
                      const isValid = tot === 100;
                      return (
                        <View style={[styles.bobotBadgeMini, isValid ? styles.bobotBadgeMiniValid : styles.bobotBadgeMiniInvalid]}>
                          <Text style={[styles.bobotBadgeMiniText, isValid ? { color: '#059669' } : { color: '#EF4444' }]}>
                            Total: {tot}% {isValid ? '✓' : '(Wajib 100%)'}
                          </Text>
                        </View>
                      );
                    })()}
                  </View>

                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bobotInputSubLabel}>Pilihan Ganda</Text>
                      <TextInput
                        style={styles.formTextInputSmall}
                        keyboardType="numeric"
                        value={String(formData.distribusi_bobot.pg ?? 0)}
                        onChangeText={(txt) =>
                          setFormData((prev) => ({
                            ...prev,
                            distribusi_bobot: { ...prev.distribusi_bobot, pg: Number(txt) || 0 },
                          }))
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bobotInputSubLabel}>Isian Singkat</Text>
                      <TextInput
                        style={styles.formTextInputSmall}
                        keyboardType="numeric"
                        value={String(formData.distribusi_bobot.isian ?? 0)}
                        onChangeText={(txt) =>
                          setFormData((prev) => ({
                            ...prev,
                            distribusi_bobot: { ...prev.distribusi_bobot, isian: Number(txt) || 0 },
                          }))
                        }
                      />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.bobotInputSubLabel}>Uraian / Esai</Text>
                      <TextInput
                        style={styles.formTextInputSmall}
                        keyboardType="numeric"
                        value={String(formData.distribusi_bobot.esai ?? 0)}
                        onChangeText={(txt) =>
                          setFormData((prev) => ({
                            ...prev,
                            distribusi_bobot: { ...prev.distribusi_bobot, esai: Number(txt) || 0 },
                          }))
                        }
                      />
                    </View>
                  </View>
                  {Boolean(formDistribusiError) && (
                    <Text style={{ fontSize: 11, color: '#EF4444', marginTop: 6, fontWeight: '700' }}>
                      {formDistribusiError}
                    </Text>
                  )}
                </View>

                {/* 11. Status Publikasi */}
                <View style={styles.formGroupSpaced}>
                  <Text style={styles.formLabel}>Status Publikasi</Text>
                  <View style={{ flexDirection: 'row', gap: 10 }}>
                    <TouchableOpacity
                      onPress={() => setFormData((prev) => ({ ...prev, status: true }))}
                      style={[
                        styles.statusSelectBtn,
                        formData.status && styles.statusSelectBtnActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={formData.status ? 'check-circle' : 'circle-outline'}
                        size={17}
                        color={formData.status ? '#059669' : '#94A3B8'}
                      />
                      <Text style={[styles.statusSelectText, formData.status && styles.statusSelectTextActive]}>
                        Aktif / Terbit
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      onPress={() => setFormData((prev) => ({ ...prev, status: false }))}
                      style={[
                        styles.statusSelectBtn,
                        !formData.status && styles.statusSelectBtnInactive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={!formData.status ? 'check-circle' : 'circle-outline'}
                        size={17}
                        color={!formData.status ? '#DC2626' : '#94A3B8'}
                      />
                      <Text style={[styles.statusSelectText, !formData.status && styles.statusSelectTextInactive]}>
                        Draft / Nonaktif
                      </Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </ScrollView>

              {/* Form Footer */}
              <View style={styles.bottomSheetFooter}>
                <TouchableOpacity
                  disabled={formSubmitting}
                  onPress={() => setIsFormModalOpen(false)}
                  style={styles.formCancelBtn}
                >
                  <Text style={styles.formCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={formSubmitting}
                  onPress={() => void handleFormSubmit()}
                  style={styles.formSubmitBtn}
                >
                  {formSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="content-save-outline" size={17} color="#FFFFFF" />
                      <Text style={styles.formSubmitBtnText}>
                        {editingGridItem ? 'Perbarui Kisi-Kisi' : 'Simpan Kisi-Kisi'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
          SUB-MODAL PICKER DROPDOWN (BOTTOM SHEET SELECTOR)
         ══════════════════════════════════════════════════════════════ */}
      {isTeacherOnly && (
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

              {/* Search bar inside picker */}
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

              <ScrollView
                style={styles.bottomSheetBody}
                contentContainerStyle={{ paddingBottom: 28 }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Opsi Kosongkan khusus untuk field opsional (CP & TP) */}
                {(pickerModal.type === 'cp' || pickerModal.type === 'tp') && (
                  <TouchableOpacity
                    style={[
                      styles.pickerListItem,
                      (pickerModal.type === 'cp' ? !formData.cp_id : !formData.tp_id) && styles.pickerListItemActive,
                    ]}
                    onPress={() => {
                      if (pickerModal.type === 'cp') {
                        void handleSelectCp('');
                      } else {
                        handleSelectTp('');
                      }
                    }}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={styles.pickerClearOptionText}>
                        (Tidak Memilih / Kosongkan)
                      </Text>
                    </View>
                    {(pickerModal.type === 'cp' ? !formData.cp_id : !formData.tp_id) && (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                    )}
                  </TouchableOpacity>
                )}

                {/* 1. Mata Pelajaran Picker */}
                {pickerModal.type === 'subject' && (() => {
                  const filtered = teacherOptions.subjects.filter((s) => {
                    const text = `${s.nama_mapel || ''} ${s.name || ''} ${s.kode_mapel || ''}`.toLowerCase();
                    return text.includes(pickerSearch.toLowerCase());
                  });
                  if (filtered.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>Mata pelajaran tidak ditemukan</Text>
                      </View>
                    );
                  }
                  return filtered.map((s) => {
                    const isSel = String(formData.mata_pelajaran_id) === String(s.id);
                    return (
                      <TouchableOpacity
                        key={`pick-subj-${s.id}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => void handleSelectSubject(String(s.id))}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {s.nama_mapel || s.name}
                          </Text>
                          {Boolean(s.kode_mapel) && (
                            <Text style={[styles.pickerListItemSub, isSel && styles.pickerListItemSubActive]}>
                              Kode: {s.kode_mapel}
                            </Text>
                          )}
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}

                {/* 2. Rombel / Kelas Picker */}
                {pickerModal.type === 'kelas' && (() => {
                  const filtered = teacherOptions.kelas.filter((k) => {
                    const text = `${k.nama_kelas || ''} ${k.name || ''}`.toLowerCase();
                    return text.includes(pickerSearch.toLowerCase());
                  });
                  if (filtered.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>Kelas tidak ditemukan</Text>
                      </View>
                    );
                  }
                  return filtered.map((k) => {
                    const isSel = String(formData.kelas_id) === String(k.id);
                    return (
                      <TouchableOpacity
                        key={`pick-cls-${k.id}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => {
                          setFormData((prev) => ({ ...prev, kelas_id: String(k.id) }));
                          setPickerModal({ isOpen: false, type: null, title: '' });
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {k.nama_kelas || k.name}
                          </Text>
                          {Boolean(k.tingkat) && (
                            <Text style={[styles.pickerListItemSub, isSel && styles.pickerListItemSubActive]}>
                              Tingkat: {k.tingkat}
                            </Text>
                          )}
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}

                {/* 3. Jenis Ujian Picker */}
                {pickerModal.type === 'jenis_ujian' && (() => {
                  const items = Array.isArray(teacherOptions.jenis_ujian_options) ? teacherOptions.jenis_ujian_options : [];
                  if (items.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>Pilihan jenis ujian belum tersedia dari server</Text>
                      </View>
                    );
                  }
                  const filtered = items.filter((typ: any) => {
                    const val = typeof typ === 'string' ? typ : (typ?.id || typ?.value || typ?.code || typ?.nama || typ?.label || '');
                    const lbl = typeof typ === 'string' ? typ : (typ?.nama || typ?.label || typ?.name || typ?.value || typ?.id || '');
                    return `${val} ${lbl}`.toLowerCase().includes(pickerSearch.toLowerCase());
                  });
                  return filtered.map((typ: any, idx: number) => {
                    const val = typeof typ === 'string' ? typ : (typ?.id || typ?.value || typ?.code || typ?.nama || typ?.label || '');
                    const lbl = typeof typ === 'string' ? typ : (typ?.nama || typ?.label || typ?.name || typ?.value || typ?.id || '');
                    const isSel = formData.jenis_ujian === val;
                    return (
                      <TouchableOpacity
                        key={`pick-type-${val || idx}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => {
                          setFormData((prev) => ({ ...prev, jenis_ujian: val }));
                          setPickerModal({ isOpen: false, type: null, title: '' });
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {lbl}
                          </Text>
                          {val !== lbl && Boolean(val) && (
                            <Text style={[styles.pickerListItemSub, isSel && styles.pickerListItemSubActive]}>
                              Tipe: {val}
                            </Text>
                          )}
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}

                {/* 4. Level Kognitif Picker */}
                {pickerModal.type === 'level_kognitif' && (() => {
                  const items = Array.isArray(teacherOptions.level_kognitif_options) ? teacherOptions.level_kognitif_options : [];
                  if (items.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>Pilihan level kognitif belum tersedia dari server</Text>
                      </View>
                    );
                  }
                  const filtered = items.filter((lvl: any) => {
                    const val = typeof lvl === 'string' ? lvl : (lvl?.id || lvl?.value || lvl?.nama || lvl?.label || '');
                    const lbl = typeof lvl === 'string' ? lvl : (lvl?.nama || lvl?.label || lvl?.name || lvl?.value || lvl?.id || '');
                    return `${val} ${lbl}`.toLowerCase().includes(pickerSearch.toLowerCase());
                  });
                  return filtered.map((lvl: any, idx: number) => {
                    const val = typeof lvl === 'string' ? lvl : (lvl?.id || lvl?.value || lvl?.nama || lvl?.label || '');
                    const lbl = typeof lvl === 'string' ? lvl : (lvl?.nama || lvl?.label || lvl?.name || lvl?.value || lvl?.id || '');
                    const isSel = formData.level_kognitif === val;
                    return (
                      <TouchableOpacity
                        key={`pick-lvl-${val || idx}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => {
                          setFormData((prev) => ({ ...prev, level_kognitif: val }));
                          setPickerModal({ isOpen: false, type: null, title: '' });
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {lbl}
                          </Text>
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}

                {/* 5. Capaian Pembelajaran (CP) Picker */}
                {pickerModal.type === 'cp' && (() => {
                  const filtered = teacherOptions.capaian_pembelajaran.filter((cp) => {
                    const text = `${cp.kode_cp || ''} ${cp.nama_cp || ''} ${cp.deskripsi || ''}`.toLowerCase();
                    return text.includes(pickerSearch.toLowerCase());
                  });
                  if (filtered.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>
                          {teacherOptions.capaian_pembelajaran.length === 0
                            ? 'Belum ada CP terdaftar untuk mata pelajaran ini'
                            : 'Capaian Pembelajaran tidak ditemukan'}
                        </Text>
                      </View>
                    );
                  }
                  return filtered.map((cp) => {
                    const isSel = String(formData.cp_id) === String(cp.id);
                    return (
                      <TouchableOpacity
                        key={`pick-cp-${cp.id}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => void handleSelectCp(String(cp.id))}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {cp.kode_cp ? `[${cp.kode_cp}] ` : ''}{cp.nama_cp || cp.label}
                          </Text>
                          {Boolean(cp.deskripsi) && (
                            <Text style={[styles.pickerListItemSub, isSel && styles.pickerListItemSubActive]} numberOfLines={2}>
                              {cp.deskripsi}
                            </Text>
                          )}
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}

                {/* 6. Tujuan Pembelajaran (TP) Picker */}
                {pickerModal.type === 'tp' && (() => {
                  const filtered = teacherOptions.tujuan_pembelajaran.filter((tp) => {
                    const text = `${tp.kode_tp || ''} ${tp.deskripsi || ''} ${tp.nama_tp || ''} ${tp.materi_pokok || ''}`.toLowerCase();
                    return text.includes(pickerSearch.toLowerCase());
                  });
                  if (filtered.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>
                          {teacherOptions.tujuan_pembelajaran.length === 0
                            ? 'Belum ada TP terdaftar untuk CP ini'
                            : 'Tujuan Pembelajaran tidak ditemukan'}
                        </Text>
                      </View>
                    );
                  }
                  return filtered.map((tp) => {
                    const isSel = String(formData.tp_id) === String(tp.id);
                    return (
                      <TouchableOpacity
                        key={`pick-tp-${tp.id}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => handleSelectTp(String(tp.id))}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {tp.kode_tp ? `[${tp.kode_tp}] ` : ''}{tp.deskripsi || tp.nama_tp || tp.label}
                          </Text>
                          {Boolean(tp.materi_pokok) && (
                            <Text style={[styles.pickerListItemSub, isSel && styles.pickerListItemSubActive]} numberOfLines={1}>
                              Materi: {tp.materi_pokok}
                            </Text>
                          )}
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}

                {/* 7. Filter Rombel / Kelas Picker */}
                {pickerModal.type === 'filter_kelas' && (() => {
                  const filtered = classOptions.filter((c) => {
                    return c.label.toLowerCase().includes(pickerSearch.toLowerCase());
                  });
                  if (filtered.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>Kelas tidak ditemukan</Text>
                      </View>
                    );
                  }
                  return filtered.map((c) => {
                    const isSel = selectedClass === c.id;
                    return (
                      <TouchableOpacity
                        key={`pick-fcls-${c.id}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => {
                          setSelectedClass(c.id);
                          setPickerModal({ isOpen: false, type: null, title: '' });
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {c.label}
                          </Text>
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}

                {/* 8. Filter Mata Pelajaran Picker */}
                {pickerModal.type === 'filter_subject' && (() => {
                  const filtered = subjectOptions.filter((s) => {
                    const lbl = s === 'Semua' ? 'Semua Mata Pelajaran' : s;
                    return lbl.toLowerCase().includes(pickerSearch.toLowerCase());
                  });
                  if (filtered.length === 0) {
                    return (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12.5, color: '#94A3B8' }}>Mata pelajaran tidak ditemukan</Text>
                      </View>
                    );
                  }
                  return filtered.map((s) => {
                    const isSel = selectedSubject === s;
                    const lbl = s === 'Semua' ? 'Semua Mata Pelajaran' : s;
                    return (
                      <TouchableOpacity
                        key={`pick-fsubj-${s}`}
                        style={[styles.pickerListItem, isSel && styles.pickerListItemActive]}
                        onPress={() => {
                          setSelectedSubject(s);
                          setPickerModal({ isOpen: false, type: null, title: '' });
                        }}
                      >
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text style={[styles.pickerListItemText, isSel && styles.pickerListItemTextActive]}>
                            {lbl}
                          </Text>
                        </View>
                        {isSel && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  });
                })()}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
          MODAL KONFIRMASI HAPUS (TAILGRIDS HARMONIZED STYLE)
         ══════════════════════════════════════════════════════════════ */}
      {isTeacherOnly && (
        <Modal
          visible={deleteModal.isOpen}
          transparent
          animationType="fade"
          onRequestClose={() => !deleteModal.isSubmitting && setDeleteModal({ isOpen: false, item: null, isSubmitting: false })}
        >
          <View style={styles.modalBackdrop}>
            <View style={[styles.modalContainer, { maxWidth: 380 }]}>
              <View style={{ alignItems: 'center', marginBottom: 14 }}>
                <View style={styles.deleteIconSquircle}>
                  <MaterialCommunityIcons name="trash-can-outline" size={28} color="#E11D48" />
                </View>
                <Text style={styles.deleteModalTitle}>Hapus Kisi-Kisi Ujian?</Text>
                <Text style={styles.deleteModalDesc}>
                  Apakah Anda yakin ingin menghapus kisi-kisi "{deleteModal.item?.judul_kisi}"?
                </Text>
                {(deleteModal.item?.bank_soal_count ?? 0) > 0 && (
                  <View style={styles.deleteWarningBox}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#B45309" />
                    <Text style={styles.deleteWarningText}>
                      Kisi-kisi ini telah memiliki {deleteModal.item?.bank_soal_count} butir soal di Bank Soal.
                    </Text>
                  </View>
                )}
              </View>

              <View style={styles.formModalFooter}>
                <TouchableOpacity
                  disabled={deleteModal.isSubmitting}
                  onPress={() => setDeleteModal({ isOpen: false, item: null, isSubmitting: false })}
                  style={styles.formCancelBtn}
                >
                  <Text style={styles.formCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  disabled={deleteModal.isSubmitting}
                  onPress={() => void handleConfirmDelete()}
                  style={styles.deleteConfirmBtn}
                >
                  {deleteModal.isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="trash-can" size={16} color="#FFFFFF" />
                      <Text style={styles.deleteConfirmBtnText}>Hapus Permanen</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* ══════════════════════════════════════════════════════════════
          OFFICIAL FEEDBACK MODAL DIALOG (PENYIMPANAN, PERUBAHAN, SALIN, HAPUS)
         ══════════════════════════════════════════════════════════════ */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          actionLabel={feedbackModal.actionLabel}
          cancelLabel={feedbackModal.cancelLabel}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* ══════════════════════════════════════════════════════════════
          FLOATING IN-APP TOAST FEEDBACK
         ══════════════════════════════════════════════════════════════ */}
      {toastMessage && (
        <View
          style={[
            styles.floatingToast,
            toastMessage.type === 'error' ? styles.floatingToastError : styles.floatingToastSuccess,
          ]}
        >
          <MaterialCommunityIcons
            name={toastMessage.type === 'error' ? 'alert-circle' : 'check-circle'}
            size={18}
            color="#FFFFFF"
          />
          <Text style={styles.floatingToastText}>{toastMessage.text}</Text>
        </View>
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
  cleanMainScrollContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  cleanScrollInner: {
    width: '100%',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  mainScrollContent: {
    flexGrow: 1,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 10,
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
    color: '#047857',
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
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1.2,
  },
  studentStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  kisiGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  kisiGroupHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  kisiGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  kisiGroupHeaderIconBoxWhite: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  kisiGroupTitleWhite: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  kisiGroupSubWhite: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 1,
  },
  kisiGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  kisiGroupBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  kpiRowModern: {
    flexDirection: 'row',
    gap: 10,
    padding: 12,
  },
  kpiCardModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
  },
  kpiIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabelModern: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  kpiValueModern: {
    fontSize: 17,
    fontWeight: '800',
    marginVertical: 1,
  },
  kpiSubModern: {
    fontSize: 9.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  kpiProgressBannerWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  kpiProgressBanner: {
    borderRadius: 12,
    padding: 10,
  },
  kpiProgressBannerEmerald: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  kpiProgressBannerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiProgressBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  kpiProgressBannerSub: {
    fontSize: 10.5,
    color: '#059669',
    marginTop: 1,
  },
  heroCreateBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 2,
  },
  heroCreateBtnSmallText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  kpiMiniProgressBarBg: {
    height: 6,
    backgroundColor: '#D1FAE5',
    borderRadius: 3,
    overflow: 'hidden',
  },
  kpiMiniProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  kpiFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiFilterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  searchContainerModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInputModern: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },
  filterDropdownRowModern: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  filterDropdownTriggerModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  filterDropdownValueModern: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  countBadgeModern: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  countBadgeModernText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  gridCardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 12,
  },
  gridSubjectIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gridTitleMetaCol: {
    flex: 1,
  },
  gridSpecsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  gridSpecItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  gridSpecDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  gridSpecLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  gridSpecValue: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
  },
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

  // Search & Filter Card (Kaya Warna, Lega, Modern & Bebas Himpitan)
  filterCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 14,
    paddingTop: 16,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    gap: 12,
    overflow: 'hidden',
    position: 'relative',
  },
  filterCardAccentBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 10,
    height: 48,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  searchIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  filterDropdownRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterDropdownTrigger: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    minHeight: 50,
  },
  filterDropdownTriggerClass: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  filterDropdownTriggerActiveClass: {
    borderColor: '#0284C7',
    backgroundColor: '#E0F2FE',
  },
  filterDropdownIconBoxSky: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E0F2FE',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDropdownSubLabelSky: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0369A1',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  filterDropdownValueSky: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0C4A6E',
    marginTop: 1,
  },
  filterDropdownTriggerMapel: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  filterDropdownTriggerActiveMapel: {
    borderColor: '#059669',
    backgroundColor: '#D1FAE5',
  },
  filterDropdownIconBoxEmerald: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDropdownSubLabelEmerald: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  filterDropdownValueEmerald: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
    marginTop: 1,
  },
  filterDropdownLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 4,
  },
  filterDropdownIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDropdownSubLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  filterDropdownValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 1,
  },
  filterDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 2,
  },
  examFilterScrollTrack: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  examFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  examFilterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowColor: '#059669',
    shadowOpacity: 0.22,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  examFilterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  examFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  examFilterBadge: {
    marginLeft: 6,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  examFilterBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  examFilterBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
  },
  examFilterBadgeTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  subjectFilterScroll: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Summary Banner
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  summarySubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  // Grids List
  gridsList: {
    gap: 12,
  },
  gridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  classBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  classBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0284C7',
    textTransform: 'uppercase',
  },
  examTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  examTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#854D0E',
  },
  gridTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 6,
  },
  infoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  infoMetaText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  attributePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  attrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  attrPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#18A165',
  },

  // State Views
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalSubjectBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  modalSubjectBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  modalTitle: {
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
  modalBody: {
    marginVertical: 12,
  },
  modalMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  modalMetaItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalMetaLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
  },
  modalMetaValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  modalSectionBox: {
    marginBottom: 14,
  },
  modalSectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSectionContent: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 18,
  },
  // Bobot section in Modal
  bobotSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  bobotSectionSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  bobotTotalBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  bobotTotalBadgeValid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  bobotTotalBadgeCustom: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  bobotTotalBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  bobotSegmentedBar: {
    flexDirection: 'row',
    height: 6,
    borderRadius: 3,
    overflow: 'hidden',
    backgroundColor: '#E2E8F0',
    marginBottom: 10,
  },
  bobotCardsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bobotCardItem: {
    flex: 1,
    minWidth: '29%',
    borderRadius: 12,
    padding: 9,
    borderWidth: 1,
  },
  bobotCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  bobotIconCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bobotPercentBadge: {
    fontSize: 13,
    fontWeight: '900',
  },
  bobotCardLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  bobotCardSub: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },

  // Bobot row in Card List
  cardBobotRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 6,
    flexWrap: 'wrap',
  },
  cardBobotHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardBobotPrefix: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  cardBobotBadgesWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
  },
  cardBobotChip: {
    paddingHorizontal: 6.5,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
  },
  cardBobotChipText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  modalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalDoneBtn: {
    backgroundColor: '#18A165',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },

  // ══════════════════════════════════════════════════════════════
  // TEACHER LMS STYLES (FILTER, ACTIONS, MODALS, PROGRESS, TOAST)
  // ══════════════════════════════════════════════════════════════
  filterChipActiveClass: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  filterChipActiveExam: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  heroCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  heroCreateBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
  },
  statusMiniBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  statusMiniActive: {
    backgroundColor: '#ECFDF5',
  },
  statusMiniInactive: {
    backgroundColor: '#F1F5F9',
  },
  statusMiniText: {
    fontSize: 10,
    fontWeight: '800',
  },
  teacherProgressBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teacherProgressLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  teacherProgressVal: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  teacherProgressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  teacherProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  // Key Attributes 3-Column Mini Grid (Simetris, Bebas Himpitan)
  cardInfoGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  cardInfoCol: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 7,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  cardInfoVal: {
    fontSize: 11.5,
    fontWeight: '800',
    marginTop: 2,
    textAlign: 'center',
  },
  cardInfoSub: {
    fontSize: 9.5,
    fontWeight: '700',
    marginTop: 1,
    textAlign: 'center',
  },

  // Teacher Card Actions (2 Baris Terstruktur & Tidak Berhimpitan)
  teacherCardActionsCol: {
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teacherActionRowPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teacherActionRowSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teacherActionBtnBankSoal: {
    flex: 1.35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  teacherActionBtnBankSoalText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
  },
  teacherActionBtnDetail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  teacherActionBtnDetailText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#047857',
  },
  teacherActionBtnManage: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderWidth: 1,
  },
  teacherActionBtnManageText: {
    fontSize: 11,
    fontWeight: '800',
  },

  // Student & Parent Detail Button
  studentDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginTop: 8,
  },
  studentDetailBtnLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  studentDetailBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#047857',
  },
  formTeacherLockedNote: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  formGroup: {
    marginBottom: 12,
  },
  formLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 5,
  },
  formTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  formTextInputSmall: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 8,
    paddingVertical: 6,
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
    textAlign: 'center',
  },
  chipsScrollWrap: {
    flexDirection: 'row',
    gap: 6,
    paddingVertical: 2,
  },
  formSelectChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formSelectChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  formSelectChipActiveClass: {
    backgroundColor: '#0284C7',
    borderColor: '#0284C7',
  },
  formSelectChipActiveExam: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  formSelectChipActivePurple: {
    backgroundColor: '#7C3AED',
    borderColor: '#7C3AED',
  },
  formSelectChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  formSelectChipTextActive: {
    color: '#FFFFFF',
  },
  formSelectChipTextActiveClass: {
    color: '#FFFFFF',
  },
  formSelectChipTextActiveExam: {
    color: '#FFFFFF',
  },
  formSelectChipTextActivePurple: {
    color: '#FFFFFF',
  },
  bobotInputSubLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 3,
    textAlign: 'center',
  },
  statusSelectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  statusSelectBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  statusSelectBtnInactive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECDD3',
  },
  statusSelectText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  statusSelectTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  statusSelectTextInactive: {
    color: '#DC2626',
    fontWeight: '800',
  },
  formModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  formCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  formCancelBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  formSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  formSubmitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  deleteIconSquircle: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  deleteModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  deleteModalDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  deleteWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 8,
  },
  deleteWarningText: {
    fontSize: 11,
    color: '#92400E',
    fontWeight: '700',
    flex: 1,
  },
  deleteConfirmBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: '#E11D48',
  },
  deleteConfirmBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  floatingToast: {
    position: 'absolute',
    top: 50,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
    zIndex: 9999,
  },
  floatingToastSuccess: {
    backgroundColor: '#059669',
  },
  floatingToastError: {
    backgroundColor: '#DC2626',
  },
  floatingToastText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
    flex: 1,
  },

  // Bottom Sheet Form & Picker Modal
  bottomSheetBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.65)',
    justifyContent: 'flex-end',
  },
  bottomSheetDismissArea: {
    flex: 1,
  },
  bottomSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  bottomSheetDragHandle: {
    width: 44,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginTop: 10,
    marginBottom: 8,
  },
  bottomSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  bottomSheetTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  bottomSheetBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  bottomSheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  formGroupSpaced: {
    marginBottom: 16,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  dropdownTriggerDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
    opacity: 0.7,
  },
  dropdownLeftWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  dropdownValueText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  dropdownPlaceholder: {
    fontSize: 13,
    fontWeight: '500',
    color: '#94A3B8',
  },
  formNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderRadius: 8,
    marginTop: 6,
  },
  formNoticeText: {
    fontSize: 11,
    color: '#B45309',
    flex: 1,
    lineHeight: 16,
    fontWeight: '600',
  },
  formOptionalBadge: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  bobotBadgeMini: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
  },
  bobotBadgeMiniValid: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  bobotBadgeMiniInvalid: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECDD3',
  },
  bobotBadgeMiniText: {
    fontSize: 11,
    fontWeight: '800',
  },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginHorizontal: 20,
    marginTop: 12,
    marginBottom: 4,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
    fontWeight: '600',
  },
  pickerListItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  pickerListItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  pickerListItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#1E293B',
  },
  pickerListItemTextActive: {
    color: '#065F46',
    fontWeight: '800',
  },
  pickerListItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 3,
    lineHeight: 15,
  },
  pickerListItemSubActive: {
    color: '#047857',
  },
  pickerClearOptionText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    fontStyle: 'italic',
  },
  cleanHeaderTitleCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  cleanHeaderSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
  kpiGridContainer: {
    marginTop: 6,
    marginBottom: 10,
    gap: 8,
  },
  kpiGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kpiGridCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiCardEmerald: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
  },
  kpiCardSky: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
  },
  kpiCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
  },
  kpiCardPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    shadowColor: '#7C3AED',
  },
  kpiIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiTextCol: {
    marginLeft: 8,
    flex: 1,
  },
  kpiValueLarge: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  teacherFab: {
    position: 'absolute',
    right: 18,
    borderRadius: 24,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.28,
    shadowRadius: 8,
    elevation: 6,
    zIndex: 99,
  },
  teacherFabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 18,
    borderRadius: 24,
    gap: 6,
  },
  teacherFabText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
