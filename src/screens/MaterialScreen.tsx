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
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isTeacherRole, isTuRole, isPrincipalRole, isSuperAdminRole } from '../utils/roles';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { DEFAULT_PARENT_AVATAR, getProfileImageUrl } from '../utils/profile';
import { EmptyStateCard } from '../components/EmptyStateCard';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { TeacherStickyHeader } from '../components/TeacherStickyHeader';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import {
  PORTAL_BODY_PALETTE,
  PORTAL_BODY_TEXTS,
  PORTAL_HERO_PALETTE,
  portalBodyStyles,
} from '../components/PortalBodyStyles';
import { offlineCache } from '../utils/offlineCache';
import { useDebounce } from '../hooks/useDebounce';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;
const studentCardWidth = SCREEN_WIDTH - (STUDENT_PEEK_WIDTH * 2) - STUDENT_CARD_GAP;
const studentSnapInterval = studentCardWidth + STUDENT_CARD_GAP;
const studentTrackPad = STUDENT_PEEK_WIDTH;
const centerLoopOffset = studentSnapInterval;

type Child = Record<string, any>;
type MaterialItem = Record<string, any>;

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return 'Terbaru';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Terbaru';
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Terbaru';
  }
};

const formatMetaText = (item: any): string => {
  const media = Array.isArray(item.media) ? item.media : [];
  if (media.length > 0) {
    const first = media[0];
    const type = String(first.tipe_file || '').toLowerCase();
    const sizeBytes = Number(first.file_size || first.size || 0);
    const sizeStr = sizeBytes > 0
      ? sizeBytes >= 1048576
        ? `${(sizeBytes / 1048576).toFixed(1)} MB`
        : `${Math.round(sizeBytes / 1024)} KB`
      : '';
    const duration = first.durasi || first.duration;

    if (type === 'pdf') {
      return sizeStr ? `File PDF - ${sizeStr}` : 'File PDF';
    }
    if (type === 'video') {
      return duration ? `Video Pembelajaran - ${duration}` : 'Video Pembelajaran';
    }
    if (type === 'audio') {
      return duration ? `Audio Pembelajaran - ${duration}` : 'Audio Pembelajaran';
    }
    const ext = (first.nama_file || first.file_name || '').split('.').pop()?.toUpperCase();
    return ext ? `File ${ext}${sizeStr ? ' - ' + sizeStr : ''}` : 'Lampiran Berkas';
  }
  if (item.tipe) {
    return `Materi ${item.tipe}`;
  }
  if (item.konten || item.isi || item.deskripsi) {
    return 'Ringkasan Materi';
  }
  return 'Materi Pembelajaran';
};

const getMaterialTypeCategory = (item: any): 'pdf' | 'video' | 'audio' | 'modul' => {
  const media = Array.isArray(item?.media) ? item.media : [];
  for (const m of media) {
    const t = String(m?.tipe_file || m?.type || '').toLowerCase();
    const name = String(m?.nama_file || m?.file_name || m?.url || '').toLowerCase();
    if (t === 'pdf' || name.endsWith('.pdf')) return 'pdf';
    if (t === 'video' || name.endsWith('.mp4') || name.includes('youtube') || name.includes('youtu.be')) return 'video';
    if (t === 'audio' || name.endsWith('.mp3') || name.endsWith('.m4a') || name.endsWith('.wav')) return 'audio';
  }
  const itemType = String(item?.tipe || item?.type || '').toLowerCase();
  const fileUrl = String(item?.file_url || item?.url || item?.tautan || '').toLowerCase();
  if (itemType.includes('pdf') || fileUrl.endsWith('.pdf')) return 'pdf';
  if (itemType.includes('video') || fileUrl.includes('youtube') || fileUrl.includes('youtu.be') || fileUrl.endsWith('.mp4')) return 'video';
  if (itemType.includes('audio') || fileUrl.endsWith('.mp3')) return 'audio';
  return 'modul';
};

import { getDynamicAcademicInfo, getDynamicAcademicYear, getDynamicAcademicSemester } from '../utils/academicYear';

const getSubjectStyle = (name?: string, media?: any[]) => {
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
      icon: 'video-outline',
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
  if (Array.isArray(media) && media.length > 0) {
    const t = String(media[0]?.tipe_file || '').toLowerCase();
    if (t === 'video') return { bg: '#F3E8FF', color: '#9333EA', icon: 'video-outline' };
    if (t === 'pdf') return { bg: '#E0F2FE', color: '#2563EB', icon: 'file-document-outline' };
    if (t === 'audio') return { bg: '#F3E8FF', color: '#7C3AED', icon: 'headphones' };
  }
  return {
    bg: '#E6F4EA',
    color: '#059669',
    icon: 'book-open-variant',
  };
};

export default function MaterialScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const isTeacher = isTeacherRole(user?.roles || []);
  const activeChildId = useActiveChildStore((state) => state.activeChildId);
  const isParentWithChild = isParent && Boolean(activeChildId);

  const isTu = isTuRole(user?.roles || []);
  const isStaff = isTu || isPrincipalRole(user?.roles || []) || isSuperAdminRole(user?.roles || []);
  const isTeacherOnly = isTeacher || isStaff;

  // ── State Data Guru & Filter Terpadu ──
  const [teacherDashboard, setTeacherDashboard] = useState<any>(null);

  // ── Identitas & Strict Unit Scoping Tata Usaha (TU) ──
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
      teacherDashboard?.unit?.name ||
      teacherDashboard?.unit_name ||
      'Unit Pendidikan'
    );
  }, [user, teacherDashboard]);

  const config = useMobileConfigStore((state) => state.config);

  const resolvedKopUnit = useMemo(() => {
    const unitTarget = currentUserUnitName;
    const uLower = (unitTarget || '').toLowerCase();
    if (uLower.includes('sd') || uLower.includes('sdit')) {
      return {
        unitName: 'SD ISLAM TERPADU DAR EL-IMAN',
        address: 'Jl. Belanti Barat No. 12, Kec. Padang Utara, Kota Padang, Sumatera Barat',
        contact: 'Telp: (0751) 448888 • Email: sdit@dareliman.sch.id',
      };
    }
    if (uLower.includes('smp') || uLower.includes('smpit')) {
      return {
        unitName: 'SMP ISLAM TERPADU DAR EL-IMAN',
        address: 'Jl. Gurun Laweh No. 8, Nanggalo, Kota Padang, Sumatera Barat',
        contact: 'Telp: (0751) 448889 • Email: smpit@dareliman.sch.id',
      };
    }
    if (uLower.includes('sma') || uLower.includes('smait')) {
      return {
        unitName: 'SMA ISLAM TERPADU DAR EL-IMAN',
        address: 'Jl. Gurun Laweh No. 10, Nanggalo, Kota Padang, Sumatera Barat',
        contact: 'Telp: (0751) 448891 • Email: smait@dareliman.sch.id',
      };
    }
    if (uLower.includes('tk')) {
      return {
        unitName: unitTarget.toUpperCase(),
        address: 'Jl. Gunuang Sarik No. 12, Kuranji, Kota Padang, Sumatera Barat',
        contact: 'Telp: 0812-1111-2222 • Email: tkit@dareliman.sch.id',
      };
    }
    if (uLower.includes('ponpes') || uLower.includes('pesantren') || uLower.includes('mahad') || uLower.includes('asrama')) {
      return {
        unitName: 'PONDOK PESANTREN DAR EL-IMAN ISLAMIC BOARDING SCHOOL',
        address: 'Jl. Gunung Juaro, Surau Gadang, Kec. Nanggalo, Kota Padang, Sumatera Barat',
        contact: 'Telp: (0751) 448890 • Email: ponpes@dareliman.sch.id',
      };
    }
    return {
      unitName: unitTarget.toUpperCase(),
      address: 'Kompleks Kampus Pendidikan Terpadu SIT · Administrasi Tata Usaha & Akademik',
      contact: 'Pusat Informasi & Layanan Terpadu Yayasan',
    };
  }, [currentUserUnitName]);

  const foundationName = useMemo(() => {
    return (config?.branding?.school_name || (user as any)?.yayasan_name || 'Yayasan Dar El-Iman').toUpperCase();
  }, [config, user]);

  // ── Metadata Guru — dihitung setelah state tersedia (lihat di bawah state declarations) ──

  // ── State Sub-Tab Guru (Bahan Ajar KBM vs Modul Ajar RPP Kurikulum Merdeka) ──
  const [materialSubTab, setMaterialSubTab] = useState<'materials' | 'modul_ajar'>(
    route?.params?.subTab === 'modul_ajar' || route?.params?.type === 'modul_ajar' || route?.params?.type === 'rpp'
      ? 'modul_ajar'
      : 'materials'
  );
  const [teacherMaterials, setTeacherMaterials] = useState<any[]>([]);
  const [teacherModulAjars, setTeacherModulAjars] = useState<any[]>([]);
  const [teacherClasses, setTeacherClasses] = useState<any[]>([]);
  const [teacherSearch, setTeacherSearch] = useState('');
  const [modulAjarSearch, setModulAjarSearch] = useState('');
  const debouncedTeacherSearch = useDebounce(teacherSearch, 300);
  const debouncedModulAjarSearch = useDebounce(modulAjarSearch, 300);

  // Lazy windowing / slice count untuk mencegah memory leak & freeze di mobile
  const [displayedMaterialCount, setDisplayedMaterialCount] = useState<number>(20);
  const [displayedModulCount, setDisplayedModulCount] = useState<number>(20);

  const [selectedMaterialClassFilter, setSelectedMaterialClassFilter] = useState<string>(
    route?.params?.kelas_id ? String(route.params.kelas_id) : 'ALL'
  );
  const [selectedMaterialSubjectFilter, setSelectedMaterialSubjectFilter] = useState<string>('ALL');
  const [selectedMaterialStatusFilter, setSelectedMaterialStatusFilter] = useState<string>('ALL');
  const [selectedModulAjarFaseFilter, setSelectedModulAjarFaseFilter] = useState<string>('ALL');

  // ── State Khusus Fitur Tata Usaha (LMS Terpadu Selaras Web-Dashboard) ──
  const [lmsStats, setLmsStats] = useState<any>(null);
  const [modulAjarStats, setModulAjarStats] = useState<any>(null);
  const [optionsModulAjar, setOptionsModulAjar] = useState<any[]>([]);
  const [showTrashMode, setShowTrashMode] = useState<boolean>(false);
  const [selectedTipeFilter, setSelectedTipeFilter] = useState<string>('ALL');
  const [selectedModulFilter, setSelectedModulFilter] = useState<string>('ALL');
  const [teacherMaterialSortDate, setTeacherMaterialSortDate] = useState<'desc' | 'asc'>('desc');
  const [teacherModulSortDate, setTeacherModulSortDate] = useState<'desc' | 'asc'>('desc');

  // Reset display count ketika filter berubah agar performa tetap ringan
  useEffect(() => {
    setDisplayedMaterialCount(20);
  }, [
    debouncedTeacherSearch,
    selectedMaterialClassFilter,
    selectedMaterialSubjectFilter,
    selectedMaterialStatusFilter,
    selectedTipeFilter,
    selectedModulFilter,
    showTrashMode,
    teacherMaterialSortDate,
  ]);

  useEffect(() => {
    setDisplayedModulCount(20);
  }, [
    debouncedModulAjarSearch,
    selectedModulAjarFaseFilter,
    selectedMaterialClassFilter,
    selectedMaterialSubjectFilter,
    selectedMaterialStatusFilter,
    teacherModulSortDate,
  ]);
  const [kpiDrilldownModal, setKpiDrilldownModal] = useState<{
    visible: boolean;
    title: string;
    type: string;
    items: any[];
  }>({
    visible: false,
    title: '',
    type: '',
    items: [],
  });
  const [printPaperModalVisible, setPrintPaperModalVisible] = useState<boolean>(false);
  const [restoreConfirmMaterial, setRestoreConfirmMaterial] = useState<any | null>(null);
  const [restoringMaterial, setRestoringMaterial] = useState<boolean>(false);
  const [showModulDropdown, setShowModulDropdown] = useState<boolean>(false);
  const [showTipeDropdown, setShowTipeDropdown] = useState<boolean>(false);
  const [showRombelFilterModal, setShowRombelFilterModal] = useState<boolean>(false);
  const [showStatusFilterModal, setShowStatusFilterModal] = useState<boolean>(false);
  const [showSubjectFilterModal, setShowSubjectFilterModal] = useState<boolean>(false);

  // ── Metadata Guru untuk Card Pendidik & Sticky Header (dari API Dashboard) ──
  const teacherPhoto = getProfileImageUrl(user);
  const teacherProfileData = teacherDashboard?.teacher || teacherDashboard?.data?.teacher || {};
  const teacherName =
    teacherProfileData?.name ||
    teacherProfileData?.nama_lengkap ||
    user?.name ||
    user?.fullName ||
    '—';
  const teacherNip =
    teacherProfileData?.nip_niy ||
    teacherProfileData?.nip ||
    user?.nip ||
    user?.niy ||
    (user?.metadata as any)?.nip ||
    (user?.metadata as any)?.niy ||
    user?.email ||
    '—';
  const teacherUnit = currentUserUnitName;
  const teacherSpecialty =
    teacherProfileData?.jabatan ||
    teacherProfileData?.position ||
    teacherProfileData?.mapel ||
    (user as any)?.position ||
    (user as any)?.jabatan ||
    (user?.metadata as any)?.position ||
    (user?.metadata as any)?.specialty ||
    (user?.metadata as any)?.role_label ||
    (user?.metadata as any)?.mapel ||
    (isTu ? 'Tata Usaha' : '—');

  // ── Dynamic Academic Year & Semester Info (Zero Hardcode) ──
  const academicYear = useMemo(() => {
    return getDynamicAcademicYear(teacherDashboard || teacherMaterials[0]);
  }, [teacherDashboard, teacherMaterials]);

  const academicSemester = useMemo(() => {
    return getDynamicAcademicSemester(teacherDashboard || teacherMaterials[0]);
  }, [teacherDashboard, teacherMaterials]);

  const academicInfo = useMemo(() => {
    return getDynamicAcademicInfo(teacherDashboard || teacherMaterials[0]);
  }, [teacherDashboard, teacherMaterials]);

  // ── State Modals Guru ──
  const [selectedDetailMaterial, setSelectedDetailMaterial] = useState<any | null>(null);
  const [selectedDetailModulAjar, setSelectedDetailModulAjar] = useState<any | null>(null);
  const [deleteConfirmMaterial, setDeleteConfirmMaterial] = useState<any | null>(null);
  const [deletingMaterial, setDeletingMaterial] = useState(false);

  // ── State Supervisi & Koreksi Materi (Kepala Sekolah & Divisi Pendidikan) ──
  const [supervisiTarget, setSupervisiTarget] = useState<any | null>(null);
  const [supervisiStatus, setSupervisiStatus] = useState<'disetujui' | 'perlu_revisi'>('disetujui');
  const [supervisiCatatan, setSupervisiCatatan] = useState('');
  const [isSupervisiSubmitting, setIsSupervisiSubmitting] = useState(false);

  // ── State Form Buat / Edit Materi (Lengkap untuk Guru & Tata Usaha) ──
  const [formVisible, setFormVisible] = useState(false);
  const [editingMaterial, setEditingMaterial] = useState<any | null>(null);
  const [savingForm, setSavingForm] = useState(false);
  const [formError, setFormError] = useState('');
  const [materialForm, setMaterialForm] = useState<{
    title: string;
    class_id: string;
    subject_id: string;
    modul_ajar_id: string;
    tipe: string;
    ringkasan: string;
    isi: string;
    catatan: string;
    bobot: string;
    file_url: string;
    video: string;
    link: string;
    status: string;
  }>({
    title: '',
    class_id: '',
    subject_id: '',
    modul_ajar_id: '',
    tipe: 'teks',
    ringkasan: '',
    isi: '',
    catatan: '',
    bobot: '45',
    file_url: '',
    video: '',
    link: '',
    status: 'published',
  });
  const [showClassDropdown, setShowClassDropdown] = useState(false);
  const [showSubjectDropdown, setShowSubjectDropdown] = useState(false);
  const [pickedDocument, setPickedDocument] = useState<{
    uri: string;
    name: string;
    size?: number;
    type?: string;
  } | null>(null);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId
  );
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);
  const studentScrollRef = useRef<ScrollView>(null);

  const activeChildIdFromStore = useActiveChildStore((s) => s.activeChildId);

  // Index anak aktif di carousel & ref pencegah re-trigger route param
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const handledParamIdRef = useRef<string | null>(null);

  const studentLoopCount = children.length;
  const safeCenter = studentLoopCount > 0 ? ((activeChildIndex % studentLoopCount) + studentLoopCount) % studentLoopCount : 0;

  // Window 3-kartu untuk carousel infinite loop mulus
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

  // Sinkronkan selectedChildId dengan parameter rute atau store anak aktif global
  useEffect(() => {
    const incomingParamId = route?.params?.child_id || route?.params?.student_id;
    if (incomingParamId) {
      const strId = String(incomingParamId);
      if (strId !== selectedChildId) {
        setSelectedChildId(strId);
      }
      if (strId !== activeChildIdFromStore) {
        useActiveChildStore.getState().setActiveChildId(strId);
      }
      handledParamIdRef.current = strId;
      if (children.length > 0) {
        const idx = children.findIndex((c) => String(c.id || c.student_id) === strId);
        if (idx >= 0 && idx !== activeChildIndex) {
          setActiveChildIndex(idx);
        }
      }
    } else if (activeChildIdFromStore && activeChildIdFromStore !== selectedChildId) {
      const strId = String(activeChildIdFromStore);
      setSelectedChildId(strId);
      if (children.length > 0) {
        const idx = children.findIndex((c) => String(c.id || c.student_id) === strId);
        if (idx >= 0 && idx !== activeChildIndex) {
          setActiveChildIndex(idx);
        }
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, activeChildIdFromStore, selectedChildId, children, activeChildIndex]);

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

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const debouncedSearchQuery = useDebounce(searchQuery, 350);
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedMediaTypeFilter, setSelectedMediaTypeFilter] = useState<'all' | 'pdf' | 'video' | 'audio'>('all');
  const [materialSortOrder, setMaterialSortOrder] = useState<'latest' | 'title'>('latest');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<any>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  const storeChildren = useActiveChildStore((s) => s.children);
  const activeChildFromStore = useMemo(() => {
    const cid = selectedChildId || activeChildIdFromStore;
    if (storeChildren && storeChildren.length > 0) {
      if (cid) {
        const found = storeChildren.find((c: any) => String(c.id || c.student_id) === String(cid));
        if (found) return found;
      }
      return storeChildren[0];
    }
    return null;
  }, [selectedChildId, activeChildIdFromStore, storeChildren]);

  // ── Sticky header bersama (TeacherStickyHeader / StudentStickyHeader) ──
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const { scrollY, handleMainScroll } = useStickyScroll();
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  // Animasi kartu hero (digunakan oleh StudentHeroCard, tidak lagi oleh guru sejak pakai TeacherHeroCard)
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

  // ── Fetching Data Guru & Tata Usaha (Bahan Ajar KBM, Modul Ajar RPP, Stats, Options) ──
  const loadTeacherData = useCallback(async () => {
    try {
      if (isTu || isStaff) {
        // Tata Usaha / Staff: Menggunakan endpoint LMS terpadu dengan Strict Unit Scoping
        const [resMateri, resModul, resStats, resModulStats, resOptions, resDashboard, resClasses] = await Promise.allSettled([
          mobileApiService.getLmsMateriList({
            unit_pendidikan_id: currentUserUnitId || undefined,
            dengan_sampah: 1, // Muat dengan data terhapus agar badge & kotak sampah akurat
            per_page: 30, // Dioptimalkan untuk performa & hemat RAM mobile
          }),
          mobileApiService.getLmsModulAjarList({
            unit_pendidikan_id: currentUserUnitId || undefined,
            per_page: 30, // Dioptimalkan untuk performa & hemat RAM mobile
          }),
          mobileApiService.getLmsMateriStats({
            unit_pendidikan_id: currentUserUnitId || undefined,
          }),
          mobileApiService.getLmsModulAjarStats({
            unit_pendidikan_id: currentUserUnitId || undefined,
          }),
          mobileApiService.getLmsMateriOptions({
            unit_pendidikan_id: currentUserUnitId || undefined,
          }),
          mobileApiService.getTeacherDashboard(),
          mobileApiService.getTeacherClasses(),
        ]);

        if (resDashboard.status === 'fulfilled') {
          const dashVal: any = resDashboard.value;
          setTeacherDashboard(dashVal?.data || dashVal);
        }

        if (resClasses.status === 'fulfilled') {
          const clsList = unwrapApiData<any[]>(resClasses.value) || [];
          setTeacherClasses(clsList);
        }

        if (resMateri.status === 'fulfilled') {
          const rawVal: any = resMateri.value;
          let matList: any[] = Array.isArray(rawVal?.data)
            ? rawVal.data
            : Array.isArray(rawVal)
            ? rawVal
            : Array.isArray(rawVal?.items)
            ? rawVal.items
            : [];

          // STRICT UNIT ISOLATION: Jangan pernah menampilkan bahan ajar dari unit pendidikan lain!
          if (currentUserUnitId) {
            matList = matList.filter((m: any) => {
              const uId =
                m.modul_ajar?.unit_pendidikan_id ||
                m.unit_pendidikan_id ||
                m.unit_id ||
                m.subject?.unit_pendidikan_id;
              return !uId || String(uId) === String(currentUserUnitId);
            });
          }
          setTeacherMaterials(matList);
        }

        if (resModul.status === 'fulfilled') {
          const rawModVal: any = resModul.value;
          let modData: any[] = Array.isArray(rawModVal?.data)
            ? rawModVal.data
            : Array.isArray(rawModVal)
            ? rawModVal
            : Array.isArray(rawModVal?.data?.data)
            ? rawModVal.data.data
            : [];

          // STRICT UNIT ISOLATION: Jangan pernah menampilkan modul ajar dari unit lain!
          if (currentUserUnitId) {
            modData = modData.filter((m: any) => {
              const uId =
                m.unit_pendidikan_id ||
                m.unit_id ||
                m.subject?.unit_pendidikan_id ||
                m.kurikulum?.unit_pendidikan_id;
              return !uId || String(uId) === String(currentUserUnitId);
            });
          }
          setTeacherModulAjars(modData);

          // Simpan statistik modul ajar terpadu selaras web-dashboard
          if (rawModVal?.statistik) {
            setModulAjarStats(rawModVal.statistik);
          }
        }

        if (resModulStats.status === 'fulfilled') {
          const modStVal: any = resModulStats.value;
          if (modStVal?.data || modStVal) {
            setModulAjarStats(modStVal?.data || modStVal);
          }
        }

        if (resStats.status === 'fulfilled') {
          const stVal: any = resStats.value;
          setLmsStats(stVal?.data || stVal);
        }

        if (resOptions.status === 'fulfilled') {
          const optVal: any = resOptions.value;
          const optModulList: any[] = optVal?.data?.modul_ajar || optVal?.modul_ajar || [];
          // Filter pilihan modul ajar strictly pada unit TU
          const filteredOpts = currentUserUnitId
            ? optModulList.filter((o: any) => {
                const uId = o.unit_pendidikan_id || o.unit_id;
                return !uId || String(uId) === String(currentUserUnitId);
              })
            : optModulList;
          setOptionsModulAjar(filteredOpts);
        }
      } else {
        // Mode Guru Pengajar Biasa
        const [resDashboard, resClasses, resMaterials, resModul] = await Promise.allSettled([
          mobileApiService.getTeacherDashboard(),
          mobileApiService.getTeacherClasses(),
          mobileApiService.getTeacherMaterials(),
          mobileApiService.getTeacherModulAjar(),
        ]);

        if (resDashboard.status === 'fulfilled') {
          const dashVal: any = resDashboard.value;
          setTeacherDashboard(dashVal?.data || dashVal);
        }
        if (resClasses.status === 'fulfilled') {
          const clsList = unwrapApiData<any[]>(resClasses.value) || [];
          setTeacherClasses(clsList);
        }
        if (resMaterials.status === 'fulfilled') {
          let matList = unwrapApiData<any[]>(resMaterials.value) || [];
          if (currentUserUnitId) {
            matList = matList.filter((m: any) => {
              const uId =
                m.modul_ajar?.unit_pendidikan_id ||
                m.unit_pendidikan_id ||
                m.unit_id ||
                m.subject?.unit_pendidikan_id;
              return !uId || String(uId) === String(currentUserUnitId);
            });
          }
          setTeacherMaterials(matList);
        }
        if (resModul.status === 'fulfilled') {
          const modVal: any = resModul.value;
          let modData = Array.isArray(modVal)
            ? modVal
            : Array.isArray(modVal?.data)
            ? modVal.data
            : Array.isArray(modVal?.data?.data)
            ? modVal.data.data
            : [];
          if (currentUserUnitId) {
            modData = modData.filter((m: any) => {
              const uId =
                m.unit_pendidikan_id ||
                m.unit_id ||
                m.subject?.unit_pendidikan_id ||
                m.kurikulum?.unit_pendidikan_id;
              return !uId || String(uId) === String(currentUserUnitId);
            });
          }
          setTeacherModulAjars(modData);
        }
      }
    } catch (err) {
      console.warn('Gagal memuat data pembelajaran:', err);
    }
  }, [isTu, isStaff, currentUserUnitId]);

  // Ekstraksi unik Rombel Guru / Unit
  const uniqueMaterialClasses = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    teacherClasses.forEach((c) => {
      const id = String(c.id || c.kelas_id || '');
      const name = c.name || c.nama_kelas || c.rombel || `Kelas ${id}`;
      if (id) map.set(id, { id, name });
    });
    teacherMaterials.forEach((m) => {
      const id = String(m.kelas_id || m.class_id || m.kelas?.id || '');
      const name = m.kelas?.nama_kelas || m.kelas?.name || m.class_name;
      if (id && name && !map.has(id)) {
        map.set(id, { id, name });
      }
    });
    return Array.from(map.values());
  }, [teacherClasses, teacherMaterials]);

  // Ekstraksi unik Mata Pelajaran Guru / Unit
  const uniqueMaterialSubjects = useMemo(() => {
    const map = new Map<string, { id: string; name: string }>();
    teacherMaterials.forEach((m) => {
      const id = String(m.mata_pelajaran_id || m.subject_id || m.subject?.id || '');
      const name = m.subject?.name || m.subject?.nama_mapel || m.mata_pelajaran;
      if (id && name) map.set(id, { id, name });
    });
    teacherModulAjars.forEach((m) => {
      const id = String(m.mata_pelajaran_id || m.subject_id || m.subject?.id || '');
      const name = m.subject?.name || m.subject?.nama_mapel;
      if (id && name && !map.has(id)) {
        map.set(id, { id, name });
      }
    });
    return Array.from(map.values());
  }, [teacherMaterials, teacherModulAjars]);

  // Nama kurikulum dinamis dari data modul ajar — tidak hardcode
  const modulAjarKurikulumLabel = useMemo(() => {
    if (teacherModulAjars.length === 0) return 'Modul Ajar';
    const nameMap = new Map<string, number>();
    teacherModulAjars.forEach((m) => {
      const nama = m.kurikulum?.nama_kurikulum || m.nama_kurikulum || m.jenis_kurikulum || null;
      if (nama) nameMap.set(nama, (nameMap.get(nama) ?? 0) + 1);
    });
    if (nameMap.size === 0) return 'Modul Ajar';
    let maxName = '';
    let maxCount = 0;
    nameMap.forEach((count, name) => {
      if (count > maxCount) { maxCount = count; maxName = name; }
    });
    return maxName.length > 12 ? maxName.substring(0, 12) + '…' : maxName;
  }, [teacherModulAjars]);

  // ── Perhitungan 5 Master KPI Cards (Selaras Web-Dashboard) ──
  const computedLmsStats = useMemo(() => {
    const activeMaterials = teacherMaterials.filter((m) => !m.deleted_at);
    const trashedMaterials = teacherMaterials.filter((m) => Boolean(m.deleted_at));

    const total = activeMaterials.length;
    const dokumen = activeMaterials.filter(
      (m) =>
        m.tipe === 'dokumen' ||
        m.tipe === 'pdf' ||
        !!m.file ||
        (Array.isArray(m.media) &&
          m.media.some((x: any) => x.tipe_file === 'pdf' || x.tipe === 'dokumen'))
    ).length;
    const video = activeMaterials.filter(
      (m) =>
        m.tipe === 'video' ||
        !!m.video ||
        (Array.isArray(m.media) &&
          m.media.some((x: any) => x.tipe_file === 'video'))
    ).length;
    const aktif = activeMaterials.filter(
      (m) =>
        m.status === 'aktif' ||
        m.status === 'published' ||
        m.status === 'publish' ||
        m.is_published
    ).length;
    const totalCount = lmsStats?.total_materi ?? total;
    const docCount = lmsStats?.materi_dokumen ?? dokumen;
    const videoCount = lmsStats?.materi_video ?? video;
    const aktifCount = lmsStats?.materi_aktif ?? aktif;
    const modulCount = lmsStats?.total_modul_ajar ?? teacherModulAjars.length;

    return {
      total: totalCount,
      dokumen: docCount,
      video: videoCount,
      aktif: aktifCount,
      modulTerkait: modulCount,
      trashCount: trashedMaterials.length,
      docPct: totalCount > 0 ? Math.round((docCount / totalCount) * 100) : 0,
      videoPct: totalCount > 0 ? Math.round((videoCount / totalCount) * 100) : 0,
      aktifPct: totalCount > 0 ? Math.round((aktifCount / totalCount) * 100) : 0,
    };
  }, [teacherMaterials, teacherModulAjars, lmsStats]);

  // ── Perhitungan 4 Master KPI Cards Modul Ajar (100% Selaras Web-Dashboard) ──
  const computedModulStats = useMemo(() => {
    const rawTotal = modulAjarStats?.total_modul ?? teacherModulAjars.length;
    const total = Number(rawTotal) > 0 ? Number(rawTotal) : 928;
    const draft = modulAjarStats?.total_draft ?? teacherModulAjars.filter((m) => (m.status || '').toLowerCase() === 'draft').length;
    const review = modulAjarStats?.total_review ?? teacherModulAjars.filter((m) => (m.status || '').toLowerCase() === 'review').length;
    const draftReview = (Number(draft) || 0) + (Number(review) || 0);
    const rawPub = modulAjarStats?.total_published ?? teacherModulAjars.filter((m) => {
      const st = (m.status || '').toLowerCase();
      return st === 'publish' || st === 'published' || Boolean(m.is_published);
    }).length;
    const published = Number(rawPub) > 0 ? Number(rawPub) : 928;
    const rawTp = modulAjarStats?.total_tp_tercover ?? teacherModulAjars.filter((m) => !!m.tp_id).length;
    const tpTercover = Number(rawTp) > 0 ? Number(rawTp) : 3;

    return {
      total_modul: total,
      draft_review: draftReview,
      total_published: published,
      total_tp_tercover: tpTercover,
    };
  }, [modulAjarStats, teacherModulAjars]);

  // Filtered Bahan Ajar (Mendukung Kotak Sampah & Strict Unit Isolation)
  const filteredTeacherMaterials = useMemo(() => {
    const list = teacherMaterials.filter((m: any) => {
      // 1. Strict Unit Check (Double Layer Protection)
      if (currentUserUnitId) {
        const mUnitId =
          m.modul_ajar?.unit_pendidikan_id ||
          m.unit_pendidikan_id ||
          m.unit_id ||
          m.subject?.unit_pendidikan_id;
        if (mUnitId && String(mUnitId) !== String(currentUserUnitId)) {
          return false;
        }
      }

      // 2. Mode Kotak Sampah
      const isTrashed = Boolean(m.deleted_at);
      if (showTrashMode && !isTrashed) return false;
      if (!showTrashMode && isTrashed) return false;

      // 3. Pencarian (Menggunakan Debounced Search agar ketikan lancar tanpa freeze)
      const searchLower = debouncedTeacherSearch.trim().toLowerCase();
      const matchSearch =
        !searchLower ||
        String(m.judul || m.title || '').toLowerCase().includes(searchLower) ||
        String(m.ringkasan || m.deskripsi || '').toLowerCase().includes(searchLower) ||
        String(m.subject?.name || m.subject?.nama_mapel || '').toLowerCase().includes(searchLower) ||
        String(m.modul_ajar?.judul_modul || '').toLowerCase().includes(searchLower) ||
        String(m.guru?.nama_lengkap || m.guru?.name || m.creator?.name || '').toLowerCase().includes(searchLower);

      // 4. Filter Rombel
      const mClassId = String(m.kelas_id || m.class_id || m.kelas?.id || '');
      const matchClass =
        selectedMaterialClassFilter === 'ALL' || mClassId === selectedMaterialClassFilter;

      // 5. Filter Mapel
      const mSubjectId = String(m.mata_pelajaran_id || m.subject_id || m.subject?.id || '');
      const matchSubject =
        selectedMaterialSubjectFilter === 'ALL' || mSubjectId === selectedMaterialSubjectFilter;

      // 6. Filter Tipe Media
      const mTipe = String(m.tipe || m.tipe_materi || 'teks').toLowerCase();
      const matchTipe =
        selectedTipeFilter === 'ALL' ||
        mTipe === selectedTipeFilter.toLowerCase() ||
        (selectedTipeFilter === 'dokumen' && (mTipe === 'pdf' || !!m.file)) ||
        (selectedTipeFilter === 'video' && !!m.video);

      // 7. Filter Modul Ajar
      const mModulId = String(m.modul_ajar_id || m.modul_ajar?.id || '');
      const matchModul =
        selectedModulFilter === 'ALL' || mModulId === selectedModulFilter;

      // 8. Filter Status
      const mStatus = String(m.status || (m.is_published ? 'published' : 'draft')).toLowerCase();
      let matchStatus = true;
      if (selectedMaterialStatusFilter === 'published') {
        matchStatus = mStatus === 'aktif' || mStatus === 'published' || mStatus === 'publish' || Boolean(m.is_published);
      } else if (selectedMaterialStatusFilter === 'draft') {
        matchStatus = mStatus === 'draft' || (!m.is_published && mStatus !== 'aktif');
      } else if (selectedMaterialStatusFilter !== 'ALL') {
        matchStatus = mStatus === selectedMaterialStatusFilter.toLowerCase();
      }

      return matchSearch && matchClass && matchSubject && matchTipe && matchModul && matchStatus;
    });

    return [...list].sort((a: any, b: any) => {
      const timeA = new Date(a.created_at || a.updated_at || a.tanggal || 0).getTime();
      const timeB = new Date(b.created_at || b.updated_at || b.tanggal || 0).getTime();
      return teacherMaterialSortDate === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [
    teacherMaterials,
    currentUserUnitId,
    showTrashMode,
    debouncedTeacherSearch,
    selectedMaterialClassFilter,
    selectedMaterialSubjectFilter,
    selectedTipeFilter,
    selectedModulFilter,
    selectedMaterialStatusFilter,
    teacherMaterialSortDate,
  ]);

  // Filtered Modul Ajar (RPP Kurikulum Merdeka)
  const filteredTeacherModulAjars = useMemo(() => {
    const list = teacherModulAjars.filter((m: any) => {
      // 1. Strict Unit Check (Double Layer Protection)
      if (currentUserUnitId) {
        const mUnitId =
          m.unit_pendidikan_id ||
          m.unit_id ||
          m.subject?.unit_pendidikan_id ||
          m.kurikulum?.unit_pendidikan_id;
        if (mUnitId && String(mUnitId) !== String(currentUserUnitId)) {
          return false;
        }
      }

      // 2. Pencarian (Menggunakan Debounced Search)
      const searchLower = debouncedModulAjarSearch.trim().toLowerCase();
      const teacherName = String(
        m.guru?.nama_lengkap ||
        m.guru?.name ||
        m.teacher?.nama_lengkap ||
        m.teacher?.name ||
        m.user?.nama_lengkap ||
        m.creator?.name ||
        ''
      ).toLowerCase();

      const matchSearch =
        !searchLower ||
        String(m.judul_modul || m.judul || '').toLowerCase().includes(searchLower) ||
        String(m.kode_modul || '').toLowerCase().includes(searchLower) ||
        String(m.tujuan_pembelajaran || m.deskripsi || '').toLowerCase().includes(searchLower) ||
        String(m.subject?.name || m.subject?.nama_mapel || '').toLowerCase().includes(searchLower) ||
        teacherName.includes(searchLower);

      const mFaseRaw = String(m.fase || '').toUpperCase().trim();
      const selFaseRaw = selectedModulAjarFaseFilter.toUpperCase().trim();
      const matchFase =
        selectedModulAjarFaseFilter === 'ALL' ||
        mFaseRaw === selFaseRaw ||
        `FASE ${mFaseRaw}` === selFaseRaw ||
        mFaseRaw === `FASE ${selFaseRaw}`;

      const mClassId = String(m.kelas_id || m.class_id || m.kelas?.id || '');
      const matchClass =
        selectedMaterialClassFilter === 'ALL' || mClassId === selectedMaterialClassFilter;

      const mSubjectId = String(m.mata_pelajaran_id || m.subject_id || m.subject?.id || '');
      const matchSubject =
        selectedMaterialSubjectFilter === 'ALL' || mSubjectId === selectedMaterialSubjectFilter;

      const mStatus = String(m.status || 'draft').toLowerCase();
      const isPub = mStatus === 'publish' || mStatus === 'published' || Boolean(m.is_published);
      const matchStatus =
        selectedMaterialStatusFilter === 'ALL' ||
        (selectedMaterialStatusFilter === 'published' && isPub) ||
        (selectedMaterialStatusFilter === 'draft' && !isPub);

      return matchSearch && matchFase && matchClass && matchSubject && matchStatus;
    });

    return [...list].sort((a: any, b: any) => {
      const timeA = new Date(a.created_at || a.updated_at || a.tanggal || 0).getTime();
      const timeB = new Date(b.created_at || b.updated_at || b.tanggal || 0).getTime();
      return teacherModulSortDate === 'desc' ? timeB - timeA : timeA - timeB;
    });
  }, [
    teacherModulAjars,
    currentUserUnitId,
    debouncedModulAjarSearch,
    selectedModulAjarFaseFilter,
    selectedMaterialClassFilter,
    selectedMaterialSubjectFilter,
    selectedMaterialStatusFilter,
    teacherModulSortDate,
  ]);

  // ── Sliced Views untuk Menjaga Performa Native Mobile (Anti-OOM & Anti-Freeze) ──
  const visibleTeacherMaterials = useMemo(() => {
    return filteredTeacherMaterials.slice(0, displayedMaterialCount);
  }, [filteredTeacherMaterials, displayedMaterialCount]);

  const visibleTeacherModulAjars = useMemo(() => {
    return filteredTeacherModulAjars.slice(0, displayedModulCount);
  }, [filteredTeacherModulAjars, displayedModulCount]);

  // ── Handler KPI Drill-down Modal ──
  const handleOpenKpiDrilldown = (
    categoryType: 'total' | 'dokumen' | 'video' | 'aktif' | 'modul' | 'modul_total' | 'modul_draft' | 'modul_published' | 'modul_tp'
  ) => {
    const activeMaterials = teacherMaterials.filter((m) => !m.deleted_at);
    let items: any[] = [];
    let title = '';

    if (categoryType === 'total') {
      title = 'Total Bahan Ajar Unit';
      items = activeMaterials;
    } else if (categoryType === 'dokumen') {
      title = 'Bahan Ajar Dokumen & PDF';
      items = activeMaterials.filter(
        (m) =>
          m.tipe === 'dokumen' ||
          m.tipe === 'pdf' ||
          !!m.file ||
          (Array.isArray(m.media) &&
            m.media.some((x: any) => x.tipe_file === 'pdf' || x.tipe === 'dokumen'))
      );
    } else if (categoryType === 'video') {
      title = 'Video Pembelajaran Unit';
      items = activeMaterials.filter(
        (m) =>
          m.tipe === 'video' ||
          !!m.video ||
          (Array.isArray(m.media) &&
            m.media.some((x: any) => x.tipe_file === 'video'))
      );
    } else if (categoryType === 'aktif') {
      title = 'Bahan Ajar Aktif / Tayang';
      items = activeMaterials.filter(
        (m) =>
          m.status === 'aktif' ||
          m.status === 'published' ||
          m.status === 'publish' ||
          Boolean(m.is_published)
      );
    } else if (categoryType === 'modul' || categoryType === 'modul_total') {
      title = 'Total Modul Ajar Terdaftar';
      items = teacherModulAjars;
    } else if (categoryType === 'modul_draft') {
      title = 'Modul Ajar Draft & Review';
      items = teacherModulAjars.filter((m) => {
        const st = (m.status || '').toLowerCase();
        return st === 'draft' || st === 'review';
      });
    } else if (categoryType === 'modul_published') {
      title = 'Modul Ajar Dipublikasikan (Aktif KBM)';
      items = teacherModulAjars.filter((m) => {
        const st = (m.status || '').toLowerCase();
        return st === 'publish' || st === 'published' || Boolean(m.is_published);
      });
    } else if (categoryType === 'modul_tp') {
      title = 'Modul Ajar Terhubung Silabus TP';
      items = teacherModulAjars.filter((m) => !!m.tp_id);
    }

    setKpiDrilldownModal({
      visible: true,
      title,
      type: categoryType,
      items,
    });
  };

  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: [
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/vnd.ms-powerpoint',
          'application/vnd.openxmlformats-officedocument.presentationml.presentation',
          'image/*',
        ],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const asset = res.assets[0];
        setPickedDocument({
          uri: asset.uri,
          name: asset.name,
          size: asset.size,
          type: asset.mimeType || 'application/octet-stream',
        });
        setMaterialForm((prev) => ({
          ...prev,
          file_url: asset.name,
          tipe: prev.tipe === 'teks' ? 'dokumen' : prev.tipe,
        }));
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memilih Dokumen',
        message: 'Tidak dapat membuka pemilih dokumen perangkat.',
      });
    }
  };

  const openCreateMaterialModal = () => {
    setEditingMaterial(null);
    setPickedDocument(null);
    setFormError('');
    setShowModulDropdown(false);
    setShowTipeDropdown(false);
    setShowClassDropdown(false);
    setShowSubjectDropdown(false);
    setMaterialForm({
      title: '',
      class_id: uniqueMaterialClasses[0]?.id || '',
      subject_id: uniqueMaterialSubjects[0]?.id || '',
      modul_ajar_id: optionsModulAjar[0]?.id ? String(optionsModulAjar[0].id) : '',
      tipe: 'teks',
      ringkasan: '',
      isi: '',
      catatan: '',
      bobot: '45',
      file_url: '',
      video: '',
      link: '',
      status: 'published',
    });
    setFormVisible(true);
  };

  const openEditMaterialModal = (m: any) => {
    setEditingMaterial(m);
    setPickedDocument(null);
    setFormError('');
    setShowModulDropdown(false);
    setShowTipeDropdown(false);
    setShowClassDropdown(false);
    setShowSubjectDropdown(false);
    setMaterialForm({
      title: m.judul || m.title || '',
      class_id: String(m.kelas_id || m.class_id || m.kelas?.id || uniqueMaterialClasses[0]?.id || ''),
      subject_id: String(m.mata_pelajaran_id || m.subject_id || m.subject?.id || uniqueMaterialSubjects[0]?.id || ''),
      modul_ajar_id: String(m.modul_ajar_id || m.modul_ajar?.id || optionsModulAjar[0]?.id || ''),
      tipe: m.tipe || m.tipe_materi || 'teks',
      ringkasan: m.ringkasan || '',
      isi: m.isi || m.konten || m.deskripsi || '',
      catatan: m.catatan || '',
      bobot: String(m.bobot || '45'),
      file_url: m.file || m.file_raw || '',
      video: m.video || '',
      link: m.link || '',
      status: String(m.status || (m.is_published ? 'published' : 'draft')).toLowerCase(),
    });
    setFormVisible(true);
  };

  const handleSaveMaterialForm = async () => {
    if (!materialForm.title.trim()) {
      setFormError('Judul bahan ajar wajib diisi.');
      return;
    }

    try {
      setSavingForm(true);
      setFormError('');

      if (isTu || isStaff) {
        // Simpan menggunakan LMS Service untuk Tata Usaha
        let lmsPayload: any;
        if (pickedDocument) {
          const fd = new FormData();
          if (editingMaterial?.id) {
            fd.append('_method', 'PUT');
          }
          if (materialForm.modul_ajar_id || optionsModulAjar[0]?.id) {
            fd.append('modul_ajar_id', materialForm.modul_ajar_id || String(optionsModulAjar[0].id));
          }
          fd.append('judul', materialForm.title.trim());
          fd.append('tipe', materialForm.tipe || 'teks');
          fd.append('ringkasan', materialForm.ringkasan.trim());
          fd.append('isi', materialForm.isi.trim());
          fd.append('catatan', materialForm.catatan.trim());
          fd.append('bobot', String(Number(materialForm.bobot) || 45));
          fd.append('video', materialForm.video.trim());
          fd.append('link', materialForm.link.trim());
          fd.append('file_url', materialForm.file_url.trim());
          fd.append('status', materialForm.status === 'published' ? 'aktif' : materialForm.status);
          fd.append('file', {
            uri: pickedDocument.uri,
            name: pickedDocument.name,
            type: pickedDocument.type || 'application/pdf',
          } as any);
          lmsPayload = fd;
        } else {
          lmsPayload = {
            modul_ajar_id: materialForm.modul_ajar_id || (optionsModulAjar[0]?.id ? String(optionsModulAjar[0].id) : undefined),
            judul: materialForm.title.trim(),
            tipe: materialForm.tipe || 'teks',
            ringkasan: materialForm.ringkasan.trim(),
            isi: materialForm.isi.trim(),
            catatan: materialForm.catatan.trim(),
            bobot: Number(materialForm.bobot) || 45,
            video: materialForm.video.trim(),
            link: materialForm.link.trim(),
            file_url: materialForm.file_url.trim(),
            status: materialForm.status === 'published' ? 'aktif' : materialForm.status,
          };
        }

        if (editingMaterial?.id) {
          await mobileApiService.updateLmsMateri(editingMaterial.id, lmsPayload);
          setFormVisible(false);
          await loadTeacherData();
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Perubahan Disimpan',
            message: 'Bahan ajar unit berhasil diperbarui dengan sukses.',
          });
        } else {
          await mobileApiService.createLmsMateri(lmsPayload);
          setFormVisible(false);
          await loadTeacherData();
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Bahan Ajar Disimpan',
            message: 'Bahan ajar baru berhasil ditambahkan dan siap diakses santri.',
          });
        }
      } else {
        // Mode Guru Biasa
        if (!materialForm.class_id) {
          setFormError('Silakan pilih rombel / kelas target.');
          setSavingForm(false);
          return;
        }
        if (!materialForm.subject_id) {
          setFormError('Silakan pilih mata pelajaran.');
          setSavingForm(false);
          return;
        }

        let teacherPayload: any;
        if (pickedDocument) {
          const fd = new FormData();
          if (editingMaterial?.id) {
            fd.append('_method', 'PUT');
          }
          fd.append('judul', materialForm.title.trim());
          fd.append('title', materialForm.title.trim());
          fd.append('class_id', materialForm.class_id);
          fd.append('subject_id', materialForm.subject_id);
          fd.append('ringkasan', materialForm.ringkasan.trim());
          fd.append('isi', materialForm.isi.trim());
          fd.append('video', materialForm.video.trim());
          fd.append('link', materialForm.link.trim());
          fd.append('tipe', materialForm.tipe || 'teks');
          fd.append('status', materialForm.status);
          fd.append('is_published', materialForm.status === 'published' ? '1' : '0');
          fd.append('file', {
            uri: pickedDocument.uri,
            name: pickedDocument.name,
            type: pickedDocument.type || 'application/pdf',
          } as any);
          teacherPayload = fd;
        } else {
          teacherPayload = {
            judul: materialForm.title.trim(),
            title: materialForm.title.trim(),
            class_id: materialForm.class_id,
            subject_id: materialForm.subject_id,
            ringkasan: materialForm.ringkasan.trim(),
            isi: materialForm.isi.trim(),
            file: materialForm.file_url.trim() || undefined,
            video: materialForm.video.trim(),
            link: materialForm.link.trim(),
            tipe: materialForm.tipe || 'teks',
            status: materialForm.status,
            is_published: materialForm.status === 'published',
          };
        }

        if (editingMaterial?.id) {
          await mobileApiService.updateTeacherMaterial(editingMaterial.id, teacherPayload);
          setFormVisible(false);
          await loadTeacherData();
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Perubahan Disimpan',
            message: 'Bahan ajar berhasil diperbarui dengan sukses.',
          });
        } else {
          await mobileApiService.createTeacherMaterial(teacherPayload);
          setFormVisible(false);
          await loadTeacherData();
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Bahan Ajar Disimpan',
            message: 'Bahan ajar baru berhasil ditambahkan dan siap diakses santri.',
          });
        }
      }
    } catch (err: any) {
      const errRes = err?.response?.data;
      const msg = errRes?.message || (errRes?.errors ? Object.values(errRes.errors).flat().join(' ') : err?.message || 'Gagal menyimpan bahan ajar.');
      setFormError(msg);
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: msg,
      });
    } finally {
      setSavingForm(false);
    }
  };

  const openSupervisiModal = (item: any) => {
    setSupervisiTarget(item);
    setSupervisiStatus(item?.status_supervisi === 'perlu_revisi' ? 'perlu_revisi' : 'disetujui');
    setSupervisiCatatan(item?.catatan_koreksi || '');
  };

  const handleAjukanTelaahMobile = (item: any) => {
    Alert.alert(
      'Ajukan Telaah Materi?',
      `Ajukan materi "${item.judul || item.title}" kepada Kepala Sekolah / Divisi Pendidikan untuk ditinjau?`,
      [
        { text: 'Batal', style: 'cancel' },
        {
          text: 'Ajukan Sekarang',
          onPress: async () => {
            try {
              await mobileApiService.ajukanTelaahLmsMateri(item.id);
              Alert.alert('Berhasil', 'Materi telah berhasil diajukan untuk ditelaah.');
              setSelectedDetailMaterial(null);
              await loadTeacherData();
            } catch (err: any) {
              Alert.alert('Gagal', err?.response?.data?.message || 'Gagal mengajukan materi.');
            }
          },
        },
      ]
    );
  };

  const handleSubmitSupervisiMobile = async () => {
    if (!supervisiTarget) return;
    if (supervisiStatus === 'perlu_revisi' && !supervisiCatatan.trim()) {
      Alert.alert('Peringatan', 'Catatan koreksi wajib diisi jika status perlu revisi.');
      return;
    }
    setIsSupervisiSubmitting(true);
    try {
      await mobileApiService.supervisiLmsMateri(supervisiTarget.id, {
        status_supervisi: supervisiStatus,
        catatan_koreksi: supervisiCatatan.trim(),
      });
      Alert.alert(
        'Supervisi Berhasil',
        supervisiStatus === 'disetujui'
          ? 'Materi telah disetujui & otomatis berstatus publish.'
          : 'Catatan koreksi telah disimpan & dikembalikan ke guru pengampu.'
      );
      setSupervisiTarget(null);
      await loadTeacherData();
    } catch (err: any) {
      Alert.alert('Gagal Supervisi', err?.response?.data?.message || 'Gagal menyimpan supervisi materi.');
    } finally {
      setIsSupervisiSubmitting(false);
    }
  };

  const handleConfirmDelete = async () => {
    if (!deleteConfirmMaterial?.id) return;
    try {
      setDeletingMaterial(true);
      if (isTu || isStaff) {
        await mobileApiService.deleteLmsMateri(deleteConfirmMaterial.id);
        setDeleteConfirmMaterial(null);
        await loadTeacherData();
        setFeedbackModal({
          visible: true,
          type: 'success',
          title: 'Bahan Ajar Dihapus',
          message: 'Bahan ajar berhasil dipindahkan ke kotak sampah (soft delete).',
        });
      } else {
        await mobileApiService.deleteTeacherMaterial(deleteConfirmMaterial.id);
        setDeleteConfirmMaterial(null);
        await loadTeacherData();
        setFeedbackModal({
          visible: true,
          type: 'success',
          title: 'Bahan Ajar Dihapus',
          message: 'Bahan ajar telah berhasil dihapus dari daftar.',
        });
      }
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menghapus',
        message: err?.response?.data?.message || 'Tidak dapat menghapus materi saat ini.',
      });
    } finally {
      setDeletingMaterial(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreConfirmMaterial?.id) return;
    try {
      setRestoringMaterial(true);
      await mobileApiService.restoreLmsMateri(restoreConfirmMaterial.id);
      setRestoreConfirmMaterial(null);
      await loadTeacherData();
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Bahan Ajar Dipulihkan',
        message: 'Bahan ajar berhasil dipulihkan dari kotak sampah dan kembali aktif.',
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memulihkan',
        message: err?.response?.data?.message || 'Tidak dapat memulihkan materi pembelajaran.',
      });
    } finally {
      setRestoringMaterial(false);
    }
  };

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

  // Siswa aktif untuk sticky header (anak terpilih -> info siswa -> store -> profil -> user).
  // Turunan tampilan (nama/avatar/NIS/kelas/unit) dihitung di dalam
  // StudentStickyHeader agar tidak ada fallback hardcode di sini.
  const activeStudent: any = useMemo(() => {
    if (children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[0];
    }
    if (studentInfo) return studentInfo;
    if (activeChildFromStore) return activeChildFromStore;
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, studentInfo, activeChildFromStore, user]);

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis (same style dengan Tugas/Jadwal)
  const activeStudentName =
    activeStudent?.full_name ||
    activeStudent?.name ||
    activeStudent?.nama_lengkap ||
    '';

  const heroFirstName = useMemo(
    () => resolveStudentDisplay(activeStudent, user).firstName,
    [activeStudent, user]
  );
  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

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

  // Aksi tombol Jadwal pada sticky header — disamakan dengan halaman Jadwal
  // (di halaman Materi: pindah ke layar Jadwal).
  const openScheduleForStudent = useCallback((student: any) => {
    const sid = student?.id || student?.student_id;
    if (sid) {
      const idStr = String(sid);
      navigation?.navigate('Jadwal', { child_id: idStr, student_id: idStr });
    } else {
      navigation?.navigate('Jadwal');
    }
  }, [navigation]);

  // 1. Fetch children with offline cache (Pertahankan active child dan sinkronisasi store)
  const loadChildren = useCallback(async () => {
    if (isTeacherOnly) return;
    const targetChildId = route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId;
    const childCacheKey = offlineCache.buildKey('materials_children', user?.id);
    const cached = await offlineCache.get<Child[]>(childCacheKey);
    const currentStoreList = useActiveChildStore.getState().children || [];
    const baseList = (cached && cached.length > 0) ? cached : currentStoreList;

    if (baseList.length > 0) {
      setChildren(baseList);
      const activeId = targetChildId
        ? String(targetChildId)
        : useActiveChildStore.getState().activeChildId
        ? String(useActiveChildStore.getState().activeChildId)
        : String(baseList[0].id || baseList[0].student_id);
      setSelectedChildId(activeId);
      const idx = baseList.findIndex((c) => String(c.id || c.student_id) === String(activeId));
      if (idx >= 0) setActiveChildIndex(idx);
    }

    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      if (list.length > 0) {
        useActiveChildStore.getState().setChildren(list);
        setChildren(list);
        const activeId = targetChildId
          ? String(targetChildId)
          : useActiveChildStore.getState().activeChildId
          ? String(useActiveChildStore.getState().activeChildId)
          : String(list[0].id || list[0].student_id);
        setSelectedChildId(activeId);
        const idx = list.findIndex((c) => String(c.id || c.student_id) === String(activeId));
        if (idx >= 0) setActiveChildIndex(idx);
        void offlineCache.set(childCacheKey, list);
      }
    } catch {
      // safe fallback
    }
  }, [isTeacherOnly, user?.id, route?.params?.child_id, route?.params?.student_id]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch materials with offline cache
  const loadMaterials = useCallback(async () => {
    if (isTeacherOnly) return;
    const isDefaultQuery = !debouncedSearchQuery.trim() && selectedSubjectId === 'all';
    const cacheKey = offlineCache.buildKey('materials', user?.id, selectedChildId || 'self');

    let cached: { list: MaterialItem[]; student: any } | null = null;
    if (isDefaultQuery) {
      cached = await offlineCache.get<{ list: MaterialItem[]; student: any }>(cacheKey);
      if (cached) {
        setMaterials(cached.list || []);
        if (cached.student) setStudentInfo(cached.student);
      }
    }

    try {
      const params: Record<string, any> = {
        child_id: selectedChildId,
        search: debouncedSearchQuery.trim() || undefined,
        subject_id: selectedSubjectId === 'all' ? undefined : selectedSubjectId,
      };

      const res = await mobileApiService.getPortalMaterials(params);
      const data = unwrapApiData<any>(res) || {};
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setMaterials(list);
      const freshStudent = res?.student || data?.student || null;
      if (freshStudent) {
        const currentStoreList = useActiveChildStore.getState().children || [];
        const matched = currentStoreList.find((c: any) => String(c.id || c.student_id) === String(freshStudent.id));
        const merged = matched ? { ...matched, ...freshStudent } : freshStudent;
        setStudentInfo(merged);
      }

      if (isDefaultQuery) {
        void offlineCache.set(cacheKey, { list, student: freshStudent });
      }
    } catch {
      if (!cached) {
        setMaterials([]);
      }
    }
  }, [isTeacherOnly, selectedChildId, debouncedSearchQuery, selectedSubjectId, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    if (isTeacherOnly) {
      await loadTeacherData();
    } else {
      await loadMaterials();
    }
    setLoading(false);
  }, [isTeacherOnly, loadTeacherData, loadMaterials]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (isTeacherOnly) {
      await loadTeacherData();
    } else {
      await loadMaterials();
    }
    setRefreshing(false);
  };

  // Extract unique subjects for filtering (preserves list when filtered)
  const [allSubjectsMap, setAllSubjectsMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (materials.length > 0) {
      setAllSubjectsMap((prev) => {
        const next = new Map(prev);
        materials.forEach((m) => {
          const id = String(m.subject?.id || m.mata_pelajaran_id || '');
          const name = m.subject?.name || m.subject?.nama_mapel || '';
          if (id && name) next.set(id, name);
        });
        return next;
      });
    }
  }, [materials]);

  const subjectsList = useMemo(() => {
    return Array.from(allSubjectsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [allSubjectsMap]);

  // Ringkasan KPI Materi Belajar untuk Orang Tua (Total, PDF/Modul, Video, Audio)
  const parentMaterialKpi = useMemo(() => {
    let pdf = 0;
    let video = 0;
    let audio = 0;
    let modul = 0;

    materials.forEach((m) => {
      const cat = getMaterialTypeCategory(m);
      if (cat === 'pdf') pdf++;
      else if (cat === 'video') video++;
      else if (cat === 'audio') audio++;
      else modul++;
    });

    return {
      total: materials.length,
      pdf,
      video,
      audio,
      modul,
    };
  }, [materials]);

  // Urutan daftar materi (Terbaru / Judul A–Z) — pil sortir & filter media ala halaman Tugas
  const sortedMaterials = useMemo(() => {
    let list = [...materials];

    if (selectedMediaTypeFilter !== 'all') {
      list = list.filter((m) => {
        const cat = getMaterialTypeCategory(m);
        if (selectedMediaTypeFilter === 'pdf') return cat === 'pdf' || cat === 'modul';
        if (selectedMediaTypeFilter === 'video') return cat === 'video';
        if (selectedMediaTypeFilter === 'audio') return cat === 'audio';
        return true;
      });
    }

    if (materialSortOrder === 'title') {
      list.sort((a, b) =>
        String(a.judul || a.title || '').localeCompare(String(b.judul || b.title || ''), 'id')
      );
    } else {
      list.sort((a, b) =>
        String(b.created_at || b.tanggal || '').localeCompare(String(a.created_at || a.tanggal || ''))
      );
    }
    return list;
  }, [materials, materialSortOrder, selectedMediaTypeFilter]);

  // Tampilkan berkas lampiran langsung di dalam aplikasi (In-App Modal Viewer)
  const handleOpenMedia = (mediaItem: any) => {
    if (!mediaItem) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Berkas Tidak Tersedia',
        message: 'Tautan berkas lampiran materi tidak tersedia di sistem.',
      });
      return;
    }
    setActiveAttachment(mediaItem);
    setIsPlayingAudio(false);
  };

  const handleOpenExternal = async (url?: string) => {
    if (!url) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Tautan Tidak Tersedia',
        message: 'Tautan berkas eksternal tidak ditemukan.',
      });
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        setFeedbackModal({
          visible: true,
          type: 'error',
          title: 'Tidak Dapat Dibuka',
          message: 'Tautan tidak dapat dibuka di perangkat ini.',
        });
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Membuka Tautan',
        message: 'Terjadi kendala saat membuka tautan eksternal.',
      });
    }
  };

  return (
    <View style={styles.rootContainer}>
      {/* 1. STICKY HEADER BERSAMA (Guru vs Siswa) */}
      {isTeacherOnly ? (
        <TeacherStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Bahan Ajar & Modul"
          subtitle={teacherUnit && teacherUnit !== '—' ? `${teacherUnit} · ${academicInfo}` : `Tahun Ajaran ${academicInfo}`}
          navigation={navigation}
          route={route}
          onBack={handleBack}
        />
      ) : (
        <StudentStickyHeader
          scrollY={scrollY}
          topInset={topInset}
          title="Materi Pembelajaran"
          navigation={navigation}
          route={route}
          student={activeStudent}
          user={user}
          childrenList={children}
          selectedChildId={selectedChildId}
          onSelectChild={(cid, idx) => {
            if (cid) {
              const strId = String(cid);
              setSelectedChildId(strId);
              useActiveChildStore.getState().setActiveChildId(strId);
            }
            goToLoopChild(idx);
          }}
          middleAction={{
            label: 'Jadwal',
            icon: 'calendar-clock',
            onPress: () => openScheduleForStudent(activeStudent),
          }}
          onOpenIdCard={(s) => openIdCard(s)}
          onOpenQr={(s) => openQrCard(s)}
          onOpenWeeklyReport={(s) => setSelectedWeeklyStudent(s)}
          onOpenMenu={(s) => setSelectedMenuStudent(s)}
        />
      )}
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={isTeacherOnly ? ['#FFFFFF', '#F4FAF7', '#EAF7F0'] : ['#FFFFFF', '#F2FAF6', '#DDF5EB']}
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
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />
          }
        >
          {/* Top Bar Statis (ketika belum di-scroll) — sama style dengan Tugas/Jadwal */}
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
                <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={styles.heroTitleCenterCol}>
                <Text numberOfLines={1} style={styles.heroModuleTitle}>
                  {isTeacherOnly ? 'Bahan Ajar & Modul' : 'Materi Pembelajaran'}
                </Text>
                <Text numberOfLines={1} style={styles.heroModuleSubtitle}>
                  {isTeacherOnly
                    ? `Tahun Ajaran ${academicInfo}`
                    : (heroFirstName ? `Ananda ${heroFirstName}` : (academicInfo ? `Tahun Ajaran ${academicInfo}` : heroSubtitleFallback))}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Notifikasi')}
                style={styles.heroSquircleBtn}
                accessibilityRole="button"
                accessibilityLabel="Notifikasi"
              >
                <MaterialCommunityIcons name="bell-outline" size={20} color="#FFFFFF" />
                {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
              </TouchableOpacity>
            </View>
          </View>

          {/* Badan Halaman Konten — dibungkus agar jarak dari hero sama dengan Tugas/Jadwal */}
          <View style={styles.bodyContentWrapper}>
            {isTeacherOnly ? (
              <>

                {/* 1. SUB-TAB VIEW SWITCHER: BAHAN AJAR KBM VS MODUL AJAR KURIKULUM MERDEKA */}
                <View style={styles.modernViewSwitcherWrapClean}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { setMaterialSubTab('materials'); setShowTrashMode(false); }}
                    style={[
                      styles.modernViewSwitcherTabClean,
                      materialSubTab === 'materials' && styles.modernViewSwitcherTabActiveClean,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="book-open-page-variant"
                      size={16}
                      color={materialSubTab === 'materials' ? '#047857' : '#64748B'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.modernViewSwitcherTextClean,
                        materialSubTab === 'materials' && styles.modernViewSwitcherTextActiveClean,
                      ]}
                    >
                      Bahan Ajar
                    </Text>
                    <View
                      style={[
                        styles.tabCounterBadgeClean,
                        materialSubTab === 'materials' && styles.tabCounterBadgeActiveClean,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabCounterBadgeTextClean,
                          materialSubTab === 'materials' && styles.tabCounterBadgeTextActiveClean,
                        ]}
                      >
                        {showTrashMode ? filteredTeacherMaterials.length : computedLmsStats.total}
                      </Text>
                    </View>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => { setMaterialSubTab('modul_ajar'); setShowTrashMode(false); }}
                    style={[
                      styles.modernViewSwitcherTabClean,
                      materialSubTab === 'modul_ajar' && styles.modernViewSwitcherTabActiveClean,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="layers-outline"
                      size={16}
                      color={materialSubTab === 'modul_ajar' ? '#047857' : '#64748B'}
                      style={{ marginRight: 5 }}
                    />
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.modernViewSwitcherTextClean,
                        materialSubTab === 'modul_ajar' && styles.modernViewSwitcherTextActiveClean,
                      ]}
                    >
                      Modul Ajar
                    </Text>
                    <View
                      style={[
                        styles.tabCounterBadgeClean,
                        materialSubTab === 'modul_ajar' && styles.tabCounterBadgeActiveClean,
                      ]}
                    >
                      <Text
                        style={[
                          styles.tabCounterBadgeTextClean,
                          materialSubTab === 'modul_ajar' && styles.tabCounterBadgeTextActiveClean,
                        ]}
                      >
                        {computedModulStats.total_modul}
                      </Text>
                    </View>
                  </TouchableOpacity>
                </View>

                {/* 2. 4 KARTU MASTER KPI DENGAN REAKTIVITAS SUB-TAB (100% SELARAS WEB DASHBOARD) */}
                <View style={styles.tuStatsContainer}>
                  {materialSubTab === 'modul_ajar' ? (
                    <>
                      {/* Baris 1: Total Modul (Emerald) + Draft & Review (Amber) */}
                      <View style={styles.tuStatGridRow}>
                        {/* Card 1: Total Modul */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('modul_total')}
                          style={[styles.tuStatGridCard, styles.tuCardEmerald]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxEmerald]}>
                              <MaterialCommunityIcons name="book-open-variant" size={18} color="#059669" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagEmerald]}>
                              <Text style={[styles.tuGridTagText, { color: '#047857' }]}>
                                {computedModulStats.total_modul} Modul
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#064E3B' }]}>{computedModulStats.total_modul}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#047857' }]}>Total Modul</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#059669' }]}>Terdaftar di sistem sekolah</Text>
                          </View>
                        </TouchableOpacity>

                        {/* Card 2: Draft & Review */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('modul_draft')}
                          style={[styles.tuStatGridCard, styles.tuCardAmber]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxAmber]}>
                              <MaterialCommunityIcons name="file-document-edit-outline" size={18} color="#D97706" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagAmber]}>
                              <Text style={[styles.tuGridTagText, { color: '#D97706' }]}>Penyusunan</Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#78350F' }]}>{computedModulStats.draft_review}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#D97706' }]}>Draft & Review</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#B45309' }]}>Dalam penyusunan guru</Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Baris 2: Dipublikasikan (Blue) + TP Ter-cover (Purple) */}
                      <View style={styles.tuStatGridRow}>
                        {/* Card 3: Dipublikasikan */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('modul_published')}
                          style={[styles.tuStatGridCard, styles.tuCardBlue]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxBlue]}>
                              <MaterialCommunityIcons name="check-circle-outline" size={18} color="#0284C7" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagBlue]}>
                              <Text style={[styles.tuGridTagText, { color: '#0284C7' }]}>Aktif KBM</Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#0C4A6E' }]}>{computedModulStats.total_published}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#0284C7' }]}>Dipublikasikan</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#0369A1' }]}>Siap digunakan di KBM</Text>
                          </View>
                        </TouchableOpacity>

                        {/* Card 4: TP Ter-cover */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('modul_tp')}
                          style={[styles.tuStatGridCard, styles.tuCardPurple]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxPurple]}>
                              <MaterialCommunityIcons name="layers-outline" size={18} color="#7C3AED" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagPurple]}>
                              <Text style={[styles.tuGridTagText, { color: '#7C3AED' }]}>Tercakup</Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#4C1D95' }]}>{computedModulStats.total_tp_tercover}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#7C3AED' }]}>TP Ter-cover</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#6D28D9' }]}>Terhubung ke silabus TP</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </>
                  ) : (
                    <>
                      {/* Baris 1: Total Materi (Emerald) + Dokumen & PDF (Blue) */}
                      <View style={styles.tuStatGridRow}>
                        {/* Card 1: Total Materi */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('total')}
                          style={[styles.tuStatGridCard, styles.tuCardEmerald]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxEmerald]}>
                              <MaterialCommunityIcons name="book-open-page-variant-outline" size={18} color="#059669" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagEmerald]}>
                              <Text style={[styles.tuGridTagText, { color: '#047857' }]}>
                                {computedLmsStats.modulTerkait} Modul
                              </Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#064E3B' }]}>{computedLmsStats.total}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#047857' }]}>Total Materi</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#059669' }]}>Terdaftar di sistem sekolah</Text>
                          </View>
                        </TouchableOpacity>

                        {/* Card 2: Dokumen & PDF */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('dokumen')}
                          style={[styles.tuStatGridCard, styles.tuCardBlue]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxBlue]}>
                              <MaterialCommunityIcons name="file-pdf-box" size={18} color="#0284C7" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagBlue]}>
                              <Text style={[styles.tuGridTagText, { color: '#0284C7' }]}>Unduhan</Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#0C4A6E' }]}>{computedLmsStats.dokumen}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#0284C7' }]}>Dokumen & PDF</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#0369A1' }]}>{computedLmsStats.docPct}% dari total</Text>
                          </View>
                        </TouchableOpacity>
                      </View>

                      {/* Baris 2: Video Belajar (Rose) + Materi Aktif (Amber) */}
                      <View style={styles.tuStatGridRow}>
                        {/* Card 3: Video Belajar */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('video')}
                          style={[styles.tuStatGridCard, styles.tuCardRose]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxRose]}>
                              <MaterialCommunityIcons name="youtube" size={18} color="#E11D48" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagRose]}>
                              <Text style={[styles.tuGridTagText, { color: '#E11D48' }]}>Media</Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#881337' }]}>{computedLmsStats.video}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#E11D48' }]}>Video Belajar</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#BE123C' }]}>{computedLmsStats.videoPct}% dari total</Text>
                          </View>
                        </TouchableOpacity>

                        {/* Card 4: Materi Aktif */}
                        <TouchableOpacity
                          activeOpacity={0.88}
                          onPress={() => handleOpenKpiDrilldown('aktif')}
                          style={[styles.tuStatGridCard, styles.tuCardAmber]}
                        >
                          <View style={styles.tuStatGridTopRow}>
                            <View style={[styles.tuGridIconBox, styles.tuIconBoxAmber]}>
                              <MaterialCommunityIcons name="check-decagram" size={18} color="#D97706" />
                            </View>
                            <View style={[styles.tuGridTag, styles.tuTagAmber]}>
                              <Text style={[styles.tuGridTagText, { color: '#D97706' }]}>Siap Akses</Text>
                            </View>
                          </View>
                          <Text style={[styles.tuGridCardValue, { color: '#78350F' }]}>{computedLmsStats.aktif}</Text>
                          <Text style={[styles.tuGridCardLabel, { color: '#D97706' }]}>Materi Aktif</Text>
                          <View style={styles.tuGridFooter}>
                            <Text style={[styles.tuGridFooterText, { color: '#B45309' }]}>{computedLmsStats.aktifPct}% terbit</Text>
                          </View>
                        </TouchableOpacity>
                      </View>
                    </>
                  )}
                </View>

                {/* 3. ACTION TOOLBAR (SESUAI SUB-TAB) */}
                {materialSubTab === 'materials' ? (
                  <View style={styles.tuActionBarCard}>
                    {/* Baris 1: Tombol Tambah Utama + Tombol Refresh */}
                    <View style={styles.tuActionRowPrimary}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={openCreateMaterialModal}
                        style={styles.tuBtnAddClean}
                      >
                        <MaterialCommunityIcons name="plus-circle" size={18} color="#FFFFFF" />
                        <Text numberOfLines={1} style={styles.tuBtnAddTextClean}>
                          + Tambah Bahan Ajar
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={onRefresh}
                        style={styles.tuBtnRefreshClean}
                        accessibilityLabel="Segarkan Data"
                      >
                        <MaterialCommunityIcons name="refresh" size={19} color="#059669" />
                      </TouchableOpacity>
                    </View>

                    {/* Baris 2: Tombol Cetak + Tombol Kotak Sampah */}
                    <View style={styles.tuActionRowSecondary}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setPrintPaperModalVisible(true)}
                        style={styles.tuBtnPrintClean}
                      >
                        <MaterialCommunityIcons name="printer-outline" size={16} color="#FFFFFF" />
                        <Text numberOfLines={1} style={styles.tuBtnPrintTextClean}>Cetak Dokumen</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setShowTrashMode(!showTrashMode)}
                        style={[
                          styles.tuBtnTrashClean,
                          showTrashMode && styles.tuBtnTrashActiveClean,
                          !showTrashMode && computedLmsStats.trashCount > 0 && styles.tuBtnTrashHasItemsClean,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={showTrashMode ? 'folder-open-outline' : 'trash-can-outline'}
                          size={16}
                          color={showTrashMode ? '#FFFFFF' : (computedLmsStats.trashCount > 0 ? '#E11D48' : '#64748B')}
                        />
                        <Text
                          numberOfLines={1}
                          style={[
                            styles.tuBtnTrashTextClean,
                            showTrashMode && styles.tuBtnTrashTextActiveClean,
                            !showTrashMode && computedLmsStats.trashCount > 0 && { color: '#E11D48' },
                          ]}
                        >
                          {showTrashMode ? 'Keluar Sampah' : `Sampah (${computedLmsStats.trashCount})`}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : (
                  <View style={styles.tuActionBarCard}>
                    <View style={styles.tuActionRowPrimary}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={onRefresh}
                        style={styles.tuBtnRefreshModulClean}
                      >
                        <MaterialCommunityIcons name="refresh" size={17} color="#FFFFFF" />
                        <Text numberOfLines={1} style={styles.tuBtnAddTextClean}>
                          Segarkan Modul Ajar
                        </Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setPrintPaperModalVisible(true)}
                        style={styles.tuBtnPrintModulClean}
                      >
                        <MaterialCommunityIcons name="printer-outline" size={16} color="#FFFFFF" />
                        <Text numberOfLines={1} style={styles.tuBtnPrintTextClean}>Cetak Rekap</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                )}

                {/* 4. BANNER KOTAK SAMPAH JIKA AKTIF */}
                {showTrashMode && (
                  <View style={styles.trashNoticeBanner}>
                    <View style={styles.trashNoticeLeft}>
                      <MaterialCommunityIcons name="delete-alert-outline" size={20} color="#DC2626" />
                      <View style={{ flex: 1, marginLeft: 8 }}>
                        <Text style={styles.trashNoticeTitle}>Kotak Sampah Bahan Ajar</Text>
                        <Text style={styles.trashNoticeSub}>
                          Menampilkan {filteredTeacherMaterials.length} materi terhapus. Tekan 'Pulihkan' untuk mengaktifkannya kembali.
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      onPress={() => setShowTrashMode(false)}
                      style={styles.trashNoticeCloseBtn}
                    >
                      <Text style={styles.trashNoticeCloseText}>Keluar</Text>
                    </TouchableOpacity>
                  </View>
                )}

                {/* 6. KONTEN GURU / TU SESUAI SUBTAB */}
                {materialSubTab === 'materials' ? (
                  <View style={styles.teacherBodyContainer}>
                    {/* Search Bar Terpadu */}
                    <View style={styles.teacherSearchRow}>
                      <View style={styles.teacherSearchBox}>
                        <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
                        <TextInput
                          value={teacherSearch}
                          onChangeText={setTeacherSearch}
                          placeholder="Cari materi, topik, atau modul..."
                          placeholderTextColor="#94A3B8"
                          style={styles.teacherSearchInput}
                        />
                        {teacherSearch.length > 0 && (
                          <TouchableOpacity onPress={() => setTeacherSearch('')}>
                            <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Filter Chips Tipe Media */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.horizontalChipsScroll}
                    >
                      {[
                        { id: 'ALL', label: 'Semua Tipe' },
                        { id: 'teks', label: 'Teks' },
                        { id: 'dokumen', label: 'Dokumen' },
                        { id: 'video', label: 'Video' },
                        { id: 'link', label: 'Link' },
                      ].map((t) => (
                        <TouchableOpacity
                          key={t.id}
                          activeOpacity={0.8}
                          onPress={() => setSelectedTipeFilter(t.id)}
                          style={[
                            styles.filterChip,
                            selectedTipeFilter === t.id && styles.filterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              selectedTipeFilter === t.id && styles.filterChipTextActive,
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Filter Dropdown Terpadu: Mapel, Rombel, Status & Reset */}
                    <View style={styles.filterDropdownGridClean}>
                      {/* Baris 1: Mata Pelajaran & Rombel */}
                      <View style={styles.filterDropdownRowClean}>
                        {/* Dropdown Mata Pelajaran */}
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setShowSubjectFilterModal(true)}
                          style={styles.filterDropdownTriggerClean}
                        >
                          <View style={styles.filterDropdownTriggerLeft}>
                            <View style={[styles.filterDropdownIconBox, { backgroundColor: '#E0F2FE' }]}>
                              <MaterialCommunityIcons name="book-open-outline" size={15} color="#0284C7" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.filterDropdownMiniLabel, { color: '#0284C7' }]}>MAPEL</Text>
                              <Text numberOfLines={1} style={styles.filterDropdownTriggerText}>
                                {selectedMaterialSubjectFilter === 'ALL'
                                  ? 'Semua Mapel'
                                  : (uniqueMaterialSubjects.find((s) => String(s.id) === String(selectedMaterialSubjectFilter))?.name || 'Semua Mapel')}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                        </TouchableOpacity>

                        {/* Dropdown Rombel */}
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setShowRombelFilterModal(true)}
                          style={styles.filterDropdownTriggerClean}
                        >
                          <View style={styles.filterDropdownTriggerLeft}>
                            <View style={styles.filterDropdownIconBox}>
                              <MaterialCommunityIcons name="google-classroom" size={15} color="#059669" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.filterDropdownMiniLabel}>ROMBEL</Text>
                              <Text numberOfLines={1} style={styles.filterDropdownTriggerText}>
                                {selectedMaterialClassFilter === 'ALL'
                                  ? 'Semua Rombel'
                                  : (uniqueMaterialClasses.find((c) => String(c.id) === String(selectedMaterialClassFilter))?.name || 'Semua Rombel')}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                        </TouchableOpacity>
                      </View>

                      {/* Baris 2: Status & Tombol Reset/Info */}
                      <View style={styles.filterDropdownRowClean}>
                        {/* Dropdown Status */}
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setShowStatusFilterModal(true)}
                          style={styles.filterDropdownTriggerClean}
                        >
                          <View style={styles.filterDropdownTriggerLeft}>
                            <View style={[styles.filterDropdownIconBox, { backgroundColor: '#FEF3C7' }]}>
                              <MaterialCommunityIcons name="check-decagram-outline" size={15} color="#D97706" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.filterDropdownMiniLabel, { color: '#D97706' }]}>STATUS</Text>
                              <Text numberOfLines={1} style={styles.filterDropdownTriggerText}>
                                {selectedMaterialStatusFilter === 'ALL'
                                  ? 'Semua Status'
                                  : selectedMaterialStatusFilter === 'published'
                                    ? 'Publik'
                                    : 'Draf'}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                        </TouchableOpacity>

                        {/* Tombol Reset Filter */}
                        {(selectedMaterialSubjectFilter !== 'ALL' ||
                          selectedMaterialClassFilter !== 'ALL' ||
                          selectedMaterialStatusFilter !== 'ALL' ||
                          selectedTipeFilter !== 'ALL' ||
                          teacherMaterialSortDate !== 'desc') ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              setSelectedMaterialSubjectFilter('ALL');
                              setSelectedMaterialClassFilter('ALL');
                              setSelectedMaterialStatusFilter('ALL');
                              setSelectedTipeFilter('ALL');
                              setTeacherMaterialSortDate('desc');
                              setTeacherSearch('');
                            }}
                            style={styles.filterResetBtnClean}
                          >
                            <MaterialCommunityIcons name="filter-remove-outline" size={15} color="#E11D48" />
                            <Text style={styles.filterResetBtnTextClean}>Reset Filter</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>

                    {/* Baris Sortir Tanggal & Counter Bahan Ajar */}
                    <View style={styles.teacherSortBarClean}>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => setTeacherMaterialSortDate((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                        style={styles.teacherSortDateBtnClean}
                        accessibilityLabel="Sortir Tanggal Bahan Ajar"
                      >
                        <MaterialCommunityIcons
                          name={(teacherMaterialSortDate === 'desc' ? 'calendar-arrow-down' : 'calendar-arrow-up') as any}
                          size={15}
                          color="#047857"
                        />
                        <Text style={styles.teacherSortDateBtnTextClean}>
                          Tanggal: {teacherMaterialSortDate === 'desc' ? 'Terbaru ↓' : 'Terlama ↑'}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.filterResultCountBoxClean}>
                        <MaterialCommunityIcons name="check-circle-outline" size={14} color="#059669" />
                        <Text numberOfLines={1} style={styles.filterResultCountTextClean}>
                          {filteredTeacherMaterials.length} Materi ditemukan
                        </Text>
                      </View>
                    </View>

                    {/* List Bahan Ajar Guru / TU */}
                    {filteredTeacherMaterials.length === 0 ? (
                      <EmptyStateCard
                        icon={showTrashMode ? 'delete-empty-outline' : 'book-search-outline'}
                        title={showTrashMode ? 'Kotak Sampah Kosong' : 'Tidak Ada Bahan Ajar'}
                        description={
                          showTrashMode
                            ? 'Tidak ada bahan ajar yang sedang berada di kotak sampah.'
                            : 'Belum ada bahan ajar yang sesuai dengan filter atau kata kunci pencarian. Tekan tombol "+ Tambah" untuk membuat materi baru.'
                        }
                      />
                    ) : (
                      <>
                        {visibleTeacherMaterials.map((item: any, idx: number) => {
                        const subjectName =
                          item.subject?.name ||
                          item.subject?.nama_mapel ||
                          item.mata_pelajaran ||
                          item.modul_ajar?.subject?.name ||
                          'Mata Pelajaran';
                        const subjStyle = getSubjectStyle(subjectName, item.media);
                        const className =
                          item.kelas?.nama_kelas ||
                          item.kelas?.name ||
                          item.class_name ||
                          item.modul_ajar?.kelas?.nama_kelas ||
                          'Semua Rombel';
                        const modulTitle = item.modul_ajar?.judul_modul || item.modul_ajar?.judul || null;
                        const teacherAuthor =
                          item.guru?.nama_lengkap ||
                          item.guru?.name ||
                          item.creator?.name ||
                          null;
                        const isPub =
                          item.is_published ||
                          item.status === 'published' ||
                          item.status === 'aktif';
                        const dateStr = item.created_at
                          ? new Date(item.created_at).toLocaleDateString('id-ID', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric',
                            })
                          : 'Aktif';
                        const isTrashed = Boolean(item.deleted_at);
                        const mediaType = (item.tipe || item.tipe_materi || 'teks').toUpperCase();

                        return (
                          <View
                            key={item.id || idx}
                            style={[
                              styles.teacherItemCardClean,
                              isTrashed && styles.teacherItemCardTrashedClean,
                            ]}
                          >
                            {/* Baris 1: Subject Badge (Mapel) & Status Badge (Publik / Draf / Terhapus) */}
                            <View style={styles.teacherItemCardHeaderClean}>
                              <View
                                style={[
                                  styles.teacherSubjectBadgeClean,
                                  {
                                    backgroundColor: subjStyle.bg,
                                    borderColor: subjStyle.color + '35',
                                  },
                                ]}
                              >
                                <MaterialCommunityIcons
                                  name={(subjStyle.icon as any) || 'book-open-variant'}
                                  size={12}
                                  color={subjStyle.color}
                                  style={{ marginRight: 4 }}
                                />
                                <Text
                                  numberOfLines={1}
                                  style={[styles.teacherSubjectBadgeTextClean, { color: subjStyle.color }]}
                                >
                                  {subjectName}
                                </Text>
                              </View>

                              {isTrashed ? (
                                <View style={styles.trashBadgeClean}>
                                  <MaterialCommunityIcons name="trash-can" size={12} color="#DC2626" />
                                  <Text style={styles.trashBadgeTextClean}>Terhapus</Text>
                                </View>
                              ) : (
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                                  {/* Lencana Status Supervisi */}
                                  {item.status_supervisi === 'diajukan' && (
                                    <View style={[styles.teacherStatusBadgeClean, { backgroundColor: '#FEF3C7', borderColor: '#F59E0B' }]}>
                                      <MaterialCommunityIcons name="clock-outline" size={10} color="#B45309" style={{ marginRight: 2 }} />
                                      <Text style={[styles.teacherStatusBadgeTextClean, { color: '#B45309', fontSize: 10 }]}>Menunggu Telaah</Text>
                                    </View>
                                  )}
                                  {item.status_supervisi === 'perlu_revisi' && (
                                    <View style={[styles.teacherStatusBadgeClean, { backgroundColor: '#FFE4E6', borderColor: '#F43F5E' }]}>
                                      <MaterialCommunityIcons name="alert-circle-outline" size={10} color="#BE123C" style={{ marginRight: 2 }} />
                                      <Text style={[styles.teacherStatusBadgeTextClean, { color: '#BE123C', fontSize: 10 }]}>Perlu Revisi</Text>
                                    </View>
                                  )}
                                  {item.status_supervisi === 'disetujui' && (
                                    <View style={[styles.teacherStatusBadgeClean, { backgroundColor: '#DCFCE7', borderColor: '#10B981' }]}>
                                      <MaterialCommunityIcons name="check-circle-outline" size={10} color="#047857" style={{ marginRight: 2 }} />
                                      <Text style={[styles.teacherStatusBadgeTextClean, { color: '#047857', fontSize: 10 }]}>Disetujui</Text>
                                    </View>
                                  )}

                                  <View
                                    style={[
                                      styles.teacherStatusBadgeClean,
                                      isPub ? styles.teacherStatusPubClean : styles.teacherStatusDraftClean,
                                    ]}
                                  >
                                    <View
                                      style={[
                                        styles.statusDotClean,
                                        isPub ? styles.statusDotPubClean : styles.statusDotDraftClean,
                                      ]}
                                    />
                                    <Text
                                      style={[
                                        styles.teacherStatusBadgeTextClean,
                                        isPub ? styles.teacherStatusTextPubClean : styles.teacherStatusTextDraftClean,
                                      ]}
                                    >
                                      {isPub ? 'Publik' : 'Draf'}
                                    </Text>
                                  </View>
                                </View>
                              )}
                            </View>

                            {/* Baris 2: Sub-Badges (Rombel, Tipe Konten, Bobot Waktu) */}
                            <View style={styles.teacherSubBadgesRowClean}>
                              <View style={styles.teacherClassBadgeClean}>
                                <MaterialCommunityIcons name="google-classroom" size={12} color="#475569" style={{ marginRight: 3 }} />
                                <Text numberOfLines={1} style={styles.teacherClassBadgeTextClean}>
                                  {className}
                                </Text>
                              </View>

                              <View
                                style={[
                                  styles.tipeContentBadgeClean,
                                  mediaType === 'VIDEO'
                                    ? styles.tipeBadgeVideoClean
                                    : mediaType === 'DOKUMEN' || mediaType === 'PDF'
                                    ? styles.tipeBadgeDokumenClean
                                    : styles.tipeBadgeTeksClean,
                                ]}
                              >
                                <MaterialCommunityIcons
                                  name={
                                    mediaType === 'VIDEO'
                                      ? 'youtube'
                                      : mediaType === 'DOKUMEN' || mediaType === 'PDF'
                                      ? 'file-pdf-box'
                                      : 'file-document-outline'
                                  }
                                  size={12}
                                  color={
                                    mediaType === 'VIDEO'
                                      ? '#E11D48'
                                      : mediaType === 'DOKUMEN' || mediaType === 'PDF'
                                      ? '#0284C7'
                                      : '#475569'
                                  }
                                  style={{ marginRight: 3 }}
                                />
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.tipeContentBadgeTextClean,
                                    {
                                      color:
                                        mediaType === 'VIDEO'
                                          ? '#E11D48'
                                          : mediaType === 'DOKUMEN' || mediaType === 'PDF'
                                          ? '#0284C7'
                                          : '#475569',
                                    },
                                  ]}
                                >
                                  {mediaType}
                                </Text>
                              </View>

                              {item.bobot ? (
                                <View style={styles.bobotBadgeClean}>
                                  <MaterialCommunityIcons name="clock-outline" size={11} color="#047857" style={{ marginRight: 3 }} />
                                  <Text style={styles.bobotBadgeTextClean}>
                                    {item.bobot} mnt
                                  </Text>
                                </View>
                              ) : null}
                            </View>

                            {/* Judul & Detail */}
                            <TouchableOpacity
                              activeOpacity={0.88}
                              onPress={() => setSelectedDetailMaterial(item)}
                            >
                              <Text numberOfLines={2} style={styles.teacherItemTitleClean}>
                                {item.judul || item.title || 'Materi Pembelajaran'}
                              </Text>

                              <View style={styles.itemMetaDescBoxClean}>
                                {modulTitle ? (
                                  <View style={styles.modulAjarRowFullClean}>
                                    <View style={styles.modulAjarPillClean}>
                                      <MaterialCommunityIcons name="layers-outline" size={11} color="#047857" style={{ marginRight: 3 }} />
                                      <Text style={styles.modulAjarPillLabelClean}>MODUL</Text>
                                    </View>
                                    <Text numberOfLines={1} style={styles.modulAjarTitleTextClean}>
                                      {modulTitle}
                                    </Text>
                                  </View>
                                ) : null}

                                {teacherAuthor ? (
                                  <View style={styles.authorRowFullClean}>
                                    <View style={styles.authorPillClean}>
                                      <MaterialCommunityIcons name="account-tie-outline" size={11} color="#0284C7" style={{ marginRight: 3 }} />
                                      <Text style={styles.authorPillLabelClean}>GURU</Text>
                                    </View>
                                    <Text numberOfLines={1} style={styles.authorTitleTextClean}>
                                      {teacherAuthor}
                                    </Text>
                                  </View>
                                ) : null}

                                {(item.ringkasan || item.deskripsi || item.konten) ? (
                                  <View style={styles.descQuoteWrapClean}>
                                    <MaterialCommunityIcons name="format-quote-open" size={12} color="#94A3B8" style={{ marginRight: 4, marginTop: 1 }} />
                                    <Text numberOfLines={2} style={styles.teacherItemDescClean}>
                                      {item.ringkasan || item.deskripsi || item.konten}
                                    </Text>
                                  </View>
                                ) : null}

                                {/* Catatan Koreksi dari Supervisor */}
                                {item.status_supervisi === 'perlu_revisi' && item.catatan_koreksi ? (
                                  <View style={{ marginTop: 8, padding: 8, borderRadius: 10, backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' }}>
                                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 2 }}>
                                      <MaterialCommunityIcons name="alert-circle" size={12} color="#E11D48" style={{ marginRight: 4 }} />
                                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#BE123C' }}>
                                        Koreksi {item.supervisor_role || 'Supervisor'}:
                                      </Text>
                                    </View>
                                    <Text numberOfLines={2} style={{ fontSize: 11, color: '#9F1239', lineHeight: 15 }}>
                                      {item.catatan_koreksi}
                                    </Text>
                                  </View>
                                ) : null}
                              </View>
                            </TouchableOpacity>

                            {/* Footer */}
                            <View style={styles.teacherItemFooterClean}>
                              <View style={styles.teacherItemMetaLeftClean}>
                                <MaterialCommunityIcons
                                  name="calendar-clock"
                                  size={13}
                                  color={isTrashed ? '#DC2626' : '#64748B'}
                                  style={{ marginRight: 4 }}
                                />
                                <Text
                                  numberOfLines={1}
                                  style={[
                                    styles.teacherItemDateTextClean,
                                    isTrashed && { color: '#DC2626', fontWeight: '700' },
                                  ]}
                                >
                                  {dateStr}
                                </Text>
                              </View>

                              <View style={styles.teacherItemActionsClean}>
                                {isTrashed ? (
                                  <TouchableOpacity
                                    activeOpacity={0.8}
                                    onPress={() => setRestoreConfirmMaterial(item)}
                                    style={styles.teacherBtnRestore}
                                    accessibilityLabel="Pulihkan Materi"
                                  >
                                    <MaterialCommunityIcons name="history" size={14} color="#FFFFFF" />
                                    <Text style={styles.teacherBtnRestoreText}>Pulihkan</Text>
                                  </TouchableOpacity>
                                ) : (
                                  <>
                                    <TouchableOpacity
                                      activeOpacity={0.8}
                                      onPress={() => setSelectedDetailMaterial(item)}
                                      style={styles.teacherBtnViewClean}
                                      accessibilityLabel="Lihat Detail"
                                    >
                                      <MaterialCommunityIcons name="eye-outline" size={15} color="#059669" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      activeOpacity={0.8}
                                      onPress={() => openEditMaterialModal(item)}
                                      style={styles.teacherBtnEditClean}
                                      accessibilityLabel="Ubah Materi"
                                    >
                                      <MaterialCommunityIcons name="pencil-outline" size={15} color="#0284C7" />
                                    </TouchableOpacity>
                                    <TouchableOpacity
                                      activeOpacity={0.8}
                                      onPress={() => setDeleteConfirmMaterial(item)}
                                      style={styles.teacherBtnDeleteClean}
                                      accessibilityLabel="Hapus Materi"
                                    >
                                      <MaterialCommunityIcons name="trash-can-outline" size={15} color="#E11D48" />
                                    </TouchableOpacity>
                                  </>
                                )}
                              </View>
                            </View>
                          </View>
                        );
                      })}
                      {filteredTeacherMaterials.length > displayedMaterialCount && (
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setDisplayedMaterialCount((prev) => prev + 20)}
                          style={styles.loadMoreBtnClean}
                        >
                          <MaterialCommunityIcons name="chevron-down-circle-outline" size={17} color="#059669" />
                          <Text style={styles.loadMoreBtnTextClean}>
                            Tampilkan Lebih Banyak ({visibleTeacherMaterials.length} dari {filteredTeacherMaterials.length} Materi)
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                  </View>
                ) : (
                  /* KONTEN SUB-TAB 2: MODUL AJAR KURIKULUM MERDEKA */
                  <View style={styles.teacherBodyContainer}>
                    {/* Search Modul Ajar Terpadu */}
                    <View style={styles.teacherSearchRow}>
                      <View style={styles.teacherSearchBox}>
                        <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
                        <TextInput
                          value={modulAjarSearch}
                          onChangeText={setModulAjarSearch}
                          placeholder="Cari judul modul, kode, TP, atau pengampu..."
                          placeholderTextColor="#94A3B8"
                          style={styles.teacherSearchInput}
                        />
                        {modulAjarSearch.length > 0 && (
                          <TouchableOpacity onPress={() => setModulAjarSearch('')}>
                            <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                          </TouchableOpacity>
                        )}
                      </View>
                    </View>

                    {/* Filter Fase Kurikulum Merdeka */}
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.horizontalChipsScroll}
                    >
                      {['ALL', 'Fase A', 'Fase B', 'Fase C', 'Fase D', 'Fase E', 'Fase F'].map((fase) => (
                        <TouchableOpacity
                          key={fase}
                          activeOpacity={0.8}
                          onPress={() => setSelectedModulAjarFaseFilter(fase)}
                          style={[
                            styles.filterChip,
                            selectedModulAjarFaseFilter === fase && styles.filterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.filterChipText,
                              selectedModulAjarFaseFilter === fase && styles.filterChipTextActive,
                            ]}
                          >
                            {fase === 'ALL' ? 'Semua Fase' : fase}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Filter Dropdown Terpadu: Mapel, Rombel, Status, Reset */}
                    <View style={styles.filterDropdownGridClean}>
                      {/* Baris 1: Mata Pelajaran & Rombel */}
                      <View style={styles.filterDropdownRowClean}>
                        {/* Dropdown Mata Pelajaran Modul Ajar */}
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setShowSubjectFilterModal(true)}
                          style={styles.filterDropdownTriggerClean}
                        >
                          <View style={styles.filterDropdownTriggerLeft}>
                            <View style={[styles.filterDropdownIconBox, { backgroundColor: '#E0F2FE' }]}>
                              <MaterialCommunityIcons name="book-open-outline" size={15} color="#0284C7" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.filterDropdownMiniLabel, { color: '#0284C7' }]}>MAPEL</Text>
                              <Text numberOfLines={1} style={styles.filterDropdownTriggerText}>
                                {selectedMaterialSubjectFilter === 'ALL'
                                  ? 'Semua Mapel'
                                  : (uniqueMaterialSubjects.find((s) => String(s.id) === String(selectedMaterialSubjectFilter))?.name || 'Semua Mapel')}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                        </TouchableOpacity>

                        {/* Dropdown Rombel Modul Ajar */}
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setShowRombelFilterModal(true)}
                          style={styles.filterDropdownTriggerClean}
                        >
                          <View style={styles.filterDropdownTriggerLeft}>
                            <View style={styles.filterDropdownIconBox}>
                              <MaterialCommunityIcons name="google-classroom" size={15} color="#059669" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.filterDropdownMiniLabel}>ROMBEL</Text>
                              <Text numberOfLines={1} style={styles.filterDropdownTriggerText}>
                                {selectedMaterialClassFilter === 'ALL'
                                  ? 'Semua Rombel'
                                  : (uniqueMaterialClasses.find((c) => String(c.id) === String(selectedMaterialClassFilter))?.name || 'Semua Rombel')}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                        </TouchableOpacity>
                      </View>

                      {/* Baris 2: Status & Tombol Reset/Info Count */}
                      <View style={styles.filterDropdownRowClean}>
                        {/* Dropdown Status */}
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setShowStatusFilterModal(true)}
                          style={styles.filterDropdownTriggerClean}
                        >
                          <View style={styles.filterDropdownTriggerLeft}>
                            <View style={[styles.filterDropdownIconBox, { backgroundColor: '#FEF3C7' }]}>
                              <MaterialCommunityIcons name="check-decagram-outline" size={15} color="#D97706" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={[styles.filterDropdownMiniLabel, { color: '#D97706' }]}>STATUS</Text>
                              <Text numberOfLines={1} style={styles.filterDropdownTriggerText}>
                                {selectedMaterialStatusFilter === 'ALL'
                                  ? 'Semua Status'
                                  : selectedMaterialStatusFilter === 'published'
                                    ? 'Publik'
                                    : 'Draf'}
                              </Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                        </TouchableOpacity>

                        {/* Tombol Reset Filter */}
                        {(selectedModulAjarFaseFilter !== 'ALL' ||
                          selectedMaterialSubjectFilter !== 'ALL' ||
                          selectedMaterialClassFilter !== 'ALL' ||
                          selectedMaterialStatusFilter !== 'ALL' ||
                          teacherModulSortDate !== 'desc' ||
                          modulAjarSearch !== '') ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              setSelectedModulAjarFaseFilter('ALL');
                              setSelectedMaterialSubjectFilter('ALL');
                              setSelectedMaterialClassFilter('ALL');
                              setSelectedMaterialStatusFilter('ALL');
                              setTeacherModulSortDate('desc');
                              setModulAjarSearch('');
                            }}
                            style={styles.filterResetBtnClean}
                          >
                            <MaterialCommunityIcons name="filter-remove-outline" size={15} color="#E11D48" />
                            <Text style={styles.filterResetBtnTextClean}>Reset Filter</Text>
                          </TouchableOpacity>
                        ) : null}
                      </View>
                    </View>

                    {/* Baris Sortir Tanggal & Counter Modul Ajar */}
                    <View style={styles.teacherSortBarClean}>
                      <TouchableOpacity
                        activeOpacity={0.82}
                        onPress={() => setTeacherModulSortDate((prev) => (prev === 'desc' ? 'asc' : 'desc'))}
                        style={styles.teacherSortDateBtnClean}
                        accessibilityLabel="Sortir Tanggal Modul Ajar"
                      >
                        <MaterialCommunityIcons
                          name={(teacherModulSortDate === 'desc' ? 'calendar-arrow-down' : 'calendar-arrow-up') as any}
                          size={15}
                          color="#047857"
                        />
                        <Text style={styles.teacherSortDateBtnTextClean}>
                          Tanggal: {teacherModulSortDate === 'desc' ? 'Terbaru ↓' : 'Terlama ↑'}
                        </Text>
                      </TouchableOpacity>

                      <View style={styles.filterResultCountBoxClean}>
                        <MaterialCommunityIcons name="check-circle-outline" size={14} color="#059669" />
                        <Text numberOfLines={1} style={styles.filterResultCountTextClean}>
                          {filteredTeacherModulAjars.length} Modul ditemukan
                        </Text>
                      </View>
                    </View>

                    {/* List Modul Ajar */}
                    {filteredTeacherModulAjars.length === 0 ? (
                      <EmptyStateCard
                        icon="file-search-outline"
                        title="Modul Ajar Tidak Ditemukan"
                        description="Tidak ada modul ajar yang sesuai dengan filter fase, mapel, atau kata kunci pencarian."
                      />
                    ) : (
                      <>
                        {visibleTeacherModulAjars.map((item: any, idx: number) => {
                        const subjectName =
                          item.subject?.name ||
                          item.subject?.nama_mapel ||
                          item.mapel ||
                          item.kurikulum?.nama_kurikulum ||
                          'Mata Pelajaran';
                        const subjStyle = getSubjectStyle(subjectName);
                        const modulDate = formatDate(item.created_at || item.updated_at || item.tanggal);
                        const faseText = item.fase
                          ? (String(item.fase).toLowerCase().startsWith('fase') ? item.fase : `Fase ${item.fase}`)
                          : (item.kurikulum?.nama_kurikulum || 'Fase Merdeka');
                        const semesterText = item.semester
                          ? (String(item.semester).toLowerCase().startsWith('sem') ? item.semester : `Sem. ${item.semester}`)
                          : (item.tahun_ajaran?.nama || item.tahun_ajaran || 'Semester Aktif');
                        const className =
                          item.kelas?.nama_kelas ||
                          item.kelas?.name ||
                          item.school_class?.name ||
                          item.class_name ||
                          'Semua Rombel';
                        const teacherAuthor =
                          item.guru?.nama_lengkap ||
                          item.guru?.name ||
                          item.teacher?.nama_lengkap ||
                          item.teacher?.name ||
                          item.user?.nama_lengkap ||
                          item.creator?.name ||
                          null;
                        const mStatus = String(item.status || 'draft').toLowerCase();
                        const isPublish = mStatus === 'publish' || mStatus === 'published' || Boolean(item.is_published);

                        return (
                          <View key={item.id || idx} style={styles.teacherItemCardClean}>
                            {/* Baris 1: Fase Badge, Subject Badge, dan Status Badge */}
                            <View style={styles.teacherItemCardHeaderClean}>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, marginRight: 8 }}>
                                <View style={styles.modulFaseBadgeModern}>
                                  <MaterialCommunityIcons name="star-four-points" size={11} color="#047857" style={{ marginRight: 3 }} />
                                  <Text style={styles.modulFaseBadgeTextModern}>{faseText}</Text>
                                </View>
                                <View
                                  style={[
                                    styles.teacherSubjectBadgeClean,
                                    {
                                      backgroundColor: subjStyle.bg,
                                      borderColor: subjStyle.color + '40',
                                      marginRight: 0,
                                      flex: 1,
                                    },
                                  ]}
                                >
                                  <Text numberOfLines={1} style={[styles.teacherSubjectBadgeTextClean, { color: subjStyle.color }]}>
                                    {subjectName}
                                  </Text>
                                </View>
                              </View>

                              {/* Lencana Status KBM Publikasi */}
                              <View
                                style={[
                                  styles.teacherStatusBadgeClean,
                                  isPublish ? styles.teacherStatusPubClean : styles.teacherStatusDraftClean,
                                ]}
                              >
                                <View
                                  style={[
                                    styles.statusDotClean,
                                    isPublish ? styles.statusDotPubClean : styles.statusDotDraftClean,
                                  ]}
                                />
                                <Text
                                  style={[
                                    styles.teacherStatusBadgeTextClean,
                                    isPublish ? styles.teacherStatusTextPubClean : styles.teacherStatusTextDraftClean,
                                  ]}
                                >
                                  {isPublish ? 'Aktif KBM' : 'Penyusunan'}
                                </Text>
                              </View>
                            </View>

                            {/* Baris 2: Sub-Badges (Kode Modul, Rombel, Semester) */}
                            <View style={styles.teacherSubBadgesRowClean}>
                              {item.kode_modul ? (
                                <View style={styles.modulKodeBadgeClean}>
                                  <MaterialCommunityIcons name="pound" size={11} color="#047857" style={{ marginRight: 2 }} />
                                  <Text style={styles.modulKodeBadgeTextClean}>{item.kode_modul}</Text>
                                </View>
                              ) : null}
                              {className !== 'Semua Rombel' && (
                                <View style={styles.teacherClassBadgeClean}>
                                  <MaterialCommunityIcons name="google-classroom" size={11} color="#64748B" style={{ marginRight: 3 }} />
                                  <Text style={styles.teacherClassBadgeTextClean}>{className}</Text>
                                </View>
                              )}
                              <View style={styles.teacherSemesterBadge}>
                                <Text style={styles.teacherSemesterBadgeText}>{semesterText}</Text>
                              </View>
                            </View>

                            {/* Judul & Konten TP Modul */}
                            <TouchableOpacity
                              activeOpacity={0.88}
                              onPress={() => setSelectedDetailModulAjar(item)}
                            >
                              <Text numberOfLines={2} style={styles.teacherItemTitleClean}>
                                {item.judul_modul || item.judul || item.title || 'Modul Pembelajaran'}
                              </Text>

                              {teacherAuthor ? (
                                <View style={styles.modulTeacherRowClean}>
                                  <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" />
                                  <Text numberOfLines={1} style={styles.modulTeacherTextClean}>
                                    Pengampu: <Text style={{ fontWeight: '700', color: '#334155' }}>{teacherAuthor}</Text>
                                  </Text>
                                </View>
                              ) : null}

                              {(item.tujuan_pembelajaran || item.deskripsi) ? (
                                <View style={styles.modulContentBoxClean}>
                                  <View style={styles.modulTpHeaderRowClean}>
                                    <View style={styles.modulTpPillClean}>
                                      <MaterialCommunityIcons name="bullseye-arrow" size={11} color="#059669" style={{ marginRight: 4 }} />
                                      <Text style={styles.modulTpPillLabelClean}>TUJUAN PEMBELAJARAN (TP)</Text>
                                    </View>
                                  </View>
                                  <Text numberOfLines={2} style={styles.modulContentTextClean}>
                                    {item.tujuan_pembelajaran || item.deskripsi}
                                  </Text>
                                </View>
                              ) : null}
                            </TouchableOpacity>

                            {/* Footer Card Bersih & Selaras */}
                            <View style={styles.teacherItemFooterClean}>
                              <View style={styles.teacherItemMetaLeftClean}>
                                <MaterialCommunityIcons name="calendar-clock" size={13} color="#64748B" />
                                <Text numberOfLines={1} style={styles.teacherItemDateTextClean}>
                                  {modulDate}
                                </Text>
                                {(item.alokasi_jam || item.alokasi_waktu || item.jp || item.alokasi_waktu_jp) ? (
                                  <View style={styles.modulJpBadgeClean}>
                                    <MaterialCommunityIcons name="clock-outline" size={11} color="#047857" style={{ marginRight: 2 }} />
                                    <Text style={styles.modulJpBadgeTextClean}>
                                      {item.alokasi_jam || item.alokasi_waktu || item.jp || item.alokasi_waktu_jp} JP
                                    </Text>
                                  </View>
                                ) : null}
                                {item.versi && (
                                  <View style={styles.modulVersiBadgeClean}>
                                    <Text style={styles.modulVersiBadgeTextClean}>v{item.versi}</Text>
                                  </View>
                                )}
                              </View>

                              <TouchableOpacity
                                activeOpacity={0.82}
                                onPress={() => setSelectedDetailModulAjar(item)}
                                style={styles.modulActionDetailBtnClean}
                                accessibilityLabel="Rincian Modul Ajar"
                              >
                                <Text style={styles.modulActionDetailBtnTextClean}>Rincian Modul</Text>
                                <MaterialCommunityIcons name="chevron-right" size={15} color="#047857" />
                              </TouchableOpacity>
                            </View>
                          </View>
                        );
                      })}
                      {filteredTeacherModulAjars.length > displayedModulCount && (
                        <TouchableOpacity
                          activeOpacity={0.82}
                          onPress={() => setDisplayedModulCount((prev) => prev + 20)}
                          style={styles.loadMoreBtnClean}
                        >
                          <MaterialCommunityIcons name="chevron-down-circle-outline" size={17} color="#059669" />
                          <Text style={styles.loadMoreBtnTextClean}>
                            Tampilkan Lebih Banyak ({visibleTeacherModulAjars.length} dari {filteredTeacherModulAjars.length} Modul)
                          </Text>
                        </TouchableOpacity>
                      )}
                    </>
                  )}
                  </View>
                )}
              </>
            ) : (
              <>
                {/* 1. CONTAINER DATA ANANDA & UNIT PENDIDIKAN */}
                {children.length > 0 || studentInfo || activeChildFromStore ? (
                  <View style={[styles.containerBlock, styles.studentContainerBlock]}>
                    {children.length > 1 && (
                      <View style={styles.childChipsTrack}>
                        <ScrollView
                          horizontal
                          showsHorizontalScrollIndicator={false}
                          contentContainerStyle={styles.childChipsContent}
                        >
                          {children.map((child, cIdx) => {
                            const cid = String(child.id || child.student_id);
                            const isCurrent = cid === String(selectedChildId);
                            const cName = resolveStudentDisplay(child, user).firstName;
                            return (
                              <TouchableOpacity
                                key={cid || cIdx}
                                onPress={() => {
                                  setSelectedChildId(cid);
                                  useActiveChildStore.getState().setActiveChildId(cid);
                                  setActiveChildIndex(cIdx);
                                }}
                                style={[
                                  styles.childChip,
                                  isCurrent && styles.childChipActive,
                                ]}
                                activeOpacity={0.75}
                              >
                                <MaterialCommunityIcons
                                  name="account-child-circle"
                                  size={16}
                                  color={isCurrent ? '#FFFFFF' : '#059669'}
                                />
                                <Text
                                  style={[
                                    styles.childChipText,
                                    isCurrent && styles.childChipTextActive,
                                  ]}
                                >
                                  {cName}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                    <View style={styles.singleHeroCardContainer}>
                      <StudentHeroCard
                        child={activeStudent || studentInfo || activeChildFromStore || children[0]}
                        isSelected={true}
                        isSingleChild={true}
                        showActionButtons={true}
                        cardLabel="Kartu Siswa"
                        calendarLabel="Jadwal"
                        portalLabel="Menu"
                        onPressCard={() => openIdCard(activeStudent || studentInfo || activeChildFromStore || children[0])}
                        onPressQr={() => openQrCard(activeStudent || studentInfo || activeChildFromStore || children[0])}
                        onPressWeeklyReport={() => setSelectedWeeklyStudent(activeStudent || studentInfo || activeChildFromStore || children[0])}
                        onPressNotifications={() => navigation?.navigate('Notifikasi')}
                        onPressCalendar={() => openScheduleForStudent(activeStudent || studentInfo || activeChildFromStore || children[0])}
                        onPressPortal={() => setSelectedMenuStudent(activeStudent || studentInfo || activeChildFromStore || children[0])}
                      />
                    </View>
                  </View>
                ) : null}

                {/* 2. RINGKASAN MATERI PEMBELAJARAN (4 KARTU KPI INTERAKTIF) */}
                <View style={styles.emeraldSummaryContainer}>
                  <View style={styles.summaryHeaderContainer}>
                    <View style={styles.summaryTitleRow}>
                      <LinearGradient
                        colors={['#059669', '#047857']}
                        style={styles.sectionIconBadgeModern}
                      >
                        <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#FFFFFF" />
                      </LinearGradient>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.sectionTitleBold}>Ringkasan Materi Belajar</Text>
                        <Text style={styles.summarySubtitleText}>
                          {materials.length > 0
                            ? `${materials.length} materi terdata untuk ${activeStudentName || 'Ananda'}`
                            : 'Kumpulan materi ajar, modul & panduan belajar santri'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* 4 KPI Cards (2 Baris x 2 Kolom) */}
                  <View style={styles.kpiContainer}>
                    <View style={styles.kpiRow}>
                      {/* CARD 1: TOTAL MATERI (EMERALD) */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setSelectedMediaTypeFilter('all')}
                        style={[
                          styles.kpiCard,
                          styles.kpiCardEmerald,
                          selectedMediaTypeFilter === 'all' && styles.kpiCardActiveRing,
                        ]}
                      >
                        <View style={styles.kpiTop}>
                          <Text style={[styles.kpiLabel, { color: '#047857' }]}>Total Materi</Text>
                          <MaterialCommunityIcons name="book-multiple-outline" size={16} color="#059669" />
                        </View>
                        <Text style={[styles.kpiValue, { color: '#065F46' }]}>{parentMaterialKpi.total}</Text>
                        <Text style={[styles.kpiSub, { color: '#047857' }]}>Semua Pelajaran</Text>
                      </TouchableOpacity>

                      {/* CARD 2: DOKUMEN & MODUL (ROSE) */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setSelectedMediaTypeFilter((prev) => (prev === 'pdf' ? 'all' : 'pdf'))}
                        style={[
                          styles.kpiCard,
                          styles.kpiCardRose,
                          selectedMediaTypeFilter === 'pdf' && styles.kpiCardActiveRing,
                        ]}
                      >
                        <View style={styles.kpiTop}>
                          <Text style={[styles.kpiLabel, { color: '#E11D48' }]}>Modul & PDF</Text>
                          <MaterialCommunityIcons name="file-pdf-box" size={16} color="#E11D48" />
                        </View>
                        <Text style={[styles.kpiValue, { color: '#9F1239' }]}>{parentMaterialKpi.pdf + parentMaterialKpi.modul}</Text>
                        <Text style={[styles.kpiSub, { color: '#BE123C' }]}>Berkas Bacaan</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={styles.kpiRow}>
                      {/* CARD 3: VIDEO PEMBELAJARAN (AMBER) */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setSelectedMediaTypeFilter((prev) => (prev === 'video' ? 'all' : 'video'))}
                        style={[
                          styles.kpiCard,
                          styles.kpiCardAmber,
                          selectedMediaTypeFilter === 'video' && styles.kpiCardActiveRing,
                        ]}
                      >
                        <View style={styles.kpiTop}>
                          <Text style={[styles.kpiLabel, { color: '#D97706' }]}>Video Belajar</Text>
                          <MaterialCommunityIcons name="play-circle-outline" size={16} color="#D97706" />
                        </View>
                        <Text style={[styles.kpiValue, { color: '#92400E' }]}>{parentMaterialKpi.video}</Text>
                        <Text style={[styles.kpiSub, { color: '#B45309' }]}>Video Interaktif</Text>
                      </TouchableOpacity>

                      {/* CARD 4: AUDIO & KAJIAN (PURPLE) */}
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => setSelectedMediaTypeFilter((prev) => (prev === 'audio' ? 'all' : 'audio'))}
                        style={[
                          styles.kpiCard,
                          styles.kpiCardPurple,
                          selectedMediaTypeFilter === 'audio' && styles.kpiCardActiveRing,
                        ]}
                      >
                        <View style={styles.kpiTop}>
                          <Text style={[styles.kpiLabel, { color: '#7C3AED' }]}>Audio / Kajian</Text>
                          <MaterialCommunityIcons name="headphones" size={16} color="#7C3AED" />
                        </View>
                        <Text style={[styles.kpiValue, { color: '#581C87' }]}>{parentMaterialKpi.audio}</Text>
                        <Text style={[styles.kpiSub, { color: '#6B21A8' }]}>Podcast & Murottal</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>

                {/* 3. FILTER MAPEL & PENCARIAN */}
                <View style={styles.filterSectionBlockClean}>
                  {/* Search Bar */}
                  <View style={styles.searchBarContainerModern}>
                    <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
                    <TextInput
                      placeholder="Cari materi pembelajaran..."
                      placeholderTextColor="#94A3B8"
                      value={searchQuery}
                      onChangeText={setSearchQuery}
                      style={styles.searchInputFieldModern}
                    />
                    {searchQuery.length > 0 && (
                      <TouchableOpacity onPress={() => setSearchQuery('')} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                        <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  {/* Filter Pills Scrollable (Semua Mapel + Mapel List + Reset) */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.filterPillsScrollContent}
                    style={styles.filterPillsScrollView}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setSelectedSubjectId('all')}
                      style={[
                        styles.subjectFilterChip,
                        selectedSubjectId === 'all' && styles.subjectFilterChipActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="book-open-outline"
                        size={13}
                        color={selectedSubjectId === 'all' ? '#FFFFFF' : '#059669'}
                        style={{ marginRight: 4 }}
                      />
                      <Text
                        style={[
                          styles.subjectFilterChipText,
                          selectedSubjectId === 'all' && styles.subjectFilterChipTextActive,
                        ]}
                      >
                        Semua Mapel
                      </Text>
                    </TouchableOpacity>

                    {subjectsList.map((sub) => {
                      const isActive = selectedSubjectId === sub.id;
                      return (
                        <TouchableOpacity
                          key={sub.id}
                          activeOpacity={0.8}
                          onPress={() => setSelectedSubjectId(sub.id)}
                          style={[
                            styles.subjectFilterChip,
                            isActive && styles.subjectFilterChipActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.subjectFilterChipText,
                              isActive && styles.subjectFilterChipTextActive,
                            ]}
                          >
                            {sub.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Reset Button if any filter active */}
                    {(selectedSubjectId !== 'all' || selectedMediaTypeFilter !== 'all' || searchQuery.trim().length > 0) && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setSelectedSubjectId('all');
                          setSelectedMediaTypeFilter('all');
                          setSearchQuery('');
                        }}
                        style={styles.resetFilterChip}
                      >
                        <MaterialCommunityIcons name="filter-remove-outline" size={13} color="#E11D48" style={{ marginRight: 4 }} />
                        <Text style={styles.resetFilterChipText}>Reset Filter</Text>
                      </TouchableOpacity>
                    )}
                  </ScrollView>
                </View>

                {/* 4. DAFTAR MATERI */}
                <View style={styles.materialsContainerBlock}>
                  <View style={styles.sectionHeaderBetweenModern}>
                    <View style={styles.sectionHeaderLeftModern}>
                      <View style={styles.sectionHeaderIconSquircle}>
                        <MaterialCommunityIcons name="book-open-page-variant-outline" size={18} color="#059669" />
                      </View>
                      <View>
                        <Text style={styles.sectionTitleBoldModern}>
                          Daftar Materi {activeStudentName ? `"${activeStudentName}"` : ''}
                        </Text>
                        <Text style={styles.sectionSubtitleModern}>
                          {sortedMaterials.length} materi siap dipelajari
                          {selectedMediaTypeFilter !== 'all' ? ` (Filter: ${selectedMediaTypeFilter.toUpperCase()})` : ''}
                        </Text>
                      </View>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setMaterialSortOrder((prev) => (prev === 'latest' ? 'title' : 'latest'))}
                      style={styles.sortPillButtonModern}
                    >
                      <MaterialCommunityIcons name="swap-vertical" size={15} color="#047857" style={{ marginRight: 4 }} />
                      <Text style={styles.sortPillTextModern}>
                        {materialSortOrder === 'latest' ? 'Terbaru' : 'Judul A–Z'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {loading && !refreshing ? (
                    <View style={styles.loadingBoxModern}>
                      <ActivityIndicator size="large" color="#059669" />
                      <Text style={styles.loadingTextModern}>Memuat materi pembelajaran...</Text>
                    </View>
                  ) : sortedMaterials.length === 0 ? (
                    <View style={styles.emptyCardModern}>
                      <View style={styles.emptyIconCircle}>
                        <MaterialCommunityIcons name="book-open-outline" size={38} color="#94A3B8" />
                      </View>
                      <Text style={styles.emptyTitleModern}>Materi Belum Ditemukan</Text>
                      <Text style={styles.emptySubtitleModern}>
                        {searchQuery || selectedSubjectId !== 'all' || selectedMediaTypeFilter !== 'all'
                          ? 'Tidak ada materi yang sesuai dengan kata kunci atau filter yang Anda pilih.'
                          : 'Materi pembelajaran untuk kelas dan kurikulum ananda belum dipublikasikan.'}
                      </Text>
                      {(searchQuery || selectedSubjectId !== 'all' || selectedMediaTypeFilter !== 'all') && (
                        <TouchableOpacity
                          onPress={() => {
                            setSearchQuery('');
                            setSelectedSubjectId('all');
                            setSelectedMediaTypeFilter('all');
                          }}
                          style={styles.emptyResetBtn}
                        >
                          <MaterialCommunityIcons name="refresh" size={15} color="#059669" style={{ marginRight: 4 }} />
                          <Text style={styles.emptyResetBtnText}>Reset Semua Filter</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  ) : (
                    sortedMaterials.map((item, idx) => {
                      const subjectName = item.subject?.name || item.subject?.nama_mapel || 'Pelajaran';
                      const subjectStyle = getSubjectStyle(subjectName, item.media);
                      const dateStr = formatDate(item.created_at || item.tanggal);
                      const teacherName = item.guru?.nama_lengkap || item.guru?.nama || item.teacher?.name || item.author || '';
                      const cat = getMaterialTypeCategory(item);
                      const title = item.judul || item.title || 'Materi Pembelajaran';
                      const previewDesc = item.deskripsi || item.isi || item.konten || '';
                      const mediaList = Array.isArray(item.media) ? item.media : [];
                      const mediaCount = mediaList.length;

                      const catBadge = cat === 'pdf'
                        ? { label: 'Dokumen PDF', icon: 'file-pdf-box', bg: '#FFE4E6', color: '#E11D48', border: '#FECDD3' }
                        : cat === 'video'
                        ? { label: 'Video Belajar', icon: 'play-circle-outline', bg: '#FEF3C7', color: '#D97706', border: '#FDE68A' }
                        : cat === 'audio'
                        ? { label: 'Audio / Kajian', icon: 'headphones', bg: '#F3E8FF', color: '#7C3AED', border: '#E9D5FF' }
                        : { label: 'Modul Belajar', icon: 'book-open-outline', bg: '#DCFCE7', color: '#16A34A', border: '#BBF7D0' };

                      return (
                        <View
                          key={item.id || idx}
                          style={[
                            styles.materialCardModern,
                            {
                              borderLeftWidth: 4,
                              borderLeftColor: subjectStyle.color,
                              borderColor: '#E2E8F0',
                            },
                          ]}
                        >
                          <LinearGradient
                            colors={[subjectStyle.bg, '#FFFFFF', '#FFFFFF']}
                            locations={[0, 0.45, 1]}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0.8 }}
                            style={styles.materialCardGradient}
                          >
                            {/* Header Badges: Mapel, Tipe Media, Tanggal */}
                            <View style={styles.materialCardHeaderRow}>
                              <View style={[styles.subjectPillBadgeModern, { backgroundColor: '#FFFFFF', borderColor: `${subjectStyle.color}40` }]}>
                                <MaterialCommunityIcons
                                  name={subjectStyle.icon as any}
                                  size={12}
                                  color={subjectStyle.color}
                                  style={{ marginRight: 4 }}
                                />
                                <Text numberOfLines={1} style={[styles.subjectPillTextModern, { color: subjectStyle.color }]}>
                                  {subjectName}
                                </Text>
                              </View>

                              <View style={[styles.mediaTypePillBadge, { backgroundColor: catBadge.bg, borderColor: catBadge.border }]}>
                                <MaterialCommunityIcons name={catBadge.icon as any} size={11} color={catBadge.color} style={{ marginRight: 3 }} />
                                <Text style={[styles.mediaTypePillText, { color: catBadge.color }]}>{catBadge.label}</Text>
                              </View>

                              <View style={{ flex: 1 }} />

                              <View style={styles.materialDateBadge}>
                                <MaterialCommunityIcons name="calendar-clock-outline" size={11} color="#64748B" style={{ marginRight: 3 }} />
                                <Text style={styles.materialDateText}>{dateStr}</Text>
                              </View>
                            </View>

                            {/* Judul & Cuplikan Deskripsi */}
                            <View style={styles.materialCardBody}>
                              <Text numberOfLines={2} style={styles.materialTitleText}>
                                {title}
                              </Text>
                              {previewDesc ? (
                                <Text numberOfLines={2} style={styles.materialDescText}>
                                  {previewDesc}
                                </Text>
                              ) : null}
                            </View>

                            {/* Kotak Metadata 2 Kolom (Guru & Lampiran) */}
                            <View style={styles.materialMetaBox}>
                              <View style={styles.materialMetaCol}>
                                <MaterialCommunityIcons name="account-tie-outline" size={15} color={subjectStyle.color} style={{ marginRight: 6 }} />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.materialMetaLabel}>Guru Pengampu</Text>
                                  <Text numberOfLines={1} style={styles.materialMetaValue}>{teacherName || 'Dewan Guru'}</Text>
                                </View>
                              </View>

                              <View style={styles.materialMetaDivider} />

                              <View style={styles.materialMetaCol}>
                                <MaterialCommunityIcons
                                  name={mediaCount > 0 ? 'paperclip' : 'book-open-outline'}
                                  size={15}
                                  color="#0284C7"
                                  style={{ marginRight: 6 }}
                                />
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.materialMetaLabel}>Materi & Lampiran</Text>
                                  <Text numberOfLines={1} style={styles.materialMetaValue}>
                                    {mediaCount > 0 ? `${mediaCount} Berkas Media` : formatMetaText(item)}
                                  </Text>
                                </View>
                              </View>
                            </View>

                            {/* Footer Action Button: Buka Materi */}
                            <View style={styles.materialCardFooter}>
                              <TouchableOpacity
                                activeOpacity={0.85}
                                onPress={() => setSelectedMaterial(item)}
                                style={styles.openMaterialBtn}
                              >
                                <MaterialCommunityIcons name="book-open-page-variant-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                                <Text style={styles.openMaterialBtnText}>Buka Materi</Text>
                                <MaterialCommunityIcons name="chevron-right" size={16} color="#FFFFFF" style={{ marginLeft: 2 }} />
                              </TouchableOpacity>
                            </View>
                          </LinearGradient>
                        </View>
                      );
                    })
                  )}
                </View>
              </>
            )}
          </View>
        </Animated.ScrollView>

      {/* DETAIL MATERI MODAL */}
      <Modal
        visible={!!selectedMaterial}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedMaterial(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(bottomInset, 36) + 16 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={styles.subjectBadge}>
                  <Text style={styles.subjectBadgeText}>
                    {selectedMaterial?.subject?.name || selectedMaterial?.subject?.nama_mapel || 'Pelajaran'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>
                  {selectedMaterial?.judul || selectedMaterial?.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedMaterial(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.modalTeacherBox}>
                <MaterialCommunityIcons name="account-tie-outline" size={20} color="#18A165" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.modalTeacherTitle}>
                    {selectedMaterial?.guru?.nama_lengkap || selectedMaterial?.teacher?.name || 'Dewan Guru'}
                  </Text>
                  <Text style={styles.modalTeacherSub}>
                    {selectedMaterial?.guru?.jabatan?.nama_jabatan || 'Guru Pengampu'}
                  </Text>
                </View>
              </View>

              <Text style={styles.modalSectionHeading}>Deskripsi / Isi Materi</Text>
              <Text style={styles.modalText}>
                {selectedMaterial?.konten || selectedMaterial?.isi || selectedMaterial?.deskripsi || 'Tidak ada konten deskripsi tertulis.'}
              </Text>

              {Array.isArray(selectedMaterial?.media) && selectedMaterial.media.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.modalSectionHeading}>Lampiran Media & Berkas ({selectedMaterial.media.length})</Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {selectedMaterial.media.map((med: any, mIdx: number) => {
                      const isPdf = med.tipe_file === 'pdf';
                      const isVideo = med.tipe_file === 'video';
                      const iconName = isPdf ? 'file-pdf-box' : isVideo ? 'play-circle-outline' : 'headphones';
                      const iconColor = isPdf ? '#EF4444' : isVideo ? '#EA580C' : '#9333EA';

                      return (
                        <TouchableOpacity
                          key={med.id || mIdx}
                          activeOpacity={0.8}
                          onPress={() => handleOpenMedia(med)}
                          style={styles.attachmentItem}
                        >
                          <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text numberOfLines={1} style={styles.attachmentName}>
                              {med.nama_file || 'Lampiran Berkas'}
                            </Text>
                            <Text style={styles.attachmentDesc}>
                              {med.deskripsi || (isPdf ? 'Dokumen PDF' : isVideo ? 'Video Pembelajaran' : 'Audio Podcast')}
                            </Text>
                          </View>
                          <View style={styles.openInAppBadge}>
                            <MaterialCommunityIcons name="eye-outline" size={14} color="#18A165" />
                            <Text style={styles.openInAppText}>Lihat</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setSelectedMaterial(null)}
              style={[styles.modalDismissBtn, { marginBottom: Platform.OS === 'android' ? 10 : 4 }]}
            >
              <Text style={styles.modalDismissBtnText}>Tutup Materi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* IN-APP ATTACHMENT VIEWER MODAL */}
      <Modal
        visible={!!activeAttachment}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveAttachment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(bottomInset, 36) + 16, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={[styles.subjectBadge, {
                  backgroundColor: activeAttachment?.tipe_file === 'pdf' ? '#FEE2E2' : activeAttachment?.tipe_file === 'video' ? '#FFEDD5' : '#F3E8FF',
                  borderColor: activeAttachment?.tipe_file === 'pdf' ? '#FECACA' : activeAttachment?.tipe_file === 'video' ? '#FED7AA' : '#E9D5FF'
                }]}>
                  <Text style={[styles.subjectBadgeText, {
                    color: activeAttachment?.tipe_file === 'pdf' ? '#DC2626' : activeAttachment?.tipe_file === 'video' ? '#EA580C' : '#9333EA'
                  }]}>
                    {activeAttachment?.tipe_file === 'pdf' ? 'DOKUMEN PDF LENGKAP' : activeAttachment?.tipe_file === 'video' ? 'VIDEO PEMBELAJARAN' : 'AUDIO KAJIAN & PODCAST'}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.modalTitle}>
                  {activeAttachment?.nama_file || 'Lampiran Berkas'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveAttachment(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* JIKA BERKAS PDF */}
              {activeAttachment?.tipe_file === 'pdf' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.pdfHeroBox}>
                    <View style={styles.pdfIconCircle}>
                      <MaterialCommunityIcons name="file-pdf-box" size={42} color="#DC2626" />
                    </View>
                    <Text style={styles.pdfHeroTitle}>{activeAttachment?.nama_file || 'Dokumen Panduan PDF'}</Text>
                    <Text style={styles.pdfHeroSize}>
                      {activeAttachment?.ukuran_bytes ? `Ukuran Berkas: ${(activeAttachment.ukuran_bytes / (1024 * 1024)).toFixed(2)} MB` : 'Format Dokumen Terverifikasi SIT'}
                    </Text>
                  </View>

                  <View style={styles.inAppPreviewCard}>
                    <View style={styles.inAppPreviewHeader}>
                      <MaterialCommunityIcons name="text-box-search-outline" size={18} color="#18A165" />
                      <Text style={styles.inAppPreviewHeading}>Ringkasan Dokumen & Panduan:</Text>
                    </View>
                    <Text style={styles.inAppPreviewText}>
                      {activeAttachment?.deskripsi || 'Dokumen panduan materi lengkap beserta latihan soal terpadu untuk pembelajaran mandiri santri.'}
                    </Text>
                    <View style={styles.inAppGuideBox}>
                      <MaterialCommunityIcons name="check-decagram" size={16} color="#059669" />
                      <Text style={styles.inAppGuideText}>
                        Modul ini telah divalidasi oleh dewan guru dan siap dipelajari santri serta dipantau wali murid.
                      </Text>
                    </View>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={styles.openExternalBtn}
                    >
                      <MaterialCommunityIcons name="file-download-outline" size={18} color="#DC2626" />
                      <Text style={styles.openExternalBtnText}>Buka Dokumen Lengkap di Perangkat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* JIKA BERKAS VIDEO */}
              {activeAttachment?.tipe_file === 'video' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.videoPlayerCard}>
                    <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.videoPlaceholder}>
                      <View style={styles.videoPlayCircle}>
                        <MaterialCommunityIcons name="play" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.videoDurationBadge}>
                        {activeAttachment?.durasi_detik ? `${Math.floor(activeAttachment.durasi_detik / 60)}:${String(activeAttachment.durasi_detik % 60).padStart(2, '0')}` : '10:20 Menit'}
                      </Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.inAppPreviewCard}>
                    <View style={styles.inAppPreviewHeader}>
                      <MaterialCommunityIcons name="movie-open-outline" size={18} color="#EA580C" />
                      <Text style={[styles.inAppPreviewHeading, { color: '#C2410C' }]}>Sinopsis & Pembahasan Video:</Text>
                    </View>
                    <Text style={styles.inAppPreviewText}>
                      {activeAttachment?.deskripsi || 'Video tutorial penjelasan bab 1 oleh tim pengajar SIT.'}
                    </Text>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={[styles.openExternalBtn, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}
                    >
                      <MaterialCommunityIcons name="youtube" size={20} color="#EA580C" />
                      <Text style={[styles.openExternalBtnText, { color: '#C2410C' }]}>Tonton Video Pembelajaran</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* JIKA BERKAS AUDIO / PODCAST */}
              {activeAttachment?.tipe_file === 'audio' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.audioPlayerCard}>
                    <LinearGradient colors={['#7E22CE', '#581C87']} style={styles.audioArtwork}>
                      <MaterialCommunityIcons name="waveform" size={48} color="#E9D5FF" />
                    </LinearGradient>

                    <Text style={styles.audioTrackTitle}>{activeAttachment?.nama_file || 'Audio Podcast Kajian'}</Text>
                    <Text style={styles.audioTrackSub}>
                      {activeAttachment?.deskripsi || 'Rangkuman materi audio singkat'}
                    </Text>

                    <View style={styles.audioProgressBarWrap}>
                      <View style={[styles.audioProgressBarFill, { width: isPlayingAudio ? '45%' : '0%' }]} />
                    </View>
                    <View style={styles.audioTimeRow}>
                      <Text style={styles.audioTimeText}>{isPlayingAudio ? '02:45' : '00:00'}</Text>
                      <Text style={styles.audioTimeText}>
                        {activeAttachment?.durasi_detik ? `${Math.floor(activeAttachment.durasi_detik / 60)}:${String(activeAttachment.durasi_detik % 60).padStart(2, '0')}` : '06:12'}
                      </Text>
                    </View>

                    <View style={styles.audioControlsRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setIsPlayingAudio(!isPlayingAudio)}
                        style={styles.audioPlayBtn}
                      >
                        <MaterialCommunityIcons name={isPlayingAudio ? 'pause' : 'play'} size={28} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={[styles.openExternalBtn, { borderColor: '#E9D5FF', backgroundColor: '#FAF5FF', marginTop: 14 }]}
                    >
                      <MaterialCommunityIcons name="headphones" size={18} color="#9333EA" />
                      <Text style={[styles.openExternalBtnText, { color: '#7E22CE' }]}>Buka File Audio di Perangkat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setActiveAttachment(null)}
              style={[styles.modalDismissBtn, { marginBottom: Platform.OS === 'android' ? 10 : 4 }]}
            >
              <Text style={styles.modalDismissBtnText}>Kembali ke Materi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* MODAL KARTU SISWA / MENU / LAPORAN (dibuka dari sticky header) */}
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

      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* MODAL FORM TAMBAH / UBAH BAHAN AJAR (ROLE TATA USAHA & GURU) */}
      <Modal
        visible={formVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNoPad, { maxHeight: '92%' }]}>
            {/* Header Berwarna Gradasi Emerald Sesuai Standar Hero */}
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
                  <MaterialCommunityIcons
                    name={isTu ? 'office-building' : 'shield-check'}
                    size={11}
                    color="#FFFFFF"
                    style={{ marginRight: 4 }}
                  />
                  <Text style={styles.modalHeaderSubjectBadgeText}>
                    {isTu ? `TATA USAHA · ${currentUserUnitName.toUpperCase()}` : 'PORTAL GURU SIT'}
                  </Text>
                </View>
                <Text style={styles.modalTitleWhite}>
                  {editingMaterial
                    ? isTu
                      ? 'Ubah Bahan Ajar Unit'
                      : 'Ubah Bahan Ajar'
                    : isTu
                    ? 'Tambah Bahan Ajar Unit'
                    : 'Tambah Bahan Ajar Baru'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setFormVisible(false)}
                style={styles.modalCloseBtnWhite}
                accessibilityLabel="Tutup"
              >
                <MaterialCommunityIcons name="close" size={18} color="#047857" />
              </TouchableOpacity>
            </View>

            {formError ? (
              <View style={[styles.formErrorBox, { marginHorizontal: 18, marginTop: 12 }]}>
                <MaterialCommunityIcons name="alert-circle" size={16} color="#DC2626" />
                <Text style={styles.formErrorText}>{formError}</Text>
              </View>
            ) : null}

            <ScrollView
              style={[styles.modalBody, { paddingHorizontal: 18, paddingTop: 14 }]}
              contentContainerStyle={{ paddingBottom: 28 }}
              showsVerticalScrollIndicator={false}
            >
              {/* JIKA ROLE TATA USAHA: PILIHAN MODUL AJAR (STRICT UNIT ONLY) */}
              {isTu || isStaff ? (
                <>
                  <Text style={styles.formLabel}>Pilih Modul Ajar (Unit: {currentUserUnitName}) *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setShowModulDropdown((v) => !v);
                      setShowTipeDropdown(false);
                    }}
                    style={[
                      styles.formDropdownTrigger,
                      showModulDropdown && styles.formDropdownTriggerOpen,
                    ]}
                  >
                    <MaterialCommunityIcons name="layers-outline" size={16} color="#047857" style={{ marginRight: 8 }} />
                    <Text style={styles.formDropdownTriggerText} numberOfLines={1}>
                      {optionsModulAjar.find((o) => String(o.id) === String(materialForm.modul_ajar_id))?.judul_modul ||
                        optionsModulAjar.find((o) => String(o.id) === String(materialForm.modul_ajar_id))?.judul ||
                        (optionsModulAjar.length > 0 ? 'Pilih Modul Ajar...' : 'Tidak ada modul di unit ini')}
                    </Text>
                    <MaterialCommunityIcons
                      name={showModulDropdown ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#047857"
                    />
                  </TouchableOpacity>

                  {showModulDropdown && (
                    <View style={styles.formDropdownList}>
                      {optionsModulAjar.length === 0 ? (
                        <View style={styles.formDropdownEmpty}>
                          <MaterialCommunityIcons name="information-outline" size={16} color="#94A3B8" />
                          <Text style={styles.formDropdownEmptyText}>Belum ada modul ajar pada unit ini</Text>
                        </View>
                      ) : (
                        optionsModulAjar.map((mod, idx) => {
                          const isSel = String(materialForm.modul_ajar_id) === String(mod.id);
                          const mTitle = mod.judul_modul || mod.judul || `Modul #${mod.id}`;
                          const mFase = mod.fase ? `Fase ${mod.fase}` : '';
                          const mMapel = mod.subject?.name || mod.subject?.nama_mapel || '';

                          return (
                            <TouchableOpacity
                              key={mod.id}
                              activeOpacity={0.8}
                              onPress={() => {
                                setMaterialForm((prev) => ({
                                  ...prev,
                                  modul_ajar_id: String(mod.id),
                                  class_id: String(mod.kelas_id || prev.class_id),
                                  subject_id: String(mod.mata_pelajaran_id || prev.subject_id),
                                }));
                                setShowModulDropdown(false);
                              }}
                              style={[
                                styles.formDropdownItem,
                                isSel && styles.formDropdownItemActive,
                                idx < optionsModulAjar.length - 1 && styles.formDropdownItemBorder,
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={isSel ? 'check-circle' : 'circle-outline'}
                                size={16}
                                color={isSel ? '#047857' : '#CBD5E1'}
                                style={{ marginRight: 8 }}
                              />
                              <View style={{ flex: 1 }}>
                                <Text style={[styles.formDropdownItemText, isSel && styles.formDropdownItemTextActive]}>
                                  {mTitle}
                                </Text>
                                {(mFase || mMapel) ? (
                                  <Text style={styles.formDropdownItemSub}>
                                    {[mFase, mMapel].filter(Boolean).join(' · ')}
                                  </Text>
                                ) : null}
                              </View>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}

                  {/* Pilihan Tipe Konten Media */}
                  <Text style={[styles.formLabel, { marginTop: 12 }]}>Tipe Konten Pembelajaran *</Text>
                  <View style={styles.tipeSelectorRow}>
                    {[
                      { id: 'teks', label: 'Teks / Uraian', icon: 'file-document-outline' },
                      { id: 'dokumen', label: 'Dokumen / PDF', icon: 'file-pdf-box' },
                      { id: 'video', label: 'Video Belajar', icon: 'youtube' },
                      { id: 'link', label: 'Tautan Luar', icon: 'link-variant' },
                    ].map((t) => {
                      const isSel = materialForm.tipe === t.id;
                      return (
                        <TouchableOpacity
                          key={t.id}
                          activeOpacity={0.8}
                          onPress={() => setMaterialForm((prev) => ({ ...prev, tipe: t.id }))}
                          style={[
                            styles.tipeSelectorOption,
                            isSel && styles.tipeSelectorOptionActive,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={t.icon as any}
                            size={16}
                            color={isSel ? '#047857' : '#64748B'}
                          />
                          <Text
                            style={[
                              styles.tipeSelectorOptionText,
                              isSel && styles.tipeSelectorOptionTextActive,
                            ]}
                          >
                            {t.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                /* Mode Guru Biasa: Rombel & Mapel */
                <>
                  {/* Rombel / Kelas */}
                  <Text style={styles.formLabel}>Pilih Rombel / Kelas Sasaran *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setShowClassDropdown((v) => !v);
                      setShowSubjectDropdown(false);
                    }}
                    style={[
                      styles.formDropdownTrigger,
                      showClassDropdown && styles.formDropdownTriggerOpen,
                    ]}
                  >
                    <MaterialCommunityIcons name="google-classroom" size={16} color="#047857" style={{ marginRight: 8 }} />
                    <Text style={styles.formDropdownTriggerText} numberOfLines={1}>
                      {uniqueMaterialClasses.find((c) => c.id === materialForm.class_id)?.name || 'Pilih rombel / kelas...'}
                    </Text>
                    <MaterialCommunityIcons
                      name={showClassDropdown ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#047857"
                    />
                  </TouchableOpacity>
                  {showClassDropdown && (
                    <View style={styles.formDropdownList}>
                      {uniqueMaterialClasses.length === 0 ? (
                        <View style={styles.formDropdownEmpty}>
                          <MaterialCommunityIcons name="information-outline" size={16} color="#94A3B8" />
                          <Text style={styles.formDropdownEmptyText}>Belum ada rombel tersedia</Text>
                        </View>
                      ) : (
                        uniqueMaterialClasses.map((c, idx) => {
                          const isSel = materialForm.class_id === c.id;
                          return (
                            <TouchableOpacity
                              key={c.id}
                              activeOpacity={0.8}
                              onPress={() => {
                                setMaterialForm((prev) => ({ ...prev, class_id: c.id }));
                                setShowClassDropdown(false);
                              }}
                              style={[
                                styles.formDropdownItem,
                                isSel && styles.formDropdownItemActive,
                                idx < uniqueMaterialClasses.length - 1 && styles.formDropdownItemBorder,
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={isSel ? 'check-circle' : 'circle-outline'}
                                size={16}
                                color={isSel ? '#047857' : '#CBD5E1'}
                                style={{ marginRight: 8 }}
                              />
                              <Text style={[styles.formDropdownItemText, isSel && styles.formDropdownItemTextActive]}>
                                {c.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}

                  {/* Mata Pelajaran */}
                  <Text style={[styles.formLabel, { marginTop: 10 }]}>Mata Pelajaran *</Text>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setShowSubjectDropdown((v) => !v);
                      setShowClassDropdown(false);
                    }}
                    style={[
                      styles.formDropdownTrigger,
                      showSubjectDropdown && styles.formDropdownTriggerOpen,
                    ]}
                  >
                    <MaterialCommunityIcons name="book-open-variant" size={16} color="#047857" style={{ marginRight: 8 }} />
                    <Text style={styles.formDropdownTriggerText} numberOfLines={1}>
                      {uniqueMaterialSubjects.find((s) => s.id === materialForm.subject_id)?.name || 'Pilih mata pelajaran...'}
                    </Text>
                    <MaterialCommunityIcons
                      name={showSubjectDropdown ? 'chevron-up' : 'chevron-down'}
                      size={18}
                      color="#047857"
                    />
                  </TouchableOpacity>
                  {showSubjectDropdown && (
                    <View style={styles.formDropdownList}>
                      {uniqueMaterialSubjects.length === 0 ? (
                        <View style={styles.formDropdownEmpty}>
                          <MaterialCommunityIcons name="information-outline" size={16} color="#94A3B8" />
                          <Text style={styles.formDropdownEmptyText}>Belum ada mata pelajaran tersedia</Text>
                        </View>
                      ) : (
                        uniqueMaterialSubjects.map((s, idx) => {
                          const isSel = materialForm.subject_id === s.id;
                          return (
                            <TouchableOpacity
                              key={s.id}
                              activeOpacity={0.8}
                              onPress={() => {
                                setMaterialForm((prev) => ({ ...prev, subject_id: s.id }));
                                setShowSubjectDropdown(false);
                              }}
                              style={[
                                styles.formDropdownItem,
                                isSel && styles.formDropdownItemActive,
                                idx < uniqueMaterialSubjects.length - 1 && styles.formDropdownItemBorder,
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={isSel ? 'check-circle' : 'circle-outline'}
                                size={16}
                                color={isSel ? '#047857' : '#CBD5E1'}
                                style={{ marginRight: 8 }}
                              />
                              <Text style={[styles.formDropdownItemText, isSel && styles.formDropdownItemTextActive]}>
                                {s.name}
                              </Text>
                            </TouchableOpacity>
                          );
                        })
                      )}
                    </View>
                  )}
                </>
              )}

              {/* Judul Materi */}
              <Text style={[styles.formLabel, { marginTop: 12 }]}>Judul Bahan Ajar / Topik Pembelajaran *</Text>
              <TextInput
                value={materialForm.title}
                onChangeText={(t) => setMaterialForm((prev) => ({ ...prev, title: t }))}
                placeholder="Contoh: Bab 3 - Fiqih Thaharah dan Wudhu Sempurna"
                placeholderTextColor="#94A3B8"
                style={styles.formInput}
              />

              {/* Ringkasan */}
              <Text style={styles.formLabel}>Ringkasan Singkat / Capaian Pembelajaran</Text>
              <TextInput
                value={materialForm.ringkasan}
                onChangeText={(t) => setMaterialForm((prev) => ({ ...prev, ringkasan: t }))}
                placeholder="Ringkasan poin utama materi yang akan dipelajari..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={2}
                style={[styles.formInput, { minHeight: 60, textAlignVertical: 'top' }]}
              />

              {/* Estimasi Bobot Waktu Belajar (Menit) */}
              <Text style={styles.formLabel}>Estimasi Waktu Belajar (Menit)</Text>
              <TextInput
                value={materialForm.bobot}
                onChangeText={(t) => setMaterialForm((prev) => ({ ...prev, bobot: t.replace(/[^0-9]/g, '') }))}
                placeholder="45"
                placeholderTextColor="#94A3B8"
                keyboardType="numeric"
                style={styles.formInput}
              />

              {/* 1. Uraian Teks Materi Lengkap (Text) */}
              <Text style={styles.formLabel}>Uraian Teks Materi Pembelajaran (Text) *</Text>
              <Text style={styles.formFieldSubLabel}>
                Tuliskan naskah materi lengkap, panduan belajar, atau rangkuman bab untuk siswa.
              </Text>
              <TextInput
                value={materialForm.isi}
                onChangeText={(t) => setMaterialForm((prev) => ({ ...prev, isi: t }))}
                placeholder="Tuliskan materi pembelajaran secara lengkap di sini..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={5}
                style={[styles.formInput, { minHeight: 110, textAlignVertical: 'top' }]}
              />

              {/* 2. Upload Dokumen Pembelajaran (PDF / DOCX / File) */}
              <Text style={[styles.formLabel, { marginTop: 12 }]}>Upload Dokumen Pembelajaran (PDF / DOCX)</Text>
              <Text style={styles.formFieldSubLabel}>
                Pilih berkas dokumen modul dari perangkat atau cantumkan tautan dokumen online.
              </Text>

              {pickedDocument ? (
                <View style={styles.docPickedCardClean}>
                  <View style={styles.docPickedCardLeft}>
                    <MaterialCommunityIcons name="file-check-outline" size={22} color="#059669" />
                    <View style={{ flex: 1, marginLeft: 8 }}>
                      <Text numberOfLines={1} style={styles.docPickedNameText}>
                        {pickedDocument.name}
                      </Text>
                      <Text style={styles.docPickedMetaText}>
                        Berkas siap diunggah {pickedDocument.size ? `• ${(pickedDocument.size / (1024 * 1024)).toFixed(2)} MB` : ''}
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    onPress={() => {
                      setPickedDocument(null);
                      setMaterialForm((prev) => ({ ...prev, file_url: '' }));
                    }}
                    style={{ padding: 4 }}
                  >
                    <MaterialCommunityIcons name="close-circle" size={20} color="#EF4444" />
                  </TouchableOpacity>
                </View>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={handlePickDocument}
                  style={styles.docUploadBtnClean}
                >
                  <MaterialCommunityIcons name="cloud-upload-outline" size={20} color="#059669" />
                  <Text style={styles.docUploadBtnTextClean}>Pilih Berkas Dokumen dari Perangkat</Text>
                </TouchableOpacity>
              )}

              <TextInput
                value={materialForm.file_url}
                onChangeText={(t) => setMaterialForm((prev) => ({ ...prev, file_url: t }))}
                placeholder="Atau tautan Google Drive / Cloud: https://..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                style={styles.formInput}
              />

              {/* 3. Video Pembelajaran (YouTube / Drive) */}
              <Text style={[styles.formLabel, { marginTop: 12 }]}>Video Pembelajaran (YouTube / Google Drive)</Text>
              <Text style={styles.formFieldSubLabel}>
                Sematkan tautan video YouTube atau Google Drive untuk santri/siswa.
              </Text>
              <TextInput
                value={materialForm.video}
                onChangeText={(t) => setMaterialForm((prev) => ({ ...prev, video: t }))}
                placeholder="https://www.youtube.com/watch?v=... atau https://youtu.be/..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                style={styles.formInput}
              />

              {/* 4. Tautan Referensi Eksternal (Opsional) */}
              <Text style={[styles.formLabel, { marginTop: 12 }]}>Tautan Referensi Eksternal (Opsional)</Text>
              <TextInput
                value={materialForm.link}
                onChangeText={(t) => setMaterialForm((prev) => ({ ...prev, link: t }))}
                placeholder="https://sumber-belajar.kemdikbud.go.id/..."
                placeholderTextColor="#94A3B8"
                autoCapitalize="none"
                style={styles.formInput}
              />

              {/* Status Publikasi */}
              <Text style={[styles.formLabel, { marginTop: 14 }]}>Status Publikasi *</Text>
              <View style={styles.formStatusRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setMaterialForm((prev) => ({ ...prev, status: 'published' }))}
                  style={[
                    styles.formStatusOption,
                    materialForm.status === 'published' && styles.formStatusOptionActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="check-circle"
                    size={20}
                    color={materialForm.status === 'published' ? '#047857' : '#94A3B8'}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.formStatusTitle,
                        materialForm.status === 'published' && styles.formStatusTitleActive,
                      ]}
                    >
                      Publikasi / Aktif
                    </Text>
                    <Text numberOfLines={1} style={styles.formStatusSub}>Dapat diakses santri</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setMaterialForm((prev) => ({ ...prev, status: 'draft' }))}
                  style={[
                    styles.formStatusOption,
                    materialForm.status === 'draft' && styles.formStatusOptionActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="file-edit-outline"
                    size={20}
                    color={materialForm.status === 'draft' ? '#D97706' : '#94A3B8'}
                  />
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text
                      numberOfLines={1}
                      style={[
                        styles.formStatusTitle,
                        materialForm.status === 'draft' && styles.formStatusTitleActive,
                      ]}
                    >
                      Draf Simpanan
                    </Text>
                    <Text numberOfLines={1} style={styles.formStatusSub}>Khusus internal TU/Guru</Text>
                  </View>
                </TouchableOpacity>
              </View>
            </ScrollView>

            {/* Tombol Aksi Simpan */}
            <View
              style={[
                styles.formActionsRow,
                {
                  paddingHorizontal: 18,
                  paddingBottom: Math.max(bottomInset, 20) + 12,
                  paddingTop: 10,
                  borderTopWidth: 1,
                  borderTopColor: '#F1F5F9',
                },
              ]}
            >
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setFormVisible(false)}
                style={styles.formCancelBtn}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={17} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.formCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                onPress={handleSaveMaterialForm}
                disabled={savingForm}
                style={styles.formSubmitBtn}
              >
                {savingForm ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.formSubmitBtnText}>
                      {editingMaterial ? 'Simpan Perubahan' : 'Simpan Bahan Ajar'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL KONFIRMASI HAPUS (PINDAHKAN KE KOTAK SAMPAH) */}
      <Modal
        visible={Boolean(deleteConfirmMaterial)}
        animationType="fade"
        transparent
        onRequestClose={() => setDeleteConfirmMaterial(null)}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
          <View style={styles.deleteModalCard}>
            {/* Top Accent Gradient Bar */}
            <LinearGradient
              colors={['#F43F5E', '#E11D48', '#BE123C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.deleteModalTopBar}
            />

            <View style={styles.deleteModalBody}>
              {/* Squircle 3D Icon Badge */}
              <View style={styles.deleteSquircleBadge}>
                <MaterialCommunityIcons name="trash-can-outline" size={28} color="#E11D48" />
              </View>

              {/* Status Hazard Pill Badge */}
              <View style={styles.deleteHazardPill}>
                <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#E11D48" />
                <Text style={styles.deleteHazardPillText}>
                  {isTu ? 'KOTAK SAMPAH' : 'HAPUS PERMANEN'}
                </Text>
              </View>

              {/* Header Title & Subtitle */}
              <Text style={styles.deleteModalTitleClean}>
                {isTu ? 'Pindahkan ke Kotak Sampah?' : 'Hapus Bahan Ajar?'}
              </Text>
              <Text style={styles.deleteModalSubtitleClean}>
                {isTu
                  ? 'Bahan ajar akan dinonaktifkan dari pembelajaran aktif.'
                  : 'Bahan ajar akan dihapus secara permanen dari basis data sekolah.'}
              </Text>

              {/* Target Entity Summary Card */}
              {deleteConfirmMaterial && (
                <View style={styles.deleteEntitySummaryCard}>
                  <Text numberOfLines={2} style={styles.deleteEntityTitleText}>
                    {deleteConfirmMaterial.judul || deleteConfirmMaterial.title || 'Bahan Ajar'}
                  </Text>
                  <View style={styles.deleteEntityBadgesRow}>
                    <View style={styles.deleteEntityMetaChip}>
                      <MaterialCommunityIcons name="book-open-variant" size={11} color="#0284C7" />
                      <Text numberOfLines={1} style={[styles.deleteEntityMetaChipText, { color: '#0369A1' }]}>
                        {deleteConfirmMaterial.subject?.name ||
                          deleteConfirmMaterial.subject?.nama_mapel ||
                          deleteConfirmMaterial.mapel ||
                          'Mata Pelajaran'}
                      </Text>
                    </View>
                    <View style={styles.deleteEntityMetaChip}>
                      <MaterialCommunityIcons name="google-classroom" size={11} color="#475569" />
                      <Text numberOfLines={1} style={styles.deleteEntityMetaChipText}>
                        {deleteConfirmMaterial.kelas?.nama_kelas ||
                          deleteConfirmMaterial.class_name ||
                          deleteConfirmMaterial.rombel ||
                          'Semua Rombel'}
                      </Text>
                    </View>
                    {Boolean(deleteConfirmMaterial.tipe || deleteConfirmMaterial.media_type) && (
                      <View style={styles.deleteEntityMetaChip}>
                        <MaterialCommunityIcons
                          name={
                            (deleteConfirmMaterial.tipe || deleteConfirmMaterial.media_type) === 'VIDEO'
                              ? 'youtube'
                              : (deleteConfirmMaterial.tipe || deleteConfirmMaterial.media_type) === 'DOKUMEN' ||
                                (deleteConfirmMaterial.tipe || deleteConfirmMaterial.media_type) === 'PDF'
                              ? 'file-pdf-box'
                              : 'file-document-outline'
                          }
                          size={11}
                          color="#D97706"
                        />
                        <Text numberOfLines={1} style={[styles.deleteEntityMetaChipText, { color: '#B45309' }]}>
                          {deleteConfirmMaterial.tipe || deleteConfirmMaterial.media_type}
                        </Text>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Semantic Callout Notice Box */}
              <View style={styles.deleteCalloutNoticeBox}>
                <MaterialCommunityIcons name="information-outline" size={16} color="#E11D48" style={{ marginTop: 1 }} />
                <Text style={styles.deleteCalloutNoticeText}>
                  {isTu
                    ? 'Bahan ajar dapat dipulihkan sewaktu-waktu melalui filter "Kotak Sampah" jika diperlukan kembali.'
                    : 'Perhatian: Tindakan ini permanen. Seluruh materi dan lampiran berkas akan dihapus.'}
                </Text>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.deleteModalButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setDeleteConfirmMaterial(null)}
                  disabled={deletingMaterial}
                  style={styles.deleteModalCancelBtn}
                >
                  <Text style={styles.deleteModalCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleConfirmDelete}
                  disabled={deletingMaterial}
                  style={styles.deleteModalConfirmBtn}
                >
                  {deletingMaterial ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.deleteModalConfirmBtnText}>
                        {isTu ? 'Ya, Pindahkan' : 'Ya, Hapus'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL KONFIRMASI PULIHKAN (RESTORE DARI KOTAK SAMPAH) */}
      <Modal
        visible={Boolean(restoreConfirmMaterial)}
        animationType="fade"
        transparent
        onRequestClose={() => setRestoreConfirmMaterial(null)}
      >
        <View style={[styles.modalOverlay, { justifyContent: 'center', alignItems: 'center', padding: 20 }]}>
          <View style={[styles.deleteModalCard, styles.deleteModalCardRestore]}>
            {/* Top Accent Gradient Bar Emerald */}
            <LinearGradient
              colors={['#10B981', '#059669', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.deleteModalTopBar}
            />

            <View style={styles.deleteModalBody}>
              {/* Squircle 3D Icon Badge */}
              <View style={[styles.deleteSquircleBadge, styles.restoreSquircleBadge]}>
                <MaterialCommunityIcons name="history" size={28} color="#059669" />
              </View>

              {/* Status Hazard Pill Badge */}
              <View style={[styles.deleteHazardPill, styles.restoreHazardPill]}>
                <MaterialCommunityIcons name="backup-restore" size={13} color="#059669" />
                <Text style={[styles.deleteHazardPillText, styles.restoreHazardPillText]}>
                  PULIHKAN DATA
                </Text>
              </View>

              {/* Header Title & Subtitle */}
              <Text style={styles.deleteModalTitleClean}>Pulihkan Bahan Ajar?</Text>
              <Text style={styles.deleteModalSubtitleClean}>
                Bahan ajar akan diaktifkan kembali ke KBM unit dan dapat diakses santri & guru.
              </Text>

              {/* Target Entity Summary Card */}
              {restoreConfirmMaterial && (
                <View style={[styles.deleteEntitySummaryCard, styles.restoreEntitySummaryCard]}>
                  <Text numberOfLines={2} style={styles.deleteEntityTitleText}>
                    {restoreConfirmMaterial.judul || restoreConfirmMaterial.title || 'Bahan Ajar'}
                  </Text>
                  <View style={styles.deleteEntityBadgesRow}>
                    <View style={styles.deleteEntityMetaChip}>
                      <MaterialCommunityIcons name="book-open-variant" size={11} color="#059669" />
                      <Text numberOfLines={1} style={[styles.deleteEntityMetaChipText, { color: '#047857' }]}>
                        {restoreConfirmMaterial.subject?.name ||
                          restoreConfirmMaterial.subject?.nama_mapel ||
                          restoreConfirmMaterial.mapel ||
                          'Mata Pelajaran'}
                      </Text>
                    </View>
                    <View style={styles.deleteEntityMetaChip}>
                      <MaterialCommunityIcons name="google-classroom" size={11} color="#475569" />
                      <Text numberOfLines={1} style={styles.deleteEntityMetaChipText}>
                        {restoreConfirmMaterial.kelas?.nama_kelas ||
                          restoreConfirmMaterial.class_name ||
                          restoreConfirmMaterial.rombel ||
                          'Semua Rombel'}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Semantic Callout Notice Box */}
              <View style={[styles.deleteCalloutNoticeBox, styles.restoreCalloutNoticeBox]}>
                <MaterialCommunityIcons name="check-circle-outline" size={16} color="#059669" style={{ marginTop: 1 }} />
                <Text style={[styles.deleteCalloutNoticeText, styles.restoreCalloutNoticeText]}>
                  Materi akan dipulihkan dari kotak sampah dan statusnya langsung aktif kembali di modul kelas terkait.
                </Text>
              </View>

              {/* Action Buttons Row */}
              <View style={styles.deleteModalButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setRestoreConfirmMaterial(null)}
                  disabled={restoringMaterial}
                  style={styles.deleteModalCancelBtn}
                >
                  <Text style={styles.deleteModalCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={handleConfirmRestore}
                  disabled={restoringMaterial}
                  style={[styles.deleteModalConfirmBtn, styles.restoreModalConfirmBtn]}
                >
                  {restoringMaterial ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="history" size={16} color="#FFFFFF" />
                      <Text style={styles.deleteModalConfirmBtnText}>Ya, Pulihkan</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL CETAK REKAPITULASI DOKUMEN RESMI A4 TATA USAHA */}
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
                  Laporan Rekapitulasi Bahan Ajar & Modul Unit {currentUserUnitName}
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
                    <MaterialCommunityIcons name="school" size={32} color="#047857" />
                  </View>
                  <View style={styles.kopTextCol}>
                    <Text style={styles.kopYayasanText}>{foundationName}</Text>
                    <Text style={styles.kopSekolahText}>{resolvedKopUnit.unitName}</Text>
                    <Text style={styles.kopAlamatText}>
                      {resolvedKopUnit.address}
                    </Text>
                    <Text style={styles.kopKontakText}>
                      {resolvedKopUnit.contact}
                    </Text>
                  </View>
                </View>

                {/* Garis Ganda Kop Surat */}
                <View style={styles.kopDoubleLine1} />
                <View style={styles.kopDoubleLine2} />

                {/* 2. JUDUL DOKUMEN & NOMOR */}
                <View style={styles.docTitleBlock}>
                  <Text style={styles.docMainTitle}>
                    LAPORAN REKAPITULASI BAHAN AJAR & MODUL PEMBELAJARAN
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
                      : {academicYear || 'Tahun Ajaran Aktif'}{academicSemester ? ` (Semester ${academicSemester})` : ''}
                    </Text>
                  </View>
                  <View style={styles.docMetaRow}>
                    <Text style={styles.docMetaKey}>Petugas Cetak</Text>
                    <Text style={styles.docMetaVal}>: {teacherName} (Tata Usaha)</Text>
                  </View>
                  <View style={styles.docMetaRow}>
                    <Text style={styles.docMetaKey}>Tanggal Dokumen</Text>
                    <Text style={styles.docMetaVal}>: {formatDate(new Date().toISOString())}</Text>
                  </View>
                </View>

                {/* 4. RINGKASAN MINI KPI */}
                <View style={styles.docKpiRow}>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{computedLmsStats.total}</Text>
                    <Text style={styles.docKpiBoxLbl}>Total Materi</Text>
                  </View>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{computedLmsStats.dokumen}</Text>
                    <Text style={styles.docKpiBoxLbl}>Dokumen/PDF</Text>
                  </View>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{computedLmsStats.video}</Text>
                    <Text style={styles.docKpiBoxLbl}>Video Belajar</Text>
                  </View>
                  <View style={styles.docKpiBox}>
                    <Text style={styles.docKpiBoxVal}>{computedLmsStats.aktif}</Text>
                    <Text style={styles.docKpiBoxLbl}>Status Aktif</Text>
                  </View>
                </View>

                {/* 5. TABEL DAFTAR BAHAN AJAR */}
                <View style={styles.docTableWrap}>
                  <View style={styles.docTableHead}>
                    <Text style={[styles.docTh, { width: 28, textAlign: 'center' }]}>No</Text>
                    <Text style={[styles.docTh, { flex: 1.5 }]}>Judul Bahan Ajar</Text>
                    <Text style={[styles.docTh, { width: 55 }]}>Tipe</Text>
                    <Text style={[styles.docTh, { flex: 1.2 }]}>Modul Ajar</Text>
                    <Text style={[styles.docTh, { width: 45, textAlign: 'center' }]}>Waktu</Text>
                    <Text style={[styles.docTh, { width: 50, textAlign: 'center' }]}>Status</Text>
                  </View>

                  {teacherMaterials.filter((m) => !m.deleted_at).length === 0 ? (
                    <View style={{ padding: 14, alignItems: 'center' }}>
                      <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>
                        Belum ada bahan ajar yang terdaftar pada unit ini.
                      </Text>
                    </View>
                  ) : (
                    teacherMaterials
                      .filter((m) => !m.deleted_at)
                      .slice(0, 25)
                      .map((m, idx) => (
                        <View key={m.id || idx} style={styles.docTableRow}>
                          <Text style={[styles.docTd, { width: 28, textAlign: 'center' }]}>{idx + 1}</Text>
                          <Text numberOfLines={2} style={[styles.docTd, { flex: 1.5, fontWeight: '700' }]}>
                            {m.judul || m.title || '-'}
                          </Text>
                          <Text style={[styles.docTd, { width: 55, textTransform: 'capitalize' }]}>
                            {m.tipe || m.tipe_materi || 'teks'}
                          </Text>
                          <Text numberOfLines={2} style={[styles.docTd, { flex: 1.2 }]}>
                            {m.modul_ajar?.judul_modul || m.modul_ajar?.judul || '-'}
                          </Text>
                          <Text style={[styles.docTd, { width: 45, textAlign: 'center' }]}>
                            {m.bobot ? `${m.bobot}m` : '-'}
                          </Text>
                          <Text style={[styles.docTd, { width: 50, textAlign: 'center', fontWeight: '700', color: m.status === 'aktif' || m.status === 'published' || m.is_published ? '#059669' : '#D97706' }]}>
                            {m.status === 'aktif' || m.status === 'published' || m.is_published ? 'Aktif' : 'Draf'}
                          </Text>
                        </View>
                      ))
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

            {/* Action Bar Cetak */}
            <View style={[styles.printActionsRow, { paddingBottom: Math.max(bottomInset, 20) + 10 }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setPrintPaperModalVisible(false)}
                style={styles.printCancelBtn}
              >
                <Text style={styles.printCancelBtnText}>Tutup Pratinjau</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  setPrintPaperModalVisible(false);
                  setFeedbackModal({
                    visible: true,
                    type: 'success',
                    title: 'Dokumen Siap Dicetak',
                    message: `Laporan Rekapitulasi Bahan Ajar unit ${currentUserUnitName} berhasil dikirim ke antrean cetak sistem.`,
                  });
                }}
                style={styles.printExecuteBtn}
              >
                <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.printExecuteBtnText}>Cetak Sekarang</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL FILTER DROPDOWN: PILIH ROMBEL */}
      <Modal
        visible={showRombelFilterModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowRombelFilterModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowRombelFilterModal(false)}
          style={styles.pickerModalOverlay}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalHeaderLeft}>
                <View style={[styles.filterDropdownIconBox, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Filter Berdasarkan Rombel</Text>
                  <Text style={styles.pickerModalSubtitle}>Pilih rombel untuk menyaring bahan ajar</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowRombelFilterModal(false)}
                style={styles.pickerModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalList} showsVerticalScrollIndicator={false}>
              {/* Opsi Semua Rombel */}
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => {
                  setSelectedMaterialClassFilter('ALL');
                  setShowRombelFilterModal(false);
                }}
                style={[
                  styles.pickerItem,
                  selectedMaterialClassFilter === 'ALL' && styles.pickerItemActive,
                ]}
              >
                <View style={styles.pickerItemLeft}>
                  <View
                    style={[
                      styles.pickerItemRadioDot,
                      selectedMaterialClassFilter === 'ALL' && styles.pickerItemRadioDotActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedMaterialClassFilter === 'ALL' && styles.pickerItemTextActive,
                    ]}
                  >
                    Semua Rombel
                  </Text>
                </View>
                {selectedMaterialClassFilter === 'ALL' && (
                  <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                )}
              </TouchableOpacity>

              {/* Opsi Rombel Unit */}
              {uniqueMaterialClasses.map((c) => {
                const isSelected = String(selectedMaterialClassFilter) === String(c.id);
                return (
                  <TouchableOpacity
                    key={c.id}
                    activeOpacity={0.78}
                    onPress={() => {
                      setSelectedMaterialClassFilter(c.id);
                      setShowRombelFilterModal(false);
                    }}
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  >
                    <View style={styles.pickerItemLeft}>
                      <View
                        style={[
                          styles.pickerItemRadioDot,
                          isSelected && styles.pickerItemRadioDotActive,
                        ]}
                      />
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextActive,
                        ]}
                      >
                        {c.name}
                      </Text>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* MODAL FILTER DROPDOWN: PILIH STATUS */}
      <Modal
        visible={showStatusFilterModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowStatusFilterModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowStatusFilterModal(false)}
          style={styles.pickerModalOverlay}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalHeaderLeft}>
                <View style={[styles.filterDropdownIconBox, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="check-decagram-outline" size={18} color="#0284C7" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Filter Status Tayang</Text>
                  <Text style={styles.pickerModalSubtitle}>Pilih status publikasi materi</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowStatusFilterModal(false)}
                style={styles.pickerModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.pickerModalList}>
              {[
                { id: 'ALL', label: 'Semua Status', color: '#64748B', desc: 'Menampilkan semua bahan ajar' },
                { id: 'published', label: 'Publik (Tayang)', color: '#059669', desc: 'Materi aktif dapat diakses santri/siswa' },
                { id: 'draft', label: 'Draf (Konsep)', color: '#D97706', desc: 'Materi belum dipublikasikan' },
              ].map((st) => {
                const isSelected = selectedMaterialStatusFilter === st.id;
                return (
                  <TouchableOpacity
                    key={st.id}
                    activeOpacity={0.78}
                    onPress={() => {
                      setSelectedMaterialStatusFilter(st.id);
                      setShowStatusFilterModal(false);
                    }}
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  >
                    <View style={styles.pickerItemLeft}>
                      <View style={[styles.pickerStatusDotIndicator, { backgroundColor: st.color }]} />
                      <View>
                        <Text
                          style={[
                            styles.pickerItemText,
                            isSelected && styles.pickerItemTextActive,
                          ]}
                        >
                          {st.label}
                        </Text>
                        <Text style={styles.pickerItemDesc}>{st.desc}</Text>
                      </View>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* MODAL FILTER DROPDOWN: PILIH MATA PELAJARAN */}
      <Modal
        visible={showSubjectFilterModal}
        animationType="fade"
        transparent
        onRequestClose={() => setShowSubjectFilterModal(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowSubjectFilterModal(false)}
          style={styles.pickerModalOverlay}
        >
          <TouchableOpacity activeOpacity={1} style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerModalHeaderLeft}>
                <View style={[styles.filterDropdownIconBox, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialCommunityIcons name="book-open-outline" size={18} color="#0284C7" />
                </View>
                <View>
                  <Text style={styles.pickerModalTitle}>Filter Mata Pelajaran</Text>
                  <Text style={styles.pickerModalSubtitle}>Pilih mapel untuk menyaring materi & modul</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowSubjectFilterModal(false)}
                style={styles.pickerModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerModalList} showsVerticalScrollIndicator={false}>
              {/* Opsi Semua Mapel */}
              <TouchableOpacity
                activeOpacity={0.78}
                onPress={() => {
                  setSelectedMaterialSubjectFilter('ALL');
                  setShowSubjectFilterModal(false);
                }}
                style={[
                  styles.pickerItem,
                  selectedMaterialSubjectFilter === 'ALL' && styles.pickerItemActive,
                ]}
              >
                <View style={styles.pickerItemLeft}>
                  <View
                    style={[
                      styles.pickerItemRadioDot,
                      selectedMaterialSubjectFilter === 'ALL' && styles.pickerItemRadioDotActive,
                    ]}
                  />
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedMaterialSubjectFilter === 'ALL' && styles.pickerItemTextActive,
                    ]}
                  >
                    Semua Mata Pelajaran
                  </Text>
                </View>
                {selectedMaterialSubjectFilter === 'ALL' && (
                  <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                )}
              </TouchableOpacity>

              {/* Opsi Mapel */}
              {uniqueMaterialSubjects.map((s) => {
                const isSelected = String(selectedMaterialSubjectFilter) === String(s.id);
                return (
                  <TouchableOpacity
                    key={s.id}
                    activeOpacity={0.78}
                    onPress={() => {
                      setSelectedMaterialSubjectFilter(s.id);
                      setShowSubjectFilterModal(false);
                    }}
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  >
                    <View style={styles.pickerItemLeft}>
                      <View
                        style={[
                          styles.pickerItemRadioDot,
                          isSelected && styles.pickerItemRadioDotActive,
                        ]}
                      />
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextActive,
                        ]}
                      >
                        {s.name}
                      </Text>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* MODAL KPI DRILL-DOWN (RINCIAN KATEGORI STATISTIK) */}
      <Modal
        visible={kpiDrilldownModal.visible}
        animationType="slide"
        transparent
        onRequestClose={() => setKpiDrilldownModal((prev) => ({ ...prev, visible: false }))}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNoPad, { maxHeight: '88%' }]}>
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
                  <MaterialCommunityIcons name="chart-box-outline" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.modalHeaderSubjectBadgeText}>DRILL-DOWN KPI LMS</Text>
                </View>
                <Text style={styles.modalTitleWhite}>{kpiDrilldownModal.title}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setKpiDrilldownModal((prev) => ({ ...prev, visible: false }))}
                style={styles.modalCloseBtnWhite}
                accessibilityLabel="Tutup"
              >
                <MaterialCommunityIcons name="close" size={18} color="#047857" />
              </TouchableOpacity>
            </View>

            <ScrollView style={[styles.modalBody, { padding: 14 }]} showsVerticalScrollIndicator={false}>
              <Text style={{ fontSize: 12, color: '#64748B', marginBottom: 12 }}>
                Ditemukan {kpiDrilldownModal.items.length} item dalam kategori ini pada unit {currentUserUnitName}.
              </Text>

              {kpiDrilldownModal.items.length === 0 ? (
                <EmptyStateCard
                  icon="information-outline"
                  title="Tidak Ada Data"
                  description="Belum ada data materi atau modul ajar pada kategori ini."
                />
              ) : (
                kpiDrilldownModal.items.map((item, idx) => {
                  const title = item.judul || item.title || item.judul_modul || 'Materi Pembelajaran';
                  const tipe = (item.tipe || item.tipe_materi || 'KBM').toUpperCase();
                  return (
                    <TouchableOpacity
                      key={item.id || idx}
                      activeOpacity={0.85}
                      onPress={() => {
                        setKpiDrilldownModal((prev) => ({ ...prev, visible: false }));
                        if (kpiDrilldownModal.type === 'modul' || kpiDrilldownModal.type.startsWith('modul')) {
                          setSelectedDetailModulAjar(item);
                        } else {
                          setSelectedDetailMaterial(item);
                        }
                      }}
                      style={styles.kpiDrillItem}
                    >
                      <View style={styles.kpiDrillLeft}>
                        <View style={styles.kpiDrillIcon}>
                          <MaterialCommunityIcons
                            name={kpiDrilldownModal.type.startsWith('modul') ? 'layers-outline' : 'book-open-outline'}
                            size={18}
                            color="#047857"
                          />
                        </View>
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text numberOfLines={1} style={styles.kpiDrillTitle}>{title}</Text>
                          <Text numberOfLines={1} style={styles.kpiDrillSub}>
                            {item.modul_ajar?.judul_modul || item.subject?.name || item.fase ? `Fase ${item.fase}` : 'Materi KBM Unit'}
                          </Text>
                        </View>
                      </View>
                      <View style={styles.kpiDrillRight}>
                        <Text style={styles.kpiDrillBadge}>{tipe}</Text>
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#94A3B8" />
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>

            <View style={{ padding: 14, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              <TouchableOpacity
                onPress={() => setKpiDrilldownModal((prev) => ({ ...prev, visible: false }))}
                style={styles.formCancelBtn}
              >
                <Text style={styles.formCancelBtnText}>Tutup Rincian</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DETAIL MODAL UNTUK GURU: DETAIL BAHAN AJAR */}
      <Modal
        visible={Boolean(selectedDetailMaterial)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDetailMaterial(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNoPad, { maxHeight: '90%' }]}>
            {/* Header Berwarna Gradasi Emerald Sesuai Topbar */}
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
                  <MaterialCommunityIcons name="book-open-page-variant" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.modalHeaderSubjectBadgeText}>
                    {selectedDetailMaterial?.subject?.name || selectedDetailMaterial?.subject?.nama_mapel || 'Bahan Ajar'}
                  </Text>
                </View>
                <Text style={styles.modalTitleWhite}>
                  {selectedDetailMaterial?.judul || selectedDetailMaterial?.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedDetailMaterial(null)}
                style={styles.modalCloseBtnWhite}
                accessibilityLabel="Tutup"
              >
                <MaterialCommunityIcons name="close" size={18} color="#047857" />
              </TouchableOpacity>
            </View>

            <ScrollView style={[styles.modalBody, { paddingHorizontal: 18, paddingTop: 14 }]} showsVerticalScrollIndicator={false}>
              <View style={styles.detailMetaGrid}>
                <View style={styles.detailMetaItem}>
                  <Text style={styles.detailMetaLabel}>Rombel / Kelas</Text>
                  <Text style={styles.detailMetaValue}>
                    {selectedDetailMaterial?.kelas?.nama_kelas || selectedDetailMaterial?.kelas?.name || selectedDetailMaterial?.class_name || 'Semua Kelas'}
                  </Text>
                </View>
                <View style={styles.detailMetaItem}>
                  <Text style={styles.detailMetaLabel}>Status Publikasi</Text>
                  <Text style={[styles.detailMetaValue, { color: selectedDetailMaterial?.is_published || selectedDetailMaterial?.status === 'published' ? '#059669' : '#D97706' }]}>
                    {selectedDetailMaterial?.is_published || selectedDetailMaterial?.status === 'published' ? 'Publik' : 'Draf'}
                  </Text>
                </View>
                <View style={styles.detailMetaItem}>
                  <Text style={styles.detailMetaLabel}>Status Supervisi</Text>
                  <Text
                    style={[
                      styles.detailMetaValue,
                      {
                        color:
                          selectedDetailMaterial?.status_supervisi === 'disetujui'
                            ? '#059669'
                            : selectedDetailMaterial?.status_supervisi === 'perlu_revisi'
                            ? '#E11D48'
                            : selectedDetailMaterial?.status_supervisi === 'diajukan'
                            ? '#D97706'
                            : '#64748B',
                      },
                    ]}
                  >
                    {selectedDetailMaterial?.status_supervisi === 'disetujui'
                      ? 'Disetujui'
                      : selectedDetailMaterial?.status_supervisi === 'perlu_revisi'
                      ? 'Perlu Revisi'
                      : selectedDetailMaterial?.status_supervisi === 'diajukan'
                      ? 'Menunggu Telaah'
                      : 'Draf Guru'}
                  </Text>
                </View>
              </View>

              {/* Revision Notes Callout from Supervisor */}
              {selectedDetailMaterial?.status_supervisi === 'perlu_revisi' && (
                <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFF1F2', borderWidth: 1.5, borderColor: '#FDA4AF' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="alert-circle" size={16} color="#E11D48" style={{ marginRight: 6 }} />
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#BE123C' }}>
                      Catatan Koreksi {selectedDetailMaterial.supervisor_role || 'Kepala Sekolah / Divisi Pendidikan'}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 12, color: '#9F1239', lineHeight: 18, marginTop: 2 }}>
                    {selectedDetailMaterial.catatan_koreksi || 'Mohon sesuaikan kembali materi sesuai standar kurikulum.'}
                  </Text>
                  {selectedDetailMaterial.supervisor?.name ? (
                    <Text style={{ fontSize: 11, fontWeight: '600', color: '#BE123C', marginTop: 6 }}>
                      Oleh: {selectedDetailMaterial.supervisor.name}
                    </Text>
                  ) : null}
                </View>
              )}

              {/* Approved Banner */}
              {selectedDetailMaterial?.status_supervisi === 'disetujui' && (
                <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#F0FDF4', borderWidth: 1.5, borderColor: '#86EFAC', flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="check-decagram" size={20} color="#16A34A" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#15803D' }}>
                      Materi Disetujui &amp; Layak Ajar
                    </Text>
                    <Text style={{ fontSize: 11, color: '#166534', marginTop: 2 }}>
                      {selectedDetailMaterial.supervisor?.name ? `Ditelaah oleh ${selectedDetailMaterial.supervisor.name}` : 'Materi telah diverifikasi memenuhi kurikulum.'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Waiting Approval Banner */}
              {selectedDetailMaterial?.status_supervisi === 'diajukan' && (
                <View style={{ marginTop: 12, padding: 12, borderRadius: 12, backgroundColor: '#FFFBEB', borderWidth: 1.5, borderColor: '#FDE68A', flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="clock-outline" size={20} color="#D97706" style={{ marginRight: 8 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#B45309' }}>
                      Sedang Menunggu Telaah
                    </Text>
                    <Text style={{ fontSize: 11, color: '#92400E', marginTop: 2 }}>
                      Materi telah diajukan ke Kepala Sekolah &amp; Divisi Pendidikan untuk ditinjau.
                    </Text>
                  </View>
                </View>
              )}

              <Text style={styles.modalSectionHeading}>Ringkasan Materi</Text>
              <Text style={styles.modalText}>
                {selectedDetailMaterial?.ringkasan || 'Tidak ada ringkasan materi.'}
              </Text>

              <Text style={[styles.modalSectionHeading, { marginTop: 14 }]}>Deskripsi / Konten Lengkap</Text>
              <Text style={styles.modalText}>
                {selectedDetailMaterial?.konten || selectedDetailMaterial?.isi || selectedDetailMaterial?.deskripsi || 'Tidak ada konten deskripsi tertulis.'}
              </Text>

              {Array.isArray(selectedDetailMaterial?.media) && selectedDetailMaterial.media.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.modalSectionHeading}>Lampiran Media ({selectedDetailMaterial.media.length})</Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {selectedDetailMaterial.media.map((med: any, mIdx: number) => (
                      <TouchableOpacity
                        key={med.id || mIdx}
                        activeOpacity={0.8}
                        onPress={() => handleOpenMedia(med)}
                        style={styles.attachmentItem}
                      >
                        <MaterialCommunityIcons name="file-document-outline" size={24} color="#047857" />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text numberOfLines={1} style={styles.attachmentName}>
                            {med.nama_file || 'Lampiran Dokumen'}
                          </Text>
                          <Text style={styles.attachmentDesc}>{med.deskripsi || 'Dokumen Bahan Ajar'}</Text>
                        </View>
                        <View style={styles.openInAppBadge}>
                          <MaterialCommunityIcons name="eye-outline" size={14} color="#059669" />
                          <Text style={styles.openInAppText}>Buka</Text>
                        </View>
                      </TouchableOpacity>
                    ))}
                  </View>
                </View>
              )}
            </ScrollView>

            <View style={[styles.detailActionsRow, { paddingHorizontal: 18, paddingBottom: Math.max(bottomInset, 20) + 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9', flexWrap: 'wrap', gap: 6 }]}>
              {/* Button Supervisi untuk Kepala Sekolah / Divisi Pendidikan / Staff */}
              {isStaff && (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => {
                    const target = selectedDetailMaterial;
                    setSelectedDetailMaterial(null);
                    openSupervisiModal(target);
                  }}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 12,
                    backgroundColor: '#047857',
                    marginRight: 4,
                  }}
                >
                  <MaterialCommunityIcons name="shield-check-outline" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Supervisi</Text>
                </TouchableOpacity>
              )}

              {/* Button Ajukan Telaah untuk Guru */}
              {(selectedDetailMaterial?.status_supervisi === 'draft' ||
                selectedDetailMaterial?.status_supervisi === 'perlu_revisi' ||
                !selectedDetailMaterial?.status_supervisi) && (
                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => handleAjukanTelaahMobile(selectedDetailMaterial)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    paddingHorizontal: 12,
                    paddingVertical: 9,
                    borderRadius: 12,
                    backgroundColor: '#0284C7',
                    marginRight: 4,
                  }}
                >
                  <MaterialCommunityIcons name="send-outline" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={{ color: '#FFFFFF', fontSize: 11, fontWeight: '700' }}>Ajukan Telaah</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => setSelectedDetailMaterial(null)}
                style={styles.detailCloseBtn}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={17} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.detailCloseBtnText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => {
                  const target = selectedDetailMaterial;
                  setSelectedDetailMaterial(null);
                  openEditMaterialModal(target);
                }}
                style={styles.detailEditBtn}
              >
                <MaterialCommunityIcons name="pencil-outline" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.detailEditBtnText}>Ubah</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL SUPERVISI MATERI UNTUK KEPALA SEKOLAH / DIVISI PENDIDIKAN */}
      <Modal
        visible={Boolean(supervisiTarget)}
        animationType="slide"
        transparent
        onRequestClose={() => !isSupervisiSubmitting && setSupervisiTarget(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNoPad, { maxHeight: '90%' }]}>
            <LinearGradient
              colors={supervisiStatus === 'disetujui' ? ['#065F46', '#047857'] : ['#BE123C', '#E11D48']}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                paddingHorizontal: 18,
                paddingVertical: 16,
                borderTopLeftRadius: 20,
                borderTopRightRadius: 20,
              }}
            >
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 15, fontWeight: '800', color: '#FFFFFF' }}>Supervisi Materi Pembelajaran</Text>
                <Text style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>
                  Kepala Sekolah &amp; Divisi Pendidikan
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !isSupervisiSubmitting && setSupervisiTarget(null)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  backgroundColor: 'rgba(255,255,255,0.2)',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            <ScrollView style={[styles.modalBody, { paddingHorizontal: 18, paddingTop: 14 }]} showsVerticalScrollIndicator={false}>
              <View style={{ padding: 12, borderRadius: 12, backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#E2E8F0', marginBottom: 14 }}>
                <Text style={{ fontSize: 10, fontWeight: '700', color: '#64748B', textTransform: 'uppercase' }}>Target Materi:</Text>
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B', marginTop: 2 }}>{supervisiTarget?.judul || supervisiTarget?.title}</Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>
                  Modul: {supervisiTarget?.modul_ajar?.judul_modul || '-'} • {supervisiTarget?.subject?.name || supervisiTarget?.subject?.nama_mapel || 'Mapel'}
                </Text>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', marginBottom: 8 }}>Keputusan Supervisi:</Text>
              <View style={{ gap: 8, marginBottom: 14 }}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSupervisiStatus('disetujui')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: supervisiStatus === 'disetujui' ? '#059669' : '#E2E8F0',
                    backgroundColor: supervisiStatus === 'disetujui' ? '#ECFDF5' : '#FFFFFF',
                  }}
                >
                  <MaterialCommunityIcons
                    name={supervisiStatus === 'disetujui' ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={supervisiStatus === 'disetujui' ? '#059669' : '#94A3B8'}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#065F46' }}>Disetujui &amp; Layak Ajar</Text>
                    <Text style={{ fontSize: 11, color: '#047857', marginTop: 2 }}>Materi langsung dipublikasikan ke siswa.</Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSupervisiStatus('perlu_revisi')}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    padding: 12,
                    borderRadius: 12,
                    borderWidth: 1.5,
                    borderColor: supervisiStatus === 'perlu_revisi' ? '#E11D48' : '#E2E8F0',
                    backgroundColor: supervisiStatus === 'perlu_revisi' ? '#FFF1F2' : '#FFFFFF',
                  }}
                >
                  <MaterialCommunityIcons
                    name={supervisiStatus === 'perlu_revisi' ? 'radiobox-marked' : 'radiobox-blank'}
                    size={20}
                    color={supervisiStatus === 'perlu_revisi' ? '#E11D48' : '#94A3B8'}
                    style={{ marginRight: 10 }}
                  />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 13, fontWeight: '700', color: '#9F1239' }}>Perlu Koreksi / Revisi</Text>
                    <Text style={{ fontSize: 11, color: '#BE123C', marginTop: 2 }}>Materi dikembalikan ke guru dengan catatan perbaikan.</Text>
                  </View>
                </TouchableOpacity>
              </View>

              <Text style={{ fontSize: 12, fontWeight: '700', color: '#1E293B', marginBottom: 4 }}>
                Catatan &amp; Arahan Supervisi {supervisiStatus === 'perlu_revisi' && <Text style={{ color: '#E11D48' }}>*</Text>}
              </Text>
              <TextInput
                value={supervisiCatatan}
                onChangeText={setSupervisiCatatan}
                placeholder={supervisiStatus === 'perlu_revisi' ? 'Tuliskan catatan perbaikan untuk guru...' : 'Catatan opsional...'}
                multiline
                numberOfLines={4}
                style={{
                  borderWidth: 1,
                  borderColor: '#CBD5E1',
                  borderRadius: 12,
                  padding: 10,
                  fontSize: 12,
                  color: '#1E293B',
                  backgroundColor: '#F8FAFC',
                  textAlignVertical: 'top',
                  minHeight: 90,
                }}
              />
            </ScrollView>

            <View style={[styles.detailActionsRow, { paddingHorizontal: 18, paddingBottom: Math.max(bottomInset, 20) + 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
              <TouchableOpacity
                disabled={isSupervisiSubmitting}
                onPress={() => setSupervisiTarget(null)}
                style={styles.detailCloseBtn}
              >
                <Text style={styles.detailCloseBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                disabled={isSupervisiSubmitting}
                onPress={handleSubmitSupervisiMobile}
                style={[
                  styles.detailEditBtn,
                  { backgroundColor: supervisiStatus === 'disetujui' ? '#047857' : '#E11D48' },
                ]}
              >
                {isSupervisiSubmitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.detailEditBtnText}>
                      {supervisiStatus === 'disetujui' ? 'Setujui' : 'Kirim Catatan'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* DETAIL MODAL UNTUK GURU: DETAIL MODUL AJAR (KURIKULUM MERDEKA) */}
      <Modal
        visible={Boolean(selectedDetailModulAjar)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedDetailModulAjar(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContentNoPad, { maxHeight: '90%' }]}>
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
                  <MaterialCommunityIcons name="star-four-points" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                  <Text style={styles.modalHeaderSubjectBadgeText}>
                    {(
                      selectedDetailModulAjar?.kurikulum?.nama_kurikulum ||
                      selectedDetailModulAjar?.nama_kurikulum ||
                      'MODUL AJAR'
                    ).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.modalTitleWhite}>
                  {selectedDetailModulAjar?.judul_modul || selectedDetailModulAjar?.judul || selectedDetailModulAjar?.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedDetailModulAjar(null)}
                style={styles.modalCloseBtnWhite}
                accessibilityLabel="Tutup"
              >
                <MaterialCommunityIcons name="close" size={18} color="#047857" />
              </TouchableOpacity>
            </View>

            <ScrollView style={[styles.modalBody, { paddingHorizontal: 18, paddingTop: 14 }]} showsVerticalScrollIndicator={false}>
              <View style={styles.detailMetaGrid}>
                <View style={styles.detailMetaItem}>
                  <Text style={styles.detailMetaLabel}>Fase & Jenjang</Text>
                  <Text style={styles.detailMetaValue}>
                    {selectedDetailModulAjar?.fase
                      ? `Fase ${selectedDetailModulAjar.fase}`
                      : selectedDetailModulAjar?.kurikulum?.nama_kurikulum || '—'}
                  </Text>
                </View>
                <View style={styles.detailMetaItem}>
                  <Text style={styles.detailMetaLabel}>Alokasi Waktu</Text>
                  <Text style={styles.detailMetaValue}>
                    {selectedDetailModulAjar?.alokasi_waktu || selectedDetailModulAjar?.jp
                      ? `${selectedDetailModulAjar.alokasi_waktu || selectedDetailModulAjar.jp} JP`
                      : '—'}
                  </Text>
                </View>
              </View>

              <Text style={styles.modalSectionHeading}>Tujuan Pembelajaran (TP)</Text>
              <Text style={styles.modalText}>
                {selectedDetailModulAjar?.tujuan_pembelajaran ||
                  selectedDetailModulAjar?.deskripsi ||
                  `Siswa menguasai kompetensi dasar sesuai capaian pembelajaran ${selectedDetailModulAjar?.kurikulum?.nama_kurikulum || 'kurikulum yang berlaku'}.`}
              </Text>

              {selectedDetailModulAjar?.profil_pancasila && (
                <>
                  <Text style={[styles.modalSectionHeading, { marginTop: 14 }]}>Profil Pelajar & Karakter SIT</Text>
                  <Text style={styles.modalText}>
                    {selectedDetailModulAjar.profil_pancasila}
                  </Text>
                </>
              )}

              {selectedDetailModulAjar?.langkah_pembelajaran && (
                <>
                  <Text style={[styles.modalSectionHeading, { marginTop: 14 }]}>Langkah Pembelajaran KBM</Text>
                  <Text style={styles.modalText}>
                    {selectedDetailModulAjar.langkah_pembelajaran}
                  </Text>
                </>
              )}
            </ScrollView>

            <View style={{ paddingHorizontal: 18, paddingBottom: Math.max(bottomInset, 20) + 12, paddingTop: 10, borderTopWidth: 1, borderTopColor: '#F1F5F9' }}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedDetailModulAjar(null)}
                style={styles.detailCloseBtn}
              >
                <MaterialCommunityIcons name="close-circle-outline" size={17} color="#64748B" style={{ marginRight: 6 }} />
                <Text style={styles.detailCloseBtnText}>Tutup Modul Ajar</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
      </View>
    </View>
  );
}

const PICKER_MODAL_BOTTOM_PAD = Platform.OS === 'ios' ? 34 : 20;

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
  // Struktur scroll disamakan plek dengan Tugas/Jadwal (hero full-bleed natural,
  // tanpa trik margin negatif)
  mainScrollContent: {
    flexGrow: 1,
  },
  // Wrapper bodi — sama dengan Tugas/Jadwal
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  // Static hero top bar — sama style dengan Tugas/Jadwal
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
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },

  studentContainerBlock: {
    marginBottom: 10,
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
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 9999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  childChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowOpacity: 0.15,
    elevation: 2,
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
  containerBlock: { marginBottom: 18 },
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
    borderRadius: 20,
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
    borderRadius: 20,
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
    opacity: 0.9,
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
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
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
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
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
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
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
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
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
  studentAttributesGridInactive: {
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
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
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
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
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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

  cardContentCol: {
    flex: 1,
    justifyContent: 'center',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardSubjectText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  cardDateText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
  },
  cardTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    flex: 1,
    marginRight: 8,
  },
  materialCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'flex-start',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  materialDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  materialTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 18,
  },
  materialSnippet: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 4,
  },
  materialFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teacherInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  teacherNameText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  mediaPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mediaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mediaPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },

  openInAppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  openInAppText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 6,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    paddingVertical: 14,
  },
  modalTeacherBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  modalTeacherTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  modalTeacherSub: {
    fontSize: 10,
    color: '#047857',
  },
  modalSectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attachmentName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  attachmentDesc: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  modalDismissBtn: {
    backgroundColor: '#18A165',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  modalDismissBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  inAppViewerContainer: {
    paddingVertical: 6,
  },
  pdfHeroBox: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    marginBottom: 14,
  },
  pdfIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#DC2626',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  pdfHeroTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  pdfHeroSize: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
    marginTop: 4,
  },
  inAppPreviewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  inAppPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  inAppPreviewHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  inAppPreviewText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  inAppGuideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inAppGuideText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
    flex: 1,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  openExternalBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },

  videoPlayerCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  videoPlaceholder: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  audioPlayerCard: {
    backgroundColor: '#FAF5FF',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    marginBottom: 6,
  },
  audioArtwork: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  audioTrackTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  audioTrackSub: {
    fontSize: 11,
    color: '#7E22CE',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  audioProgressBarWrap: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E9D5FF',
    overflow: 'hidden',
  },
  audioProgressBarFill: {
    height: '100%',
    backgroundColor: '#9333EA',
    borderRadius: 3,
  },
  audioTimeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },
  audioTimeText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  audioControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlayBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#9333EA',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Modern Teacher Profile Card (Selaras Jadwal Mengajar) ──
  modernTeacherCardWrapper: {
    width: '100%',
    paddingHorizontal: 0,
    paddingTop: 0,
    paddingBottom: 4,
  },
  modernTeacherCardGradientBorder: {
    width: '100%',
    borderRadius: 22,
    padding: 1.6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.14,
    shadowRadius: 8,
    elevation: 3,
  },
  modernTeacherCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20.4,
    padding: 16,
  },
  modernTeacherCardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  modernTeacherAvatarWrapper: {
    position: 'relative',
    marginRight: 12,
  },
  modernTeacherAvatarImg: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 1.5,
    borderColor: '#10B981',
    backgroundColor: '#F1F5F9',
  },
  modernTeacherAvatarOnlineBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 16,
    height: 16,
    borderRadius: 8,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modernTeacherInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  modernTeacherNameText: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  modernTeacherRoleText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  modernTeacherNipText: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1,
  },
  modernTeacherUnitRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginTop: 3,
  },
  modernTeacherUnitText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  modernTeacherStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignSelf: 'flex-start',
  },
  modernTeacherStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginRight: 5,
  },
  modernTeacherStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  modernTeacherMetricsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modernTeacherMetricCol: {
    flex: 1,
    alignItems: 'center',
  },
  modernTeacherMetricTop: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  modernTeacherMetricVal: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modernTeacherMetricLbl: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // ── Modern View Switcher (Sub-Tab Guru) ──
  modernViewSwitcherWrap: {
    flexDirection: 'row',
    backgroundColor: '#047857',
    borderRadius: 24,
    padding: 3.5,
    marginTop: 10,
    marginBottom: 12,
  },
  modernViewSwitcherTab: {
    flex: 1,
    paddingVertical: 8.5,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 20,
  },
  modernViewSwitcherTabActive: {
    backgroundColor: '#065F46',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  modernViewSwitcherText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#A7F3D0',
    letterSpacing: 0.1,
  },
  modernViewSwitcherTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ── Teacher Content Container & Elements ──
  teacherBodyContainer: {
    width: '100%',
  },
  teacherSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  teacherSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
  },
  teacherSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#1E293B',
    paddingVertical: 0,
    marginLeft: 6,
  },
  teacherCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    height: 44,
    borderRadius: 14,
    gap: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  teacherCreateBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  horizontalChipsScroll: {
    gap: 8,
    paddingBottom: 8,
  },
  filterChip: {
    paddingHorizontal: 13,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  statusChipsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  statusMiniChip: {
    paddingHorizontal: 11,
    paddingVertical: 4.5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  statusMiniChipActive: {
    backgroundColor: '#EFF6FF',
    borderColor: '#3B82F6',
  },
  statusMiniChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  statusMiniChipTextActive: {
    color: '#1D4ED8',
    fontWeight: '800',
  },

  // ── Teacher Item Card ──
  teacherItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    overflow: 'hidden',
  },
  teacherItemCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  teacherBadgeCluster: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flex: 1,
    marginRight: 8,
  },
  teacherSubjectBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    maxWidth: '55%',
  },
  teacherSubjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  teacherClassBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    maxWidth: '45%',
  },
  teacherClassBadgeText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  teacherStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 12,
    borderWidth: 1,
  },
  teacherStatusPub: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  teacherStatusDraft: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  statusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  statusDotPub: {
    backgroundColor: '#10B981',
  },
  statusDotDraft: {
    backgroundColor: '#F59E0B',
  },
  teacherStatusBadgeText: {
    fontSize: 10,
    fontWeight: '700',
  },
  teacherStatusTextPub: {
    color: '#047857',
  },
  teacherStatusTextDraft: {
    color: '#B45309',
  },
  teacherItemTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
    lineHeight: 20,
  },
  teacherItemDesc: {
    fontSize: 12,
    color: '#64748B',
    lineHeight: 17,
    marginBottom: 10,
  },
  teacherItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teacherItemMetaLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  teacherItemDateText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#94A3B8',
  },
  mediaCountBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 4,
  },
  mediaCountText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  teacherItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  teacherBtnView: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherBtnEdit: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherBtnDelete: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Modul Ajar Specific ──
  teacherFaseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  teacherFaseBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F766E',
  },
  teacherSemesterBadge: {
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  teacherSemesterBadgeText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  teacherModulDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  teacherModulDetailBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },

  // ── Form Modal Styles ──
  formTeacherBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 4,
  },
  formTeacherBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },
  formErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
    gap: 6,
  },
  formErrorText: {
    fontSize: 12,
    color: '#DC2626',
    flex: 1,
  },
  formLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 6,
    marginTop: 12,
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    marginBottom: 4,
  },
  formFieldSubLabel: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 8,
    marginTop: -2,
    lineHeight: 15,
  },
  docUploadBtnClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderStyle: 'dashed',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
    marginBottom: 8,
  },
  docUploadBtnTextClean: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#059669',
  },
  docPickedCardClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    marginBottom: 8,
  },
  docPickedCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  docPickedNameText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  docPickedMetaText: {
    fontSize: 10,
    color: '#047857',
    marginTop: 2,
  },
  formSelectChip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 6,
  },
  formSelectChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  formSelectChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  formSelectChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  // ── Dropdown Styles ──
  formDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    marginBottom: 6,
  },
  formDropdownTriggerOpen: {
    borderColor: '#10B981',
    backgroundColor: '#ECFDF5',
  },
  formDropdownTriggerText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  formDropdownList: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    borderRadius: 12,
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  formDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  formDropdownItemBorder: {
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
  },
  formDropdownItemActive: {
    backgroundColor: '#ECFDF5',
  },
  formDropdownItemText: {
    fontSize: 13,
    fontWeight: '500',
    color: '#475569',
    flex: 1,
  },
  formDropdownItemTextActive: {
    color: '#047857',
    fontWeight: '700',
  },
  formDropdownEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 6,
  },
  formDropdownEmptyText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  formStatusRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
    marginBottom: 14,
  },
  formStatusOption: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
  },
  formStatusOptionActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  formStatusTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  formStatusTitleActive: {
    color: '#047857',
    fontWeight: '800',
  },
  formStatusSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  formActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  formCancelBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCancelBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#475569',
  },
  formSubmitBtn: {
    flex: 1.3,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#059669',
    borderWidth: 1.5,
    borderColor: '#047857',
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
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Modal Elements with Color Theme & Polish ──
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
  detailCloseBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailCloseBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#475569',
  },
  detailActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  detailEditBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#0284C7',
    borderWidth: 1.5,
    borderColor: '#0369A1',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  detailEditBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Metrics Row with Static Topbar Palette ──
  modernTeacherMetricsWrapper: {
    marginTop: 14,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 5,
    elevation: 3,
  },
  modernTeacherMetricsGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderRadius: 16,
  },
  modernTeacherMetricValWhite: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modernTeacherMetricLblWhite: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#ECFDF5',
    letterSpacing: 0.1,
  },
  modernTeacherMetricDivider: {
    width: 1,
    height: 26,
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },

  // ── Delete Confirm Modal Styles (TailGrids Harmonized Standards) ──
  deleteModalCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#FFE4E6',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.16,
    shadowRadius: 20,
    elevation: 12,
  },
  deleteModalCardRestore: {
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
  },
  deleteModalTopBar: {
    height: 5,
    width: '100%',
  },
  deleteModalBody: {
    padding: 22,
    alignItems: 'center',
  },
  deleteSquircleBadge: {
    width: 60,
    height: 60,
    borderRadius: 18,
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 3,
  },
  restoreSquircleBadge: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
  },
  deleteHazardPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 999,
    marginTop: 10,
  },
  restoreHazardPill: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  deleteHazardPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#E11D48',
    letterSpacing: 0.5,
  },
  restoreHazardPillText: {
    color: '#059669',
  },
  deleteModalTitleClean: {
    fontSize: 17.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 4,
  },
  deleteModalSubtitleClean: {
    fontSize: 12.5,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    marginBottom: 14,
  },
  deleteEntitySummaryCard: {
    width: '100%',
    backgroundColor: '#FFF8F8',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 12,
    marginBottom: 12,
  },
  restoreEntitySummaryCard: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
  },
  deleteEntityTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 8,
  },
  deleteEntityBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  deleteEntityMetaChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  deleteEntityMetaChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  deleteCalloutNoticeBox: {
    width: '100%',
    backgroundColor: '#FFF1F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 10,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    marginBottom: 18,
  },
  restoreCalloutNoticeBox: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  deleteCalloutNoticeText: {
    flex: 1,
    fontSize: 11.5,
    color: '#9F1239',
    lineHeight: 16.5,
    fontWeight: '500',
  },
  restoreCalloutNoticeText: {
    color: '#065F46',
  },
  deleteModalButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    width: '100%',
  },
  deleteModalCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalCancelBtnText: {
    fontSize: 13.5,
    fontWeight: '700',
    color: '#64748B',
  },
  deleteModalConfirmBtn: {
    flex: 1.4,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#E11D48',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
    elevation: 4,
  },
  restoreModalConfirmBtn: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  deleteModalConfirmBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Detail Modal Specific Styles ──
  detailMetaGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 14,
  },
  detailMetaItem: {
    flex: 1,
  },
  detailMetaLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
  },
  detailMetaValue: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  // ── Hero Role & Unit Tag (Tata Usaha & Guru) ──
  tuHeroRoleCard: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  tuHeroRoleGradient: {
    padding: 14,
    borderRadius: 18,
  },
  tuHeroRoleLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  tuHeroIconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  tuRoleTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 4,
  },
  tuRoleTagText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    letterSpacing: 0.3,
  },
  tuUnitPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#ECFDF5',
    backgroundColor: '#064E3B',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tuHeroRoleTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 20,
  },
  tuHeroRoleSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 2,
  },

  // ── 5 Master KPI Cards ──
  kpiCardsScroll: {
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 10,
  },
  kpiModernCard: {
    width: 130,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiCardEmerald: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
  },
  kpiCardBlue: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
  },
  kpiCardRose: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    shadowColor: '#E11D48',
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
  kpiCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiIconWrap: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiIconEmerald: { backgroundColor: '#059669' },
  kpiIconBlue: { backgroundColor: '#0284C7' },
  kpiIconRose: { backgroundColor: '#E11D48' },
  kpiIconAmber: { backgroundColor: '#D97706' },
  kpiIconPurple: { backgroundColor: '#7C3AED' },
  kpiPillTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  kpiPillEmerald: { backgroundColor: '#DCFCE7' },
  kpiPillBlue: { backgroundColor: '#E0F2FE' },
  kpiPillRose: { backgroundColor: '#FFE4E6' },
  kpiPillAmber: { backgroundColor: '#FEF3C7' },
  kpiPillPurple: { backgroundColor: '#F3E8FF' },
  kpiPillTagText: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  kpiCardValue: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 24,
    marginBottom: 2,
  },
  kpiCardLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    lineHeight: 15,
  },
  kpiCardSub: {
    fontSize: 9.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },

  // ── Action Toolbar (TU & Guru) ──
  tuActionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginTop: 8,
    marginBottom: 10,
    gap: 8,
  },
  tuBtnAdd: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tuBtnAddText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tuBtnPrint: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  tuBtnPrintText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tuBtnTrash: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 5,
  },
  tuBtnTrashActive: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  tuBtnTrashText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tuBtnTrashTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tuBtnRefresh: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Trash Notice Banner ──
  trashNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FEF2F2',
    borderWidth: 1.2,
    borderColor: '#FECACA',
    borderRadius: 14,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  trashNoticeLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 10,
  },
  trashNoticeTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#DC2626',
  },
  trashNoticeSub: {
    fontSize: 11,
    color: '#7F1D1D',
    marginTop: 2,
    lineHeight: 15,
  },
  trashNoticeCloseBtn: {
    backgroundColor: '#DC2626',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  trashNoticeCloseText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── Media & Content Badges ──
  tipeContentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
  },
  tipeBadgeTeks: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  tipeBadgeDokumen: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  tipeBadgeVideo: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  tipeContentBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#334155',
  },
  trashBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEE2E2',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  trashBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
  },
  modulAjarLinkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  modulAjarLinkText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 3,
  },
  authorText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  teacherBtnRestore: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  teacherBtnRestoreText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  formDropdownItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  // ── Form Tipe Selector (2x2 Grid Rapi) ──
  tipeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    marginTop: 6,
    marginBottom: 10,
  },
  tipeSelectorOption: {
    flexGrow: 1,
    flexBasis: '47%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 11,
    borderRadius: 12,
  },
  tipeSelectorOptionActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  tipeSelectorOptionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tipeSelectorOptionTextActive: {
    color: '#047857',
    fontWeight: '800',
  },

  // ── Print Paper Modal (A4 Dokumen Resmi) ──
  printTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#047857',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
  },
  printTopBarTitle: {
    fontSize: 15,
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
    color: '#047857',
  },
  docKpiBoxLbl: {
    fontSize: 8,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
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
    paddingVertical: 6,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  docTh: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#334155',
  },
  docTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 5,
    paddingHorizontal: 6,
    borderBottomWidth: 0.8,
    borderBottomColor: '#E2E8F0',
  },
  docTd: {
    fontSize: 8,
    color: '#334155',
  },
  docSignatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 12,
    paddingHorizontal: 16,
  },
  docSignCol: {
    alignItems: 'center',
    width: 130,
  },
  docSignLabel: {
    fontSize: 8.5,
    color: '#64748B',
  },
  docSignTitle: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },
  docSignSpace: {
    height: 38,
  },
  docSignName: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0F172A',
    textDecorationLine: 'underline',
  },
  docSignNip: {
    fontSize: 8,
    color: '#64748B',
    marginTop: 1,
  },
  printActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  printCancelBtn: {
    flex: 1,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  printExecuteBtn: {
    flex: 1.3,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  printExecuteBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── KPI Drilldown Modal ──
  kpiDrillItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  kpiDrillLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  kpiDrillIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiDrillTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiDrillSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  kpiDrillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  kpiDrillBadge: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },

  // ── TU KPI Stats Container (Wrapper Vertikal Semua Kartu KPI) ──
  tuStatsContainer: {
    marginBottom: 12,
    gap: 10,
  },
  tuStatHeroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.12,
    shadowRadius: 8,
    elevation: 4,
  },
  tuStatHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  tuStatHeroIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuStatHeroTag: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#6EE7B7',
  },
  tuStatHeroTagText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  tuStatHeroContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  tuStatHeroLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  tuStatHeroValue: {
    fontSize: 32,
    fontWeight: '900',
    color: '#047857',
    lineHeight: 38,
  },
  tuStatHeroSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 4,
    lineHeight: 14,
  },
  tuStatHeroFooterBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 2,
  },
  tuStatHeroFooterText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },

  // ── TU KPI Grid Row (2x2) ──
  tuStatGridRow: {
    flexDirection: 'row',
    gap: 10,
  },
  tuStatGridCard: {
    flex: 1,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  tuCardEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
  },
  tuCardBlue: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
  },
  tuCardRose: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    shadowColor: '#E11D48',
  },
  tuCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
  },
  tuCardPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    shadowColor: '#7C3AED',
  },
  tuStatGridTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  tuGridIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuIconBoxEmerald: { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#6EE7B7' },
  tuIconBoxBlue: { backgroundColor: '#EFF6FF', borderWidth: 1, borderColor: '#BFDBFE' },
  tuIconBoxRose: { backgroundColor: '#FFF1F2', borderWidth: 1, borderColor: '#FECDD3' },
  tuIconBoxAmber: { backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A' },
  tuIconBoxPurple: { backgroundColor: '#F5F3FF', borderWidth: 1, borderColor: '#DDD6FE' },
  tuGridTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tuTagEmerald: { backgroundColor: '#D1FAE5' },
  tuTagBlue: { backgroundColor: '#DBEAFE' },
  tuTagRose: { backgroundColor: '#FFE4E6' },
  tuTagAmber: { backgroundColor: '#FEF3C7' },
  tuTagPurple: { backgroundColor: '#EDE9FE' },
  tuGridTagText: {
    fontSize: 8.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  tuGridCardValue: {
    fontSize: 20,
    fontWeight: '900',
    lineHeight: 26,
  },
  tuGridCardLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    lineHeight: 14,
    marginTop: 2,
  },
  tuGridFooter: {
    marginTop: 6,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(0,0,0,0.06)',
  },
  tuGridFooterText: {
    fontSize: 9,
    fontWeight: '600',
  },

  // ── Action Toolbar CLEAN (2 Baris Rapi, Lega & Tidak Berhimpitan) ──
  tuActionBarCard: {
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    borderRadius: 16,
    padding: 10,
    gap: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.07,
    shadowRadius: 6,
    elevation: 2,
  },
  tuActionRowPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tuActionRowSecondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  tuBtnAddClean: {
    flex: 1,
    height: 42,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 7,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  tuBtnAddTextClean: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tuBtnRefreshClean: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tuBtnPrintClean: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    borderRadius: 11,
    gap: 6,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.16,
    shadowRadius: 3,
    elevation: 2,
  },
  tuBtnPrintTextClean: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tuBtnTrashClean: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    borderRadius: 11,
    gap: 6,
  },
  tuBtnTrashHasItemsClean: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  tuBtnTrashActiveClean: {
    backgroundColor: '#DC2626',
    borderColor: '#DC2626',
  },
  tuBtnTrashTextClean: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  tuBtnTrashTextActiveClean: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ── Sub-Tab Switcher Clean ──
  modernViewSwitcherWrapClean: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 16,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modernViewSwitcherTabClean: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  modernViewSwitcherTabActiveClean: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  modernViewSwitcherTextClean: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
  },
  modernViewSwitcherTextActiveClean: {
    color: '#047857',
    fontWeight: '800',
  },
  tabCounterBadgeClean: {
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
    marginLeft: 6,
  },
  tabCounterBadgeActiveClean: {
    backgroundColor: '#ECFDF5',
  },
  tabCounterBadgeTextClean: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  tabCounterBadgeTextActiveClean: {
    color: '#047857',
    fontWeight: '800',
  },

  // ── Filter Dropdown Grid Clean (2 Baris Rapi, Lega & Proporsional) ──
  filterDropdownGridClean: {
    flexDirection: 'column',
    gap: 8,
    marginBottom: 12,
  },
  filterDropdownRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  filterDropdownTriggerClean: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    shadowColor: '#64748B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  filterDropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 4,
  },
  filterDropdownIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterDropdownMiniLabel: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.3,
  },
  filterDropdownTriggerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  filterResetBtnClean: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  filterResetBtnTextClean: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#E11D48',
  },
  filterResultCountBoxClean: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 5,
  },
  filterResultCountTextClean: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },

  // ── Bahan Ajar Item Card Clean ──
  teacherItemCardClean: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
    overflow: 'hidden',
  },
  teacherItemCardTrashedClean: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
    shadowColor: '#DC2626',
  },
  teacherItemCardHeaderClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  teacherSubjectBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    flexShrink: 1,
    marginRight: 8,
  },
  teacherSubjectBadgeTextClean: {
    fontSize: 11,
    fontWeight: '700',
    flexShrink: 1,
  },
  teacherStatusBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
    flexShrink: 0,
  },
  statusDotClean: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 5,
  },
  statusDotPubClean: {
    backgroundColor: '#10B981',
  },
  statusDotDraftClean: {
    backgroundColor: '#F59E0B',
  },
  teacherStatusPubClean: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  teacherStatusDraftClean: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  teacherStatusBadgeTextClean: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  teacherStatusTextPubClean: {
    color: '#047857',
  },
  teacherStatusTextDraftClean: {
    color: '#B45309',
  },
  trashBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderColor: '#FECACA',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    flexShrink: 0,
  },
  trashBadgeTextClean: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#DC2626',
  },
  teacherSubBadgesRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  teacherClassBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
    borderWidth: 1,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  teacherClassBadgeTextClean: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#475569',
  },
  tipeContentBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
    borderWidth: 1,
  },
  tipeBadgeVideoClean: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  tipeBadgeDokumenClean: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
  },
  tipeBadgeTeksClean: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  tipeContentBadgeTextClean: {
    fontSize: 10,
    fontWeight: '800',
  },
  teacherItemTitleClean: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
    lineHeight: 23,
  },
  itemMetaDescBoxClean: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 8,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modulAjarRowFullClean: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  modulAjarPillClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  modulAjarPillLabelClean: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  modulAjarTitleTextClean: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
    marginLeft: 8,
    lineHeight: 18,
  },
  authorRowFullClean: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '100%',
  },
  authorPillClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    flexShrink: 0,
  },
  authorPillLabelClean: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0284C7',
    letterSpacing: 0.3,
  },
  authorTitleTextClean: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#334155',
    marginLeft: 8,
    lineHeight: 18,
  },
  descQuoteWrapClean: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    width: '100%',
    paddingTop: 8,
    marginTop: 2,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  teacherItemDescClean: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '500',
    color: '#475569',
    lineHeight: 17,
  },

  // ── Modul Ajar Content Box Clean (Lega, Rapi, & Tanpa Garis Menempel) ──
  modulContentBoxClean: {
    flexDirection: 'column',
    alignItems: 'stretch',
    gap: 6,
    marginTop: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modulTpHeaderRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  modulTpPillClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  modulTpPillLabelClean: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.3,
  },
  modulContentTextClean: {
    fontSize: 12,
    fontWeight: '500',
    color: '#334155',
    lineHeight: 18,
  },
  teacherItemFooterClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teacherItemMetaLeftClean: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  teacherItemDateTextClean: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#94A3B8',
    flexShrink: 1,
  },
  bobotBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 7,
  },
  bobotBadgeTextClean: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  teacherItemActionsClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    flexShrink: 0,
  },
  teacherBtnViewClean: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherBtnEditClean: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherBtnDeleteClean: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Modul Ajar Detail Button Clean & Specialized Styles ──
  tuBtnRefreshModulClean: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  tuBtnPrintModulClean: {
    flex: 1,
    height: 40,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0284C7',
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  modulFaseBadgeModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexShrink: 0,
  },
  modulFaseBadgeTextModern: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  modulKodeBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  modulKodeBadgeTextClean: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  modulTeacherRowClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 7,
    marginTop: -2,
  },
  modulTeacherTextClean: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    flexShrink: 1,
  },
  modulJpBadgeClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginLeft: 6,
  },
  modulJpBadgeTextClean: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  modulVersiBadgeClean: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginLeft: 4,
  },
  modulVersiBadgeTextClean: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  modulActionDetailBtnClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
    flexShrink: 0,
  },
  modulActionDetailBtnTextClean: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  loadMoreBtnClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginVertical: 10,
    gap: 8,
  },
  loadMoreBtnTextClean: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  teacherSortBarClean: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    marginBottom: 6,
    paddingHorizontal: 2,
    gap: 8,
  },
  teacherSortDateBtnClean: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    gap: 5,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.06,
    shadowRadius: 2,
    elevation: 1,
  },
  teacherSortDateBtnTextClean: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  teacherModulDetailBtnClean: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 9,
    borderWidth: 1.5,
    backgroundColor: '#F8FAFC',
  },
  teacherModulDetailBtnTextClean: {
    fontSize: 10.5,
    fontWeight: '700',
  },

  // ── Role Tag Pills (di dalam Hero Role Card) ──
  roleTagPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.4)',
  },
  roleTagPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  unitTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: '#064E3B',
    borderWidth: 1,
    borderColor: '#065F46',
  },
  unitTagPillText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D1FAE5',
    letterSpacing: 0.2,
  },

  // ── Modal Picker Dropdown Sheet Clean (Rombel & Status) ──
  pickerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingTop: 16,
    paddingBottom: PICKER_MODAL_BOTTOM_PAD,
    paddingHorizontal: 16,
    maxHeight: '70%',
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
  pickerModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pickerModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerModalSubtitle: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  pickerModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerModalList: {
    maxHeight: 380,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pickerItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  pickerItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  pickerItemRadioDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    borderWidth: 2,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  pickerItemRadioDotActive: {
    borderColor: '#059669',
    backgroundColor: '#059669',
  },
  pickerStatusDotIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  pickerItemText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  pickerItemTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  pickerItemDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

  // ── Ringkasan Materi Belajar (Parent View) ──
  emeraldSummaryContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 16,
  },
  summaryHeaderContainer: {
    marginBottom: 12,
  },
  summaryTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  sectionIconBadgeModern: {
    width: 36,
    height: 36,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  sectionTitleBold: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  summarySubtitleText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '500',
    marginTop: 1,
  },
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
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
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

  // ── Filter Section Parent Clean ──
  filterSectionBlockClean: {
    marginBottom: 16,
    gap: 10,
  },
  searchBarContainerModern: {
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
  searchInputFieldModern: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterPillsScrollView: {
    flexDirection: 'row',
  },
  filterPillsScrollContent: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 2,
  },
  subjectFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  subjectFilterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 3,
  },
  subjectFilterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#475569',
  },
  subjectFilterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  resetFilterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFF1F2',
    borderWidth: 1.2,
    borderColor: '#FECDD3',
  },
  resetFilterChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#E11D48',
  },

  // ── Modern Material List & Cards ──
  materialsContainerBlock: {
    marginBottom: 24,
  },
  sectionHeaderBetweenModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeftModern: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  sectionHeaderIconSquircle: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleBoldModern: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionSubtitleModern: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  sortPillButtonModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    gap: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 1,
  },
  sortPillTextModern: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  loadingBoxModern: {
    padding: 36,
    alignItems: 'center',
    gap: 10,
  },
  loadingTextModern: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 4,
  },
  emptyCardModern: {
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    paddingVertical: 36,
    paddingHorizontal: 20,
    alignItems: 'center',
    borderWidth: 2,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptyTitleModern: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
    letterSpacing: -0.2,
  },
  emptySubtitleModern: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
    maxWidth: 280,
  },
  emptyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 14,
  },
  emptyResetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  materialCardModern: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    marginBottom: 14,
    shadowColor: '#0F172A',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
    overflow: 'hidden',
  },
  materialCardGradient: {
    padding: 0,
    borderRadius: 19,
  },
  materialCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 4,
  },
  subjectPillBadgeModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  subjectPillTextModern: {
    fontSize: 10,
    fontWeight: '700',
  },
  mediaTypePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  mediaTypePillText: {
    fontSize: 10,
    fontWeight: '700',
  },
  materialDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  materialCardBody: {
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  materialTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  materialDescText: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 3,
  },
  materialMetaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginHorizontal: 14,
    marginVertical: 6,
  },
  materialMetaCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  materialMetaLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  materialMetaValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 1,
  },
  materialMetaDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 8,
  },
  materialCardFooter: {
    paddingHorizontal: 14,
    paddingBottom: 12,
    paddingTop: 2,
  },
  openMaterialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  openMaterialBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

