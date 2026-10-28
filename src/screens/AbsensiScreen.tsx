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
// Safe dynamic loader for expo-location to prevent crashing if native module ExpoLocation is unlinked
const getLocationModule = (): any => {
  try {
    return require('expo-location');
  } catch {
    return null;
  }
};
import * as ImagePicker from 'expo-image-picker';
import * as DocumentPicker from 'expo-document-picker';
import { getApiErrorMessage } from '../services/api';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';
import { AttendancePayload, mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { canUseQrAttendance } from '../utils/accessControl';
import {
  isAboveTuRole,
  isHomeroomRole,
  isOperatorRole,
  isParentRole,
  isStaffRole,
  isStudentRole,
  isTeacherRole,
  isTuRole,
  roleLabel,
} from '../utils/roles';
import {
  getProfileImageUrl,
  getStudentAvatarSource,
  isGirlStudent,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { StudentHeroCard } from '../components/StudentHeroCard';
import { StudentStickyHeader, resolveStudentDisplay, useStickyScroll } from '../components/StudentStickyHeader';
import { TeacherStickyHeader } from '../components/TeacherStickyHeader';
import { TeacherHeroCard } from '../components/TeacherHeroCard';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { StudentQrModal } from '../components/StudentQrModal';
import { StudentMenuModal } from '../components/StudentMenuModal';
import { StudentWeeklyReportModal } from '../components/StudentWeeklyReportModal';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { EmptyStateCard } from '../components/EmptyStateCard';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

type Child = Record<string, any>;
type AttendanceItem = Record<string, any>;
type PermissionItem = Record<string, any>;

const formatTanggalIndo = (val: unknown): string => {
  if (!val) return '-';
  const str = String(val);
  const d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
};

const formatTanggalSingkat = (val: unknown): string => {
  if (!val) return '-';
  const str = String(val);
  const d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' });
};

const getLocalDateString = (d: Date = new Date()): string => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const formatJamIndo = (val: unknown): string => {
  if (!val) return '-';
  const str = String(val);
  if (str.length === 5 || str.length === 8) return str.slice(0, 5) + ' WIB';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
};

const DROP_OFF_CATEGORIES = [
  { key: 'ojek', icon: 'motorbike', label: 'Ojek Online (Gojek / Grab / Maxim)' },
  { key: 'jemputan', icon: 'van-passenger', label: 'Antar-Jemput / Sopir Pribadi' },
  { key: 'kerabat', icon: 'account-group', label: 'Keluarga / Kerabat (Kakek/Paman/Kakak)' },
  { key: 'mandiri', icon: 'bike', label: 'Berangkat Mandiri (Sepeda / Jalan Kaki)' },
  { key: 'dinas_ortu', icon: 'briefcase-account', label: 'Orang Tua Berhalangan (Dinas / Kerja / Sakit)' },
];

export default function AbsensiScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16;

  const user = useAuthStore((state) => state.user);
  const authScope = useAuthStore((state) => state.scope);
  const employeeId = authScope?.employee_id;
  const effectiveEmployeeId = employeeId || (user as any)?.employee_id || (user as any)?.employee?.id || (user as any)?.id;
  const effectiveUnitId = authScope?.unit_id || (user as any)?.scope?.unit_id || (user as any)?.unit_id || (user as any)?.unit;
  const config = useMobileConfigStore((state) => state.config);
  const qrEnabled = canUseQrAttendance(user, config);

  const isParent = isParentRole(user?.roles || []);
  const isStudent = isStudentRole(user?.roles || []);
  const isStaff = isStaffRole(user?.roles || []) || (!isParent && !isStudent);
  const isTuStaff = isStaff && isTuRole(user?.roles || []);
  const isAboveTu = isAboveTuRole(user?.roles || []);
  const canViewStudentReport = isTuStaff || isHomeroomRole(user?.roles || []) || isAboveTu || isOperatorRole(user?.roles || []);

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

  // Children & Student Context
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(
    route?.params?.child_id || route?.params?.student_id || useActiveChildStore.getState().activeChildId
  );
  const [activeChildIndex, setActiveChildIndex] = useState(0);
  const handledParamIdRef = useRef<string | null>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);

  // Core Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Attendance & Permissions Data (100% Real Database)
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceItem[]>([]);
  const [permissionsHistory, setPermissionsHistory] = useState<PermissionItem[]>([]);
  const [dormitoryPermits, setDormitoryPermits] = useState<any[]>([]);

  // Gate Attendance Data (Tap Lokasi GPS)
  const [gateToday, setGateToday] = useState<{
    attendance?: any;
    has_check_in?: boolean;
    has_check_out?: boolean;
    student?: any;
    date?: string;
  } | null>(null);
  const [gateLoading, setGateLoading] = useState<boolean>(false);

  // Employee Specific Data
  const [employeeHistory, setEmployeeHistory] = useState<any[]>([]);
  const [employeeStats, setEmployeeStats] = useState<any>(null);
  const [savingAttendance, setSavingAttendance] = useState<boolean>(false);

  // UI Filtering & Search
  const routeTab = route?.params?.tab;
  const initialMappedTab = routeTab === 'asrama' ? 'boarding' : routeTab;
  const [activeTab, setActiveTab] = useState<'all' | 'attendance' | 'permissions' | 'boarding' | 'rekap_siswa' | 'rekap_pegawai'>(
    initialMappedTab && ['all', 'attendance', 'permissions', 'boarding', 'rekap_siswa', 'rekap_pegawai'].includes(initialMappedTab)
      ? (initialMappedTab as any)
      : isStaff
        ? 'attendance'
        : 'all'
  );
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Verifikasi Izin Santri untuk Staf / Pimpinan / TU / Walas
  const [staffPermFilter, setStaffPermFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [selectedPermForReview, setSelectedPermForReview] = useState<any>(null);
  const [reviewAction, setReviewAction] = useState<'approve' | 'reject'>('approve');
  const [reviewNotes, setReviewNotes] = useState<string>('');
  const [isReviewModalOpen, setIsReviewModalOpen] = useState<boolean>(false);
  const [submittingReview, setSubmittingReview] = useState<boolean>(false);

  // Period Filter: daily, custom_date, weekly, monthly, semester, yearly
  const [selectedPeriod, setSelectedPeriod] = useState<'daily' | 'custom_date' | 'weekly' | 'monthly' | 'semester' | 'yearly'>('daily');

  // Filter Sesuai Tanggal (Kalender Interaktif)
  const [selectedCustomDate, setSelectedCustomDate] = useState<string>('');
  const [isDatePickerModalOpen, setIsDatePickerModalOpen] = useState<boolean>(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(new Date());

  // Student / Parent Status Filter (Harmonisasi Layout Mutabaah TU)
  const [studentStatusFilter, setStudentStatusFilter] = useState<'all' | 'hadir' | 'izin' | 'sakit' | 'terlambat' | 'alpa'>('all');

  // Filter Mata Pelajaran (Daftar Mapel Scrollable)
  const [selectedSubjectFilter, setSelectedSubjectFilter] = useState<string>('all');

  // TU & Manajerial: state rekap kehadiran siswa & pegawai
  const [tuStudentAttendances, setTuStudentAttendances] = useState<any[]>([]);
  const [tuAttendanceStats, setTuAttendanceStats] = useState<any>(null);
  const [rekapPegawaiAttendances, setRekapPegawaiAttendances] = useState<any[]>([]);

  // ── Rekap Siswa Tab: Student Dashboard Data (mirror web-dashboard LaporanSiswaPage) ──
  const [rekapSiswaLoading, setRekapSiswaLoading] = useState(false);
  const [rekapSiswaDashboard, setRekapSiswaDashboard] = useState<any>(null);
  const [masterEducationUnits, setMasterEducationUnits] = useState<any[]>([]);
  const [rekapSiswaCari, setRekapSiswaCari] = useState('');
  const [rekapSiswaFilterUnit, setRekapSiswaFilterUnit] = useState('semua');
  const [rekapSiswaFilterKelas, setRekapSiswaFilterKelas] = useState('semua');
  const [rekapSiswaFilterStatus, setRekapSiswaFilterStatus] = useState('semua');
  const [rekapSiswaFilterGender, setRekapSiswaFilterGender] = useState('semua');
  const [rekapSiswaPage, setRekapSiswaPage] = useState(1);
  const rekapSiswaPerPage = 10;
  const [selectedRekapSiswa, setSelectedRekapSiswa] = useState<any>(null);
  const [rekapSiswaDetailOpen, setRekapSiswaDetailOpen] = useState(false);
  const [rekapStatusDropdownOpen, setRekapStatusDropdownOpen] = useState(false);
  const [rekapKelasDropdownOpen, setRekapKelasDropdownOpen] = useState(false);
  const [rekapUnitDropdownOpen, setRekapUnitDropdownOpen] = useState(false);
  const [rekapPrintModalOpen, setRekapPrintModalOpen] = useState(false);
  const [rekapPrintSuccessNotice, setRekapPrintSuccessNotice] = useState<string | null>(null);
  const rekapSiswaDashboardLoaded = useRef(false);

  const rekapStatusOptions = useMemo(() => [
    { key: 'semua', label: 'Semua Status' },
    { key: 'aktif', label: 'Siswa Aktif' },
    { key: 'alumni', label: 'Siswa Alumni / Lulus' },
    { key: 'mutasi_keluar', label: 'Mutasi Keluar' },
    { key: 'berhenti', label: 'Siswa Berhenti' },
    { key: 'cuti', label: 'Siswa Cuti' },
    { key: 'nonaktif', label: 'Siswa Non-aktif' },
  ], []);

  // ── Sub-Tab Kesiswaan Terpadu (Demografi, Prestasi, Kelulusan & Alumni, Mutasi) ──
  const [rekapSubTab, setRekapSubTab] = useState<'demografi' | 'prestasi' | 'kelulusan' | 'mutasi'>('demografi');
  const [rekapAlumniList, setRekapAlumniList] = useState<any[]>([]);
  const [rekapAlumniStats, setRekapAlumniStats] = useState<any>(null);
  const [rekapAlumniSearch, setRekapAlumniSearch] = useState('');
  const [rekapAlumniFilterTahun, setRekapAlumniFilterTahun] = useState('semua');
  const [rekapAlumniFilterUnit, setRekapAlumniFilterUnit] = useState('semua');
  const [rekapAlumniFilterKategori, setRekapAlumniFilterKategori] = useState('semua');

  const [rekapPrestasiList, setRekapPrestasiList] = useState<any[]>([]);
  const [rekapPrestasiSearch, setRekapPrestasiSearch] = useState('');
  const [rekapPrestasiFilterTingkat, setRekapPrestasiFilterTingkat] = useState('semua');

  const [rekapMutasiList, setRekapMutasiList] = useState<any[]>([]);
  const [rekapMutasiSearch, setRekapMutasiSearch] = useState('');
  const [rekapMutasiFilterType, setRekapMutasiFilterType] = useState('semua');

  // Modal Form Input Izin / Sakit / Dinas Luar
  const [isLeaveModalOpen, setIsLeaveModalOpen] = useState(false);
  const [leaveStatus, setLeaveStatus] = useState<'IZIN' | 'SAKIT' | 'DINAS_LUAR'>('IZIN');
  const [leaveDate, setLeaveDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [leaveReason, setLeaveReason] = useState<string>('');
  const [leaveAttachment, setLeaveAttachment] = useState<{ uri: string; name: string; type: string } | null>(null);
  const [submittingLeave, setSubmittingLeave] = useState<boolean>(false);

  // Modal Preview Lampiran Dokumen / Foto
  const [previewAttachmentUrl, setPreviewAttachmentUrl] = useState<string | null>(null);
  const [previewAttachmentTitle, setPreviewAttachmentTitle] = useState<string>('Lampiran Surat');
  const [isPreviewModalOpen, setIsPreviewModalOpen] = useState<boolean>(false);

  // Judul mengikuti tab route (Presensi vs Perizinan Santri)
  const pageTitle = routeTab === 'permissions' ? 'Perizinan Santri' : 'Presensi';

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

  // Tombol Kalender pada sticky header & body card (disamakan dengan halaman Beranda & Kalender)
  const openScheduleForStudent = useCallback((student: any) => {
    const sid = student?.id || student?.student_id || selectedChildId;
    if (sid) {
      const idStr = String(sid);
      navigation?.navigate('Kalender', { child_id: idStr, student_id: idStr });
    } else {
      navigation?.navigate('Kalender');
    }
  }, [navigation, selectedChildId]);

  useEffect(() => {
    const rawTab = route?.params?.tab;
    const mappedTab = rawTab === 'asrama' ? 'boarding' : rawTab;
    if (rawTab === 'rekap_siswa' || route?.params?.defaultSubject === 'siswa') {
      navigation?.replace?.('RekapPresensiSiswa', { defaultSubject: 'siswa' });
      return;
    }
    if (mappedTab && ['all', 'attendance', 'permissions', 'boarding', 'rekap_siswa', 'rekap_pegawai'].includes(mappedTab)) {
      setActiveTab(mappedTab as any);
    }
  }, [route?.params?.tab, route?.params?.defaultSubject, navigation]);

  // Sinkronkan selectedChildId dengan parameter rute dan store anak aktif global
  useEffect(() => {
    const isSingleChild = route?.params?.single_child_only === true;
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId) {
      if (String(incomingId) !== String(selectedChildId)) {
        setSelectedChildId(String(incomingId));
      }
    } else if (globalActiveChildId && !isSingleChild) {
      if (String(globalActiveChildId) !== String(selectedChildId)) {
        setSelectedChildId(String(globalActiveChildId));
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, route?.params?.single_child_only, globalActiveChildId, selectedChildId]);

  // Modals
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState<boolean>(false);

  // Permission Form State
  const [permType, setPermType] = useState<string>('Izin');
  const [permStartDate, setPermStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [permEndDate, setPermEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [permReason, setPermReason] = useState<string>('');
  const [permSubmitting, setPermSubmitting] = useState<boolean>(false);

  const isUserDraggingRef = useRef<boolean>(false);
  const isSyncingDataRef = useRef<boolean>(false);
  const isProgrammaticScrollRef = useRef<boolean>(false);
  const programmaticScrollTimerRef = useRef<any>(null);
  const lastDirectTapTimeRef = useRef<number>(0);

  // 1. Load Children if parent with offline cache (selaras 100% dengan ananda terpilih di halaman utama)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
      const childCacheKey = offlineCache.buildKey('absensi_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          isSyncingDataRef.current = true;
          setChildren(cached);
          useActiveChildStore.getState().setChildren(cached);
          const activeId = targetChildId
            ? String(targetChildId)
            : String(useActiveChildStore.getState().activeChildId || cached[0]?.id || cached[0]?.student_id);
          setSelectedChildId(activeId);
          const foundIdx = cached.findIndex((c: any) => String(c.id || c.student_id) === activeId);
          const safeIdx = foundIdx >= 0 ? foundIdx : 0;
          setActiveChildIndex(safeIdx);
          requestAnimationFrame(() => {
            scrollToActiveChild(safeIdx, false);
            setTimeout(() => { isSyncingDataRef.current = false; }, 250);
          });
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const raw = unwrapApiData<any>(res);
          const list = Array.isArray(raw) ? raw : (Array.isArray(raw?.data) ? raw.data : []);
          if (isMounted && list.length > 0) {
            isSyncingDataRef.current = true;
            setChildren(list);
            useActiveChildStore.getState().setChildren(list);
            const activeId = targetChildId
              ? String(targetChildId)
              : String(useActiveChildStore.getState().activeChildId || list[0]?.id || list[0]?.student_id);
            setSelectedChildId(activeId);
            const foundIdx = list.findIndex((c: any) => String(c.id || c.student_id) === activeId);
            const safeIdx = foundIdx >= 0 ? foundIdx : 0;
            setActiveChildIndex(safeIdx);
            requestAnimationFrame(() => {
              scrollToActiveChild(safeIdx, false);
              setTimeout(() => { isSyncingDataRef.current = false; }, 250);
            });
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch((err) => {
          console.log('Failed to fetch parent children in AbsensiScreen:', err);
        });
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, globalActiveChildId, route?.params?.child_id, route?.params?.student_id]);

  const studentCardWidth = useMemo(() => {
    return children.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [children.length]);

  const studentSnapInterval = useMemo(() => {
    return studentCardWidth + STUDENT_CARD_GAP;
  }, [studentCardWidth]);

  const studentTrackPad = useMemo(() => {
    return (SCREEN_WIDTH - studentCardWidth) / 2;
  }, [studentCardWidth]);

  // Real-time tracking titik dot carousel saat gesture drag/swipe berlangsung
  const [visualDotIndex, setVisualDotIndex] = useState<number | null>(null);
  const currentActiveDotIndex = visualDotIndex !== null ? visualDotIndex : activeChildIndex;

  const scrollToActiveChild = useCallback((idx: number, animated = false): void => {
    if (children.length <= 1) return;
    const clamped = Math.max(0, Math.min(children.length - 1, idx));
    isProgrammaticScrollRef.current = true;
    if (programmaticScrollTimerRef.current) clearTimeout(programmaticScrollTimerRef.current);
    programmaticScrollTimerRef.current = setTimeout(() => {
      isProgrammaticScrollRef.current = false;
    }, animated ? 650 : 80);
    studentScrollRef.current?.scrollTo({ x: clamped * studentSnapInterval, animated });
  }, [children.length, studentSnapInterval]);

  const lastHandledGlobalChildIdRef = useRef<string | null>(null);
  const initialScrollDoneRef = useRef<boolean>(false);

  const syncLoopChildId = useCallback((realIdx: number): void => {
    const selChild = children[realIdx];
    const sid = selChild?.id || selChild?.student_id;
    if (sid) {
      const strSid = String(sid);
      lastHandledGlobalChildIdRef.current = strSid;
      setSelectedChildId(strSid);
      useActiveChildStore.getState().setActiveChildId(strSid);
    }
  }, [children]);

  const goToLoopChild = useCallback((targetIndex: number, isDirectTap = false): void => {
    if (children.length === 0) return;
    const clampedIndex = Math.max(0, Math.min(children.length - 1, targetIndex));
    lastDirectTapTimeRef.current = Date.now();
    const targetChild = children[clampedIndex];
    if (targetChild) {
      const targetId = String(targetChild.id || targetChild.student_id);
      lastHandledGlobalChildIdRef.current = targetId;
    }
    setActiveChildIndex(clampedIndex);
    syncLoopChildId(clampedIndex);
    scrollToActiveChild(clampedIndex, true);
  }, [children, syncLoopChildId, scrollToActiveChild]);

  // Route params sync (hanya sekali saat parameter route baru terdeteksi)
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId && children.length > 0 && handledParamIdRef.current !== String(incomingId)) {
      handledParamIdRef.current = String(incomingId);
      lastHandledGlobalChildIdRef.current = String(incomingId);
      const foundIdx = children.findIndex((c: any) => String(c.id || c.student_id) === String(incomingId));
      if (foundIdx >= 0) {
        goToLoopChild(foundIdx);
      }
    }
  }, [route?.params?.child_id, route?.params?.student_id, children, goToLoopChild]);

  // Sinkronkan activeChildIndex jika selectedChildId berubah dari luar (route params / store)
  useEffect(() => {
    if (children.length > 0 && selectedChildId) {
      const targetStr = String(selectedChildId);
      if (targetStr === lastHandledGlobalChildIdRef.current) return;
      lastHandledGlobalChildIdRef.current = targetStr;

      const idx = children.findIndex(
        (c) => String(c.id || c.student_id) === targetStr
      );
      if (idx >= 0 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
        scrollToActiveChild(idx, true);
      }
    }
  }, [selectedChildId, children, activeChildIndex, scrollToActiveChild]);

  // Posisikan scroll ke kartu yang aktif HANYA sekali saat awal load
  useEffect(() => {
    if (children.length <= 1 || initialScrollDoneRef.current) return;
    initialScrollDoneRef.current = true;
    requestAnimationFrame(() => {
      scrollToActiveChild(activeChildIndex, false);
    });
  }, [children.length, activeChildIndex, scrollToActiveChild]);

  // Siswa aktif untuk sticky header & hero (hanya untuk orang tua atau siswa)
  const headerStudent = useMemo(() => {
    if (isParent && children && children.length > 0) {
      const found = children.find(
        (c) => String(c.id || c.student_id) === String(selectedChildId)
      );
      if (found) return found;
      return children[0];
    }
    if (isStudent) {
      if (studentInfo) return studentInfo;
      return (user as any)?.student || user || null;
    }
    return null;
  }, [isParent, isStudent, children, selectedChildId, studentInfo, user]);

  // Nama depan + fallback tahun ajaran untuk subtitle hero statis
  const heroFirstName = useMemo(
    () => resolveStudentDisplay(headerStudent, user).firstName,
    [headerStudent, user]
  );
  const activeStudentName = useMemo(() => {
    return resolveStudentDisplay(headerStudent, user).firstName || headerStudent?.name || 'Siswa';
  }, [headerStudent, user]);

  const heroSubtitleFallback = useMemo(() => {
    const now = new Date();
    const y = now.getFullYear();
    return now.getMonth() >= 6 ? `Tahun Ajaran ${y}/${y + 1}` : `Tahun Ajaran ${y - 1}/${y}`;
  }, []);

  const [showChildSelectorModal, setShowChildSelectorModal] = useState(false);

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(headerStudent);
  }, [headerStudent]);

  const studentFullName = useMemo(() => {
    const raw =
      headerStudent?.name ||
      headerStudent?.nama_lengkap ||
      headerStudent?.full_name ||
      headerStudent?.student?.name;
    return typeof raw === 'string' ? raw : 'Nama Siswa';
  }, [headerStudent]);

  const studentUnit = useMemo(() => {
    if (typeof headerStudent?.unit_name === 'string') return headerStudent.unit_name;
    if (typeof headerStudent?.unit?.name === 'string') return headerStudent.unit.name;
    if (typeof headerStudent?.education_unit?.name === 'string') return headerStudent.education_unit.name;
    if (typeof headerStudent?.education_unit_name === 'string') return headerStudent.education_unit_name;
    if (typeof headerStudent?.unit === 'string') return headerStudent.unit;
    if (typeof headerStudent?.education_unit === 'string') return headerStudent.education_unit;
    return '';
  }, [headerStudent]);

  const studentClass = useMemo(() => {
    if (typeof headerStudent?.class_name === 'string') return headerStudent.class_name;
    if (typeof headerStudent?.classroom?.name === 'string') return headerStudent.classroom.name;
    if (typeof headerStudent?.kelas?.nama_kelas === 'string') return headerStudent.kelas.nama_kelas;
    if (typeof headerStudent?.kelas?.name === 'string') return headerStudent.kelas.name;
    if (typeof headerStudent?.class?.name === 'string') return headerStudent.class.name;
    if (typeof headerStudent?.rombel === 'string') return headerStudent.rombel;
    if (typeof headerStudent?.kelas === 'string') return headerStudent.kelas;
    return '';
  }, [headerStudent]);

  // Resolusi Dinamis Status Kehadiran Siswa Hari Ini — Single Source of Truth selaras dengan HomeScreen
  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent);
  }, [headerStudent]);

  // ── 2. Load Attendance & Permissions Data ──
  const loadAttendanceData = useCallback(async () => {
    setError('');
    const cacheKey = offlineCache.buildKey('absensi', user?.id, selectedChildId || 'staff');
    // 1. Baca cache dulu
    const cached = await offlineCache.get<{ logs: AttendanceItem[]; perms: PermissionItem[]; dorms: any[]; empHistory: any[]; empStats: any; gateToday?: any }>(cacheKey);
    if (cached) {
      if (cached.logs?.length > 0) setAttendanceLogs(cached.logs);
      if (cached.perms?.length > 0) setPermissionsHistory(cached.perms);
      if (cached.dorms?.length > 0) setDormitoryPermits(cached.dorms);
      if (cached.empHistory?.length > 0) setEmployeeHistory(cached.empHistory);
      if (cached.empStats) setEmployeeStats(cached.empStats);
      if (cached.gateToday) setGateToday(cached.gateToday);
    }
    // 2. Fetch dari backend
    try {
      if (isParent || isStudent) {
        const targetId = isParent ? selectedChildId : undefined;
        const [attRes, permRes, dormRes, gateRes] = await Promise.allSettled([
          mobileApiService.getPortalAttendance(targetId),
          mobileApiService.getPortalPermissions(targetId),
          mobileApiService.getDormitoryPermits(targetId),
          mobileApiService.getPortalGateAttendanceToday(targetId),
        ]);

        let logs: AttendanceItem[] = [];
        let perms: PermissionItem[] = [];
        let dorms: any[] = [];
        let gateData: any = null;

        if (attRes.status === 'fulfilled') {
          const raw = attRes.value?.data || attRes.value || [];
          logs = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
          setAttendanceLogs(logs);
        }
        if (permRes.status === 'fulfilled') {
          const rawP = permRes.value?.data || permRes.value || [];
          perms = Array.isArray(rawP?.data) ? rawP.data : (Array.isArray(rawP) ? rawP : []);
          setPermissionsHistory(perms);
        }
        if (dormRes.status === 'fulfilled') {
          const rawD = dormRes.value?.data || dormRes.value || [];
          dorms = Array.isArray(rawD?.data) ? rawD.data : (Array.isArray(rawD) ? rawD : []);
          setDormitoryPermits(dorms);
        }
        if (gateRes.status === 'fulfilled') {
          const rawG = gateRes.value?.data || gateRes.value;
          gateData = rawG || null;
          setGateToday(gateData);
        }
        if (isStudent) {
          setStudentInfo((prev: any) => prev || user?.student || user);
        }
        // 3. Simpan ke cache
        if (logs.length > 0 || perms.length > 0 || dorms.length > 0 || gateData) {
          void offlineCache.set(cacheKey, { logs, perms, dorms, empHistory: [], empStats: null, gateToday: gateData });
        }
      } else if (isStaff) {
        const empIdParam = effectiveEmployeeId ? String(effectiveEmployeeId) : undefined;
        const [repRes, statsRes, teacherAttRes, tuRekapRes, tuStatsRes, pegRekapRes, teacherPermRes, dormRes] = await Promise.allSettled([
          // Presensi mandiri milik diri sendiri — wajib sertakan tipe_presensi Pegawai
          empIdParam
            ? mobileApiService.getAttendanceReport({ employee_id: empIdParam, tipe_presensi: 'Pegawai', per_page: 100, period: selectedPeriod })
            : Promise.reject('no_emp_id'),
          empIdParam
            ? mobileApiService.getAttendanceStats({ employee_id: empIdParam, tipe_presensi: 'Pegawai', period: selectedPeriod })
            : Promise.reject('no_emp_id'),
          // Fallback via endpoint teacher/attendance-logs (tersedia untuk semua staff)
          mobileApiService.getTeacherAttendanceLogs(),
          // TU, Walas & Manajerial: rekap kehadiran seluruh siswa di unit
          canViewStudentReport
            ? mobileApiService.getAttendanceReport({ per_page: 50, period: selectedPeriod })
            : Promise.reject('not_allowed_student_rekap'),
          canViewStudentReport
            ? mobileApiService.getAttendanceStats({ period: selectedPeriod })
            : Promise.reject('not_allowed_student_stats'),
          // Pimpinan di atas TU: rekap presensi seluruh pegawai unit
          isAboveTu
            ? mobileApiService.getAttendanceReport({ tipe_presensi: 'Pegawai', per_page: 50, period: selectedPeriod })
            : Promise.reject('not_above_tu'),
          // Verifikasi Izin Santri untuk Staf / Kepsek / TU / Walas
          canViewStudentReport
            ? mobileApiService.getTeacherPermissions({ per_page: 100 })
            : Promise.reject('not_allowed_permissions'),
          // Izin Asrama / Boarding Permits
          mobileApiService.getDormitoryPermits(),
        ]);

        let empHistory: any[] = [];
        let empStats: any = null;

        // Primary: dari /attendance/report?employee_id=...&tipe_presensi=Pegawai
        if (repRes.status === 'fulfilled') {
          const res = repRes.value;
          empHistory = Array.isArray(res?.records)
            ? res.records
            : Array.isArray(res?.data)
              ? res.data
              : Array.isArray(res?.data?.data)
                ? res.data.data
                : [];
        }
        // Fallback: dari /teacher/attendance-logs (berlaku untuk SEMUA staff, bukan hanya guru)
        if (empHistory.length === 0 && teacherAttRes.status === 'fulfilled') {
          const res = teacherAttRes.value;
          const raw = res?.data || res || [];
          empHistory = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
        }
        setEmployeeHistory(empHistory);

        if (statsRes.status === 'fulfilled') {
          empStats = statsRes.value?.data || statsRes.value || null;
          setEmployeeStats(empStats);
        }

        // Simpan rekap kehadiran siswa untuk TU & Walas
        if (canViewStudentReport) {
          if (tuRekapRes.status === 'fulfilled') {
            const res = tuRekapRes.value;
            const rekapList = Array.isArray(res?.records)
              ? res.records
              : Array.isArray(res?.data)
                ? res.data
                : Array.isArray(res?.data?.data)
                  ? res.data.data
                  : [];
            setTuStudentAttendances(rekapList);
          }
          if (tuStatsRes.status === 'fulfilled') {
            setTuAttendanceStats(tuStatsRes.value?.data || tuStatsRes.value || null);
          }
        }

        // Simpan rekap presensi pegawai untuk role di atas TU
        if (isAboveTu && pegRekapRes.status === 'fulfilled') {
          const res = pegRekapRes.value;
          const pegList = Array.isArray(res?.records)
            ? res.records
            : Array.isArray(res?.data)
              ? res.data
              : Array.isArray(res?.data?.data)
                ? res.data.data
                : [];
          setRekapPegawaiAttendances(pegList);
        }

        // Simpan perizinan santri untuk staf / pimpinan / TU / Walas
        if (teacherPermRes.status === 'fulfilled') {
          const rawP = teacherPermRes.value?.data || teacherPermRes.value || [];
          const pList = Array.isArray(rawP?.data) ? rawP.data : (Array.isArray(rawP) ? rawP : []);
          setPermissionsHistory(pList);
        }

        // Simpan izin kepulangan asrama
        if (dormRes.status === 'fulfilled') {
          const rawD = dormRes.value?.data || dormRes.value || [];
          const dList = Array.isArray(rawD?.data) ? rawD.data : (Array.isArray(rawD) ? rawD : []);
          setDormitoryPermits(dList);
        }

        // 3. Simpan ke cache
        if (empHistory.length > 0 || empStats) {
          void offlineCache.set(cacheKey, { logs: [], perms: [], empHistory, empStats });
        }
      }
    } catch (err: any) {
      // Offline: data cache sudah tampil dari step 1
      setError(getApiErrorMessage(err, 'Data presensi belum dapat dimuat.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, isStudent, isStaff, isTuStaff, isAboveTu, canViewStudentReport, selectedPeriod, selectedChildId, effectiveEmployeeId, user]);


  useEffect(() => {
    setLoading(true);
    void loadAttendanceData();
  }, [loadAttendanceData]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadAttendanceData();
  };

  // ── 3. Calculate Stats for Student / Parent ──
  const studentStats = useMemo(() => {
    let hadir = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;

    attendanceLogs.forEach((item) => {
      const st = (item.status_hadir || item.status_label || item.status || '').toLowerCase();
      if (st.includes('hadir') || st.includes('present')) hadir++;
      else if (st.includes('terlambat') || st.includes('late')) terlambat++;
      else if (st.includes('izin')) izin++;
      else if (st.includes('sakit')) sakit++;
      else if (st.includes('alpa') || st.includes('alpha')) alpa++;
    });

    const total = attendanceLogs.length;
    const percentage = total > 0 ? Math.round(((hadir + terlambat) / total) * 100) : 0;

    return { hadir, terlambat, izin, sakit, alpa, total, percentage };
  }, [attendanceLogs]);

  // ── 3b. Calculate Stats for Staff / TU (Sourced from Real DB History with Server Stats Integration) ──
  const computedEmployeeStats = useMemo(() => {
    let hadir = 0;
    let dinasLuar = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;

    employeeHistory.forEach((item) => {
      const st = String(item.status || item.status_label || '').toLowerCase();
      if (st.includes('dinas') || st.includes('tugas_luar')) dinasLuar++;
      else if (st.includes('hadir') || st.includes('present')) hadir++;
      else if (st.includes('terlambat') || st.includes('late')) terlambat++;
      else if (st.includes('izin')) izin++;
      else if (st.includes('sakit')) sakit++;
      else if (st.includes('alpa') || st.includes('alpha')) alpa++;
    });

    const total = employeeHistory.length;
    const percentage = total > 0 ? Math.round(((hadir + dinasLuar + terlambat) / total) * 100) : 100;

    // Use backend stats if they contain non-zero data, otherwise fallback to exact aggregate of employeeHistory
    const sHadir = employeeStats?.hadir && employeeStats.hadir > 0 ? employeeStats.hadir : hadir;
    const sDinasLuar = employeeStats?.dinas_luar !== undefined && employeeStats.dinas_luar > 0 ? employeeStats.dinas_luar : dinasLuar;
    const sTerlambat = employeeStats?.terlambat !== undefined && employeeStats.terlambat > 0 ? employeeStats.terlambat : terlambat;
    const sIzin = employeeStats?.izin !== undefined && employeeStats.izin > 0 ? employeeStats.izin : izin;
    const sSakit = employeeStats?.sakit !== undefined && employeeStats.sakit > 0 ? employeeStats.sakit : sakit;
    const sAlpa = (employeeStats?.alpa ?? employeeStats?.alpha) !== undefined && (employeeStats?.alpa ?? employeeStats?.alpha) > 0
      ? (employeeStats?.alpa ?? employeeStats?.alpha)
      : alpa;
    const sTotal = employeeStats?.total_presensi && employeeStats.total_presensi > 0 ? employeeStats.total_presensi : total;
    const sPercentage = employeeStats?.persentase_hadir ?? percentage;

    return {
      hadir: sHadir,
      dinas_luar: sDinasLuar,
      terlambat: sTerlambat,
      izin: sIzin,
      sakit: sSakit,
      alpa: sAlpa,
      total: sTotal,
      percentage: sPercentage,
    };
  }, [employeeHistory, employeeStats]);

  // ── 3c. Load Rekap Siswa dashboard data (dijalankan sekali saat tab aktif) ──
  const loadStudentRekapData = useCallback(async () => {
    if (!canViewStudentReport) return;
    setRekapSiswaLoading(true);
    try {
      const [resStudent, resUnits, resAlumni, resAlumniStats, resPrestasi, resStudentsAll] = await Promise.allSettled([
        mobileApiService.getStudentDashboard(),
        mobileApiService.getEducationUnits({ per_page: 50 }),
        mobileApiService.getAlumni({ per_page: 500 }),
        mobileApiService.getAlumniStats(),
        mobileApiService.getRekapPrestasiSiswa({ per_page: 200 }),
        mobileApiService.getStudents({ per_page: 500 }),
      ]);
      if (resStudent.status === 'fulfilled') {
        const data = resStudent.value?.data ?? resStudent.value;
        setRekapSiswaDashboard(data);
        rekapSiswaDashboardLoaded.current = true;
      }
      if (resUnits.status === 'fulfilled') {
        const uVal = resUnits.value?.data ?? resUnits.value;
        const uList = Array.isArray(uVal) ? uVal : (Array.isArray(uVal?.data) ? uVal.data : []);
        setMasterEducationUnits(uList);
      }
      if (resAlumni.status === 'fulfilled') {
        const aVal = unwrapCollection(resAlumni.value);
        setRekapAlumniList(Array.isArray(aVal) ? aVal : []);
      }
      if (resAlumniStats.status === 'fulfilled') {
        const asVal = resAlumniStats.value?.data ?? resAlumniStats.value;
        setRekapAlumniStats(asVal);
      }
      if (resPrestasi.status === 'fulfilled') {
        const pVal = unwrapCollection(resPrestasi.value);
        setRekapPrestasiList(Array.isArray(pVal) ? pVal : []);
      }
      if (resStudentsAll.status === 'fulfilled') {
        const stVal = unwrapCollection(resStudentsAll.value);
        const mutasiItems = (Array.isArray(stVal) ? stVal : []).filter((s: any) => {
          const st = String(s.status || s.status_siswa || '').toLowerCase();
          return st.includes('mutasi') || Boolean(s.metadata?.mutasi_type);
        });
        setRekapMutasiList(mutasiItems);
      }
    } catch (err) {
      // silently fail — tampilkan empty state
    } finally {
      setRekapSiswaLoading(false);
    }
  }, [canViewStudentReport]);

  useEffect(() => {
    if (activeTab === 'rekap_siswa' && canViewStudentReport && !rekapSiswaDashboardLoaded.current) {
      void loadStudentRekapData();
    }
  }, [activeTab, canViewStudentReport, loadStudentRekapData]);

  // Derived rekap siswa data
  const rekapSiswaAll = useMemo(() => rekapSiswaDashboard?.daftar_siswa || [], [rekapSiswaDashboard]);
  const rekapSiswaStats = useMemo(() => ({
    total: Number(rekapSiswaDashboard?.statistik?.total_siswa || rekapSiswaAll.length || 0),
    aktif: Number(rekapSiswaDashboard?.statistik?.siswa_aktif ?? rekapSiswaAll.filter((s: any) => s.aktif).length),
    alumni: Number(rekapSiswaDashboard?.statistik?.alumni || 0),
    mutasi: Number(rekapSiswaDashboard?.statistik?.mutasi_keluar || 0),
    nonaktif: Number(rekapSiswaDashboard?.statistik?.siswa_nonaktif ?? 0),
  }), [rekapSiswaDashboard, rekapSiswaAll]);

  const daftarUnitRekap = useMemo(
    () => [...new Set(rekapSiswaAll.map((s: any) => s.unit).filter((u: any) => u && u !== '-'))],
    [rekapSiswaAll]
  );
  const daftarKelasRekap = useMemo(
    () => [...new Set(rekapSiswaAll.map((s: any) => s.kelas).filter(Boolean))],
    [rekapSiswaAll]
  );

  const rekapSiswaFiltered = useMemo(() => {
    return rekapSiswaAll.filter((item: any) => {
      const cocokCari = `${item.nis || ''} ${item.nama || ''} ${item.kelas || ''} ${item.unit || ''}`
        .toLowerCase().includes(rekapSiswaCari.toLowerCase());
      const jkVal = String(item.jenis_kelamin || item.jk || '').toUpperCase();
      const cocokGender =
        rekapSiswaFilterGender === 'semua' ||
        (rekapSiswaFilterGender === 'L' && (jkVal.startsWith('L') || jkVal.includes('LAKI'))) ||
        (rekapSiswaFilterGender === 'P' && (jkVal.startsWith('P') || jkVal.includes('PEREMPUAN')));
      const statusRaw = String(item.status || (item.aktif ? 'aktif' : 'nonaktif')).toLowerCase();
      let cocokStatus = true;
      if (rekapSiswaFilterStatus === 'aktif') {
        cocokStatus = item.aktif === true && !statusRaw.includes('alumni') && !statusRaw.includes('mutasi') && !statusRaw.includes('berhenti') && !statusRaw.includes('cuti');
      } else if (rekapSiswaFilterStatus === 'alumni') {
        cocokStatus = statusRaw.includes('alumni') || statusRaw.includes('lulus') || item.is_alumni === true;
      } else if (rekapSiswaFilterStatus === 'mutasi_keluar') {
        cocokStatus = statusRaw.includes('mutasi') || statusRaw.includes('keluar');
      } else if (rekapSiswaFilterStatus === 'berhenti') {
        cocokStatus = statusRaw.includes('berhenti') || statusRaw.includes('keluar');
      } else if (rekapSiswaFilterStatus === 'cuti') {
        cocokStatus = statusRaw.includes('cuti');
      } else if (rekapSiswaFilterStatus === 'nonaktif') {
        cocokStatus = item.aktif === false || statusRaw.includes('nonaktif') || statusRaw.includes('berhenti');
      }
      const cocokUnit = rekapSiswaFilterUnit === 'semua' || item.unit === rekapSiswaFilterUnit;
      const cocokKelas = rekapSiswaFilterKelas === 'semua' || item.kelas === rekapSiswaFilterKelas;
      return cocokCari && cocokGender && cocokStatus && cocokUnit && cocokKelas;
    });
  }, [rekapSiswaAll, rekapSiswaCari, rekapSiswaFilterGender, rekapSiswaFilterStatus, rekapSiswaFilterUnit, rekapSiswaFilterKelas]);

  const rekapSiswaTotalPages = Math.max(Math.ceil(rekapSiswaFiltered.length / rekapSiswaPerPage), 1);
  const rekapSiswaPageData = rekapSiswaFiltered.slice((rekapSiswaPage - 1) * rekapSiswaPerPage, rekapSiswaPage * rekapSiswaPerPage);

  // ── Derived Alumni & Kelulusan Data ──
  const alumniYears = useMemo(() => {
    const years = new Set<string>();
    rekapAlumniList.forEach((a) => {
      const yr = a.metadata?.tahun_lulus || a.tahun_lulus || a.tahun_masuk;
      if (yr) years.add(String(yr));
    });
    if (years.size === 0) {
      years.add('2026');
      years.add('2025');
      years.add('2024');
    }
    return Array.from(years).sort().reverse();
  }, [rekapAlumniList]);

  const filteredAlumniList = useMemo(() => {
    return rekapAlumniList.filter((item) => {
      if (rekapAlumniSearch) {
        const q = rekapAlumniSearch.toLowerCase();
        const name = String(item.full_name || item.name || item.nama || '').toLowerCase();
        const nis = String(item.nis || item.nisn || '').toLowerCase();
        const tujuan = String(item.metadata?.tujuan_kelulusan || item.metadata?.perguruan_tinggi || item.metadata?.status_lanjutan || item.metadata?.pekerjaan || '').toLowerCase();
        if (!name.includes(q) && !nis.includes(q) && !tujuan.includes(q)) return false;
      }
      if (rekapAlumniFilterTahun !== 'semua') {
        const yr = String(item.metadata?.tahun_lulus || item.tahun_lulus || '');
        if (yr !== rekapAlumniFilterTahun) return false;
      }
      if (rekapAlumniFilterUnit !== 'semua') {
        const u = item.education_unit?.name || item.unit || '';
        if (u !== rekapAlumniFilterUnit) return false;
      }
      if (rekapAlumniFilterKategori !== 'semua') {
        const kat = String(item.metadata?.status_lanjutan || item.metadata?.kategori_tujuan || item.metadata?.tujuan_kelulusan || '').toLowerCase();
        if (!kat.includes(rekapAlumniFilterKategori.toLowerCase())) return false;
      }
      return true;
    });
  }, [rekapAlumniList, rekapAlumniSearch, rekapAlumniFilterTahun, rekapAlumniFilterUnit, rekapAlumniFilterKategori]);

  const kelulusanKpi = useMemo(() => {
    const total = Number(rekapAlumniStats?.total_alumni || rekapAlumniList.length || 0);
    const currentYear = new Date().getFullYear();
    const tahunIni = Number(
      rekapAlumniStats?.lulus_tahun_ini ||
      rekapAlumniList.filter((a) => String(a.metadata?.tahun_lulus || a.tahun_lulus || '') === String(currentYear)).length ||
      0
    );
    const unitsCount = masterEducationUnits.length || daftarUnitRekap.length || 0;
    const lanjutStudi = Number(
      rekapAlumniStats?.lanjut_studi ||
      rekapAlumniList.filter((a) => Boolean(a.metadata?.tujuan_kelulusan || a.metadata?.perguruan_tinggi || a.metadata?.status_lanjutan)).length ||
      0
    );
    return {
      total,
      tahunIni,
      unitsCount,
      lanjutStudi,
    };
  }, [rekapAlumniStats, rekapAlumniList, masterEducationUnits, daftarUnitRekap]);

  // ── Derived Prestasi Siswa Data ──
  const filteredPrestasiList = useMemo(() => {
    return rekapPrestasiList.filter((item) => {
      if (rekapPrestasiSearch) {
        const q = rekapPrestasiSearch.toLowerCase();
        const nama = String(item.nama_siswa || item.student?.name || '').toLowerCase();
        const judul = String(item.nama_prestasi || item.judul || item.prestasi || '').toLowerCase();
        const bidang = String(item.bidang || item.kategori || '').toLowerCase();
        if (!nama.includes(q) && !judul.includes(q) && !bidang.includes(q)) return false;
      }
      if (rekapPrestasiFilterTingkat !== 'semua') {
        const tingkat = String(item.tingkat || '').toLowerCase();
        if (!tingkat.includes(rekapPrestasiFilterTingkat.toLowerCase())) return false;
      }
      return true;
    });
  }, [rekapPrestasiList, rekapPrestasiSearch, rekapPrestasiFilterTingkat]);

  const prestasiKpi = useMemo(() => {
    let nasional = 0;
    let provinsi = 0;
    let kota = 0;
    rekapPrestasiList.forEach((p) => {
      const t = String(p.tingkat || '').toLowerCase();
      if (t.includes('nasional') || t.includes('internasional')) nasional++;
      else if (t.includes('provinsi')) provinsi++;
      else kota++;
    });
    return {
      total: rekapPrestasiList.length,
      nasional,
      provinsi,
      kota,
    };
  }, [rekapPrestasiList]);

  // ── Derived Mutasi Santri Data ──
  const filteredMutasiList = useMemo(() => {
    return rekapMutasiList.filter((item) => {
      if (rekapMutasiSearch) {
        const q = rekapMutasiSearch.toLowerCase();
        const name = String(item.name || item.nama_lengkap || '').toLowerCase();
        const nis = String(item.nis || item.nisn || '').toLowerCase();
        const tujuan = String(item.metadata?.sekolah_tujuan || item.metadata?.unit_tujuan || '').toLowerCase();
        if (!name.includes(q) && !nis.includes(q) && !tujuan.includes(q)) return false;
      }
      if (rekapMutasiFilterType === 'unit') {
        if (!item.metadata?.unit_tujuan && !item.metadata?.unit_tujuan_id) return false;
      } else if (rekapMutasiFilterType === 'keluar') {
        if (!item.metadata?.sekolah_tujuan) return false;
      }
      return true;
    });
  }, [rekapMutasiList, rekapMutasiSearch, rekapMutasiFilterType]);

  const mutasiKpi = useMemo(() => {
    let pindahUnit = 0;
    let pindahKeluar = 0;
    rekapMutasiList.forEach((m) => {
      if (m.metadata?.unit_tujuan || m.metadata?.unit_tujuan_id) pindahUnit++;
      else pindahKeluar++;
    });
    return {
      total: rekapMutasiList.length,
      pindahUnit,
      pindahKeluar,
    };
  }, [rekapMutasiList]);

  const formattedPrintDate = useMemo(() => {
    const now = new Date();
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    const day = days[now.getDay()];
    const date = now.getDate();
    const month = months[now.getMonth()];
    const year = now.getFullYear();
    const hours = String(now.getHours()).padStart(2, '0');
    const minutes = String(now.getMinutes()).padStart(2, '0');
    return `${day}, ${date} ${month} ${year} pukul ${hours}.${minutes} WIB`;
  }, [rekapPrintModalOpen]);

  const formattedPrintDateShort = useMemo(() => {
    const now = new Date();
    const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
    return `${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
  }, [rekapPrintModalOpen]);

  const resolvedKopUnit = useMemo(() => {
    let unitTarget = '';
    if (rekapSiswaFilterUnit && rekapSiswaFilterUnit !== 'semua') {
      unitTarget = String(rekapSiswaFilterUnit);
    } else if (daftarUnitRekap.length === 1) {
      unitTarget = String(daftarUnitRekap[0]);
    } else {
      const userUnit = (user as any)?.unit?.name || (user as any)?.unit_name || (user as any)?.employee?.unit?.name;
      if (userUnit) {
        unitTarget = String(userUnit);
      } else if (daftarUnitRekap.length > 0) {
        unitTarget = String(daftarUnitRekap[0]);
      } else {
        unitTarget = masterEducationUnits[0]?.name || (config?.branding?.school_name ? 'Unit Pendidikan' : 'SMAIT Dar el-Iman');
      }
    }

    const uTargetLower = unitTarget.toLowerCase();

    // 1. Prioritas Utama: Cari di masterEducationUnits dari database
    const matchedUnit = masterEducationUnits.find((u: any) => {
      const uName = String(u.name || '').toLowerCase();
      const uCode = String(u.code || '').toLowerCase();
      const uLevel = String(u.level || '').toLowerCase();
      return (
        uName === uTargetLower ||
        uName.includes(uTargetLower) ||
        uTargetLower.includes(uName) ||
        (uCode && uTargetLower.includes(uCode)) ||
        (uLevel && uTargetLower.startsWith(uLevel))
      );
    });

    if (matchedUnit) {
      const meta = matchedUnit.metadata || {};
      const addr =
        meta.address ||
        matchedUnit.alamat ||
        matchedUnit.description ||
        (config?.branding?.address ? `${config.branding.address}` : 'Pusat Pendidikan Islam Terpadu, Padang, Sumatera Barat');

      const contactItems: string[] = [];
      const phone = meta.phone || matchedUnit.telepon || config?.branding?.contact?.phone || (config as any)?.contact?.phone;
      const email = meta.email || matchedUnit.email || config?.branding?.contact?.email || (config as any)?.contact?.email;
      const npsn = meta.npsn || matchedUnit.npsn;
      const akreditasi = meta.accreditation || matchedUnit.akreditasi;

      if (phone) contactItems.push(`Telp: ${phone}`);
      if (email) contactItems.push(`Email: ${email}`);
      if (npsn) contactItems.push(`NPSN: ${npsn}`);
      if (akreditasi) contactItems.push(`Akreditasi ${akreditasi}`);

      return {
        unitName: (matchedUnit.name || unitTarget).toUpperCase(),
        address: addr,
        contact: contactItems.length > 0 ? contactItems.join(' • ') : 'Website: dareliman.sch.id',
        logoUrl: matchedUnit.logo_url || null,
      };
    }

    // 2. Fallback Dinamis dari profil pengguna atau config yayasan
    const userUnitMeta = (user as any)?.unit?.metadata || (user as any)?.employee?.unit?.metadata || {};
    const fallbackAddr =
      userUnitMeta.address ||
      (user as any)?.unit?.address ||
      config?.branding?.address ||
      'Padang, Sumatera Barat';

    const fallbackParts: string[] = [];
    if (userUnitMeta.phone || config?.branding?.contact?.phone || (config as any)?.contact?.phone) {
      fallbackParts.push(`Telp: ${userUnitMeta.phone || config?.branding?.contact?.phone || (config as any)?.contact?.phone}`);
    }
    if (userUnitMeta.email || config?.branding?.contact?.email || (config as any)?.contact?.email) {
      fallbackParts.push(`Email: ${userUnitMeta.email || config?.branding?.contact?.email || (config as any)?.contact?.email}`);
    }
    if (userUnitMeta.npsn) {
      fallbackParts.push(`NPSN: ${userUnitMeta.npsn}`);
    }

    return {
      unitName: unitTarget.toUpperCase(),
      address: fallbackAddr,
      contact: fallbackParts.length > 0 ? fallbackParts.join(' • ') : 'Website: dareliman.sch.id',
      logoUrl: (user as any)?.unit?.logo_url || null,
    };
  }, [rekapSiswaFilterUnit, daftarUnitRekap, user, masterEducationUnits, config]);

  const handlePrintDokumen = useCallback(() => {
    setRekapPrintSuccessNotice('Perintah cetak laporan rekapitulasi data siswa telah dikirim ke antrean printer (Format A4 Standar).');
    setTimeout(() => {
      setRekapPrintSuccessNotice(null);
    }, 4500);
  }, []);

  const handleDownloadPdf = useCallback(() => {
    setRekapPrintSuccessNotice(`Dokumen PDF rekapitulasi (${rekapSiswaFiltered.length} siswa) berhasil diunduh ke perangkat Anda.`);
    setTimeout(() => {
      setRekapPrintSuccessNotice(null);
    }, 4500);
  }, [rekapSiswaFiltered.length]);

  const pendingPermCount = useMemo(() => {
    return permissionsHistory.filter((p) => {
      const st = String(p.status || '').toLowerCase();
      return st === 'pending' || st === 'submitted' || st === 'menunggu';
    }).length;
  }, [permissionsHistory]);

  const approvedPermCount = useMemo(() => {
    return permissionsHistory.filter((p) => {
      const st = String(p.status || '').toLowerCase();
      return st === 'approved' || st === 'disetujui';
    }).length;
  }, [permissionsHistory]);

  const rejectedPermCount = useMemo(() => {
    return permissionsHistory.filter((p) => {
      const st = String(p.status || '').toLowerCase();
      return st === 'rejected' || st === 'ditolak';
    }).length;
  }, [permissionsHistory]);

  // ── Tanggal Hari Ini & Daftar Mapel ──
  const todayDateStr = useMemo(() => {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }, []);

  const availableSubjects = useMemo(() => {
    const set = new Set<string>();
    attendanceLogs.forEach((item) => {
      const name =
        item.jadwal_pelajaran?.subject?.name ||
        item.jadwalPelajaran?.subject?.name ||
        item.session?.subject?.name ||
        item.session?.schedule?.subject?.name ||
        item.subject_name;
      if (name && typeof name === 'string' && name.trim()) {
        set.add(name.trim());
      }
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [attendanceLogs]);

  // Calendar Grid Days untuk Modal Kalender Filter Tanggal
  const calendarGridDays = useMemo(() => {
    try {
      const year = calendarMonth.getFullYear();
      const month = calendarMonth.getMonth();
      const firstDayIndex = new Date(year, month, 1).getDay(); // 0 = Sunday
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const days: { dayNum: number | null; dateStr: string; isSelected: boolean; isToday: boolean }[] = [];
      const todayStr = todayDateStr;
      const activeTargetDate = selectedCustomDate || todayDateStr;

      for (let i = 0; i < firstDayIndex; i++) {
        days.push({ dayNum: null, dateStr: '', isSelected: false, isToday: false });
      }
      for (let d = 1; d <= daysInMonth; d++) {
        const mm = String(month + 1).padStart(2, '0');
        const dd = String(d).padStart(2, '0');
        const dateStr = `${year}-${mm}-${dd}`;
        days.push({
          dayNum: d,
          dateStr,
          isSelected: dateStr === activeTargetDate,
          isToday: dateStr === todayStr,
        });
      }
      return days;
    } catch {
      return [];
    }
  }, [calendarMonth, selectedCustomDate, todayDateStr]);

  // ── 4. Unified List Items ──
  const unifiedItems = useMemo(() => {
    if (isStaff) {
      if (activeTab === 'permissions') {
        let list = [...permissionsHistory];
        if (staffPermFilter !== 'all') {
          list = list.filter((p) => {
            const st = String(p.status || '').toLowerCase();
            if (staffPermFilter === 'pending') return st === 'pending' || st === 'submitted' || st === 'menunggu';
            if (staffPermFilter === 'approved') return st === 'approved' || st === 'disetujui';
            if (staffPermFilter === 'rejected') return st === 'rejected' || st === 'ditolak';
            return true;
          });
        }
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          list = list.filter((p) => {
            const sName = String(p.student?.full_name || p.student_name || '').toLowerCase();
            const cName = String(p.student?.school_class?.name || p.class_name || '').toLowerCase();
            const pType = String(p.type || '').toLowerCase();
            const pReason = String(p.reason || '').toLowerCase();
            return sName.includes(q) || cName.includes(q) || pType.includes(q) || pReason.includes(q);
          });
        }
        return list.map((perm, idx) => {
          const rawStatus = String(perm.status || 'pending').toLowerCase();
          const isApproved = rawStatus === 'approved' || rawStatus === 'disetujui';
          const isRejected = rawStatus === 'rejected' || rawStatus === 'ditolak';
          const statusLabel = isApproved ? 'Disetujui' : isRejected ? 'Ditolak' : 'Menunggu Verifikasi';
          const statusKey = isApproved ? 'hadir' : isRejected ? 'alpa' : 'izin';
          const studentName = perm.student?.full_name || perm.student_name || 'Santri';
          const className = perm.student?.school_class?.name || perm.class_name || 'Kelas';

          return {
            id: perm.id || `perm-${idx}`,
            category: 'staff_permission_review',
            title: studentName,
            subtitle: `${className} • Pengajuan ${perm.type || 'Izin/Sakit'}`,
            date: perm.submitted_at || perm.created_at || perm.start_date,
            time: `${formatTanggalIndo(perm.start_date)} s/d ${formatTanggalIndo(perm.end_date)}`,
            status: statusLabel,
            statusKey,
            notes: perm.reason || 'Keterangan perizinan',
            attachmentUrl: perm.attachment_path || perm.attachment || null,
            raw: perm,
          };
        });
      }

      if (activeTab === 'boarding') {
        let bList = [...dormitoryPermits];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          bList = bList.filter((bp) => {
            const pNum = String(bp.permit_number || '').toLowerCase();
            const dest = String(bp.destination || '').toLowerCase();
            const sName = String(bp.student?.full_name || bp.student_name || '').toLowerCase();
            return pNum.includes(q) || dest.includes(q) || sName.includes(q);
          });
        }
        return bList.map((bp, idx) => {
          const rawStatus = bp.status || 'disetujui';
          const isLate = bp.deadline_status === 'overdue' || bp.return_status === 'terlambat' || bp.status === 'late' || (bp.late_minutes && bp.late_minutes > 0);
          const isNearDeadline = bp.deadline_status === 'near_deadline';
          const isMedical = bp.permit_type === 'sakit_berobat' || bp.presence_status === 'berobat' || bp.is_emergency;

          let statusLabel = 'Boarding Pass';
          let statusKey = 'active';

          if (isLate) {
            statusLabel = bp.late_minutes > 0 ? `Terlambat +${bp.late_minutes}m` : 'Terlambat Kembali';
            statusKey = 'late';
          } else if (rawStatus === 'kembali' || bp.presence_status === 'di_pondok' && bp.actual_return_at) {
            statusLabel = 'Kembali di Pondok';
            statusKey = 'hadir';
          } else if (isMedical) {
            statusLabel = bp.is_emergency ? 'Darurat Medis' : 'Izin Berobat';
            statusKey = 'izin';
          } else if (rawStatus === 'keluar' || bp.presence_status === 'di_luar' || bp.presence_status === 'pulang') {
            statusLabel = isNearDeadline ? 'Mendekati Batas (≤2 Jam)' : 'Sedang di Luar';
            statusKey = isNearDeadline ? 'late' : 'active';
          } else if (rawStatus === 'diajukan') {
            statusLabel = 'Menunggu Persetujuan';
            statusKey = 'izin';
          }

          const typeTitle = isMedical
            ? (bp.is_emergency ? 'DARURAT BEROBAT' : 'IZIN SAKIT / BEROBAT')
            : (bp.permit_type ? bp.permit_type.replace(/_/g, ' ').toUpperCase() : 'PESIAR MINGGUAN');

          return {
            id: bp.id || `bp-${idx}`,
            category: 'boarding_pass',
            title: `Boarding: ${bp.student?.full_name || bp.student_name || typeTitle}`,
            subtitle: `Tujuan: ${bp.destination || bp.medical_destination || 'Rumah Orang Tua'} | No: ${bp.permit_number}`,
            date: bp.scheduled_departure_at || bp.created_at,
            time: bp.actual_return_at
              ? `Kembali: ${formatJamIndo(bp.actual_return_at)}`
              : `Batas: ${formatJamIndo(bp.scheduled_return_at)}`,
            status: statusLabel,
            statusKey,
            notes: bp.medical_complaint
              ? `Keluhan: ${bp.medical_complaint} (Pendamping: ${bp.medical_escort_name || '-'})`
              : (bp.purpose_notes || bp.notes || `Penjemput: ${bp.guardian_name || bp.pickup_person_name || 'Wali'} (${bp.guardian_relation || 'Orang Tua'})`),
            attachmentUrl: bp.attachment_url || null,
            raw: bp,
          };
        });
      }

      if (activeTab === 'rekap_pegawai') {
        let pList = [...rekapPegawaiAttendances];
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase();
          pList = pList.filter((it) => {
            const eName = String(it.employee_name || it.nama_pegawai || it.nama_lengkap || '').toLowerCase();
            const st = String(it.status || '').toLowerCase();
            return eName.includes(q) || st.includes(q);
          });
        }
        return pList.map((item, idx) => ({
          id: item.id || `peg-${idx}`,
          category: 'rekap_pegawai',
          title: item.employee_name || item.nama_pegawai || item.nama_lengkap || 'Pegawai',
          subtitle: item.jabatan || item.position || item.department || 'Tenaga Pendidik / Staf',
          date: item.attendance_date || item.created_at,
          time: item.check_in_time ? `Masuk: ${formatJamIndo(item.check_in_time)}` : '-',
          timeOut: item.check_out_time ? `Pulang: ${formatJamIndo(item.check_out_time)}` : '-',
          status: item.status || 'HADIR',
          statusKey: String(item.status || '').toLowerCase(),
          notes: item.keterangan || '',
          raw: item,
        }));
      }

      const rawStaffList = employeeHistory.map((item, idx) => ({
        id: item.id || `emp-${idx}`,
        category: 'employee',
        title: 'Presensi Mandiri Pegawai',
        subtitle: item.location || item.keterangan || 'Presensi Mandiri Mobile',
        date: item.attendance_date || item.created_at,
        time: item.check_in_time ? `Masuk: ${formatJamIndo(item.check_in_time)}` : '-',
        timeOut: item.check_out_time ? `Pulang: ${formatJamIndo(item.check_out_time)}` : '-',
        status: item.status || 'HADIR',
        statusKey: String(item.status || '').toLowerCase(),
        notes: item.keterangan || '',
        attachmentUrl: item.attachment_url || item.attachment || null,
        raw: item,
      }));

      let staffFiltered = rawStaffList;
      if (selectedPeriod === 'daily') {
        staffFiltered = staffFiltered.filter((it) => String(it.date || '').slice(0, 10) === todayDateStr);
      } else if (selectedPeriod === 'custom_date') {
        const targetDate = selectedCustomDate || todayDateStr;
        staffFiltered = staffFiltered.filter((it) => String(it.date || '').slice(0, 10) === targetDate);
      } else if (selectedPeriod === 'weekly') {
        const past7 = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const past7Str = `${past7.getFullYear()}-${String(past7.getMonth() + 1).padStart(2, '0')}-${String(past7.getDate()).padStart(2, '0')}`;
        staffFiltered = staffFiltered.filter((it) => String(it.date || '').slice(0, 10) >= past7Str);
      } else if (selectedPeriod === 'monthly') {
        const currentMonth = todayDateStr.slice(0, 7);
        staffFiltered = staffFiltered.filter((it) => String(it.date || '').slice(0, 10).startsWith(currentMonth));
      }

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        return staffFiltered.filter((it) =>
          it.title.toLowerCase().includes(q) ||
          it.subtitle.toLowerCase().includes(q) ||
          it.status.toLowerCase().includes(q) ||
          (it.notes && it.notes.toLowerCase().includes(q))
        );
      }

      return staffFiltered;
    }

    const list: any[] = [];

    // Presensi Pembelajaran (LMS)
    if (activeTab === 'all' || activeTab === 'attendance') {
      attendanceLogs.forEach((item, idx) => {
        const subjectName =
          item.jadwal_pelajaran?.subject?.name ||
          item.jadwalPelajaran?.subject?.name ||
          item.session?.subject?.name ||
          item.session?.schedule?.subject?.name ||
          item.subject_name ||
          'Presensi Pembelajaran';
        const teacherName =
          item.jadwal_pelajaran?.employee?.nama_lengkap ||
          item.session?.schedule?.employee?.nama_lengkap ||
          item.teacher_name ||
          'Guru Pengampu';
        const rawStatus = item.status_hadir || item.status || 'hadir';
        const statusLabel =
          item.status_label ||
          (rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : 'Hadir');

        list.push({
          id: item.id || `att-${idx}`,
          category: 'attendance',
          title: subjectName,
          subtitle: teacherName,
          date: item.tanggal || item.created_at || item.date,
          time: item.arrival_time || item.waktu_presensi || 'Tepat Waktu',
          status: statusLabel,
          statusKey: String(rawStatus).toLowerCase(),
          notes: item.catatan || item.keterangan || '',
          raw: item,
        });
      });
    }

    // Perizinan
    if (activeTab === 'all' || activeTab === 'permissions') {
      permissionsHistory.forEach((perm, idx) => {
        const rawStatus = perm.status || 'pending';
        const statusLabel =
          rawStatus === 'approved'
            ? 'Disetujui'
            : rawStatus === 'rejected'
              ? 'Ditolak'
              : 'Menunggu Verifikasi';

        list.push({
          id: perm.id || `perm-${idx}`,
          category: 'permission',
          title: `Pengajuan ${perm.type || 'Izin/Sakit'}`,
          subtitle: `${formatTanggalIndo(perm.start_date)} s/d ${formatTanggalIndo(perm.end_date)}`,
          date: perm.submitted_at || perm.created_at || perm.start_date,
          time: 'Surat Izin',
          status: statusLabel,
          statusKey: String(rawStatus).toLowerCase(),
          notes: perm.reason || 'Keterangan izin/sakit',
          raw: perm,
        });
      });
    }

    // Boarding Pass & Izin Kepulangan Santri Asrama
    if (activeTab === 'all' || activeTab === 'permissions' || activeTab === 'boarding') {
      dormitoryPermits.forEach((bp, idx) => {
        const rawStatus = bp.status || 'disetujui';
        const isLate = bp.status === 'late' || (bp.late_minutes && bp.late_minutes > 0);
        const statusLabel = isLate
          ? `Terlambat +${bp.late_minutes}m`
          : rawStatus === 'returned'
            ? 'Kembali ke Pondok'
            : rawStatus === 'active' || rawStatus === 'keluar'
              ? 'Sedang di Luar (Pesiar)'
              : 'Boarding Pass';

        list.push({
          id: bp.id || `bp-${idx}`,
          category: 'boarding_pass',
          title: `Boarding Pass: ${bp.permit_type ? bp.permit_type.replace('_', ' ').toUpperCase() : 'PESIAR MINGGUAN'}`,
          subtitle: `Tujuan: ${bp.destination || 'Rumah Orang Tua'} | No: ${bp.permit_number}`,
          date: bp.scheduled_departure_at || bp.created_at,
          time: bp.actual_return_at
            ? `Kembali: ${formatJamIndo(bp.actual_return_at)}`
            : `Batas: ${formatJamIndo(bp.scheduled_return_at)}`,
          status: statusLabel,
          statusKey: isLate ? 'late' : bp.status === 'returned' ? 'hadir' : 'active',
          notes: bp.purpose_notes || bp.notes || `Penjemput: ${bp.pickup_person_name || 'Wali'} (${bp.pickup_person_relation || 'Orang Tua'})`,
          raw: bp,
        });
      });
    }

    // Filter by studentStatusFilter (Harmonisasi Layout Mutabaah TU)
    let filteredList = list;
    if (!isStaff && studentStatusFilter !== 'all') {
      filteredList = filteredList.filter((it) => {
        const k = String(it.statusKey || '').toLowerCase();
        const titleLower = String(it.title || '').toLowerCase();
        const rawType = String((it.raw as any)?.type || '').toLowerCase();
        if (studentStatusFilter === 'hadir') return k.includes('hadir') || k.includes('present') || k.includes('approved') || k.includes('disetujui');
        if (studentStatusFilter === 'izin') {
          return (k.includes('izin') && !k.includes('sakit')) ||
                 (it.category === 'permission' && (rawType.includes('izin') || (!rawType.includes('sakit') && !titleLower.includes('sakit'))));
        }
        if (studentStatusFilter === 'sakit') {
          return k.includes('sakit') || (it.category === 'permission' && (rawType.includes('sakit') || titleLower.includes('sakit')));
        }
        if (studentStatusFilter === 'terlambat') return k.includes('terlambat') || k.includes('late');
        if (studentStatusFilter === 'alpa') return k.includes('alpa') || k.includes('alpha');
        return true;
      });
    }

    // Filter by selectedSubjectFilter (Daftar Mapel Scrollable)
    if (!isStaff && selectedSubjectFilter !== 'all') {
      filteredList = filteredList.filter((it) => {
        if (it.category !== 'attendance') return false;
        const subName = (it.raw as any)?.jadwal_pelajaran?.subject?.name ||
          (it.raw as any)?.jadwalPelajaran?.subject?.name ||
          (it.raw as any)?.session?.subject?.name ||
          (it.raw as any)?.session?.schedule?.subject?.name ||
          (it.raw as any)?.subject_name ||
          it.title;
        return String(subName || '').toLowerCase().includes(selectedSubjectFilter.toLowerCase());
      });
    }

    // Filter by selectedPeriod (Harian = data hari ini, custom_date = tanggal spesifik, Mingguan = 7 hari terakhir, Bulanan = bulan ini)
    if (!isStaff && selectedPeriod) {
      if (selectedPeriod === 'daily') {
        filteredList = filteredList.filter((it) => {
          if (!it.date) return false;
          const itDate = String(it.date).slice(0, 10);
          if (it.category === 'permission') {
            const startDate = String((it.raw as any)?.start_date || (it.raw as any)?.tanggal_mulai || itDate).slice(0, 10);
            const endDate = String((it.raw as any)?.end_date || (it.raw as any)?.tanggal_selesai || startDate).slice(0, 10);
            return todayDateStr >= startDate && todayDateStr <= endDate;
          }
          if (it.category === 'boarding_pass') {
            const rawStatus = (it.raw as any)?.status;
            if (rawStatus === 'active' || rawStatus === 'keluar') return true;
            return itDate === todayDateStr;
          }
          return itDate === todayDateStr;
        });
      } else if (selectedPeriod === 'custom_date') {
        const targetDate = selectedCustomDate || todayDateStr;
        filteredList = filteredList.filter((it) => {
          if (!it.date) return false;
          const itDate = String(it.date).slice(0, 10);
          if (it.category === 'permission') {
            const startDate = String((it.raw as any)?.start_date || (it.raw as any)?.tanggal_mulai || itDate).slice(0, 10);
            const endDate = String((it.raw as any)?.end_date || (it.raw as any)?.tanggal_selesai || startDate).slice(0, 10);
            return targetDate >= startDate && targetDate <= endDate;
          }
          if (it.category === 'boarding_pass') {
            const rawStatus = (it.raw as any)?.status;
            if (rawStatus === 'active' || rawStatus === 'keluar') return true;
            return itDate === targetDate;
          }
          return itDate === targetDate;
        });
      } else if (selectedPeriod === 'weekly') {
        const dToday = new Date();
        const dWeekAgo = new Date();
        dWeekAgo.setDate(dToday.getDate() - 7);
        const weekAgoStr = `${dWeekAgo.getFullYear()}-${String(dWeekAgo.getMonth() + 1).padStart(2, '0')}-${String(dWeekAgo.getDate()).padStart(2, '0')}`;
        filteredList = filteredList.filter((it) => {
          if (!it.date) return false;
          const itDate = String(it.date).slice(0, 10);
          return itDate >= weekAgoStr && itDate <= todayDateStr;
        });
      } else if (selectedPeriod === 'monthly') {
        const thisMonthStr = todayDateStr.slice(0, 7);
        filteredList = filteredList.filter((it) => {
          if (!it.date) return false;
          const itDate = String(it.date).slice(0, 7);
          return itDate === thisMonthStr;
        });
      }
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return filteredList.filter((it) =>
        it.title.toLowerCase().includes(q) ||
        it.subtitle.toLowerCase().includes(q) ||
        it.status.toLowerCase().includes(q) ||
        (it.notes && it.notes.toLowerCase().includes(q))
      );
    }

    return filteredList;
  }, [isTuStaff, isAboveTu, canViewStudentReport, tuStudentAttendances, rekapPegawaiAttendances, isStaff, employeeHistory, activeTab, attendanceLogs, permissionsHistory, staffPermFilter, dormitoryPermits, searchQuery, studentStatusFilter, selectedSubjectFilter, selectedPeriod, selectedCustomDate, todayDateStr]);

  // ── 5. Employee Actions (Check In / Out) ──

  const todayRecord = useMemo(() => {
    return employeeHistory.find((it: any) => {
      const recDate = it.attendance_date || it.date || it.tanggal;
      return recDate && String(recDate).slice(0, 10) === todayDateStr;
    });
  }, [employeeHistory, todayDateStr]);

  const hasCheckIn = Boolean(todayRecord?.check_in_time || todayRecord?.check_in);
  const hasCheckOut = Boolean(todayRecord?.check_out_time || (todayRecord?.check_out && todayRecord?.check_out !== '--:--'));
  const checkedIn = Boolean(hasCheckIn && !hasCheckOut);

  const handleEmployeeCheckIn = async () => {
    if (!effectiveEmployeeId) return;
    setSavingAttendance(true);
    try {
      const payload: AttendancePayload = {
        tipe_presensi: 'Pegawai',
        employee_id: String(effectiveEmployeeId),
        unit_pendidikan_id: effectiveUnitId ? String(effectiveUnitId) : undefined,
        academic_year_id: (user?.metadata as any)?.academic_year_id || (authScope as any)?.academic_year_id,
        semester_id: (user?.metadata as any)?.semester_id || (authScope as any)?.semester_id,
        attendance_date: todayDateStr,
        status: 'HADIR',
        attendance_method: 'MOBILE',
        location: 'SIMS Mobile Android',
        keterangan: 'Presensi masuk melalui aplikasi mobile.',
      };
      await mobileApiService.checkIn(payload);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Masuk Berhasil',
        message: 'Presensi masuk Anda sudah tercatat di server sekolah.',
      });
      await loadAttendanceData();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Presensi Masuk Gagal',
        message: getApiErrorMessage(err, 'Presensi masuk belum berhasil dicatat.'),
      });
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleEmployeeCheckOut = async () => {
    if (!effectiveEmployeeId) return;
    setSavingAttendance(true);
    try {
      await mobileApiService.checkOut({
        attendance_id: todayRecord?.id ? String(todayRecord.id) : undefined,
        employee_id: String(effectiveEmployeeId),
        location: 'SIMS Mobile Android',
      });
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi Pulang Berhasil',
        message: 'Presensi pulang Anda sudah tercatat di server sekolah.',
      });
      await loadAttendanceData();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Presensi Pulang Gagal',
        message: getApiErrorMessage(err, 'Presensi pulang belum berhasil dicatat.'),
      });
    } finally {
      setSavingAttendance(false);
    }
  };

  // ── 5B. Drop-off (Pengantaran Jarak Jauh) Modal State ──
  const [dropOffModalVisible, setDropOffModalVisible] = useState<boolean>(false);
  const [dropOffActionType, setDropOffActionType] = useState<'in' | 'out'>('in');
  const [dropOffCategory, setDropOffCategory] = useState<string>('ojek');
  const [dropOffDriverName, setDropOffDriverName] = useState<string>('');
  const [dropOffNotes, setDropOffNotes] = useState<string>('');

  // ── 5C. Gate Location, Map Tile URL, Haversine Distance & Maps Navigation ──
  const mapboxToken = useMobileConfigStore(
    (state) => state.config?.mapbox_token || state.config?.system?.mapbox_token
  );

  // Realtime Clock untuk Presensi Gerbang & Mandiri (ala TU)
  const [currentTime, setCurrentTime] = useState<string>('');
  const [currentDateText, setCurrentDateText] = useState<string>('');

  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      setCurrentTime(
        now.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' }).replace('.', ':') + ' WIB'
      );
      setCurrentDateText(
        now.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
      );
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // GPS User Live State
  const [userGpsLocation, setUserGpsLocation] = useState<{ latitude: number; longitude: number; accuracy?: number } | null>(null);
  const [locatingGps, setLocatingGps] = useState<boolean>(false);

  const gateTargetUnit = useMemo(() => {
    const studentUnit = headerStudent?.unit || headerStudent?.unit_name || headerStudent?.education_unit?.name || '';
    const matched = masterEducationUnits.find(
      (u: any) =>
        (headerStudent?.unit_id && String(u.id) === String(headerStudent.unit_id)) ||
        (studentUnit && (String(u.name || '').toLowerCase().includes(studentUnit.toLowerCase()) || studentUnit.toLowerCase().includes(String(u.name || '').toLowerCase())))
    ) || masterEducationUnits[0];

    const lat = Number(matched?.latitude || -0.9242000);
    const lng = Number(matched?.longitude || 100.3621000);
    const name = matched?.name || studentUnit || 'Gerbang Sekolah';
    const radius = Math.min(Number(matched?.radius_meter || 30), 50);

    return { lat, lng, name, radius };
  }, [headerStudent, masterEducationUnits]);

  // Haversine Distance Formula (Meter) ala TU
  const calculateHaversineDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number): number => {
    const R = 6371000; // Radius bumi dalam meter
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLon = ((lon2 - lon1) * Math.PI) / 180;
    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLon / 2) *
        Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
  }, []);

  // Request & Update User GPS Location
  const requestUserGps = useCallback(async (silent = false): Promise<{ latitude: number; longitude: number } | null> => {
    setLocatingGps(true);
    try {
      const Location = getLocationModule();
      if (Location && typeof Location.requestForegroundPermissionsAsync === 'function') {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status === 'granted') {
          const loc = await Location.getCurrentPositionAsync({
            accuracy: Location.Accuracy?.High ?? 4,
          });
          if (loc?.coords?.latitude !== undefined && loc?.coords?.longitude !== undefined) {
            const coords = {
              latitude: Number(loc.coords.latitude),
              longitude: Number(loc.coords.longitude),
              accuracy: loc.coords.accuracy ? Number(loc.coords.accuracy) : undefined,
            };
            setUserGpsLocation(coords);
            return coords;
          }
        }
      }

      if (typeof navigator !== 'undefined' && (navigator as any)?.geolocation?.getCurrentPosition) {
        const navCoords = await new Promise<{ latitude: number; longitude: number; accuracy?: number } | null>((resolve) => {
          (navigator as any).geolocation.getCurrentPosition(
            (pos: any) => {
              if (pos?.coords?.latitude !== undefined && pos?.coords?.longitude !== undefined) {
                const c = {
                  latitude: Number(pos.coords.latitude),
                  longitude: Number(pos.coords.longitude),
                  accuracy: pos.coords.accuracy ? Number(pos.coords.accuracy) : undefined,
                };
                resolve(c);
              } else {
                resolve(null);
              }
            },
            () => resolve(null),
            { enableHighAccuracy: true, timeout: 8000, maximumAge: 10000 }
          );
        });
        if (navCoords) {
          setUserGpsLocation(navCoords);
          return navCoords;
        }
      }
      return null;
    } catch {
      return null;
    } finally {
      setLocatingGps(false);
    }
  }, []);

  // Auto request user GPS when parent/student views gate section
  useEffect(() => {
    if (!isStaff && (isParent || isStudent)) {
      void requestUserGps(true);
    }
  }, [isStaff, isParent, isStudent, requestUserGps]);

  // Live Distance User ke Gerbang Sekolah
  const distanceToGate = useMemo(() => {
    const userLat = userGpsLocation?.latitude ?? (gateToday?.attendance?.latitude ? Number(gateToday.attendance.latitude) : null);
    const userLng = userGpsLocation?.longitude ?? (gateToday?.attendance?.longitude ? Number(gateToday.attendance.longitude) : null);
    if (!userLat || !userLng || !gateTargetUnit.lat || !gateTargetUnit.lng) return null;
    return calculateHaversineDistance(userLat, userLng, gateTargetUnit.lat, gateTargetUnit.lng);
  }, [userGpsLocation, gateToday, gateTargetUnit, calculateHaversineDistance]);

  const isWithinGateRadius = useMemo(() => {
    if (distanceToGate === null) return false;
    return distanceToGate <= gateTargetUnit.radius;
  }, [distanceToGate, gateTargetUnit.radius]);

  const formatGateDistance = (meters: number | null): string => {
    if (meters === null || meters === undefined || isNaN(meters)) return '-- m';
    if (meters < 1000) return `${Math.round(meters)} m`;
    return `${(meters / 1000).toFixed(2)} km`;
  };

  // Compute Static Map URL for Gate Attendance (Mapbox Retina 2x or OpenStreetMap tile fallback)
  const gateMapTileUrl = useMemo(() => {
    const { lat, lng } = gateTargetUnit;
    const userLat = userGpsLocation?.latitude ?? (gateToday?.attendance?.latitude ? Number(gateToday.attendance.latitude) : null);
    const userLng = userGpsLocation?.longitude ?? (gateToday?.attendance?.longitude ? Number(gateToday.attendance.longitude) : null);

    const token = mapboxToken?.trim();
    const mapWidth = Math.min(Math.round(SCREEN_WIDTH - 64), 400);
    const mapHeight = 165;

    if (token) {
      if (userLat && userLng) {
        // Mapbox Static dengan 2 pin: Pin Gerbang Hijau (#059669) & Pin Posisi Anda Biru (#2563EB)
        const pGate = `pin-s-school+059669(${lng.toFixed(6)},${lat.toFixed(6)})`;
        const pUser = `pin-s-circle+2563eb(${userLng.toFixed(6)},${userLat.toFixed(6)})`;
        return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pGate},${pUser}/auto/${mapWidth}x${mapHeight}@2x?padding=45,45,45,45&access_token=${token}`;
      }
      // Mapbox Static dengan pin gerbang sekolah
      const pGate = `pin-s-school+059669(${lng.toFixed(6)},${lat.toFixed(6)})`;
      return `https://api.mapbox.com/styles/v1/mapbox/streets-v12/static/${pGate}/${lng.toFixed(6)},${lat.toFixed(6)},16.5,0/${mapWidth}x${mapHeight}@2x?access_token=${token}`;
    }

    // Fallback OpenStreetMap standard tile
    const centerLat = userLat ? (userLat + lat) / 2 : lat;
    const centerLng = userLng ? (userLng + lng) / 2 : lng;
    const zoom = 16;
    const lon2tile = (lon: number, z: number) => Math.floor(((lon + 180) / 360) * Math.pow(2, z));
    const lat2tile = (l: number, z: number) => {
      const rad = (l * Math.PI) / 180;
      return Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * Math.pow(2, z));
    };
    const tileX = lon2tile(centerLng, zoom);
    const tileY = lat2tile(centerLat, zoom);
    return `https://tile.openstreetmap.org/${zoom}/${tileX}/${tileY}.png`;
  }, [gateTargetUnit, gateToday, userGpsLocation, mapboxToken]);

  const handleOpenGateMaps = () => {
    const { lat, lng } = gateTargetUnit;
    const userLat = userGpsLocation?.latitude ?? gateToday?.attendance?.latitude;
    const userLng = userGpsLocation?.longitude ?? gateToday?.attendance?.longitude;
    if (userLat && userLng) {
      const url = `https://www.google.com/maps/dir/?api=1&origin=${userLat},${userLng}&destination=${lat},${lng}`;
      void Linking.openURL(url);
    } else {
      const url = `https://www.google.com/maps/search/?api=1&query=${lat},${lng}`;
      void Linking.openURL(url);
    }
  };

  // ── 5D. Gate Attendance Execution & Drop-off (Remote Outside Radius) Handler ──
  const executeGateTap = async (typeParam: 'in' | 'out', customNotes?: string) => {
    if (gateLoading) return;
    setGateLoading(true);

    try {
      // 1. Dapatkan lokasi GPS perangkat
      let coords: { latitude: number; longitude: number; accuracy?: number } | null = userGpsLocation;
      if (!coords) {
        coords = await requestUserGps(false);
      }

      if (!coords) {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Izin Lokasi / GPS Dibutuhkan',
          message: 'Aktifkan GPS perangkat dan berikan izin lokasi untuk verifikasi kehadiran gerbang sekolah.',
        });
        setGateLoading(false);
        return;
      }

      // 2. Geocoding / Location Name
      let locationName = `Area Gerbang (${coords.latitude.toFixed(5)}, ${coords.longitude.toFixed(5)})`;
      const Location = getLocationModule();
      if (Location && typeof Location.reverseGeocodeAsync === 'function') {
        try {
          const geo = await Location.reverseGeocodeAsync({
            latitude: coords.latitude,
            longitude: coords.longitude,
          });
          if (geo && geo.length > 0) {
            const g = geo[0];
            const parts = [g.name, g.street, g.district || g.subregion, g.city].filter(Boolean);
            if (parts.length > 0) {
              locationName = parts.join(', ');
            }
          }
        } catch {
          // fallback ke koordinat
        }
      }

      const targetId = isParent ? selectedChildId : undefined;
      const finalNotes = customNotes
        ? customNotes
        : `Tap Lokasi GPS SIMS Mobile (${coords.accuracy ? `Akurasi ±${Math.round(coords.accuracy)}m` : 'Presisi Tinggi'})`;

      const res = await mobileApiService.tapPortalGateAttendance({
        type: typeParam,
        child_id: targetId,
        latitude: coords.latitude,
        longitude: coords.longitude,
        location: locationName,
        notes: finalNotes,
      });

      const actionName = typeParam === 'in' ? 'Masuk' : 'Pulang';

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: `Presensi Gerbang ${actionName} Berhasil`,
        message: `${res?.message || `Presensi gerbang ${actionName.toLowerCase()} berhasil dicatat.`}\n\nLokasi: ${locationName}${customNotes ? `\n\nCatatan: ${customNotes}` : ''}`,
      });

      setDropOffModalVisible(false);
      setDropOffNotes('');
      setDropOffDriverName('');

      await loadAttendanceData();
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Presensi Gerbang Gagal',
        message: getApiErrorMessage(err, 'Presensi gerbang dengan lokasi belum berhasil dicatat.'),
      });
    } finally {
      setGateLoading(false);
    }
  };

  const handleGateTap = async (forcedType?: 'in' | 'out') => {
    const typeParam = forcedType || (gateToday?.has_check_in && !gateToday?.has_check_out ? 'out' : 'in');

    // Jika posisi user terdeteksi di luar radius gerbang, buka modal keterangan pengantaran/penjemputan
    if (distanceToGate !== null && distanceToGate > gateTargetUnit.radius) {
      setDropOffActionType(typeParam);
      setDropOffModalVisible(true);
      return;
    }

    // Jika belum ada data GPS tersimpan, coba refresh GPS sekali
    if (!userGpsLocation) {
      const coords = await requestUserGps(false);
      if (coords) {
        const d = calculateHaversineDistance(coords.latitude, coords.longitude, gateTargetUnit.lat, gateTargetUnit.lng);
        if (d > gateTargetUnit.radius) {
          setDropOffActionType(typeParam);
          setDropOffModalVisible(true);
          return;
        }
      }
    }

    // Jika berada dalam radius aman, langsung lakukan tap presensi
    await executeGateTap(typeParam);
  };

  const handleConfirmDropOff = async () => {
    if (dropOffNotes.trim().length < 5) {
      Alert.alert('Perhatian', 'Mohon isi catatan/alasan pengantaran minimal 5 karakter.');
      return;
    }

    const categoryLabels: Record<string, string> = {
      ojek: 'Ojek Online (Gojek / Grab / Maxim)',
      jemputan: 'Antar-Jemput / Sopir Pribadi',
      kerabat: 'Keluarga / Kerabat',
      mandiri: 'Berangkat Mandiri (Sepeda / Jalan Kaki / Angkot)',
      dinas_ortu: 'Orang Tua Berhalangan (Dinas / Kerja / Sakit)',
    };
    const catName = categoryLabels[dropOffCategory] || dropOffCategory;
    const driverStr = dropOffDriverName.trim() ? ` [Pengantar: ${dropOffDriverName.trim()}]` : '';
    const fullNotes = `[${catName}]${driverStr} ${dropOffNotes.trim()}`;

    await executeGateTap(dropOffActionType, fullNotes);
  };

  // ── 6. Submit Permission Form ──
  const handleSubmitPermission = async () => {
    if (!permReason.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Keterangan Diperlukan',
        message: 'Mohon tuliskan alasan atau keterangan perizinan dengan jelas.',
      });
      return;
    }

    setPermSubmitting(true);
    try {
      const payload = {
        type: permType as any,
        start_date: permStartDate,
        end_date: permEndDate,
        reason: permReason.trim(),
        child_id: selectedChildId,
      };
      await mobileApiService.submitPortalPermission(payload);
      setIsPermissionModalOpen(false);
      setPermReason('');
      void loadAttendanceData();
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Pengajuan Terkirim',
        message: 'Pengajuan izin/sakit berhasil dikirim dan menunggu verifikasi wali kelas.',
      });
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Pengajuan Gagal',
        message: getApiErrorMessage(err, 'Gagal mengirim pengajuan perizinan.'),
      });
    } finally {
      setPermSubmitting(false);
    }
  };

  // ── 7. Staff Leave & Attachment Handlers ──
  const handlePickDocument = async () => {
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: ['application/pdf', 'image/*'],
        copyToCacheDirectory: true,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        setLeaveAttachment({
          uri: file.uri,
          name: file.name || 'lampiran_surat.pdf',
          type: file.mimeType || 'application/pdf',
        });
      }
    } catch (err) {
      console.log('Pick document error:', err);
    }
  };

  const handlePickImage = async () => {
    try {
      const res = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        setLeaveAttachment({
          uri: file.uri,
          name: file.fileName || 'lampiran_surat.jpg',
          type: file.mimeType || 'image/jpeg',
        });
      }
    } catch (err) {
      console.log('Pick image error:', err);
    }
  };

  const handleTakePhoto = async () => {
    try {
      const perm = await ImagePicker.requestCameraPermissionsAsync();
      if (!perm.granted) {
        setFeedbackModal({
          visible: true,
          type: 'warning',
          title: 'Izin Kamera Diperlukan',
          message: 'Mohon izinkan akses kamera untuk memfoto dokumen/surat lampiran.',
        });
        return;
      }
      const res = await ImagePicker.launchCameraAsync({
        quality: 0.8,
      });
      if (!res.canceled && res.assets && res.assets.length > 0) {
        const file = res.assets[0];
        setLeaveAttachment({
          uri: file.uri,
          name: file.fileName || 'foto_surat.jpg',
          type: file.mimeType || 'image/jpeg',
        });
      }
    } catch (err) {
      console.log('Take photo error:', err);
    }
  };

  const openLeaveModal = (type: 'IZIN' | 'SAKIT' | 'DINAS_LUAR') => {
    setLeaveStatus(type);
    setLeaveDate(todayDateStr);
    setLeaveReason('');
    setLeaveAttachment(null);
    setIsLeaveModalOpen(true);
  };

  const openAttachmentPreview = (url: string, title?: string) => {
    setPreviewAttachmentUrl(url);
    setPreviewAttachmentTitle(title || 'Lampiran Surat');
    setIsPreviewModalOpen(true);
  };

  const handleSubmitLeave = async () => {
    if (!effectiveEmployeeId) return;
    if (!leaveReason.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Keterangan Diperlukan',
        message: `Mohon tuliskan keterangan / alasan ${leaveStatus.toLowerCase().replace('_', ' ')} secara jelas.`,
      });
      return;
    }

    setSubmittingLeave(true);
    try {
      if (leaveAttachment) {
        const formData = new FormData();
        formData.append('tipe_presensi', 'Pegawai');
        formData.append('employee_id', String(effectiveEmployeeId));
        if (effectiveUnitId) formData.append('unit_pendidikan_id', String(effectiveUnitId));
        const acYear = (user?.metadata as any)?.academic_year_id || (authScope as any)?.academic_year_id;
        const semId = (user?.metadata as any)?.semester_id || (authScope as any)?.semester_id;
        if (acYear) formData.append('academic_year_id', String(acYear));
        if (semId) formData.append('semester_id', String(semId));
        formData.append('attendance_date', leaveDate);
        formData.append('status', leaveStatus);
        formData.append('attendance_method', 'MOBILE');
        formData.append('location', 'SIMS Mobile Android');
        formData.append('keterangan', leaveReason.trim());
        formData.append('attachment', {
          uri: leaveAttachment.uri,
          name: leaveAttachment.name,
          type: leaveAttachment.type,
        } as any);

        await mobileApiService.checkIn(formData);
      } else {
        const payload: AttendancePayload = {
          tipe_presensi: 'Pegawai',
          employee_id: String(effectiveEmployeeId),
          unit_pendidikan_id: effectiveUnitId ? String(effectiveUnitId) : undefined,
          academic_year_id: (user?.metadata as any)?.academic_year_id || (authScope as any)?.academic_year_id,
          semester_id: (user?.metadata as any)?.semester_id || (authScope as any)?.semester_id,
          attendance_date: leaveDate,
          status: leaveStatus as any,
          attendance_method: 'MOBILE',
          location: 'SIMS Mobile Android',
          keterangan: leaveReason.trim(),
        };
        await mobileApiService.checkIn(payload);
      }

      setIsLeaveModalOpen(false);
      setLeaveReason('');
      setLeaveAttachment(null);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Pengajuan Berhasil',
        message: `Pengajuan ${leaveStatus.toLowerCase().replace('_', ' ')} Anda berhasil dicatat.`,
      });
      await loadAttendanceData();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Pengajuan Gagal',
        message: getApiErrorMessage(err, `Pengajuan ${leaveStatus.toLowerCase().replace('_', ' ')} belum berhasil disimpan.`),
      });
    } finally {
      setSubmittingLeave(false);
    }
  };

  const handleConfirmReview = async () => {
    if (!selectedPermForReview) return;
    if (reviewAction === 'reject' && !reviewNotes.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Alasan Penolakan Wajib',
        message: 'Mohon tuliskan alasan atau keterangan penolakan perizinan santri.',
      });
      return;
    }

    setSubmittingReview(true);
    try {
      await mobileApiService.reviewPermission(
        selectedPermForReview.id,
        reviewAction,
        reviewNotes.trim() || undefined
      );
      setIsReviewModalOpen(false);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: reviewAction === 'approve' ? 'Izin Siswa Disetujui' : 'Pengajuan Izin Ditolak',
        message: `Pengajuan perizinan siswa ${selectedPermForReview?.student?.full_name || selectedPermForReview?.student_name || 'ananda'} telah berhasil di-${reviewAction === 'approve' ? 'setujui' : 'tolak'}. Status kehadiran santri telah disinkronkan ke sistem.`,
      });
      setSelectedPermForReview(null);
      setReviewNotes('');
      await loadAttendanceData();
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Memproses Verifikasi',
        message: getApiErrorMessage(err, 'Terjadi kesalahan saat memproses status izin santri.'),
      });
    } finally {
      setSubmittingReview(false);
    }
  };

  const getStatusColor = (statusKey: string) => {
    const k = (statusKey || '').toLowerCase();
    if (k.includes('dinas') || k.includes('tugas_luar')) {
      return {
        bg: '#F0FDFA',
        text: '#0D9488',
        border: '#99F6E4',
        icon: 'briefcase-check-outline',
        gradient: ['#0D9488', '#14B8A6'] as [string, string],
        lightBg: '#CCFBF1',
      };
    }
    if (k.includes('hadir') || k.includes('present') || k.includes('approved') || k.includes('disetujui')) {
      return {
        bg: '#ECFDF5',
        text: '#059669',
        border: '#A7F3D0',
        icon: 'check-circle',
        gradient: ['#059669', '#10B981'] as [string, string],
        lightBg: '#D1FAE5',
      };
    }
    if (k.includes('terlambat') || k.includes('late')) {
      return {
        bg: '#FFFBEB',
        text: '#D97706',
        border: '#FDE68A',
        icon: 'clock-alert-outline',
        gradient: ['#D97706', '#F59E0B'] as [string, string],
        lightBg: '#FEF3C7',
      };
    }
    if (k.includes('izin')) {
      return {
        bg: '#EFF6FF',
        text: '#2563EB',
        border: '#BFDBFE',
        icon: 'file-document-outline',
        gradient: ['#2563EB', '#3B82F6'] as [string, string],
        lightBg: '#DBEAFE',
      };
    }
    if (k.includes('sakit')) {
      return {
        bg: '#FAF5FF',
        text: '#7C3AED',
        border: '#E9D5FF',
        icon: 'medical-bag',
        gradient: ['#7C3AED', '#8B5CF6'] as [string, string],
        lightBg: '#F3E8FF',
      };
    }
    if (k.includes('active') || k.includes('boarding') || k.includes('keluar') || k.includes('pesiar')) {
      return {
        bg: '#F0F9FF',
        text: '#0284C7',
        border: '#BAE6FD',
        icon: 'compass-outline',
        gradient: ['#0284C7', '#38BDF8'] as [string, string],
        lightBg: '#E0F2FE',
      };
    }
    if (k.includes('pending') || k.includes('menunggu')) {
      return {
        bg: '#FFF7ED',
        text: '#EA580C',
        border: '#FFEDD5',
        icon: 'timer-sand',
        gradient: ['#EA580C', '#F97316'] as [string, string],
        lightBg: '#FFEDD5',
      };
    }
    return {
      bg: '#FEF2F2',
      text: '#DC2626',
      border: '#FECACA',
      icon: 'close-circle',
      gradient: ['#DC2626', '#EF4444'] as [string, string],
      lightBg: '#FEE2E2',
    };
  };

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK HALAMAN BANK SOAL, JERNIH & CRISP) ── */}
      {!isStaff && (
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
      )}

      {/* 0. HEADER HALAMAN: DATA MASTER STYLE UNTUK STAFF / CLEAN TOPBAR UNTUK WALI (IDENTIK BANK SOAL) */}
      {isStaff ? (
        <>
          {/* ── FIXED HEADER HALAMAN DATA MASTER TERPADU ── */}
          <LinearGradient
            colors={['#065F46', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.masterHeaderContainer, { paddingTop: topInset + 6 }]}
          >
            <View style={styles.masterHeaderTopRow}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleBack}
                style={styles.masterBackButton}
                accessibilityRole="button"
                accessibilityLabel="Kembali"
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={styles.masterHeaderTitleWrap}>
                <View style={styles.masterHeaderBadge}>
                  <MaterialCommunityIcons name="database-check" size={12} color="#D1FAE5" />
                  <Text style={styles.masterHeaderBadgeText}>PUSAT DATA MASTER PRESENSI</Text>
                </View>
                <Text style={styles.masterHeaderMainTitle} numberOfLines={1}>
                  Data Presensi Terpadu
                </Text>
              </View>

              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => navigation?.navigate?.('Notifikasi')}
                  style={styles.masterRefreshButton}
                  accessibilityRole="button"
                  accessibilityLabel="Notifikasi"
                >
                  <MaterialCommunityIcons name="bell-outline" size={20} color="#FFFFFF" />
                  {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={onRefresh}
                  style={styles.masterRefreshButton}
                  accessibilityRole="button"
                  accessibilityLabel="Segarkan"
                >
                  <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </View>

            {/* Search Bar langsung di Header Gradient */}
            <View style={styles.masterSearchBar}>
              <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
              <TextInput
                style={styles.masterSearchInput}
                placeholder="Cari catatan presensi, nama, atau izin..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* 3 KPI Cards Row (Harmonisasi Data Master) */}
            <View style={styles.masterKpiCardsRow}>
              {/* Card 1: Hadir */}
              <View style={[styles.masterKpiBox, { borderColor: 'rgba(5, 150, 105, 0.22)' }]}>
                <LinearGradient colors={['#FFFFFF', '#ECFDF5']} style={styles.masterKpiBoxGradient}>
                  <View style={styles.masterKpiHeaderRow}>
                    <View style={[styles.masterKpiIconSquare, { backgroundColor: '#059669' }]}>
                      <MaterialCommunityIcons name="account-check" size={14} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.masterKpiVal, { color: '#059669' }]}>
                      {computedEmployeeStats.hadir}
                    </Text>
                  </View>
                  <Text style={[styles.masterKpiLbl, { color: '#059669' }]} numberOfLines={1}>Hadir</Text>
                  <Text style={styles.masterKpiSub} numberOfLines={1}>Presensi Terekam</Text>
                </LinearGradient>
              </View>

              {/* Card 2: Izin & Sakit */}
              <View style={[styles.masterKpiBox, { borderColor: 'rgba(37, 99, 235, 0.18)' }]}>
                <LinearGradient colors={['#FFFFFF', '#EFF6FF']} style={styles.masterKpiBoxGradient}>
                  <View style={styles.masterKpiHeaderRow}>
                    <View style={[styles.masterKpiIconSquare, { backgroundColor: '#2563EB' }]}>
                      <MaterialCommunityIcons name="file-document-outline" size={14} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.masterKpiVal, { color: '#2563EB' }]}>
                      {computedEmployeeStats.izin + computedEmployeeStats.sakit}
                    </Text>
                  </View>
                  <Text style={[styles.masterKpiLbl, { color: '#2563EB' }]} numberOfLines={1}>Izin & Sakit</Text>
                  <Text style={styles.masterKpiSub} numberOfLines={1}>
                    {`${computedEmployeeStats.izin} Izin · ${computedEmployeeStats.sakit} Sakit`}
                  </Text>
                </LinearGradient>
              </View>

              {/* Card 3: Telat & Alpa */}
              <View style={[styles.masterKpiBox, { borderColor: 'rgba(225, 29, 72, 0.18)' }]}>
                <LinearGradient colors={['#FFFFFF', '#FFF1F2']} style={styles.masterKpiBoxGradient}>
                  <View style={styles.masterKpiHeaderRow}>
                    <View style={[styles.masterKpiIconSquare, { backgroundColor: '#E11D48' }]}>
                      <MaterialCommunityIcons name="clock-alert-outline" size={14} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.masterKpiVal, { color: '#E11D48' }]}>
                      {computedEmployeeStats.terlambat + computedEmployeeStats.alpa}
                    </Text>
                  </View>
                  <Text style={[styles.masterKpiLbl, { color: '#E11D48' }]} numberOfLines={1}>Telat & Alpa</Text>
                  <Text style={styles.masterKpiSub} numberOfLines={1}>
                    {`${computedEmployeeStats.terlambat} Telat · ${computedEmployeeStats.alpa} Alpa`}
                  </Text>
                </LinearGradient>
              </View>
            </View>
          </LinearGradient>

          {/* ── SEGMENTED SUB-TABS (Tepat di bawah Header, Persis Data Master) ── */}
          <View style={styles.masterSegmentContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.masterSegmentScroll}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveTab('attendance')}
                style={[
                  styles.masterSegmentBtn,
                  activeTab === 'attendance' && styles.masterSegmentBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="calendar-check-outline"
                  size={16}
                  color={activeTab === 'attendance' ? '#FFFFFF' : '#475569'}
                />
                <Text
                  style={[
                    styles.masterSegmentBtnText,
                    activeTab === 'attendance' && styles.masterSegmentBtnTextActive,
                  ]}
                >
                  Presensi Saya
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveTab('permissions')}
                style={[
                  styles.masterSegmentBtn,
                  activeTab === 'permissions' && styles.masterSegmentBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="file-document-outline"
                  size={16}
                  color={activeTab === 'permissions' ? '#FFFFFF' : '#475569'}
                />
                <Text
                  style={[
                    styles.masterSegmentBtnText,
                    activeTab === 'permissions' && styles.masterSegmentBtnTextActive,
                  ]}
                >
                  Verifikasi Izin {pendingPermCount > 0 ? `(${pendingPermCount})` : ''}
                </Text>
              </TouchableOpacity>

              {/* Quick Action Navigation Pills */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate?.('RekapPresensiSiswa', { defaultSubject: 'siswa' })}
                style={[styles.masterSegmentBtn, { backgroundColor: '#E0F2FE', borderWidth: 1, borderColor: '#38BDF8' }]}
              >
                <MaterialCommunityIcons name="account-group" size={16} color="#0284C7" />
                <Text style={[styles.masterSegmentBtnText, { color: '#0284C7', fontWeight: '800' }]}>
                  Data Presensi Siswa ➜
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate?.('PresensiMandiriStaff')}
                style={[styles.masterSegmentBtn, { backgroundColor: '#ECFDF5', borderWidth: 1, borderColor: '#34D399' }]}
              >
                <MaterialCommunityIcons name="map-marker-check-outline" size={16} color="#059669" />
                <Text style={[styles.masterSegmentBtnText, { color: '#059669', fontWeight: '800' }]}>
                  Presensi Mandiri Pegawai ➜
                </Text>
              </TouchableOpacity>

              {isAboveTu && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveTab('rekap_pegawai')}
                  style={[
                    styles.masterSegmentBtn,
                    activeTab === 'rekap_pegawai' && styles.masterSegmentBtnActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="badge-account-outline"
                    size={16}
                    color={activeTab === 'rekap_pegawai' ? '#FFFFFF' : '#475569'}
                  />
                  <Text
                    style={[
                      styles.masterSegmentBtnText,
                      activeTab === 'rekap_pegawai' && styles.masterSegmentBtnTextActive,
                    ]}
                  >
                    Rekap Pegawai
                  </Text>
                </TouchableOpacity>
              )}

              {dormitoryPermits.length > 0 && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveTab('boarding')}
                  style={[
                    styles.masterSegmentBtn,
                    activeTab === 'boarding' && styles.masterSegmentBtnActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="home-city-outline"
                    size={16}
                    color={activeTab === 'boarding' ? '#FFFFFF' : '#475569'}
                  />
                  <Text
                    style={[
                      styles.masterSegmentBtnText,
                      activeTab === 'boarding' && styles.masterSegmentBtnTextActive,
                    ]}
                  >
                    Izin Asrama
                  </Text>
                </TouchableOpacity>
              )}
            </ScrollView>
          </View>
        </>
      ) : (
        /* ── TOP HEADER IDENTIK BANK SOAL & UTAMA (TOMBOL KARTU PUTIH MINT GREEN SHADOW, TANPA STICKY HEADER) ── */
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
            {pageTitle}
          </Text>

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
      )}

      {/* ── SHEET CONTAINER / SCROLL CONTENT ── */}
      <View style={[styles.sheetContainer, isStaff ? { backgroundColor: '#F8FAFC' } : { backgroundColor: 'transparent' }]}>
        <Animated.ScrollView
          style={[styles.screen, isStaff && { backgroundColor: '#F8FAFC' }]}
          contentContainerStyle={[
            styles.cleanMainScrollContent,
            { paddingBottom: Math.max(bottomInset + 72, 94) }
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} progressViewOffset={topInset + 10} />}
        >
          <View style={styles.cleanScrollInner}>
            {/* Badan Halaman Konten */}
            <View style={[styles.bodyContentWrapper, isStaff && { paddingHorizontal: 14 }]}>
          {/* ══════════════════════════════════════════════════════════════
              SECTION 1: DATA SISWA (OPEN STUDENT PROFILE ROW - GOLD STANDARD)
             ══════════════════════════════════════════════════════════════ */}
          {!isStaff && (headerStudent || children.length > 0) && (
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
                      {studentClass.toLowerCase().startsWith('kelas') ? studentClass : `Kelas ${studentClass}`}
                    </Text>
                  </View>
                ) : null}

                {/* Baris Aksi: Tombol Ganti Siswa + Lencana Status Kehadiran */}
                <View style={styles.studentActionBadgeRow}>
                  {children && children.length > 1 && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowChildSelectorModal(true)}
                      style={styles.parentGantiAnakBtn}
                    >
                      <Text style={styles.parentGantiAnakBtnText}>Ganti Siswa</Text>
                      <MaterialCommunityIcons name="chevron-down" size={14} color="#FFFFFF" />
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
          )}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2: RINGKASAN & STATISTIK PRESENSI (IDENTIK BANK SOAL)
             ══════════════════════════════════════════════════════════════ */}
          {!isStaff && (
            <View style={[styles.bankSoalGroupCard, { marginTop: 6 }]}>
              <LinearGradient
                colors={['#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.bankSoalGroupHeaderGradient}
              >
                <View style={styles.bankSoalGroupHeaderLeft}>
                  <View style={styles.bankSoalGroupHeaderIconBoxWhite}>
                    <MaterialCommunityIcons name="chart-box-outline" size={18} color="#047857" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.bankSoalGroupTitleWhite}>
                      Ringkasan & Statistik Presensi
                    </Text>
                    <Text numberOfLines={1} style={styles.bankSoalGroupSubWhite}>
                      {isParent && activeStudentName ? `Statistik kehadiran ${activeStudentName}` : 'Statistik kehadiran ananda di madrasah'}
                    </Text>
                  </View>
                </View>
                <View style={styles.bankSoalGroupBadge}>
                  <MaterialCommunityIcons name="shield-check" size={12} color="#047857" style={{ marginRight: 3 }} />
                  <Text style={styles.bankSoalGroupBadgeText}>
                    {studentStats.total > 0 ? `${studentStats.percentage}%` : '0%'}
                  </Text>
                </View>
              </LinearGradient>

              {/* 2 Kolom KPI Atas: Hadir & Izin/Sakit (Lega, Bersih & Modern seperti Bank Soal) */}
              <View style={styles.kpiRowModern}>
                {/* Card 1: Hadir */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setStudentStatusFilter(studentStatusFilter === 'hadir' ? 'all' : 'hadir')}
                  style={[
                    styles.kpiCardModern,
                    { borderColor: studentStatusFilter === 'hadir' ? '#059669' : '#A7F3D0', backgroundColor: studentStatusFilter === 'hadir' ? '#D1FAE5' : '#ECFDF5' },
                  ]}
                >
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#A7F3D0' }]}>
                    <MaterialCommunityIcons name="account-check" size={20} color="#047857" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text numberOfLines={1} style={styles.kpiLabelModern}>Hadir</Text>
                    <Text style={[styles.kpiValueModern, { color: '#047857' }]}>{studentStats.hadir}</Text>
                    <Text numberOfLines={1} style={styles.kpiSubModern}>Presensi Terekam</Text>
                  </View>
                </TouchableOpacity>

                {/* Card 2: Izin & Sakit */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setStudentStatusFilter(studentStatusFilter === 'izin' ? 'all' : 'izin')}
                  style={[
                    styles.kpiCardModern,
                    { borderColor: studentStatusFilter === 'izin' ? '#D97706' : '#FED7AA', backgroundColor: studentStatusFilter === 'izin' ? '#FEF3C7' : '#FFF7ED' },
                  ]}
                >
                  <View style={[styles.kpiIconWrap, { backgroundColor: '#FED7AA' }]}>
                    <MaterialCommunityIcons name="file-document-outline" size={20} color="#C2410C" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text numberOfLines={1} style={styles.kpiLabelModern}>Izin & Sakit</Text>
                    <Text style={[styles.kpiValueModern, { color: '#C2410C' }]}>{studentStats.izin + studentStats.sakit}</Text>
                    <Text numberOfLines={1} style={styles.kpiSubModern}>{studentStats.izin} Izin · {studentStats.sakit} Sakit</Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* Progress Banner Kehadiran (Mini Progress Bar seperti Bank Soal) */}
              <View style={styles.kpiProgressBannerWrapper}>
                <View style={[styles.kpiProgressBanner, styles.kpiProgressBannerEmerald]}>
                  <View style={styles.kpiProgressBannerTop}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                      <View style={[styles.kpiIconWrap, { width: 34, height: 34, borderRadius: 10, backgroundColor: '#D1FAE5' }]}>
                        <MaterialCommunityIcons name="shield-check-outline" size={18} color="#059669" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text numberOfLines={1} style={styles.kpiProgressBannerTitle}>
                          {studentStats.percentage >= 85 ? 'Tingkat Kehadiran Sangat Baik 🎉' : 'Tingkat Kehadiran Perlu Ditingkatkan'}
                        </Text>
                        <Text numberOfLines={1} style={styles.kpiProgressBannerSub}>
                          {studentStats.hadir} dari {studentStats.total} total hari tercatat ({studentStats.percentage}%)
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Mini Progress Bar */}
                  <View style={styles.kpiMiniProgressBarBg}>
                    <View
                      style={[
                        styles.kpiMiniProgressBarFill,
                        {
                          width: `${Math.min(Math.max(studentStats.percentage, 0), 100)}%`,
                          backgroundColor: '#059669',
                        },
                      ]}
                    />
                  </View>
                </View>
              </View>

              {/* Filter Pills Row (Semua, Hadir, Izin, Sakit, Terlambat, Alpa) */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 12, gap: 8 }}>
                {[
                  { key: 'all', label: 'Semua', count: studentStats.total, color: '#0F172A' },
                  { key: 'hadir', label: 'Hadir', count: studentStats.hadir, color: '#059669' },
                  { key: 'izin', label: 'Izin', count: studentStats.izin, color: '#2563EB' },
                  { key: 'sakit', label: 'Sakit', count: studentStats.sakit, color: '#7C3AED' },
                  { key: 'terlambat', label: 'Terlambat', count: studentStats.terlambat, color: '#D97706' },
                  { key: 'alpa', label: 'Alpa', count: studentStats.alpa, color: '#E11D48' },
                ].map((f) => {
                  const isActive = studentStatusFilter === f.key;
                  return (
                    <TouchableOpacity
                      key={f.key}
                      activeOpacity={0.8}
                      onPress={() => setStudentStatusFilter(f.key as any)}
                      style={[
                        styles.kpiFilterPill,
                        isActive && { backgroundColor: f.color, borderColor: f.color },
                      ]}
                    >
                      <Text style={[styles.kpiFilterPillText, isActive && { color: '#FFFFFF' }]}>
                        {f.label} ({f.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          )}



          {/* ══════════════════════════════════════════════════════════════
              SECTION 3: AKSI UTAMA / PRESENSI MANDIRI / PENGAJUAN IZIN
             ══════════════════════════════════════════════════════════════ */}
          {isStaff && activeTab === 'permissions' ? (
            <View style={styles.containerBlock}>
              <View style={styles.actionBannerCard}>
                <View style={styles.actionBannerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionBannerTitle}>Verifikasi Izin & Sakit Santri</Text>
                    <Text style={styles.actionBannerSub}>
                      Persetujuan surat permohonan izin/sakit santri resmi dari orang tua. Tinjau dokumen bukti dan perbarui status presensi.
                    </Text>
                  </View>
                  <View style={[styles.actionIconCircle, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialCommunityIcons name="file-check-outline" size={24} color="#D97706" />
                  </View>
                </View>
              </View>
            </View>
          ) : isStaff && activeTab === 'attendance' ? (
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="map-marker-check-outline" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Presensi Mandiri Hari Ini</Text>
                </View>
              </View>

              {/* Harmonized Navigation Notice Card */}
              <View style={styles.formNoticeCard}>
                <View style={styles.formNoticeHeader}>
                  <View style={styles.formNoticeIconSquare}>
                    <MaterialCommunityIcons name="shield-account-outline" size={18} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.formNoticeTitle}>Pusat Navigasi Presensi Terpadu</Text>
                    <Text style={styles.formNoticeSub}>
                      Akses cepat modul presensi mandiri pegawai dengan validasi GPS & kamera, atau buka rekapitulasi data kehadiran seluruh santri/siswa unit.
                    </Text>
                  </View>
                </View>

                <View style={styles.formNoticeBtnRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => navigation?.navigate?.('PresensiMandiriStaff')}
                    style={[styles.formNoticeBtn, { backgroundColor: '#ECFDF5', borderColor: '#6EE7B7' }]}
                  >
                    <MaterialCommunityIcons name="map-marker-radius" size={16} color="#059669" />
                    <Text style={[styles.formNoticeBtnText, { color: '#059669' }]}>Presensi Mandiri</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => navigation?.navigate?.('RekapPresensiSiswa', { defaultSubject: 'siswa' })}
                    style={[styles.formNoticeBtn, { backgroundColor: '#F0F9FF', borderColor: '#7DD3FC' }]}
                  >
                    <MaterialCommunityIcons name="account-group" size={16} color="#0284C7" />
                    <Text style={[styles.formNoticeBtnText, { color: '#0284C7' }]}>Presensi Siswa</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* Staff Check-In / Check-Out Action Card */}
              <View style={styles.actionBannerCard}>
                <View style={styles.actionBannerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionBannerTitle}>Status Presensi Pegawai</Text>
                    <Text style={styles.actionBannerDate}>{formatTanggalIndo(new Date().toISOString())}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPillBadge,
                      {
                        backgroundColor: checkedIn ? '#ECFDF5' : todayRecord?.check_out_time ? '#F1F5F9' : '#FFF7ED',
                        borderColor: checkedIn ? '#A7F3D0' : todayRecord?.check_out_time ? '#E2E8F0' : '#FFEDD5',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: checkedIn ? '#059669' : hasCheckOut ? '#64748B' : '#EA580C' },
                      ]}
                    >
                      {checkedIn ? 'Sedang Bekerja' : hasCheckOut ? 'Selesai' : 'Belum Presensi'}
                    </Text>
                  </View>
                </View>

                <View style={styles.employeeTimeRow}>
                  <View style={styles.employeeTimeBox}>
                    <Text style={styles.employeeTimeLabel}>Jam Masuk</Text>
                    <Text style={styles.employeeTimeVal}>
                      {todayRecord?.check_in_time
                        ? formatJamIndo(todayRecord.check_in_time)
                        : todayRecord?.check_in
                          ? todayRecord.check_in
                          : '--:--'}
                    </Text>
                  </View>
                  <View style={styles.employeeTimeBox}>
                    <Text style={styles.employeeTimeLabel}>Jam Pulang</Text>
                    <Text style={styles.employeeTimeVal}>
                      {todayRecord?.check_out_time
                        ? formatJamIndo(todayRecord.check_out_time)
                        : todayRecord?.check_out && todayRecord.check_out !== '--:--'
                          ? todayRecord.check_out
                          : '--:--'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={savingAttendance || !effectiveEmployeeId || hasCheckOut}
                  onPress={() => void (checkedIn ? handleEmployeeCheckOut() : handleEmployeeCheckIn())}
                  style={[
                    styles.primaryActionBtn,
                    checkedIn ? styles.primaryActionBtnOrange : styles.primaryActionBtnGreen,
                    (savingAttendance || !effectiveEmployeeId || hasCheckOut) && { opacity: 0.6 },
                  ]}
                >
                  {savingAttendance ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name={checkedIn ? 'logout-variant' : 'login-variant'}
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.primaryActionBtnText}>
                        {checkedIn ? 'Presensi Pulang' : hasCheckOut ? 'Presensi Hari Ini Selesai' : 'Presensi Masuk Sekarang'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>

                {/* 3 Tombol Aksi Cepat: Izin / Sakit / Dinas Luar */}
                <View style={styles.quickLeaveBtnRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={savingAttendance}
                    onPress={() => openLeaveModal('IZIN')}
                    style={[styles.quickLeaveBtn, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
                  >
                    <MaterialCommunityIcons name="file-document-edit-outline" size={16} color="#2563EB" />
                    <Text style={[styles.quickLeaveBtnText, { color: '#2563EB' }]}>Ajukan Izin</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={savingAttendance}
                    onPress={() => openLeaveModal('SAKIT')}
                    style={[styles.quickLeaveBtn, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}
                  >
                    <MaterialCommunityIcons name="medical-bag" size={16} color="#7C3AED" />
                    <Text style={[styles.quickLeaveBtnText, { color: '#7C3AED' }]}>Lapor Sakit</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    disabled={savingAttendance}
                    onPress={() => openLeaveModal('DINAS_LUAR')}
                    style={[styles.quickLeaveBtn, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}
                  >
                    <MaterialCommunityIcons name="briefcase-check-outline" size={16} color="#0D9488" />
                    <Text style={[styles.quickLeaveBtnText, { color: '#0D9488' }]}>Dinas Luar</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          ) : isParent && activeTab === 'permissions' ? (
            <View style={styles.containerBlock}>
              <View style={styles.actionBannerCard}>
                <View style={styles.actionBannerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionBannerTitle}>Ajukan Permohonan Izin / Sakit</Text>
                    <Text style={styles.actionBannerSub}>
                      Kirim surat izin atau keterangan sakit resmi ananda langsung ke wali kelas dan guru pengampu.
                    </Text>
                  </View>
                  <View style={styles.actionIconCircle}>
                    <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#18A165" />
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setIsPermissionModalOpen(true)}
                  style={[styles.primaryActionBtn, styles.primaryActionBtnGreen, { marginTop: 14 }]}
                >
                  <MaterialCommunityIcons name="plus-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Buat Pengajuan Izin / Sakit</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3B: PRESENSI GERBANG MANDIRI (TAP LOKASI GPS ALA TU)
              Untuk Santri / Siswa & Orang Tua (Tab Semua & Kehadiran)
             ══════════════════════════════════════════════════════════════ */}
          {!isStaff && (isParent || isStudent) && (activeTab === 'all' || activeTab === 'attendance') && (
            <View style={styles.containerBlock}>
              <View style={styles.gateLiveClockCard}>
                <LinearGradient colors={['#F0FDFA', '#CCFBF1']} style={styles.gateLiveClockGradient}>
                  {/* Top Bar: GPS Radius Badge + Unit Name */}
                  <View style={styles.gateLiveClockTopRow}>
                    <View style={styles.gateGpsRadiusBadge}>
                      <MaterialCommunityIcons name="crosshairs-gps" size={13} color="#0D9488" />
                      <Text style={styles.gateGpsRadiusBadgeText}>Radius Wajib: Maks. {gateTargetUnit.radius} Meter</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.gateUnitNameText}>{gateTargetUnit.name}</Text>
                  </View>

                  {/* Digital Clock Realtime */}
                  <Text style={styles.gateClockDigitsText}>{currentTime || '--:--:-- WIB'}</Text>
                  <Text style={styles.gateDateSubText}>
                    {currentDateText || formatTanggalIndo(new Date().toISOString())}
                  </Text>
                  <Text style={styles.gateTargetStudentText}>
                    {isParent && activeStudentName ? `Presensi Gerbang Mandiri Ananda: ${activeStudentName}` : 'Presensi Gerbang Mandiri Santri'}
                  </Text>

                  {/* ── MAP LOKASI UNIT & POSISI USER DENGAN INDIKATOR JARAK REALTIME ── */}
                  <View style={styles.gateLiveMapContainer}>
                    {/* Map Image View (Mapbox Retina 2x / OpenStreetMap) */}
                    <View style={styles.gateMapFrame}>
                      {gateMapTileUrl ? (
                        <Image
                          source={{ uri: gateMapTileUrl }}
                          style={styles.gateMapImage}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={styles.gateMapLoadingBox}>
                          <ActivityIndicator size="small" color="#0D9488" />
                          <Text style={styles.gateMapLoadingText}>Memuat peta lokasi gerbang...</Text>
                        </View>
                      )}

                      {/* Gradient overlay to soften bottom & top edges */}
                      <LinearGradient
                        colors={['rgba(0,0,0,0.4)', 'transparent', 'rgba(0,0,0,0.55)']}
                        style={StyleSheet.absoluteFill}
                        pointerEvents="none"
                      />

                      {/* Top Row Badges over Map */}
                      <View style={styles.gateMapTopBadgesRow}>
                        <View style={styles.gateMapUnitBadge}>
                          <MaterialCommunityIcons name="office-building-marker" size={12} color="#059669" />
                          <Text style={styles.gateMapUnitBadgeText} numberOfLines={1}>
                            {gateTargetUnit.name}
                          </Text>
                        </View>
                        <View style={[
                          styles.gateMapRadiusPill,
                          distanceToGate !== null && (isWithinGateRadius ? styles.gateMapRadiusPillSuccess : styles.gateMapRadiusPillDanger)
                        ]}>
                          <MaterialCommunityIcons
                            name={distanceToGate !== null ? (isWithinGateRadius ? 'check-circle' : 'alert-circle') : 'crosshairs-gps'}
                            size={12}
                            color="#FFFFFF"
                          />
                          <Text style={styles.gateMapRadiusPillText}>
                            {distanceToGate !== null
                              ? isWithinGateRadius
                                ? 'Dalam Radius'
                                : 'Di Luar Radius'
                              : `Maks. ${gateTargetUnit.radius}m`}
                          </Text>
                        </View>
                      </View>

                      {/* Bottom Row inside Map: Legend & Google Maps Navigation Button */}
                      <View style={styles.gateMapBottomRow}>
                        <View style={styles.gateMapLegendBox}>
                          <View style={styles.gateLegendItem}>
                            <View style={[styles.gateLegendDot, { backgroundColor: '#059669' }]} />
                            <Text style={styles.gateLegendText}>Gerbang</Text>
                          </View>
                          <View style={styles.gateLegendItem}>
                            <View style={[styles.gateLegendDot, { backgroundColor: '#2563EB' }]} />
                            <Text style={styles.gateLegendText}>Anda</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={handleOpenGateMaps}
                          style={styles.gateMapNavigateBtn}
                        >
                          <MaterialCommunityIcons name="google-maps" size={13} color="#0F172A" />
                          <Text style={styles.gateMapNavigateBtnText}>Rute</Text>
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Distance & GPS Status Card ala TU */}
                    <View style={styles.gateDistanceInfoCard}>
                      <View style={styles.gateDistancePrimaryRow}>
                        {/* Left: Distance Value */}
                        <View style={styles.gateDistanceValueCol}>
                          <Text style={styles.gateDistanceLabel}>Jarak Anda ke Gerbang</Text>
                          <View style={styles.gateDistanceNumberRow}>
                            <MaterialCommunityIcons
                              name="map-marker-distance"
                              size={20}
                              color={distanceToGate !== null ? (isWithinGateRadius ? '#059669' : '#E11D48') : '#64748B'}
                            />
                            <Text style={[
                              styles.gateDistanceNumberText,
                              distanceToGate !== null && (isWithinGateRadius ? { color: '#047857' } : { color: '#E11D48' })
                            ]}>
                              {formatGateDistance(distanceToGate)}
                            </Text>
                          </View>
                        </View>

                        {/* Middle: Status Note */}
                        <View style={styles.gateDistanceStatusCol}>
                          <View style={[
                            styles.gateDistanceStatusTag,
                            distanceToGate !== null
                              ? isWithinGateRadius
                                ? styles.gateDistanceStatusTagSuccess
                                : styles.gateDistanceStatusTagDanger
                              : styles.gateDistanceStatusTagPending
                          ]}>
                            <Text style={[
                              styles.gateDistanceStatusTagText,
                              distanceToGate !== null
                                ? isWithinGateRadius
                                  ? { color: '#047857' }
                                  : { color: '#BE123C' }
                                : { color: '#D97706' }
                            ]}>
                              {distanceToGate !== null
                                ? isWithinGateRadius
                                  ? '✓ Radius Aman'
                                  : `✕ Lebih ${Math.round(distanceToGate - gateTargetUnit.radius)}m`
                                : 'Menunggu GPS'}
                            </Text>
                          </View>
                          <Text style={styles.gateDistanceSubHint}>
                            Toleransi: {gateTargetUnit.radius} meter
                          </Text>
                        </View>

                        {/* Right: Refresh GPS Button */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => void requestUserGps(false)}
                          disabled={locatingGps}
                          style={styles.gateRefreshGpsBtn}
                        >
                          {locatingGps ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <MaterialCommunityIcons name="crosshairs-gps" size={15} color="#FFFFFF" />
                              <Text style={styles.gateRefreshGpsBtnText}>GPS</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      </View>

                      {/* Bottom: Coords Strip */}
                      <View style={styles.gateCoordsStripRow}>
                        <Text style={styles.gateCoordsStripText} numberOfLines={1}>
                          GPS: {userGpsLocation ? `${userGpsLocation.latitude.toFixed(5)}, ${userGpsLocation.longitude.toFixed(5)}` : (gateToday?.attendance?.location || 'Mencari...')}
                        </Text>
                        <Text style={styles.gateCoordsStripDivider}>•</Text>
                        <Text style={styles.gateCoordsStripText} numberOfLines={1}>
                          Gerbang: {gateTargetUnit.lat.toFixed(5)}, {gateTargetUnit.lng.toFixed(5)}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Status Box: 3 Kartu Terpisah ala TU (Masuk, Pulang, Status) Bebas Tumpang Tindih */}
                  <View style={styles.gateTodayStatusRow}>
                    {/* Card 1: Masuk */}
                    <View style={[styles.gateStatusPillBox, gateToday?.has_check_in ? styles.gateStatusPillBoxActiveIn : styles.gateStatusPillBoxNeutral]}>
                      <View style={styles.gateStatusPillHeader}>
                        <MaterialCommunityIcons name="login" size={13} color="#059669" />
                        <Text style={[styles.gateStatusPillLabel, gateToday?.has_check_in && { color: '#047857' }]}>MASUK</Text>
                      </View>
                      <Text style={styles.gateStatusPillValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {gateToday?.attendance?.check_in_time ? `${String(gateToday.attendance.check_in_time).slice(0, 5)} WIB` : '--:--'}
                      </Text>
                      <Text style={[styles.gateStatusPillSub, gateToday?.has_check_in && { color: '#059669' }]} numberOfLines={1}>
                        {gateToday?.has_check_in ? 'WIB • Tercatat' : 'Belum Absen'}
                      </Text>
                    </View>

                    {/* Card 2: Pulang */}
                    <View style={[styles.gateStatusPillBox, gateToday?.has_check_out ? styles.gateStatusPillBoxActiveOut : styles.gateStatusPillBoxNeutral]}>
                      <View style={styles.gateStatusPillHeader}>
                        <MaterialCommunityIcons name="logout" size={13} color="#0D9488" />
                        <Text style={[styles.gateStatusPillLabel, gateToday?.has_check_out && { color: '#0F766E' }]}>PULANG</Text>
                      </View>
                      <Text style={styles.gateStatusPillValue} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.8}>
                        {gateToday?.attendance?.check_out_time ? `${String(gateToday.attendance.check_out_time).slice(0, 5)} WIB` : '--:--'}
                      </Text>
                      <Text style={[styles.gateStatusPillSub, gateToday?.has_check_out && { color: '#0D9488' }]} numberOfLines={1}>
                        {gateToday?.has_check_out ? 'WIB • Selesai' : 'Belum Absen'}
                      </Text>
                    </View>

                    {/* Card 3: Status */}
                    <View style={[
                      styles.gateStatusPillBox,
                      gateToday?.has_check_in ? styles.gateStatusPillBoxSuccess : styles.gateStatusPillBoxNeutral
                    ]}>
                      <View style={styles.gateStatusPillHeader}>
                        <MaterialCommunityIcons
                          name={gateToday?.has_check_in ? 'check-circle' : 'clock-outline'}
                          size={13}
                          color={gateToday?.has_check_in ? '#047857' : '#64748B'}
                        />
                        <Text style={[
                          styles.gateStatusPillLabel,
                          gateToday?.has_check_in ? { color: '#047857' } : { color: '#64748B' }
                        ]}>
                          STATUS
                        </Text>
                      </View>
                      <Text
                        style={[
                          styles.gateStatusPillValue,
                          gateToday?.has_check_in ? { color: '#047857' } : { color: '#64748B' }
                        ]}
                        numberOfLines={1}
                        adjustsFontSizeToFit
                        minimumFontScale={0.8}
                      >
                        {gateToday?.has_check_in ? (gateToday?.attendance?.status_label || gateToday?.attendance?.status || 'Hadir') : 'Belum Tap'}
                      </Text>
                      <Text style={[
                        styles.gateStatusPillSub,
                        gateToday?.has_check_in ? { color: '#059669' } : { color: '#94A3B8' }
                      ]} numberOfLines={1}>
                        {gateToday?.has_check_in ? 'Tervalidasi' : 'Gerbang'}
                      </Text>
                    </View>
                  </View>

                  {/* Dual Action Buttons Berdampingan ala TU */}
                  <View style={styles.gateActionButtonsRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => void handleGateTap('in')}
                      disabled={gateLoading || Boolean(gateToday?.has_check_in)}
                      style={[
                        styles.gateCheckActionBtn,
                        { backgroundColor: '#059669' },
                        Boolean(gateToday?.has_check_in) && { opacity: 0.55 },
                      ]}
                    >
                      {gateLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="login" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.gateCheckActionBtnText}>
                            {gateToday?.has_check_in ? 'Sudah Masuk' : 'Tap Masuk'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => void handleGateTap('out')}
                      disabled={
                        gateLoading ||
                        !gateToday?.has_check_in ||
                        Boolean(gateToday?.has_check_out)
                      }
                      style={[
                        styles.gateCheckActionBtn,
                        { backgroundColor: '#0D9488' },
                        (!gateToday?.has_check_in || Boolean(gateToday?.has_check_out)) && { opacity: 0.55 },
                      ]}
                    >
                      {gateLoading ? (
                        <ActivityIndicator size="small" color="#FFFFFF" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="logout" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                          <Text style={styles.gateCheckActionBtnText}>
                            {gateToday?.has_check_out ? 'Sudah Pulang' : 'Tap Pulang'}
                          </Text>
                        </>
                      )}
                    </TouchableOpacity>
                  </View>

                  {/* Tombol Pembaruan Khusus jika sudah Masuk & Pulang */}
                  {gateToday?.has_check_in && (
                    <View style={styles.gateSecondaryTapRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => void handleGateTap('in')}
                        style={styles.gateMiniRefreshBtn}
                      >
                        <MaterialCommunityIcons name="refresh" size={12} color="#059669" />
                        <Text style={styles.gateMiniRefreshBtnText}>Tap Ulang Masuk</Text>
                      </TouchableOpacity>

                      {gateToday?.has_check_out && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => void handleGateTap('out')}
                          style={styles.gateMiniRefreshBtn}
                        >
                          <MaterialCommunityIcons name="refresh" size={12} color="#0D9488" />
                          <Text style={[styles.gateMiniRefreshBtnText, { color: '#0D9488' }]}>Perbarui Pulang</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                  )}
                </LinearGradient>
              </View>
            </View>
          )}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4: RIWAYAT & LOG KEHADIRAN
             ══════════════════════════════════════════════════════════════ */}
          {/* ══════════════════════════════════════════════════════════════
              SECTION 4: RIWAYAT & LOG KEHADIRAN (UNIFIED CARD DENGAN SCROLL MAPEL & HARIAN)
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.containerBlock}>
            {isStaff && (
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>
                    {activeTab === 'permissions'
                      ? 'Daftar Pengajuan Izin Santri'
                      : activeTab === 'boarding'
                        ? 'Daftar Izin Keluar Asrama'
                        : activeTab === 'rekap_pegawai'
                          ? 'Rekap Presensi Seluruh Pegawai'
                          : 'Riwayat Presensi Mandiri'}
                  </Text>
                </View>
              </View>
            )}

            {/* UNIFIED LOG & FILTER CARD (Khusus Santri & Wali Mengintegrasikan Label & Filter ke Dalam Satu Card) */}
            {!isStaff ? (
              <View style={styles.unifiedLogHistoryCard}>
                {/* 1. Header Card: Label Riwayat & Log Kehadiran + Tombol Aksi */}
                <View style={styles.unifiedLogCardHeader}>
                  <View style={styles.unifiedLogHeaderLeft}>
                    <View style={styles.unifiedLogCardIconBox}>
                      <MaterialCommunityIcons name="clipboard-text-clock-outline" size={20} color="#059669" />
                    </View>
                    <View style={{ flex: 1, minWidth: 0 }}>
                      <Text numberOfLines={1} style={styles.unifiedLogCardTitle}>
                        {isParent && activeStudentName
                          ? `Riwayat & Log Kehadiran "${activeStudentName}"`
                          : 'Riwayat & Log Kehadiran'}
                      </Text>
                      <Text style={styles.unifiedLogCardSub}>
                        {unifiedItems.length} catatan aktivitas{selectedPeriod === 'daily' ? ' hari ini' : selectedPeriod === 'custom_date' ? ` pd ${formatTanggalSingkat(selectedCustomDate || todayDateStr)}` : selectedPeriod === 'weekly' ? ' 7 hari terakhir' : ''}
                      </Text>
                    </View>
                  </View>

                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flexShrink: 0 }}>
                    {isParent && activeTab === 'permissions' && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setIsPermissionModalOpen(true)}
                        style={styles.headerActionPillBtn}
                      >
                        <MaterialCommunityIcons name="plus" size={13} color="#059669" />
                        <Text style={styles.headerActionPillText}>Ajukan Izin</Text>
                      </TouchableOpacity>
                    )}
                    {(searchQuery.length > 0 || studentStatusFilter !== 'all' || activeTab !== 'all' || selectedPeriod !== 'daily' || selectedSubjectFilter !== 'all' || Boolean(selectedCustomDate)) ? (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setSearchQuery('');
                          setStudentStatusFilter('all');
                          setSelectedSubjectFilter('all');
                          setActiveTab('all');
                          setSelectedPeriod('daily');
                          setSelectedCustomDate('');
                        }}
                        style={styles.resetFilterPillBtn}
                      >
                        <MaterialCommunityIcons name="refresh" size={12} color="#059669" />
                        <Text style={styles.mutabaahFilterResetBtn}>Reset</Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                </View>

                {/* Divider Halus Pemisah Header & Filter */}
                <View style={styles.unifiedLogDivider} />

                {/* 2. Sub-Header Filter Bar */}
                <View style={styles.filterBarTitleRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="filter-variant" size={15} color="#059669" />
                    <Text style={styles.mutabaahFilterCardTitle}>Filter Log Kehadiran</Text>
                  </View>
                  {selectedPeriod === 'daily' && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsDatePickerModalOpen(true)}
                      style={styles.todayDateBadge}
                    >
                      <MaterialCommunityIcons name="calendar-today" size={11} color="#059669" />
                      <Text style={styles.todayDateBadgeText}>{formatTanggalIndo(todayDateStr)}</Text>
                      <MaterialCommunityIcons name="calendar-edit" size={11} color="#059669" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  )}
                  {selectedPeriod === 'custom_date' && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsDatePickerModalOpen(true)}
                      style={styles.customDateSelectedBadge}
                    >
                      <MaterialCommunityIcons name="calendar-check" size={12} color="#047857" />
                      <Text style={styles.customDateBadgeText}>{formatTanggalIndo(selectedCustomDate || todayDateStr)}</Text>
                      <MaterialCommunityIcons name="pencil-outline" size={11} color="#047857" style={{ marginLeft: 2 }} />
                    </TouchableOpacity>
                  )}
                </View>

                {/* 3. In-Card Search Input Bar */}
                <View style={styles.mutabaahSearchBox}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#64748B" />
                  <TextInput
                    placeholder="Cari mata pelajaran, tanggal, status..."
                    placeholderTextColor="#94A3B8"
                    value={searchQuery}
                    onChangeText={setSearchQuery}
                    style={styles.mutabaahSearchInput}
                  />
                  {searchQuery ? (
                    <TouchableOpacity onPress={() => setSearchQuery('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  ) : null}
                </View>

                {/* 4. Kategori Log Presensi (Semua, Presensi Kelas, Izin, Asrama) */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.mutabaahScopeTabsScroll}
                >
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setActiveTab('all')}
                    style={[styles.mutabaahScopePill, activeTab === 'all' && styles.mutabaahScopePillActive]}
                  >
                    <MaterialCommunityIcons name="view-grid-outline" size={13} color={activeTab === 'all' ? '#047857' : '#64748B'} />
                    <Text numberOfLines={1} style={[styles.mutabaahScopePillText, activeTab === 'all' && styles.mutabaahScopePillTextActive]}>
                      Semua ({attendanceLogs.length + permissionsHistory.length + dormitoryPermits.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setActiveTab('attendance')}
                    style={[styles.mutabaahScopePill, activeTab === 'attendance' && styles.mutabaahScopePillActive]}
                  >
                    <MaterialCommunityIcons name="school-outline" size={13} color={activeTab === 'attendance' ? '#047857' : '#64748B'} />
                    <Text numberOfLines={1} style={[styles.mutabaahScopePillText, activeTab === 'attendance' && styles.mutabaahScopePillTextActive]}>
                      Presensi Kelas ({attendanceLogs.length})
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setActiveTab('permissions')}
                    style={[styles.mutabaahScopePill, activeTab === 'permissions' && styles.mutabaahScopePillActive]}
                  >
                    <MaterialCommunityIcons name="file-document-outline" size={13} color={activeTab === 'permissions' ? '#047857' : '#64748B'} />
                    <Text numberOfLines={1} style={[styles.mutabaahScopePillText, activeTab === 'permissions' && styles.mutabaahScopePillTextActive]}>
                      Izin & Sakit ({permissionsHistory.length})
                    </Text>
                  </TouchableOpacity>

                  {dormitoryPermits.length > 0 && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setActiveTab('boarding')}
                      style={[styles.mutabaahScopePill, activeTab === 'boarding' && styles.mutabaahScopePillActive]}
                    >
                      <MaterialCommunityIcons name="home-city-outline" size={13} color={activeTab === 'boarding' ? '#047857' : '#64748B'} />
                      <Text numberOfLines={1} style={[styles.mutabaahScopePillText, activeTab === 'boarding' && styles.mutabaahScopePillTextActive]}>
                        Izin Asrama ({dormitoryPermits.length})
                      </Text>
                    </TouchableOpacity>
                  )}
                </ScrollView>

                {/* 5. DAFTAR MATA PELAJARAN (SCROLL HORIZONTAL) */}
                {availableSubjects.length > 0 && (
                  <View style={styles.subjectFilterContainer}>
                    <View style={styles.subjectSectionLabelRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <MaterialCommunityIcons name="book-open-page-variant-outline" size={13} color="#059669" />
                        <Text style={styles.subjectSectionLabel}>Daftar Mata Pelajaran</Text>
                      </View>
                      {selectedSubjectFilter !== 'all' && (
                        <TouchableOpacity onPress={() => setSelectedSubjectFilter('all')}>
                          <Text style={styles.subjectResetText}>Semua Mapel</Text>
                        </TouchableOpacity>
                      )}
                    </View>
                    <ScrollView
                      horizontal
                      showsHorizontalScrollIndicator={false}
                      contentContainerStyle={styles.subjectChipsScroll}
                    >
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedSubjectFilter('all')}
                        style={[
                          styles.subjectChip,
                          selectedSubjectFilter === 'all' && styles.subjectChipActive,
                        ]}
                      >
                        <MaterialCommunityIcons
                          name="bookshelf"
                          size={12}
                          color={selectedSubjectFilter === 'all' ? '#047857' : '#64748B'}
                        />
                        <Text
                          style={[
                            styles.subjectChipText,
                            selectedSubjectFilter === 'all' && styles.subjectChipTextActive,
                          ]}
                        >
                          Semua Mapel ({availableSubjects.length})
                        </Text>
                      </TouchableOpacity>

                      {availableSubjects.map((sub) => {
                        const isSubActive = selectedSubjectFilter.toLowerCase() === sub.toLowerCase();
                        return (
                          <TouchableOpacity
                            key={sub}
                            activeOpacity={0.8}
                            onPress={() =>
                              setSelectedSubjectFilter(isSubActive ? 'all' : sub)
                            }
                            style={[
                              styles.subjectChip,
                              isSubActive && styles.subjectChipActive,
                            ]}
                          >
                            <MaterialCommunityIcons
                              name="book-outline"
                              size={12}
                              color={isSubActive ? '#047857' : '#64748B'}
                            />
                            <Text
                              style={[
                                styles.subjectChipText,
                                isSubActive && styles.subjectChipTextActive,
                              ]}
                            >
                              {sub}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* 6. Filter Rentang Periode Waktu */}
                <View style={styles.periodSectionContainer}>
                  <View style={styles.periodLabelRow}>
                    <MaterialCommunityIcons name="calendar-clock-outline" size={13} color="#059669" />
                    <Text style={styles.subjectSectionLabel}>Rentang Waktu:</Text>
                  </View>
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.periodChipsRow}
                  >
                    {[
                      { key: 'daily', label: 'Hari Ini' },
                      {
                        key: 'custom_date',
                        label: selectedPeriod === 'custom_date' && selectedCustomDate
                          ? `Tgl: ${formatTanggalSingkat(selectedCustomDate)}`
                          : 'Pilih Tanggal',
                        icon: 'calendar-search',
                      },
                      { key: 'weekly', label: 'Mingguan' },
                      { key: 'monthly', label: 'Bulanan' },
                      { key: 'semester', label: 'Semester' },
                      { key: 'yearly', label: 'Tahun Ajaran' },
                    ].map((p) => {
                      const isActive = selectedPeriod === p.key;
                      return (
                        <TouchableOpacity
                          key={p.key}
                          activeOpacity={0.8}
                          onPress={() => {
                            if (p.key === 'custom_date') {
                              setSelectedPeriod('custom_date');
                              if (!selectedCustomDate) setSelectedCustomDate(todayDateStr);
                              setIsDatePickerModalOpen(true);
                            } else {
                              setSelectedPeriod(p.key as any);
                            }
                          }}
                          style={[styles.periodChip, isActive && styles.periodChipActive]}
                        >
                          {p.icon && (
                            <MaterialCommunityIcons
                              name={p.icon as any}
                              size={12}
                              color={isActive ? '#047857' : '#64748B'}
                              style={{ marginRight: 3 }}
                            />
                          )}
                          <Text style={[styles.periodChipText, isActive && styles.periodChipTextActive]}>
                            {p.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            ) : (
              <>
                {/* Filter Rentang Periode untuk Staff */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.periodChipsRow}
                  style={{ marginBottom: 12 }}
                >
                  {[
                    { key: 'daily', label: 'Hari Ini' },
                    {
                      key: 'custom_date',
                      label: selectedPeriod === 'custom_date' && selectedCustomDate
                        ? `Tgl: ${formatTanggalSingkat(selectedCustomDate)}`
                        : 'Pilih Tanggal',
                      icon: 'calendar-search',
                    },
                    { key: 'weekly', label: 'Mingguan' },
                    { key: 'monthly', label: 'Bulanan' },
                    { key: 'semester', label: 'Semester' },
                    { key: 'yearly', label: 'Tahun Ajaran' },
                  ].map((p) => {
                    const isActive = selectedPeriod === p.key;
                    return (
                      <TouchableOpacity
                        key={p.key}
                        activeOpacity={0.8}
                        onPress={() => {
                          if (p.key === 'custom_date') {
                            setSelectedPeriod('custom_date');
                            if (!selectedCustomDate) setSelectedCustomDate(todayDateStr);
                            setIsDatePickerModalOpen(true);
                          } else {
                            setSelectedPeriod(p.key as any);
                          }
                        }}
                        style={[styles.periodChip, isActive && styles.periodChipActive]}
                      >
                        {p.icon && (
                          <MaterialCommunityIcons
                            name={p.icon as any}
                            size={12}
                            color={isActive ? '#047857' : '#64748B'}
                            style={{ marginRight: 3 }}
                          />
                        )}
                        <Text style={[styles.periodChipText, isActive && styles.periodChipTextActive]}>
                          {p.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>

                {/* Sub-Filter Status Izin khusus saat Staff membuka tab Verifikasi Izin */}
                {activeTab === 'permissions' && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.permStatusFilterRow}
                  >
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setStaffPermFilter('all')}
                      style={[styles.permStatusPill, staffPermFilter === 'all' && styles.permStatusPillActive]}
                    >
                      <Text style={[styles.permStatusPillText, staffPermFilter === 'all' && styles.permStatusPillTextActive]}>
                        Semua ({permissionsHistory.length})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setStaffPermFilter('pending')}
                      style={[styles.permStatusPill, staffPermFilter === 'pending' && styles.permStatusPillActiveAmber]}
                    >
                      <Text style={[styles.permStatusPillText, staffPermFilter === 'pending' && styles.permStatusPillTextActiveAmber]}>
                        Menunggu ({pendingPermCount})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setStaffPermFilter('approved')}
                      style={[styles.permStatusPill, staffPermFilter === 'approved' && styles.permStatusPillActiveEmerald]}
                    >
                      <Text style={[styles.permStatusPillText, staffPermFilter === 'approved' && styles.permStatusPillTextActiveEmerald]}>
                        Disetujui ({approvedPermCount})
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setStaffPermFilter('rejected')}
                      style={[styles.permStatusPill, staffPermFilter === 'rejected' && styles.permStatusPillActiveRose]}
                    >
                      <Text style={[styles.permStatusPillText, staffPermFilter === 'rejected' && styles.permStatusPillTextActiveRose]}>
                        Ditolak ({rejectedPermCount})
                      </Text>
                    </TouchableOpacity>
                  </ScrollView>
                )}
                {activeTab === 'boarding' && (
                  <View style={{ marginBottom: 12, paddingHorizontal: 2 }}>
                    {/* Active Boarding Pass Card if any is currently out */}
                    {(() => {
                      const activePermit = dormitoryPermits.find(
                        (p) => p.status === 'keluar' || p.presence_status === 'di_luar' || p.presence_status === 'berobat'
                      );
                      if (!activePermit) return null;
                      const isOverdue = activePermit.deadline_status === 'overdue';
                      const isMedical = activePermit.permit_type === 'sakit_berobat' || activePermit.presence_status === 'berobat';

                      return (
                        <LinearGradient
                          colors={isOverdue ? ['#7F1D1D', '#991B1B', '#DC2626'] : isMedical ? ['#78350F', '#B45309', '#D97706'] : ['#064E3B', '#047857', '#059669']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={{
                            borderRadius: 18,
                            padding: 14,
                            marginBottom: 10,
                            shadowColor: '#000',
                            shadowOffset: { width: 0, height: 2 },
                            shadowOpacity: 0.15,
                            shadowRadius: 5,
                            elevation: 3,
                          }}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                              <MaterialCommunityIcons name={isMedical ? 'hospital-box-outline' : 'home-city-outline'} size={18} color="#FFFFFF" />
                              <Text style={{ color: '#FFFFFF', fontSize: 12, fontWeight: '800', letterSpacing: 0.5 }}>
                                {isMedical ? 'STATUS: SEDANG BEROBAT' : 'STATUS: SEDANG DI LUAR PONDOK'}
                              </Text>
                            </View>
                            <View style={{ backgroundColor: 'rgba(255,255,255,0.2)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 10 }}>
                              <Text style={{ color: '#FFFFFF', fontSize: 10, fontWeight: '700', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }}>
                                #{activePermit.permit_number}
                              </Text>
                            </View>
                          </View>

                          <View style={{ marginTop: 8 }}>
                            <Text style={{ color: '#FFFFFF', fontSize: 13, fontWeight: '700' }}>
                              Tujuan: {activePermit.medical_destination || activePermit.destination || 'Rumah'}
                            </Text>
                            <Text style={{ color: '#F1F5F9', fontSize: 11, marginTop: 2 }}>
                              Wajib Kembali Sebelum: <Text style={{ fontWeight: '800' }}>{formatJamIndo(activePermit.scheduled_return_at)} WIB</Text>
                            </Text>
                            {isOverdue && (
                              <Text style={{ color: '#FEF08A', fontSize: 11, fontWeight: '800', marginTop: 3 }}>
                                ⚠️ Perhatian: Telah melewati batas jam kembali yang ditentukan!
                              </Text>
                            )}
                          </View>
                        </LinearGradient>
                      );
                    })()}
                  </View>
                )}
              </>
            )}

            {/* Error Banner jika gagal fetch */}
            {Boolean(error) && (
              <View style={styles.errorBannerWrap}>
                <View style={styles.errorBannerContent}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#DC2626" />
                  <Text style={styles.errorBannerText}>{error}</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={styles.retryBtn}
                  onPress={() => {
                    setLoading(true);
                    void loadAttendanceData();
                  }}
                >
                  <MaterialCommunityIcons name="refresh" size={14} color="#059669" />
                  <Text style={styles.retryBtnText}>Coba Lagi</Text>
                </TouchableOpacity>
              </View>
            )}

            {/* List Items */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#18A165" />
                <Text style={styles.loadingText}>Memuat riwayat presensi dari database...</Text>
              </View>
            ) : unifiedItems.length === 0 ? (
              <EmptyStateCard
                icon="clipboard-check-outline"
                title={
                  selectedPeriod === 'daily'
                    ? 'Belum Ada Presensi Hari Ini'
                    : selectedPeriod === 'custom_date'
                      ? `Belum Ada Presensi (${formatTanggalSingkat(selectedCustomDate || todayDateStr)})`
                      : selectedSubjectFilter !== 'all'
                        ? `Belum Ada Presensi ${selectedSubjectFilter}`
                        : 'Belum Ada Riwayat Presensi'
                }
                description={
                  selectedPeriod === 'daily'
                    ? `Tidak ditemukan catatan kehadiran pada hari ini (${formatTanggalIndo(todayDateStr)}). Pilih rentang waktu "Mingguan" atau "Semua" untuk melihat riwayat sebelumnya.`
                    : selectedPeriod === 'custom_date'
                      ? `Tidak ditemukan catatan kehadiran pada tanggal ${formatTanggalIndo(selectedCustomDate || todayDateStr)}. Anda dapat memilih tanggal lain melalui tombol kalender di atas.`
                      : selectedSubjectFilter !== 'all'
                        ? `Tidak ditemukan catatan presensi untuk mata pelajaran ${selectedSubjectFilter}. Tekan tombol "Semua Mapel" untuk melihat mapel lainnya.`
                        : 'Riwayat presensi kelas dan catatan kehadiran akan tampil otomatis di sini setelah dicatat guru.'
                }
              />
            ) : (
              <View style={!isStaff ? styles.mutabaahItemsList : styles.itemsListWrap}>
                {unifiedItems.map((item) => {
                  const tone = getStatusColor(item.statusKey);
                  const isStaffReview = item.category === 'staff_permission_review';
                  const permStatusRaw = String(item.raw?.status || '').toLowerCase();
                  const canReviewThis = isStaffReview && (permStatusRaw === 'pending' || permStatusRaw === 'submitted' || permStatusRaw === 'menunggu');

                  if (!isStaff) {
                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.85}
                        onPress={() => {
                          setSelectedDetail(item);
                          setIsDetailModalOpen(true);
                        }}
                        style={[
                          styles.mutabaahStudentCard,
                          {
                            borderLeftWidth: 4.5,
                            borderLeftColor: tone.text,
                            borderColor: tone.border,
                          },
                        ]}
                      >
                        {/* Card Header: Avatar/Icon + Judul/Mapel + Badge Status */}
                        <View style={styles.mutabaahCardHeader}>
                          <View style={[styles.mutabaahAvatarCircle, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                            <MaterialCommunityIcons name={tone.icon as any} size={20} color={tone.text} />
                          </View>
                          <View style={styles.mutabaahMetaCol}>
                            <Text numberOfLines={1} style={styles.mutabaahStudentName}>
                              {item.title}
                            </Text>
                            <Text numberOfLines={1} style={styles.mutabaahStudentSub}>
                              {item.subtitle}
                            </Text>
                          </View>
                          <View style={[styles.mutabaahStatusBadge, { backgroundColor: tone.bg, borderColor: tone.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                            <MaterialCommunityIcons name={tone.icon as any} size={11} color={tone.text} />
                            <Text style={[styles.mutabaahStatusBadgeText, { color: tone.text }]}>
                              {item.status}
                            </Text>
                          </View>
                        </View>

                        {/* Tanggal & Waktu Presensi */}
                        <View style={styles.mutabaahCardDetailsRow}>
                          <View style={[styles.infoMetaPill, { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' }]}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={12} color="#059669" />
                            <Text style={[styles.infoMetaText, { color: '#059669', fontWeight: '800' }]}>
                              {formatTanggalIndo(item.date)}
                            </Text>
                          </View>
                          <View style={[styles.infoMetaPill, { backgroundColor: '#F0F9FF', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' }]}>
                            <MaterialCommunityIcons name="clock-outline" size={12} color="#0284C7" />
                            <Text style={[styles.infoMetaText, { color: '#0284C7', fontWeight: '700' }]}>{item.time}</Text>
                          </View>
                        </View>

                        {/* Notes / Catatan Kehadiran */}
                        {item.notes ? (
                          <View style={[styles.notesBox, { backgroundColor: tone.bg, borderColor: tone.border, borderLeftWidth: 3.5, borderLeftColor: tone.text }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                              <MaterialCommunityIcons name="comment-text-outline" size={13} color={tone.text} />
                              <Text style={{ fontSize: 11, fontWeight: '800', color: tone.text }}>Catatan Presensi:</Text>
                            </View>
                            <Text numberOfLines={3} style={[styles.notesText, { color: '#334155' }]}>
                              {item.notes}
                            </Text>
                          </View>
                        ) : null}

                        {/* Lampiran (jika ada) */}
                        {item.attachmentUrl ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => openAttachmentPreview(item.attachmentUrl, `Lampiran - ${item.title}`)}
                            style={[styles.attachmentBadgeBtn, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}
                          >
                            <MaterialCommunityIcons name="paperclip" size={14} color="#059669" />
                            <Text style={[styles.attachmentBadgeBtnText, { color: '#059669', fontWeight: '700' }]}>Lihat Lampiran Surat / Bukti</Text>
                            <MaterialCommunityIcons name="open-in-new" size={12} color="#059669" />
                          </TouchableOpacity>
                        ) : null}

                        {/* Card Bottom: Tap to Detail */}
                        <View style={styles.mutabaahCardActionRow}>
                          <View style={styles.mutabaahDetailHint}>
                            <MaterialCommunityIcons name="information-outline" size={13} color={tone.text} />
                            <Text style={[styles.mutabaahDetailHintText, { color: tone.text }]}>Ketuk untuk rincian catatan lengkap</Text>
                          </View>
                          <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: tone.bg, alignItems: 'center', justifyContent: 'center' }}>
                            <MaterialCommunityIcons name="chevron-right" size={15} color={tone.text} />
                          </View>
                        </View>
                      </TouchableOpacity>
                    );
                  }

                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedDetail(item);
                        setIsDetailModalOpen(true);
                      }}
                      style={[
                        styles.historyItemCard,
                        {
                          borderLeftWidth: 4.5,
                          borderLeftColor: tone.text,
                          borderColor: tone.border,
                        },
                      ]}
                    >
                      <View style={styles.historyItemTop}>
                        <View style={[styles.itemCategoryIconBox, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                          <MaterialCommunityIcons name={tone.icon as any} size={18} color={tone.text} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text numberOfLines={1} style={styles.itemTitle}>
                            {item.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.itemSubtitle}>
                            {item.subtitle}
                          </Text>
                        </View>
                        <View style={[styles.statusBadgePill, { backgroundColor: tone.bg, borderColor: tone.border, flexDirection: 'row', alignItems: 'center', gap: 4 }]}>
                          <MaterialCommunityIcons name={tone.icon as any} size={12} color={tone.text} />
                          <Text style={[styles.statusBadgeText, { color: tone.text }]}>{item.status}</Text>
                        </View>
                      </View>

                      <View style={styles.historyItemBottom}>
                        <View style={[styles.infoMetaPill, { backgroundColor: '#ECFDF5', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8, borderWidth: 1, borderColor: '#A7F3D0' }]}>
                          <MaterialCommunityIcons name={isStaffReview ? "calendar-range" : "calendar-month-outline"} size={12} color={isStaffReview ? "#0D9488" : "#059669"} />
                          <Text style={[styles.infoMetaText, { color: isStaffReview ? '#0D9488' : '#059669', fontWeight: '800' }]}>{item.time}</Text>
                        </View>
                        <View style={[styles.infoMetaPill, { backgroundColor: '#F0F9FF', paddingHorizontal: 8, paddingVertical: 3.5, borderRadius: 8, borderWidth: 1, borderColor: '#BAE6FD' }]}>
                          <MaterialCommunityIcons name="clock-outline" size={12} color="#0284C7" />
                          <Text style={[styles.infoMetaText, { color: '#0284C7', fontWeight: '700' }]}>{isStaffReview ? `Diajukan: ${formatTanggalIndo(item.date)}` : item.time}</Text>
                        </View>
                      </View>

                      {item.notes ? (
                        <View style={[styles.notesBox, { backgroundColor: tone.bg, borderColor: tone.border, borderLeftWidth: 3.5, borderLeftColor: tone.text }]}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginBottom: 3 }}>
                            <MaterialCommunityIcons name="comment-text-outline" size={13} color={tone.text} />
                            <Text style={{ fontSize: 11, fontWeight: '800', color: tone.text }}>
                              {isStaffReview ? 'Alasan Pengajuan:' : 'Catatan Presensi:'}
                            </Text>
                          </View>
                          <Text numberOfLines={3} style={[styles.notesText, { color: '#334155' }]}>
                            {item.notes}
                          </Text>
                        </View>
                      ) : null}

                      {item.attachmentUrl ? (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => openAttachmentPreview(item.attachmentUrl, `Lampiran - ${item.title}`)}
                          style={styles.attachmentBadgeBtn}
                        >
                          <MaterialCommunityIcons name="paperclip" size={14} color="#059669" />
                          <Text style={styles.attachmentBadgeBtnText}>Lihat Lampiran Surat / Bukti</Text>
                          <MaterialCommunityIcons name="open-in-new" size={12} color="#059669" />
                        </TouchableOpacity>
                      ) : null}

                      {/* Info Review jika sudah pernah diproses */}
                      {isStaffReview && (item.raw?.reviewer?.nama_lengkap || item.raw?.reviewer?.name || item.raw?.reviewed_at) ? (
                        <View style={[styles.notesBox, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0', marginTop: 8 }]}>
                          <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>
                            Ditinjau oleh: {item.raw?.reviewer?.nama_lengkap || item.raw?.reviewer?.name || 'Pimpinan'} • {formatTanggalIndo(item.raw?.reviewed_at)}
                          </Text>
                          {item.raw?.review_notes ? (
                            <Text style={{ fontSize: 11, color: '#334155', marginTop: 2, fontStyle: 'italic' }}>
                              Catatan: "{item.raw.review_notes}"
                            </Text>
                          ) : null}
                        </View>
                      ) : null}

                      {/* Tombol Aksi Verifikasi: Setujui / Tolak */}
                      {isStaffReview && (
                        <View style={styles.reviewCardActionRow}>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => {
                              setSelectedPermForReview(item.raw);
                              setReviewAction('approve');
                              setReviewNotes('');
                              setIsReviewModalOpen(true);
                            }}
                            style={[styles.permActionBtn, styles.permApproveBtn]}
                          >
                            <MaterialCommunityIcons name="check-circle" size={15} color="#FFFFFF" />
                            <Text style={styles.permActionBtnText}>
                              {canReviewThis ? 'Setujui Izin' : 'Ubah ke Setujui'}
                            </Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => {
                              setSelectedPermForReview(item.raw);
                              setReviewAction('reject');
                              setReviewNotes('');
                              setIsReviewModalOpen(true);
                            }}
                            style={[styles.permActionBtn, styles.permRejectBtn]}
                          >
                            <MaterialCommunityIcons name="close-circle-outline" size={15} color="#E11D48" />
                            <Text style={[styles.permActionBtnText, { color: '#E11D48' }]}>
                              {canReviewThis ? 'Tolak Izin' : 'Ubah ke Tolak'}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
          </View>
          </View>
        </Animated.ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════
          SECTION REKAP SISWA — setara web-dashboard LaporanSiswaPage
         ══════════════════════════════════════════════════════════════ */}
      {activeTab === 'rekap_siswa' && canViewStudentReport && (
        <Modal
          visible={true}
          animationType="slide"
          transparent={false}
          onRequestClose={() => setActiveTab('attendance')}
          statusBarTranslucent
        >
          <View style={{ flex: 1, backgroundColor: '#F8FAFC' }}>
            {/* ── HEADER DATA MASTER TERPADU ── */}
            <LinearGradient
              colors={['#065F46', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={[styles.masterHeaderContainer, { paddingTop: topInset + 6, paddingBottom: 14 }]}
            >
              <View style={styles.masterHeaderTopRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setActiveTab('attendance')}
                  style={styles.masterBackButton}
                  accessibilityRole="button"
                  accessibilityLabel="Kembali"
                >
                  <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
                </TouchableOpacity>

                <View style={styles.masterHeaderTitleWrap}>
                  <View style={styles.masterHeaderBadge}>
                    <MaterialCommunityIcons name="database-check" size={12} color="#D1FAE5" />
                    <Text style={styles.masterHeaderBadgeText}>PUSAT DATA MASTER KESISWAAN</Text>
                  </View>
                  <Text style={styles.masterHeaderMainTitle} numberOfLines={1}>
                    Rekap Data Siswa
                  </Text>
                </View>

                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setRekapPrintModalOpen(true)}
                    style={styles.masterRefreshButton}
                    accessibilityRole="button"
                    accessibilityLabel="Cetak dan Preview"
                  >
                    <MaterialCommunityIcons name="printer-outline" size={20} color="#FFFFFF" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setRekapSiswaDashboard(null);
                      rekapSiswaDashboardLoaded.current = false;
                      void loadStudentRekapData();
                    }}
                    style={styles.masterRefreshButton}
                    accessibilityRole="button"
                    accessibilityLabel="Segarkan Data"
                  >
                    <MaterialCommunityIcons
                      name="refresh"
                      size={20}
                      color="#FFFFFF"
                      style={rekapSiswaLoading ? { transform: [{ rotate: '45deg' }] } : undefined}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </LinearGradient>

            {/* ── Sub-Tabs Nav: Demografi, Prestasi, Kelulusan & Alumni, Mutasi ── */}
            <View style={styles.masterSegmentContainer}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.masterSegmentScroll}>
                {[
                  { key: 'demografi', label: 'Demografi & Siswa', icon: 'account-group', count: rekapSiswaStats.total },
                  { key: 'prestasi', label: 'Prestasi Siswa', icon: 'trophy-award', count: prestasiKpi.total },
                  { key: 'kelulusan', label: 'Kelulusan & Alumni', icon: 'school', count: kelulusanKpi.total },
                  { key: 'mutasi', label: 'Mutasi Santri', icon: 'account-switch', count: mutasiKpi.total },
                ].map((tab) => {
                  const isActive = rekapSubTab === tab.key;
                  return (
                    <TouchableOpacity
                      key={tab.key}
                      activeOpacity={0.8}
                      onPress={() => setRekapSubTab(tab.key as any)}
                      style={[
                        styles.masterSegmentBtn,
                        isActive && styles.masterSegmentBtnActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={tab.icon as any}
                        size={16}
                        color={isActive ? '#FFFFFF' : '#475569'}
                      />
                      <Text
                        style={[
                          styles.masterSegmentBtnText,
                          isActive && styles.masterSegmentBtnTextActive,
                        ]}
                      >
                        {tab.label} ({tab.count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingTop: 14, paddingBottom: bottomInset + 24 }}
              refreshControl={
                <RefreshControl
                  refreshing={rekapSiswaLoading}
                  onRefresh={() => {
                    rekapSiswaDashboardLoaded.current = false;
                    void loadStudentRekapData();
                  }}
                  colors={['#059669']}
                  tintColor="#059669"
                />
              }
            >
              {/* ── KONTEN SUB-TAB 1: DEMOGRAFI & SISWA ── */}
              {rekapSubTab === 'demografi' && (
                <>
                  {/* ── KPI Stats Cards (Harmonized with HomeScreen hubCard & statCard) ── */}
                  <View style={rekapStyles.statsRow}>
                {[
                  { label: 'Total Siswa', value: rekapSiswaStats.total, icon: 'account-group', bg: '#F0FDF4', color: '#059669', border: '#BBF7D0', iconBg: '#DCFCE7', tag: 'Total', tagColor: '#047857', isHero: true },
                  { label: 'Siswa Aktif', value: rekapSiswaStats.aktif, icon: 'account-check', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', iconBg: '#DBEAFE', tag: 'Aktif', tagColor: '#1D4ED8' },
                  { label: 'Siswa Alumni', value: rekapSiswaStats.alumni, icon: 'school', bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', iconBg: '#FEF3C7', tag: 'Tamat', tagColor: '#B45309' },
                  { label: 'Pindah / Mutasi', value: rekapSiswaStats.mutasi, icon: 'account-arrow-right', bg: '#FAF5FF', color: '#7C3AED', border: '#E9D5FF', iconBg: '#F3E8FF', tag: 'Mutasi', tagColor: '#6B21A8' },
                  { label: 'Non-Aktif', value: rekapSiswaStats.nonaktif, icon: 'account-cancel', bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3', iconBg: '#FFE4E6', tag: 'Pasif', tagColor: '#BE123C' },
                ].map((card) => {
                  if (card.isHero) {
                    return (
                      <View key={card.label} style={[rekapStyles.statHeroCard, { backgroundColor: card.bg, borderColor: card.border }]}>
                        <View style={rekapStyles.statHeroTopRow}>
                          <View style={[rekapStyles.statHeroIconBox, { backgroundColor: card.iconBg }]}>
                            <MaterialCommunityIcons name={card.icon as any} size={22} color={card.color} />
                          </View>
                          <View style={[rekapStyles.statHeroTag, { backgroundColor: card.iconBg }]}>
                            <Text style={[rekapStyles.statHeroTagText, { color: card.tagColor }]}>Data Terpadu</Text>
                          </View>
                        </View>
                        <View style={rekapStyles.statHeroContentRow}>
                          <View>
                            <Text style={rekapStyles.statHeroLabel}>TOTAL KESELURUHAN SISWA</Text>
                            <Text style={rekapStyles.statHeroValue}>{card.value}</Text>
                          </View>
                          <View style={rekapStyles.statHeroFooterBadge}>
                            <Text style={rekapStyles.statHeroFooterText}>100% Terdaftar</Text>
                          </View>
                        </View>
                      </View>
                    );
                  }
                  const percent = rekapSiswaStats.total ? ((card.value / rekapSiswaStats.total) * 100).toFixed(1) : '0';
                  return (
                    <View key={card.label} style={[rekapStyles.statCard, { backgroundColor: card.bg, borderColor: card.border }]}>
                      <View style={rekapStyles.statTopRow}>
                        <View style={[rekapStyles.statIconBox, { backgroundColor: card.iconBg }]}>
                          <MaterialCommunityIcons name={card.icon as any} size={18} color={card.color} />
                        </View>
                        <View style={[rekapStyles.statTag, { backgroundColor: card.iconBg }]}>
                          <Text style={[rekapStyles.statTagText, { color: card.tagColor }]}>{card.tag}</Text>
                        </View>
                      </View>
                      <Text style={rekapStyles.statLabel}>{card.label}</Text>
                      <Text style={rekapStyles.statValue}>{card.value}</Text>
                      <View style={rekapStyles.statFooter}>
                        <Text style={[rekapStyles.statFooterText, { color: card.color }]}>{percent}% dari total</Text>
                      </View>
                    </View>
                  );
                })}
              </View>

              {/* ── Filter Bar ── */}
              <View style={rekapStyles.filterCard}>
                <View style={rekapStyles.filterCardHeader}>
                  <Text style={rekapStyles.filterCardTitle}>Filter Laporan Siswa</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setRekapSiswaCari('');
                      setRekapSiswaFilterUnit('semua');
                      setRekapSiswaFilterKelas('semua');
                      setRekapSiswaFilterStatus('semua');
                      setRekapSiswaFilterGender('semua');
                      setRekapSiswaPage(1);
                    }}
                  >
                    <Text style={rekapStyles.filterResetBtn}>Reset Filter</Text>
                  </TouchableOpacity>
                </View>

                {/* Pencarian */}
                <View style={rekapStyles.searchBox}>
                  <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                  <TextInput
                    style={rekapStyles.searchInput}
                    placeholder="Cari NIS, nama, kelas, unit..."
                    placeholderTextColor="#94A3B8"
                    value={rekapSiswaCari}
                    onChangeText={(v) => { setRekapSiswaCari(v); setRekapSiswaPage(1); }}
                  />
                  {rekapSiswaCari.length > 0 && (
                    <TouchableOpacity onPress={() => setRekapSiswaCari('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* ── 1. Unit Pendidikan: Jika 1 unit tampilkan CARD, jika >1 unit tampilkan DROPDOWN ── */}
                {daftarUnitRekap.length === 1 ? (
                  <View style={rekapStyles.singleUnitNoticeCard}>
                    <View style={rekapStyles.singleUnitNoticeIconBox}>
                      <MaterialCommunityIcons name="domain" size={20} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={rekapStyles.singleUnitNoticeSub}>Unit Pendidikan</Text>
                      <Text style={rekapStyles.singleUnitNoticeTitle} numberOfLines={1}>
                        {String(daftarUnitRekap[0] || '')}
                      </Text>
                    </View>
                    <View style={rekapStyles.singleUnitNoticeBadge}>
                      <Text style={rekapStyles.singleUnitNoticeBadgeText}>Terpilih</Text>
                    </View>
                  </View>
                ) : daftarUnitRekap.length > 1 ? (
                  <View style={{ marginBottom: 10 }}>
                    <Text style={rekapStyles.filterLabel}>Unit Pendidikan</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setRekapUnitDropdownOpen(true)}
                      style={rekapStyles.dropdownTrigger}
                    >
                      <MaterialCommunityIcons name="domain" size={18} color="#059669" />
                      <Text style={rekapStyles.dropdownTriggerText} numberOfLines={1}>
                        {rekapSiswaFilterUnit === 'semua' ? 'Semua Unit Pendidikan' : rekapSiswaFilterUnit}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                ) : null}

                {/* ── 2. Status Siswa: DROPDOWN ── */}
                <Text style={rekapStyles.filterLabel}>Status Siswa</Text>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setRekapStatusDropdownOpen(true)}
                  style={rekapStyles.dropdownTrigger}
                >
                  <MaterialCommunityIcons name="account-check-outline" size={18} color="#059669" />
                  <Text style={rekapStyles.dropdownTriggerText} numberOfLines={1}>
                    {rekapStatusOptions.find((o) => o.key === rekapSiswaFilterStatus)?.label || 'Semua Status'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>

                {/* ── 3. Kelas / Rombel: DROPDOWN ── */}
                {daftarKelasRekap.length > 0 && (
                  <>
                    <Text style={rekapStyles.filterLabel}>Kelas / Rombel</Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setRekapKelasDropdownOpen(true)}
                      style={rekapStyles.dropdownTrigger}
                    >
                      <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
                      <Text style={rekapStyles.dropdownTriggerText} numberOfLines={1}>
                        {rekapSiswaFilterKelas === 'semua' ? 'Semua Kelas & Rombel' : rekapSiswaFilterKelas}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </>
                )}

                {/* ── 4. Jenis Kelamin: Pills ── */}
                <Text style={rekapStyles.filterLabel}>Jenis Kelamin</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                  {[
                    { key: 'semua', label: 'Semua Gender' },
                    { key: 'L', label: 'Laki-laki (L)' },
                    { key: 'P', label: 'Perempuan (P)' },
                  ].map((opt) => (
                    <TouchableOpacity
                      key={opt.key}
                      activeOpacity={0.8}
                      onPress={() => { setRekapSiswaFilterGender(opt.key); setRekapSiswaPage(1); }}
                      style={[
                        rekapStyles.filterPill,
                        rekapSiswaFilterGender === opt.key && rekapStyles.filterPillActive,
                      ]}
                    >
                      <Text style={[
                        rekapStyles.filterPillText,
                        rekapSiswaFilterGender === opt.key && rekapStyles.filterPillTextActive,
                      ]}>
                        {opt.label}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              {/* ── Daftar Siswa ── */}
              <View style={rekapStyles.listCard}>
                <View style={rekapStyles.listHeader}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
                    <MaterialCommunityIcons name="format-list-bulleted" size={16} color="#059669" />
                    <Text style={rekapStyles.listHeaderTitle}>
                      Daftar Rincian Siswa
                    </Text>
                    <View style={rekapStyles.listCountBadge}>
                      <Text style={rekapStyles.listCountBadgeText}>{rekapSiswaFiltered.length} Siswa</Text>
                    </View>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setRekapPrintModalOpen(true)}
                    style={rekapStyles.printTriggerBtn}
                  >
                    <MaterialCommunityIcons name="printer-eye" size={15} color="#059669" />
                    <Text style={rekapStyles.printTriggerBtnText}>Cetak & Preview</Text>
                  </TouchableOpacity>
                </View>

                {rekapSiswaLoading ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <ActivityIndicator size="small" color="#059669" />
                    <Text style={{ marginTop: 10, color: '#64748B', fontSize: 13 }}>Memuat data siswa...</Text>
                  </View>
                ) : rekapSiswaPageData.length === 0 ? (
                  <View style={{ padding: 32, alignItems: 'center' }}>
                    <MaterialCommunityIcons name="account-search-outline" size={40} color="#CBD5E1" />
                    <Text style={{ marginTop: 10, color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                      Tidak ada data siswa yang cocok dengan filter atau pencarian.
                    </Text>
                  </View>
                ) : (
                  <>
                    {rekapSiswaPageData.map((item: any, idx: number) => {
                      const statusRaw = String(item.status || (item.aktif ? 'aktif' : 'nonaktif')).toLowerCase();
                      const isAlumni = statusRaw.includes('alumni');
                      const isMutasi = statusRaw.includes('mutasi');
                      const isNonaktif = !item.aktif && !isAlumni && !isMutasi;
                      const badgeBg = isAlumni ? '#FEF9EC' : isMutasi ? '#F1F5F9' : isNonaktif ? '#FFF1F2' : '#ECFDF5';
                      const badgeColor = isAlumni ? '#D97706' : isMutasi ? '#64748B' : isNonaktif ? '#E11D48' : '#059669';
                      const badgeLabel = isAlumni ? 'Alumni' : isMutasi ? 'Mutasi' : isNonaktif ? 'Non-aktif' : 'Aktif';
                      const initials = (item.nama || 'S').trim().split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
                      return (
                        <TouchableOpacity
                          key={item.id || item.nis || idx}
                          activeOpacity={0.88}
                          onPress={() => {
                            setSelectedRekapSiswa(item);
                            setRekapSiswaDetailOpen(true);
                          }}
                          style={rekapStyles.studentCard}
                        >
                          {/* Avatar inisial */}
                          <View style={rekapStyles.studentAvatar}>
                            {item.foto_url ? (
                              <Image source={{ uri: item.foto_url }} style={rekapStyles.studentAvatarImg} />
                            ) : (
                              <Image source={getStudentAvatarSource(item)} style={rekapStyles.studentAvatarImg} />
                            )}
                          </View>
                          {/* Info */}
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <Text numberOfLines={1} style={rekapStyles.studentName}>{item.nama || '-'}</Text>
                            <Text numberOfLines={1} style={rekapStyles.studentNis}>
                              NIS: {item.nis || '-'} · {item.jenis_kelamin || item.jk || '-'}
                            </Text>
                            <View style={rekapStyles.studentMetaRow}>
                              <View style={rekapStyles.studentUnitBadge}>
                                <Text numberOfLines={1} style={rekapStyles.studentUnitText}>{item.unit || '-'}</Text>
                              </View>
                              <Text style={rekapStyles.studentKelasDot}>·</Text>
                              <Text numberOfLines={1} style={rekapStyles.studentKelas}>{item.kelas || '-'}</Text>
                            </View>
                          </View>
                          {/* Status Badge */}
                          <View style={[rekapStyles.statusBadge, { backgroundColor: badgeBg }]}>
                            <Text style={[rekapStyles.statusBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}

                    {/* Pagination */}
                    {rekapSiswaTotalPages > 1 && (
                      <View style={rekapStyles.paginationRow}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          disabled={rekapSiswaPage <= 1}
                          onPress={() => setRekapSiswaPage((p) => Math.max(1, p - 1))}
                          style={[rekapStyles.pagBtn, rekapSiswaPage <= 1 && { opacity: 0.35 }]}
                        >
                          <MaterialCommunityIcons name="chevron-left" size={18} color="#fff" />
                        </TouchableOpacity>
                        <Text style={rekapStyles.pagText}>
                          Hal {rekapSiswaPage} / {rekapSiswaTotalPages}
                        </Text>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          disabled={rekapSiswaPage >= rekapSiswaTotalPages}
                          onPress={() => setRekapSiswaPage((p) => Math.min(rekapSiswaTotalPages, p + 1))}
                          style={[rekapStyles.pagBtn, rekapSiswaPage >= rekapSiswaTotalPages && { opacity: 0.35 }]}
                        >
                          <MaterialCommunityIcons name="chevron-right" size={18} color="#fff" />
                        </TouchableOpacity>
                      </View>
                    )}
                  </>
                )}
              </View>
                </>
              )}

              {/* ── KONTEN SUB-TAB 2: PRESTASI SISWA ── */}
              {rekapSubTab === 'prestasi' && (
                <>
                  {/* KPI Cards Prestasi (4 Cards) */}
                  <View style={rekapStyles.kpiCardsRow}>
                    {/* Card 1: Total Prestasi */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#BFDBFE' }]}>
                      <LinearGradient colors={['#EFF6FF', '#DBEAFE']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#2563EB' }]}>
                            <MaterialCommunityIcons name="trophy-award" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#1E40AF' }]}>{prestasiKpi.total}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#1D4ED8' }]}>Total Prestasi</Text>
                        <Text style={rekapStyles.kpiSub}>Capaian Penghargaan</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 2: Tingkat Nasional */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#FDE68A' }]}>
                      <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#D97706' }]}>
                            <MaterialCommunityIcons name="flag-variant" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#B45309' }]}>{prestasiKpi.nasional}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#92400E' }]}>Tingkat Nasional</Text>
                        <Text style={rekapStyles.kpiSub}>Prestasi Bergengsi</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 3: Tingkat Provinsi */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#A7F3D0' }]}>
                      <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#059669' }]}>
                            <MaterialCommunityIcons name="map-marker-radius" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#065F46' }]}>{prestasiKpi.provinsi}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#047857' }]}>Tingkat Provinsi</Text>
                        <Text style={rekapStyles.kpiSub}>Wilayah Terpadu</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 4: Tingkat Kota / Kab */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#DDD6FE' }]}>
                      <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#7C3AED' }]}>
                            <MaterialCommunityIcons name="city" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#6D28D9' }]}>{prestasiKpi.kota}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#5B21B6' }]}>Tingkat Kota / Kab</Text>
                        <Text style={rekapStyles.kpiSub}>Kompetisi Daerah</Text>
                      </LinearGradient>
                    </View>
                  </View>

                  {/* Filter & Search Prestasi */}
                  <View style={rekapStyles.filterCard}>
                    <View style={rekapStyles.filterCardHeader}>
                      <Text style={rekapStyles.filterCardTitle}>Filter Rekapitulasi Prestasi</Text>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setRekapPrestasiSearch('');
                          setRekapPrestasiFilterTingkat('semua');
                        }}
                      >
                        <Text style={rekapStyles.filterResetBtn}>Reset</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={rekapStyles.searchBox}>
                      <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                      <TextInput
                        style={rekapStyles.searchInput}
                        placeholder="Cari nama siswa, judul lomba, bidang..."
                        placeholderTextColor="#94A3B8"
                        value={rekapPrestasiSearch}
                        onChangeText={setRekapPrestasiSearch}
                      />
                      {rekapPrestasiSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setRekapPrestasiSearch('')}>
                          <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={rekapStyles.filterLabel}>Tingkat Kompetisi</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      {[
                        { key: 'semua', label: 'Semua Tingkat' },
                        { key: 'nasional', label: 'Nasional' },
                        { key: 'provinsi', label: 'Provinsi' },
                        { key: 'kota', label: 'Kota / Kab' },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          activeOpacity={0.8}
                          onPress={() => setRekapPrestasiFilterTingkat(opt.key)}
                          style={[
                            rekapStyles.filterPill,
                            rekapPrestasiFilterTingkat === opt.key && rekapStyles.filterPillActive,
                          ]}
                        >
                          <Text style={[
                            rekapStyles.filterPillText,
                            rekapPrestasiFilterTingkat === opt.key && rekapStyles.filterPillTextActive,
                          ]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Daftar Card Prestasi Siswa */}
                  <View style={{ marginHorizontal: 16, marginTop: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                        Daftar Prestasi ({filteredPrestasiList.length})
                      </Text>
                    </View>

                    {filteredPrestasiList.length === 0 ? (
                      <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <MaterialCommunityIcons name="trophy-broken" size={40} color="#CBD5E1" />
                        <Text style={{ marginTop: 10, color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                          Tidak ada data prestasi yang sesuai dengan filter.
                        </Text>
                      </View>
                    ) : (
                      filteredPrestasiList.map((item, idx) => {
                        const namaSiswa = item.nama_siswa || item.student?.name || item.full_name || 'Santri Berprestasi';
                        const namaPrestasi = item.nama_prestasi || item.judul || item.prestasi || 'Juara Kompetisi';
                        const tingkat = item.tingkat || 'Tingkat Daerah';
                        const bidang = item.bidang || item.kategori || 'Akademik & Keagamaan';
                        const peringkat = item.peringkat || item.juara || 'Juara 1';
                        const tahun = item.tahun || (item.tanggal_prestasi ? new Date(item.tanggal_prestasi).getFullYear() : '2026');
                        const unitName = item.unit || item.student?.education_unit?.name || 'Unit Pendidikan';

                        return (
                          <View key={item.id || idx} style={rekapStyles.calloutCard}>
                            <View style={rekapStyles.cardTopRow}>
                              <View style={[rekapStyles.avatarCircle, { backgroundColor: '#EFF6FF' }]}>
                                <MaterialCommunityIcons name="trophy" size={20} color="#2563EB" />
                              </View>
                              <View style={rekapStyles.cardMainInfo}>
                                <View style={rekapStyles.nameRow}>
                                  <Text style={rekapStyles.studentNameCallout} numberOfLines={1}>
                                    {namaPrestasi}
                                  </Text>
                                  <View style={[rekapStyles.tagBadgeCallout, { backgroundColor: '#FEF3C7' }]}>
                                    <Text style={[rekapStyles.tagBadgeTextCallout, { color: '#B45309' }]}>
                                      {tingkat}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={rekapStyles.subTextCallout} numberOfLines={1}>
                                  Peraih: {namaSiswa} • {unitName}
                                </Text>
                              </View>
                            </View>

                            <View style={rekapStyles.detailBoxCallout}>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Bidang:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{bidang}</Text>
                              </View>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Peringkat:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{peringkat}</Text>
                              </View>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Tahun:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{tahun}</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </>
              )}

              {/* ── KONTEN SUB-TAB 3: KELULUSAN & ALUMNI (Gaya Card Mutasi dengan Warna Khusus) ── */}
              {rekapSubTab === 'kelulusan' && (
                <>
                  {/* 4 Differentiated KPI Cards for Kelulusan (Harmonized with MutasiSiswaScreen) */}
                  <View style={rekapStyles.kpiCardsRow}>
                    {/* Card 1: Total Kelulusan (Emerald) */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#A7F3D0' }]}>
                      <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#059669' }]}>
                            <MaterialCommunityIcons name="school" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#065F46' }]}>{kelulusanKpi.total}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#047857' }]}>Total Kelulusan</Text>
                        <Text style={rekapStyles.kpiSub}>Siswa & Santri Lulus</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 2: Kelulusan per Tahun (Sky Blue) */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#BAE6FD' }]}>
                      <LinearGradient colors={['#F0F9FF', '#E0F2FE']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#0284C7' }]}>
                            <MaterialCommunityIcons name="calendar-check" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#0369A1' }]}>{kelulusanKpi.tahunIni}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#075985' }]}>Kelulusan per Tahun</Text>
                        <Text style={rekapStyles.kpiSub}>Periode Tahun Ini</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 3: Kelulusan per Unit (Amber) */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#FDE68A' }]}>
                      <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#D97706' }]}>
                            <MaterialCommunityIcons name="domain" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#B45309' }]}>{kelulusanKpi.unitsCount}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#92400E' }]}>Kelulusan per Unit</Text>
                        <Text style={rekapStyles.kpiSub}>Satuan Pendidikan</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 4: Tujuan Alumni (Royal Purple) */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#DDD6FE' }]}>
                      <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#7C3AED' }]}>
                            <MaterialCommunityIcons name="compass-outline" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#6D28D9' }]}>{kelulusanKpi.lanjutStudi}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#5B21B6' }]}>Tujuan Alumni</Text>
                        <Text style={rekapStyles.kpiSub}>PTN, Ma'had & Karir</Text>
                      </LinearGradient>
                    </View>
                  </View>

                  {/* Filter & Search Kelulusan / Alumni */}
                  <View style={rekapStyles.filterCard}>
                    <View style={rekapStyles.filterCardHeader}>
                      <Text style={rekapStyles.filterCardTitle}>Filter Kelulusan & Alumni</Text>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setRekapAlumniSearch('');
                          setRekapAlumniFilterTahun('semua');
                          setRekapAlumniFilterUnit('semua');
                          setRekapAlumniFilterKategori('semua');
                        }}
                      >
                        <Text style={rekapStyles.filterResetBtn}>Reset</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Search */}
                    <View style={rekapStyles.searchBox}>
                      <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                      <TextInput
                        style={rekapStyles.searchInput}
                        placeholder="Cari alumni, NIS, tujuan studi/kampus..."
                        placeholderTextColor="#94A3B8"
                        value={rekapAlumniSearch}
                        onChangeText={setRekapAlumniSearch}
                      />
                      {rekapAlumniSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setRekapAlumniSearch('')}>
                          <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Tahun Lulus Pills */}
                    <Text style={rekapStyles.filterLabel}>Tahun Kelulusan</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
                      {['semua', ...alumniYears].map((yr) => (
                        <TouchableOpacity
                          key={yr}
                          activeOpacity={0.8}
                          onPress={() => setRekapAlumniFilterTahun(yr)}
                          style={[
                            rekapStyles.filterPill,
                            rekapAlumniFilterTahun === yr && rekapStyles.filterPillActive,
                          ]}
                        >
                          <Text style={[
                            rekapStyles.filterPillText,
                            rekapAlumniFilterTahun === yr && rekapStyles.filterPillTextActive,
                          ]}>
                            {yr === 'semua' ? 'Semua Angkatan' : `Lulus ${yr}`}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>

                    {/* Kategori Lanjutan Pills */}
                    <Text style={rekapStyles.filterLabel}>Kategori Tujuan</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      {[
                        { key: 'semua', label: 'Semua Kategori' },
                        { key: 'ptn', label: 'PTN / Kampus Negeri' },
                        { key: 'pts', label: 'PTS / Swasta' },
                        { key: 'mahad', label: "Ma'had / Pesantren" },
                        { key: 'karir', label: 'Kerja / Karir' },
                      ].map((kat) => (
                        <TouchableOpacity
                          key={kat.key}
                          activeOpacity={0.8}
                          onPress={() => setRekapAlumniFilterKategori(kat.key)}
                          style={[
                            rekapStyles.filterPill,
                            rekapAlumniFilterKategori === kat.key && rekapStyles.filterPillActive,
                          ]}
                        >
                          <Text style={[
                            rekapStyles.filterPillText,
                            rekapAlumniFilterKategori === kat.key && rekapStyles.filterPillTextActive,
                          ]}>
                            {kat.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Daftar Card Alumni (Gaya MutasiSiswaScreen) */}
                  <View style={{ marginHorizontal: 16, marginTop: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                        Daftar Kelulusan Santri ({filteredAlumniList.length})
                      </Text>
                    </View>

                    {filteredAlumniList.length === 0 ? (
                      <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <MaterialCommunityIcons name="school-outline" size={40} color="#CBD5E1" />
                        <Text style={{ marginTop: 10, color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                          Tidak ada data kelulusan yang sesuai dengan filter.
                        </Text>
                      </View>
                    ) : (
                      filteredAlumniList.map((item, idx) => {
                        const name = item.full_name || item.name || item.nama || 'Santri Lulusan';
                        const nis = item.nis || item.nisn || '-';
                        const unitName = item.education_unit?.name || item.unit || 'Unit Asal';
                        const metadata = item.metadata || {};
                        const tahunLulus = metadata.tahun_lulus || item.tahun_lulus || '-';
                        const tujuanLanjutan = metadata.tujuan_kelulusan || metadata.perguruan_tinggi || metadata.status_lanjutan || '-';
                        const kategoriTujuan = metadata.kategori_tujuan || metadata.status_lanjutan || '-';
                        const statusAlumni = metadata.status_alumni || item.status || '-';

                        return (
                          <View key={item.id || idx} style={rekapStyles.calloutCard}>
                            <View style={rekapStyles.cardTopRow}>
                              <View style={[rekapStyles.avatarCircle, { backgroundColor: '#ECFDF5' }]}>
                                <MaterialCommunityIcons name="school" size={20} color="#059669" />
                              </View>
                              <View style={rekapStyles.cardMainInfo}>
                                <View style={rekapStyles.nameRow}>
                                  <Text style={rekapStyles.studentNameCallout} numberOfLines={1}>
                                    {name}
                                  </Text>
                                  <View style={[rekapStyles.tagBadgeCallout, { backgroundColor: '#FEF9EC' }]}>
                                    <Text style={[rekapStyles.tagBadgeTextCallout, { color: '#B45309' }]}>
                                      Lulus {tahunLulus}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={rekapStyles.subTextCallout} numberOfLines={1}>
                                  NIS: {nis} • {unitName}
                                </Text>
                              </View>
                            </View>

                            <View style={rekapStyles.detailBoxCallout}>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Tujuan:</Text>
                                <Text style={rekapStyles.detailItemValCallout} numberOfLines={2}>
                                  {tujuanLanjutan}
                                </Text>
                              </View>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Kategori:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{kategoriTujuan}</Text>
                              </View>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Tahun Lulus:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{tahunLulus}</Text>
                              </View>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Status:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{statusAlumni}</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </>
              )}

              {/* ── KONTEN SUB-TAB 4: MUTASI SANTRI ── */}
              {rekapSubTab === 'mutasi' && (
                <>
                  {/* KPI Cards Mutasi */}
                  <View style={rekapStyles.kpiCardsRow}>
                    {/* Card 1: Pindah Unit */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#FDE68A' }]}>
                      <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#D97706' }]}>
                            <MaterialCommunityIcons name="swap-horizontal" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#B45309' }]}>{mutasiKpi.pindahUnit}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#92400E' }]}>Pindah Unit</Text>
                        <Text style={rekapStyles.kpiSub}>Internal Yayasan</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 2: Pindah Keluar */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#FECDD3' }]}>
                      <LinearGradient colors={['#FFF1F2', '#FFE4E6']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#E11D48' }]}>
                            <MaterialCommunityIcons name="logout-variant" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#BE123C' }]}>{mutasiKpi.pindahKeluar}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#9F1239' }]}>Pindah Keluar</Text>
                        <Text style={rekapStyles.kpiSub}>Sekolah Luar</Text>
                      </LinearGradient>
                    </View>

                    {/* Card 3: Total Mutasi */}
                    <View style={[rekapStyles.kpiBox, { borderColor: '#DDD6FE' }]}>
                      <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={rekapStyles.kpiBoxGradient}>
                        <View style={rekapStyles.kpiHeaderRow}>
                          <View style={[rekapStyles.kpiIconSquare, { backgroundColor: '#7C3AED' }]}>
                            <MaterialCommunityIcons name="account-switch" size={15} color="#FFF" />
                          </View>
                          <Text style={[rekapStyles.kpiVal, { color: '#6D28D9' }]}>{mutasiKpi.total}</Text>
                        </View>
                        <Text style={[rekapStyles.kpiLbl, { color: '#5B21B6' }]}>Total Mutasi</Text>
                        <Text style={rekapStyles.kpiSub}>Arus Santri</Text>
                      </LinearGradient>
                    </View>
                  </View>

                  {/* Navigasi Lengkap ke MutasiSiswa */}
                  <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setActiveTab('attendance');
                        navigation?.navigate('MutasiSiswa');
                      }}
                      style={{
                        flexDirection: 'row',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        backgroundColor: '#6B21A8',
                        paddingHorizontal: 16,
                        paddingVertical: 12,
                        borderRadius: 14,
                        shadowColor: '#6B21A8',
                        shadowOpacity: 0.25,
                        shadowRadius: 6,
                        elevation: 3,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                        <MaterialCommunityIcons name="swap-horizontal-bold" size={20} color="#FFFFFF" />
                        <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>
                          Buka Layanan Mutasi Santri Lengkap
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#E9D5FF" />
                    </TouchableOpacity>
                  </View>

                  {/* Filter & Search Mutasi */}
                  <View style={rekapStyles.filterCard}>
                    <View style={rekapStyles.filterCardHeader}>
                      <Text style={rekapStyles.filterCardTitle}>Filter Mutasi Santri</Text>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setRekapMutasiSearch('');
                          setRekapMutasiFilterType('semua');
                        }}
                      >
                        <Text style={rekapStyles.filterResetBtn}>Reset</Text>
                      </TouchableOpacity>
                    </View>

                    <View style={rekapStyles.searchBox}>
                      <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                      <TextInput
                        style={rekapStyles.searchInput}
                        placeholder="Cari santri mutasi, NIS, atau sekolah tujuan..."
                        placeholderTextColor="#94A3B8"
                        value={rekapMutasiSearch}
                        onChangeText={setRekapMutasiSearch}
                      />
                      {rekapMutasiSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setRekapMutasiSearch('')}>
                          <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <Text style={rekapStyles.filterLabel}>Jenis Mutasi</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
                      {[
                        { key: 'semua', label: 'Semua Mutasi' },
                        { key: 'unit', label: 'Pindah Unit Internal' },
                        { key: 'keluar', label: 'Pindah Keluar Sekolah' },
                      ].map((opt) => (
                        <TouchableOpacity
                          key={opt.key}
                          activeOpacity={0.8}
                          onPress={() => setRekapMutasiFilterType(opt.key)}
                          style={[
                            rekapStyles.filterPill,
                            rekapMutasiFilterType === opt.key && rekapStyles.filterPillActive,
                          ]}
                        >
                          <Text style={[
                            rekapStyles.filterPillText,
                            rekapMutasiFilterType === opt.key && rekapStyles.filterPillTextActive,
                          ]}>
                            {opt.label}
                          </Text>
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  </View>

                  {/* Daftar Card Mutasi Santri */}
                  <View style={{ marginHorizontal: 16, marginTop: 14 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
                        Daftar Santri Mutasi ({filteredMutasiList.length})
                      </Text>
                    </View>

                    {filteredMutasiList.length === 0 ? (
                      <View style={{ padding: 32, alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' }}>
                        <MaterialCommunityIcons name="account-switch-outline" size={40} color="#CBD5E1" />
                        <Text style={{ marginTop: 10, color: '#94A3B8', fontSize: 13, textAlign: 'center' }}>
                          Tidak ada data santri mutasi yang cocok.
                        </Text>
                      </View>
                    ) : (
                      filteredMutasiList.map((item, idx) => {
                        const studentName = item.name || item.nama_lengkap || 'Santri';
                        const nis = item.nis || item.nisn || '-';
                        const kelasName = item.kelas?.nama_kelas || item.kelas_nama || 'Kelas Terakhir';
                        const metadata = item.metadata || {};
                        const unitTujuan = metadata.unit_tujuan || metadata.unit_tujuan_id || '';
                        const sekolahTujuan = metadata.sekolah_tujuan || '';
                        const alasan = metadata.alasan || '-';
                        const tglMutasi = metadata.tgl_mutasi || (item.updated_at ? new Date(item.updated_at).toLocaleDateString('id-ID') : '-');
                        const isUnit = Boolean(unitTujuan);

                        return (
                          <View key={item.id || idx} style={rekapStyles.calloutCard}>
                            <View style={rekapStyles.cardTopRow}>
                              <View style={[rekapStyles.avatarCircle, { backgroundColor: isUnit ? '#FEF3C7' : '#FFE4E6' }]}>
                                <MaterialCommunityIcons
                                  name={isUnit ? 'swap-horizontal' : 'logout-variant'}
                                  size={20}
                                  color={isUnit ? '#D97706' : '#E11D48'}
                                />
                              </View>
                              <View style={rekapStyles.cardMainInfo}>
                                <View style={rekapStyles.nameRow}>
                                  <Text style={rekapStyles.studentNameCallout} numberOfLines={1}>
                                    {studentName}
                                  </Text>
                                  <View style={[rekapStyles.tagBadgeCallout, { backgroundColor: isUnit ? '#FEF9EC' : '#FFF1F2' }]}>
                                    <Text style={[rekapStyles.tagBadgeTextCallout, { color: isUnit ? '#B45309' : '#BE123C' }]}>
                                      {isUnit ? 'Pindah Unit' : 'Pindah Keluar'}
                                    </Text>
                                  </View>
                                </View>
                                <Text style={rekapStyles.subTextCallout}>
                                  NIS: {nis} • {kelasName}
                                </Text>
                              </View>
                            </View>

                            <View style={rekapStyles.detailBoxCallout}>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Tujuan:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{sekolahTujuan || unitTujuan || 'Sekolah Lain'}</Text>
                              </View>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Alasan:</Text>
                                <Text style={rekapStyles.detailItemValCallout} numberOfLines={2}>{alasan}</Text>
                              </View>
                              <View style={rekapStyles.detailItemRowCallout}>
                                <Text style={rekapStyles.detailItemLabelCallout}>Tanggal:</Text>
                                <Text style={rekapStyles.detailItemValCallout}>{tglMutasi}</Text>
                              </View>
                            </View>
                          </View>
                        );
                      })
                    )}
                  </View>
                </>
              )}
            </ScrollView>
          </View>

          {/* ── Modal Detail Siswa ── */}
          <Modal
            visible={Boolean(rekapSiswaDetailOpen && selectedRekapSiswa)}
            animationType="slide"
            transparent
            onRequestClose={() => setRekapSiswaDetailOpen(false)}
            statusBarTranslucent
          >
            <View style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(15,23,42,0.55)' }}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setRekapSiswaDetailOpen(false)} />
              {selectedRekapSiswa && (
                <View style={[rekapStyles.detailSheet, { paddingBottom: modalBottomInset }]}>
                  {/* Drag Handle */}
                  <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', alignSelf: 'center', marginBottom: 16 }} />

                  {/* Header gradient */}
                  <LinearGradient
                    colors={['#059669', '#0D9488']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={rekapStyles.detailHeaderGrad}
                  >
                    <View style={rekapStyles.detailAvatar}>
                      {selectedRekapSiswa.foto_url ? (
                        <Image source={{ uri: selectedRekapSiswa.foto_url }} style={rekapStyles.detailAvatarImg} />
                      ) : (
                        <Image source={getStudentAvatarSource(selectedRekapSiswa)} style={rekapStyles.detailAvatarImg} />
                      )}
                    </View>
                    <View style={{ flex: 1, marginLeft: 14 }}>
                      <Text numberOfLines={1} style={rekapStyles.detailName}>{selectedRekapSiswa.nama || '-'}</Text>
                      <Text style={rekapStyles.detailNis}>NIS: {selectedRekapSiswa.nis || '-'}</Text>
                    </View>
                    <TouchableOpacity onPress={() => setRekapSiswaDetailOpen(false)} style={rekapStyles.detailCloseBtn}>
                      <MaterialCommunityIcons name="close" size={18} color="#fff" />
                    </TouchableOpacity>
                  </LinearGradient>

                  {/* Fields Grid */}
                  <View style={rekapStyles.detailGrid}>
                    {[
                      { label: 'NIS', value: selectedRekapSiswa.nis || '-' },
                      { label: 'Nama Lengkap', value: selectedRekapSiswa.nama || '-' },
                      { label: 'Unit Pendidikan', value: selectedRekapSiswa.unit || '-' },
                      { label: 'Kelas / Rombel', value: selectedRekapSiswa.kelas || '-' },
                      { label: 'Jenis Kelamin', value: selectedRekapSiswa.jenis_kelamin || selectedRekapSiswa.jk || '-' },
                      { label: 'Tanggal Masuk', value: formatTanggalIndo(selectedRekapSiswa.tanggal_masuk || selectedRekapSiswa.tgl_masuk || selectedRekapSiswa.created_at) },
                      {
                        label: 'Status Siswa',
                        value: String(selectedRekapSiswa.status || (selectedRekapSiswa.aktif ? 'Aktif' : 'Non-aktif')),
                      },
                    ].map((field) => (
                      <View key={field.label} style={rekapStyles.detailField}>
                        <Text style={rekapStyles.detailFieldLabel}>{field.label}</Text>
                        <Text style={rekapStyles.detailFieldValue}>{field.value}</Text>
                      </View>
                    ))}
                  </View>

                  {/* Footer actions */}
                  <View style={rekapStyles.detailFooter}>
                    {selectedRekapSiswa.id && (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setRekapSiswaDetailOpen(false);
                          navigation?.navigate('Absensi', {
                            tab: 'all',
                            child_id: String(selectedRekapSiswa.id || selectedRekapSiswa.student_id),
                            student_id: String(selectedRekapSiswa.id || selectedRekapSiswa.student_id),
                          });
                        }}
                        style={rekapStyles.detailActionBtn}
                      >
                        <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#fff" />
                        <Text style={rekapStyles.detailActionBtnText}>Lihat Presensi Siswa</Text>
                      </TouchableOpacity>
                    )}
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setRekapSiswaDetailOpen(false)}
                      style={rekapStyles.detailCloseActionBtn}
                    >
                      <Text style={rekapStyles.detailCloseActionBtnText}>Tutup</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </View>
          </Modal>

          {/* ── Modal Dropdown: Status Siswa ── */}
          <Modal
            visible={rekapStatusDropdownOpen}
            animationType="fade"
            transparent
            onRequestClose={() => setRekapStatusDropdownOpen(false)}
            statusBarTranslucent
          >
            <View style={rekapStyles.dropdownModalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setRekapStatusDropdownOpen(false)} />
              <View style={[rekapStyles.dropdownModalSheet, { paddingBottom: modalBottomInset }]}>
                <View style={rekapStyles.dropdownModalHeader}>
                  <Text style={rekapStyles.dropdownModalTitle}>Pilih Status Siswa</Text>
                  <TouchableOpacity onPress={() => setRekapStatusDropdownOpen(false)}>
                    <MaterialCommunityIcons name="close" size={22} color="#64748B" />
                  </TouchableOpacity>
                </View>
                {rekapStatusOptions.map((opt) => {
                  const isSelected = rekapSiswaFilterStatus === opt.key;
                  return (
                    <TouchableOpacity
                      key={opt.key}
                      activeOpacity={0.8}
                      onPress={() => {
                        setRekapSiswaFilterStatus(opt.key);
                        setRekapSiswaPage(1);
                        setRekapStatusDropdownOpen(false);
                      }}
                      style={[rekapStyles.dropdownItem, isSelected && rekapStyles.dropdownItemActive]}
                    >
                      <Text style={[rekapStyles.dropdownItemText, isSelected && rekapStyles.dropdownItemTextActive]}>
                        {opt.label}
                      </Text>
                      {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          </Modal>

          {/* ── Modal Dropdown: Kelas / Rombel ── */}
          <Modal
            visible={rekapKelasDropdownOpen}
            animationType="fade"
            transparent
            onRequestClose={() => setRekapKelasDropdownOpen(false)}
            statusBarTranslucent
          >
            <View style={rekapStyles.dropdownModalOverlay}>
              <Pressable style={StyleSheet.absoluteFill} onPress={() => setRekapKelasDropdownOpen(false)} />
              <View style={[rekapStyles.dropdownModalSheet, { paddingBottom: modalBottomInset }]}>
                <View style={rekapStyles.dropdownModalHeader}>
                  <Text style={rekapStyles.dropdownModalTitle}>Pilih Kelas / Rombel</Text>
                  <TouchableOpacity onPress={() => setRekapKelasDropdownOpen(false)}>
                    <MaterialCommunityIcons name="close" size={22} color="#64748B" />
                  </TouchableOpacity>
                </View>
                <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      setRekapSiswaFilterKelas('semua');
                      setRekapSiswaPage(1);
                      setRekapKelasDropdownOpen(false);
                    }}
                    style={[rekapStyles.dropdownItem, rekapSiswaFilterKelas === 'semua' && rekapStyles.dropdownItemActive]}
                  >
                    <Text style={[rekapStyles.dropdownItemText, rekapSiswaFilterKelas === 'semua' && rekapStyles.dropdownItemTextActive]}>
                      Semua Kelas & Rombel
                    </Text>
                    {rekapSiswaFilterKelas === 'semua' && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                  </TouchableOpacity>
                  {(daftarKelasRekap as string[]).map((k) => {
                    const isSelected = rekapSiswaFilterKelas === k;
                    return (
                      <TouchableOpacity
                        key={k}
                        activeOpacity={0.8}
                        onPress={() => {
                          setRekapSiswaFilterKelas(k);
                          setRekapSiswaPage(1);
                          setRekapKelasDropdownOpen(false);
                        }}
                        style={[rekapStyles.dropdownItem, isSelected && rekapStyles.dropdownItemActive]}
                      >
                        <Text style={[rekapStyles.dropdownItemText, isSelected && rekapStyles.dropdownItemTextActive]}>
                          {k}
                        </Text>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              </View>
            </View>
          </Modal>

          {/* ── Modal Dropdown: Unit Pendidikan (jika >1 unit) ── */}
          {daftarUnitRekap.length > 1 && (
            <Modal
              visible={rekapUnitDropdownOpen}
              animationType="fade"
              transparent
              onRequestClose={() => setRekapUnitDropdownOpen(false)}
              statusBarTranslucent
            >
              <View style={rekapStyles.dropdownModalOverlay}>
                <Pressable style={StyleSheet.absoluteFill} onPress={() => setRekapUnitDropdownOpen(false)} />
                <View style={[rekapStyles.dropdownModalSheet, { paddingBottom: modalBottomInset }]}>
                  <View style={rekapStyles.dropdownModalHeader}>
                    <Text style={rekapStyles.dropdownModalTitle}>Pilih Unit Pendidikan</Text>
                    <TouchableOpacity onPress={() => setRekapUnitDropdownOpen(false)}>
                      <MaterialCommunityIcons name="close" size={22} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 380 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setRekapSiswaFilterUnit('semua');
                        setRekapSiswaPage(1);
                        setRekapUnitDropdownOpen(false);
                      }}
                      style={[rekapStyles.dropdownItem, rekapSiswaFilterUnit === 'semua' && rekapStyles.dropdownItemActive]}
                    >
                      <Text style={[rekapStyles.dropdownItemText, rekapSiswaFilterUnit === 'semua' && rekapStyles.dropdownItemTextActive]}>
                        Semua Unit Pendidikan
                      </Text>
                      {rekapSiswaFilterUnit === 'semua' && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                    </TouchableOpacity>
                    {(daftarUnitRekap as string[]).map((u) => {
                      const isSelected = rekapSiswaFilterUnit === u;
                      return (
                        <TouchableOpacity
                          key={u}
                          activeOpacity={0.8}
                          onPress={() => {
                            setRekapSiswaFilterUnit(u);
                            setRekapSiswaPage(1);
                            setRekapUnitDropdownOpen(false);
                          }}
                          style={[rekapStyles.dropdownItem, isSelected && rekapStyles.dropdownItemActive]}
                        >
                          <Text style={[rekapStyles.dropdownItemText, isSelected && rekapStyles.dropdownItemTextActive]}>
                            {u}
                          </Text>
                          {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              </View>
            </Modal>
          )}

          {/* ── MODAL CETAK & PRATINJAU DOKUMEN REKAPITULASI A4 ── */}
          <Modal
            visible={rekapPrintModalOpen}
            animationType="slide"
            transparent={false}
            onRequestClose={() => setRekapPrintModalOpen(false)}
          >
            <View style={{ flex: 1, backgroundColor: '#064E3B', paddingTop: topInset }}>
              {/* Top Header */}
              <View style={rekapStyles.printModalHeader}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setRekapPrintModalOpen(false)}
                  style={rekapStyles.printModalHeaderBtn}
                >
                  <MaterialCommunityIcons name="arrow-left" size={22} color="#fff" />
                </TouchableOpacity>
                <View style={{ flex: 1, marginHorizontal: 8 }}>
                  <Text numberOfLines={1} style={rekapStyles.printModalHeaderTitle}>
                    Pratinjau Cetak Rekapitulasi
                  </Text>
                  <Text numberOfLines={1} style={rekapStyles.printModalHeaderSub}>
                    Format Dokumen A4 • {rekapSiswaFiltered.length} Siswa Terfilter
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePrintDokumen}
                  style={rekapStyles.printModalActionBtn}
                >
                  <MaterialCommunityIcons name="printer" size={17} color="#065F46" />
                  <Text style={rekapStyles.printModalActionBtnText}>Cetak A4</Text>
                </TouchableOpacity>
              </View>

              {/* Notice Toast if printed/downloaded */}
              {rekapPrintSuccessNotice ? (
                <View style={rekapStyles.printNoticeBanner}>
                  <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                  <Text style={rekapStyles.printNoticeBannerText}>{rekapPrintSuccessNotice}</Text>
                </View>
              ) : null}

              {/* Document Sheet Container */}
              <ScrollView
                style={{ flex: 1, backgroundColor: '#CBD5E1' }}
                contentContainerStyle={{ padding: 12, paddingBottom: 95 }}
                showsVerticalScrollIndicator={true}
              >
                <View style={rekapStyles.paperSheet}>
                  {/* KOP RESMI LEMBAGA 3-KOLOM (LOGO YAYASAN KIRI, TEKS RESMI TENGAH, LOGO UNIT KANAN) */}
                  <View style={rekapStyles.paperKopRow}>
                    {/* Logo Kiri: Yayasan (Site Logo) */}
                    <View style={rekapStyles.paperKopLogoBox}>
                      <Image
                        source={config?.branding?.logo_header_url || config?.branding?.logo_url ? { uri: config.branding.logo_header_url || config.branding.logo_url } : require('../../assets/logo.png')}
                        style={rekapStyles.paperKopLogoImg}
                        resizeMode="contain"
                      />
                    </View>

                    {/* Kolom Tengah: Yayasan, Nama Unit, Motto, Alamat, Kontak */}
                    <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 }}>
                      <Text style={rekapStyles.paperKopYayasan}>
                        {(config?.branding?.school_name || 'YAYASAN DAR EL-IMAN PADANG').toUpperCase()}
                      </Text>
                      <Text style={rekapStyles.paperKopUnit}>
                        {resolvedKopUnit.unitName}
                      </Text>
                      <Text style={rekapStyles.paperKopMotto}>
                        {config?.branding?.motto || "Pusat Pendidikan Islam Terpadu Berkarakter Qur'ani & As-Sunnah"}
                      </Text>
                      <Text style={rekapStyles.paperKopAddress}>
                        {resolvedKopUnit.address}
                      </Text>
                      <Text style={rekapStyles.paperKopContact}>
                        {resolvedKopUnit.contact}
                      </Text>
                    </View>

                    {/* Logo Kanan: Unit Pendidikan */}
                    <View style={rekapStyles.paperKopLogoBox}>
                      <Image
                        source={resolvedKopUnit.logoUrl ? { uri: resolvedKopUnit.logoUrl } : require('../../assets/logo.png')}
                        style={rekapStyles.paperKopLogoImg}
                        resizeMode="contain"
                      />
                    </View>
                  </View>

                  {/* Garis Kop Tebal & Tipis */}
                  <View style={rekapStyles.paperKopDividerThick} />
                  <View style={rekapStyles.paperKopDividerThin} />

                  {/* JUDUL DOKUMEN */}
                  <View style={rekapStyles.paperDocHeader}>
                    <Text style={rekapStyles.paperDocTitle}>LAPORAN REKAPITULASI DATA SISWA / SANTRI</Text>
                    <Text style={rekapStyles.paperDocSub}>{(rekapSiswaDashboard?.academic_year || rekapSiswaDashboard?.tahun_ajaran || heroSubtitleFallback).toUpperCase()}</Text>
                  </View>

                  {/* PARAMETER FILTER AKTIF */}
                  <View style={rekapStyles.paperFilterBox}>
                    <View style={rekapStyles.paperFilterBoxHeader}>
                      <MaterialCommunityIcons name="tune-variant" size={14} color="#065F46" />
                      <Text style={rekapStyles.paperFilterBoxTitle}>PARAMETER & FILTER AKTIF</Text>
                    </View>
                    <View style={rekapStyles.paperFilterGrid}>
                      <View style={rekapStyles.paperFilterCol}>
                        <Text style={rekapStyles.paperFilterLabel}>Status Siswa</Text>
                        <Text style={rekapStyles.paperFilterValue}>
                          {rekapStatusOptions.find((o) => o.key === rekapSiswaFilterStatus)?.label || 'Semua Status'}
                        </Text>
                      </View>
                      <View style={rekapStyles.paperFilterCol}>
                        <Text style={rekapStyles.paperFilterLabel}>Unit Pendidikan</Text>
                        <Text style={rekapStyles.paperFilterValue}>
                          {rekapSiswaFilterUnit === 'semua' ? 'Semua Unit Pendidikan' : rekapSiswaFilterUnit}
                        </Text>
                      </View>
                      <View style={rekapStyles.paperFilterCol}>
                        <Text style={rekapStyles.paperFilterLabel}>Kelas / Rombel</Text>
                        <Text style={rekapStyles.paperFilterValue}>
                          {rekapSiswaFilterKelas === 'semua' ? 'Semua Kelas / Rombel' : rekapSiswaFilterKelas}
                        </Text>
                      </View>
                      <View style={rekapStyles.paperFilterCol}>
                        <Text style={rekapStyles.paperFilterLabel}>Jenis Kelamin</Text>
                        <Text style={rekapStyles.paperFilterValue}>
                          {rekapSiswaFilterGender === 'semua' ? 'Semua (L & P)' : (rekapSiswaFilterGender === 'L' ? 'Laki-laki (L)' : 'Perempuan (P)')}
                        </Text>
                      </View>
                      <View style={rekapStyles.paperFilterCol}>
                        <Text style={rekapStyles.paperFilterLabel}>Kata Kunci Cari</Text>
                        <Text style={rekapStyles.paperFilterValue}>
                          {rekapSiswaCari.trim() ? `"${rekapSiswaCari.trim()}"` : 'Tidak Ada (Semua)'}
                        </Text>
                      </View>
                      <View style={rekapStyles.paperFilterCol}>
                        <Text style={rekapStyles.paperFilterLabel}>Tanggal Cetak</Text>
                        <Text style={rekapStyles.paperFilterValue}>{formattedPrintDate}</Text>
                      </View>
                      <View style={[rekapStyles.paperFilterCol, { width: '100%' }]}>
                        <Text style={rekapStyles.paperFilterLabel}>Total Data Terpilih</Text>
                        <Text style={[rekapStyles.paperFilterValue, { color: '#059669', fontWeight: '800' }]}>
                          {rekapSiswaFiltered.length} Siswa ditemukan sesuai filter di atas
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* TABEL DATA SISWA */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={rekapStyles.paperTable}>
                      {/* Table Head */}
                      <View style={rekapStyles.paperTableHead}>
                        <Text style={[rekapStyles.paperTh, { width: 34, textAlign: 'center' }]}>NO</Text>
                        <Text style={[rekapStyles.paperTh, { width: 85 }]}>NIS / NISN</Text>
                        <Text style={[rekapStyles.paperTh, { width: 170 }]}>NAMA SISWA</Text>
                        <Text style={[rekapStyles.paperTh, { width: 110 }]}>UNIT PENDIDIKAN</Text>
                        <Text style={[rekapStyles.paperTh, { width: 85 }]}>KELAS</Text>
                        <Text style={[rekapStyles.paperTh, { width: 38, textAlign: 'center' }]}>JK</Text>
                        <Text style={[rekapStyles.paperTh, { width: 75, textAlign: 'center' }]}>STATUS</Text>
                      </View>

                      {/* Table Rows */}
                      {rekapSiswaFiltered.length === 0 ? (
                        <View style={{ padding: 24, alignItems: 'center' }}>
                          <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                            Tidak ada data siswa yang memenuhi filter yang dipilih.
                          </Text>
                        </View>
                      ) : (
                        rekapSiswaFiltered.slice(0, 100).map((st: any, idx: number) => {
                          const statusRaw = String(st.status || (st.aktif ? 'aktif' : 'nonaktif')).toLowerCase();
                          const isAlumni = statusRaw.includes('alumni');
                          const isMutasi = statusRaw.includes('mutasi');
                          const isAktif = statusRaw === 'aktif' || (!isAlumni && !isMutasi && Boolean(st.aktif));
                          const statusBadgeLabel = isAlumni ? 'Alumni' : isMutasi ? 'Mutasi' : isAktif ? 'Aktif' : 'Non-aktif';

                          return (
                            <View
                              key={st.id || `print-row-${idx}`}
                              style={[
                                rekapStyles.paperTableRow,
                                idx % 2 === 1 && { backgroundColor: '#F8FAFC' },
                              ]}
                            >
                              <Text style={[rekapStyles.paperTd, { width: 34, textAlign: 'center', fontWeight: '700' }]}>
                                {idx + 1}
                              </Text>
                              <Text style={[rekapStyles.paperTd, { width: 85, fontFamily: 'monospace', fontSize: 10 }]}>
                                {st.nis || st.nisn || '-'}
                              </Text>
                              <Text numberOfLines={1} style={[rekapStyles.paperTd, { width: 170, fontWeight: '700', color: '#0F172A' }]}>
                                {st.nama || st.name || '-'}
                              </Text>
                              <Text numberOfLines={1} style={[rekapStyles.paperTd, { width: 110, fontSize: 10.5 }]}>
                                {st.unit || '-'}
                              </Text>
                              <Text numberOfLines={1} style={[rekapStyles.paperTd, { width: 85, fontSize: 10.5 }]}>
                                {st.kelas || '-'}
                              </Text>
                              <Text style={[rekapStyles.paperTd, { width: 38, textAlign: 'center', fontWeight: '700' }]}>
                                {st.jenis_kelamin || st.jk || '-'}
                              </Text>
                              <View style={{ width: 75, alignItems: 'center' }}>
                                <Text style={[
                                  rekapStyles.paperTdBadge,
                                  isAlumni && { backgroundColor: '#FEF3C7', color: '#92400E' },
                                  isMutasi && { backgroundColor: '#FFE4E6', color: '#9F1239' },
                                  isAktif && { backgroundColor: '#D1FAE5', color: '#065F46' },
                                  !isAlumni && !isMutasi && !isAktif && { backgroundColor: '#F1F5F9', color: '#475569' },
                                ]}>
                                  {statusBadgeLabel}
                                </Text>
                              </View>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </ScrollView>

                  {rekapSiswaFiltered.length > 100 && (
                    <View style={rekapStyles.paperTableNotice}>
                      <Text style={rekapStyles.paperTableNoticeText}>
                        * Menampilkan 100 dari total {rekapSiswaFiltered.length} siswa pada pratinjau mobile. Seluruh {rekapSiswaFiltered.length} data siswa akan tercetak lengkap pada dokumen cetak A4 / PDF.
                      </Text>
                    </View>
                  )}

                  {/* LEMBAR PENGESAHAN TANDA TANGAN */}
                  <View style={rekapStyles.paperSignWrapper}>
                    <View style={rekapStyles.paperSignCol}>
                      <Text style={rekapStyles.paperSignDate}>Padang, {formattedPrintDateShort}</Text>
                      <Text style={rekapStyles.paperSignRole}>Petugas Administrasi / Operator</Text>
                      <View style={rekapStyles.paperSignSpace} />
                      <Text style={rekapStyles.paperSignName}>( .................................................... )</Text>
                      <Text style={rekapStyles.paperSignNiy}>NIP / NIY: ______________________</Text>
                    </View>
                    <View style={rekapStyles.paperSignCol}>
                      <Text style={rekapStyles.paperSignDate}>Mengetahui,</Text>
                      <Text style={rekapStyles.paperSignRole}>Kepala Bagian Kesiswaan</Text>
                      <View style={rekapStyles.paperSignSpace} />
                      <Text style={rekapStyles.paperSignName}>( .................................................... )</Text>
                      <Text style={rekapStyles.paperSignNiy}>NIY / NIP: ______________________</Text>
                    </View>
                  </View>
                </View>
              </ScrollView>

              {/* Floating Bottom Action Bar */}
              <View style={rekapStyles.printBottomBar}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setRekapPrintModalOpen(false)}
                  style={rekapStyles.printBottomBtnClose}
                >
                  <MaterialCommunityIcons name="close" size={17} color="#64748B" />
                  <Text style={rekapStyles.printBottomBtnCloseText}>Tutup</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleDownloadPdf}
                  style={rekapStyles.printBottomBtnDownload}
                >
                  <MaterialCommunityIcons name="file-pdf-box" size={18} color="#D97706" />
                  <Text style={rekapStyles.printBottomBtnDownloadText}>Unduh PDF</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handlePrintDokumen}
                  style={rekapStyles.printBottomBtnPrint}
                >
                  <MaterialCommunityIcons name="printer" size={18} color="#fff" />
                  <Text style={rekapStyles.printBottomBtnPrintText}>Cetak A4</Text>
                </TouchableOpacity>
              </View>
            </View>
          </Modal>
        </Modal>
      )}

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

      {/* ── MODAL PEMILIH ANANDA (JIKA ORANG TUA MEMILIKI >1 ANAK) ── */}
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
                      goToLoopChild(idx);
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
                      <MaterialCommunityIcons name="check-circle" size={20} color="#0D6B42" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL KALENDER: FILTER DATA PRESENSI SESUAI TANGGAL
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={isDatePickerModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsDatePickerModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDatePickerModalOpen(false)} />
          <View style={[styles.calendarPickerModalCard, { paddingBottom: modalBottomInset }]}>
            {/* Header Modal */}
            <View style={styles.calendarModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, minWidth: 0 }}>
                <View style={styles.calendarHeaderIconBox}>
                  <MaterialCommunityIcons name="calendar-search" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.calendarModalTitle}>Pilih Tanggal Presensi</Text>
                  <Text numberOfLines={1} style={styles.calendarModalSub}>
                    {formatTanggalIndo(selectedCustomDate || todayDateStr)}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsDatePickerModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Quick Presets (Pintasan Cepat) */}
            <View style={styles.calendarQuickPresets}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.calendarPresetBtn,
                  (selectedCustomDate === todayDateStr || (!selectedCustomDate && selectedPeriod === 'daily')) && styles.calendarPresetBtnActive,
                ]}
                onPress={() => {
                  setSelectedCustomDate(todayDateStr);
                  setSelectedPeriod('custom_date');
                  setIsDatePickerModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.calendarPresetText,
                    (selectedCustomDate === todayDateStr || (!selectedCustomDate && selectedPeriod === 'daily')) && styles.calendarPresetTextActive,
                  ]}
                >
                  Hari Ini
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.calendarPresetBtn,
                  selectedCustomDate === getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000)) && styles.calendarPresetBtnActive,
                ]}
                onPress={() => {
                  const yesterday = new Date();
                  yesterday.setDate(yesterday.getDate() - 1);
                  const dStr = getLocalDateString(yesterday);
                  setSelectedCustomDate(dStr);
                  setSelectedPeriod('custom_date');
                  setIsDatePickerModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.calendarPresetText,
                    selectedCustomDate === getLocalDateString(new Date(Date.now() - 24 * 60 * 60 * 1000)) && styles.calendarPresetTextActive,
                  ]}
                >
                  Kemarin
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                style={[
                  styles.calendarPresetBtn,
                  selectedCustomDate === getLocalDateString(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) && styles.calendarPresetBtnActive,
                ]}
                onPress={() => {
                  const twoDaysAgo = new Date();
                  twoDaysAgo.setDate(twoDaysAgo.getDate() - 2);
                  const dStr = getLocalDateString(twoDaysAgo);
                  setSelectedCustomDate(dStr);
                  setSelectedPeriod('custom_date');
                  setIsDatePickerModalOpen(false);
                }}
              >
                <Text
                  style={[
                    styles.calendarPresetText,
                    selectedCustomDate === getLocalDateString(new Date(Date.now() - 2 * 24 * 60 * 60 * 1000)) && styles.calendarPresetTextActive,
                  ]}
                >
                  2 Hari Lalu
                </Text>
              </TouchableOpacity>
            </View>

            {/* Month Nav */}
            <View style={styles.calendarMonthNav}>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => {
                  const prevMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
                  setCalendarMonth(prevMonth);
                }}
              >
                <MaterialCommunityIcons name="chevron-left" size={22} color="#334155" />
              </TouchableOpacity>
              <Text style={styles.calendarMonthTitle}>
                {new Intl.DateTimeFormat('id-ID', { month: 'long', year: 'numeric' }).format(calendarMonth)}
              </Text>
              <TouchableOpacity
                style={styles.calendarNavBtn}
                onPress={() => {
                  const nextMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
                  setCalendarMonth(nextMonth);
                }}
              >
                <MaterialCommunityIcons name="chevron-right" size={22} color="#334155" />
              </TouchableOpacity>
            </View>

            {/* Day Header Row */}
            <View style={styles.calendarDayHeaderRow}>
              {['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'].map((d) => (
                <Text key={d} style={styles.calendarDayHeaderCol}>{d}</Text>
              ))}
            </View>

            {/* Day Grid */}
            <View style={styles.calendarGrid}>
              {calendarGridDays.map((item, idx) => {
                if (!item.dayNum) {
                  return <View key={`empty-${idx}`} style={styles.calendarGridCell} />;
                }
                const isItemChosen = item.dateStr === (selectedCustomDate || todayDateStr);
                return (
                  <TouchableOpacity
                    key={item.dateStr}
                    style={[
                      styles.calendarGridCell,
                      isItemChosen && styles.calendarGridCellActive,
                      item.isToday && !isItemChosen && styles.calendarGridCellToday,
                    ]}
                    onPress={() => {
                      setSelectedCustomDate(item.dateStr);
                      setSelectedPeriod('custom_date');
                      setIsDatePickerModalOpen(false);
                    }}
                    activeOpacity={0.7}
                  >
                    <Text
                      style={[
                        styles.calendarGridDayText,
                        isItemChosen && styles.calendarGridDayTextActive,
                        item.isToday && !isItemChosen && styles.calendarGridDayTextToday,
                      ]}
                    >
                      {item.dayNum}
                    </Text>
                    {item.isToday && !isItemChosen && (
                      <View style={styles.todayDotIndicator} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Footer Modal Action */}
            <View style={styles.calendarModalFooter}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.calendarFooterCancelBtn}
                onPress={() => setIsDatePickerModalOpen(false)}
              >
                <Text style={styles.calendarFooterCancelText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.calendarFooterApplyBtn}
                onPress={() => {
                  if (!selectedCustomDate) setSelectedCustomDate(todayDateStr);
                  setSelectedPeriod('custom_date');
                  setIsDatePickerModalOpen(false);
                }}
              >
                <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                <Text style={styles.calendarFooterApplyText}>Terapkan Tanggal</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 1: DETAIL INFORMASI PRESENSI / PERIZINAN (Color Styled)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(isDetailModalOpen && selectedDetail)}
        animationType="slide"
        transparent
        onRequestClose={() => setIsDetailModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDetailModalOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset, overflow: 'hidden' }]}>
            {selectedDetail && (() => {
              const detailTone = getStatusColor(selectedDetail.statusKey);
              return (
                <>
                  {/* Top Accent Gradient Line */}
                  <LinearGradient
                    colors={detailTone.gradient}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.modalTopAccentLine}
                  />

                  <View style={styles.modalDragHandle} />

                  <View style={styles.modalHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1, marginRight: 8 }}>
                      <View style={[styles.modalHeaderIconBadge, { backgroundColor: detailTone.bg, borderColor: detailTone.border }]}>
                        <MaterialCommunityIcons name="clipboard-text-search-outline" size={20} color={detailTone.text} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={styles.modalHeaderTitle}>Detail Catatan Presensi</Text>
                        <Text numberOfLines={1} style={styles.modalHeaderSub}>Informasi & Catatan Kehadiran Siswa</Text>
                      </View>
                    </View>
                    <TouchableOpacity onPress={() => setIsDetailModalOpen(false)} style={styles.modalCloseBtn}>
                      <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
                    <View style={styles.modalDetailBody}>
                      {/* Detail Header Banner with Tone Color */}
                      <View style={[styles.detailHeaderBox, { backgroundColor: detailTone.bg, borderColor: detailTone.border }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 }}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailTitle}>{selectedDetail.title}</Text>
                            <Text style={styles.detailSubtitle}>{selectedDetail.subtitle}</Text>
                          </View>
                          <View
                            style={[
                              styles.statusBadgePill,
                              { backgroundColor: '#FFFFFF', borderColor: detailTone.border, paddingVertical: 5, paddingHorizontal: 10, borderWidth: 1.5, flexDirection: 'row', alignItems: 'center', gap: 4 },
                            ]}
                          >
                            <MaterialCommunityIcons name={detailTone.icon as any} size={14} color={detailTone.text} />
                            <Text style={[styles.statusBadgeText, { color: detailTone.text, fontSize: 11, fontWeight: '800' }]}>
                              {selectedDetail.status}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Detail Fields with Colorful Icon Chips */}
                      <View style={styles.detailFieldsGrid}>
                        {/* Tanggal */}
                        <View style={styles.detailFieldItemColored}>
                          <View style={[styles.detailFieldIconBox, { backgroundColor: '#ECFDF5' }]}>
                            <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#059669" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailFieldLabel}>Tanggal Presensi:</Text>
                            <Text style={styles.detailFieldValText}>{formatTanggalIndo(selectedDetail.date)}</Text>
                          </View>
                        </View>

                        {/* Waktu Kehadiran */}
                        <View style={styles.detailFieldItemColored}>
                          <View style={[styles.detailFieldIconBox, { backgroundColor: '#F0F9FF' }]}>
                            <MaterialCommunityIcons name="clock-outline" size={16} color="#0284C7" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.detailFieldLabel}>Waktu Kehadiran:</Text>
                            <Text style={styles.detailFieldValText}>{selectedDetail.time}</Text>
                          </View>
                        </View>

                        {/* Presensi Pembelajaran Fields */}
                        {selectedDetail.category === 'attendance' && (
                          <>
                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: '#EEF2FF' }]}>
                                <MaterialCommunityIcons name="account-tie" size={16} color="#4F46E5" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Guru Pengampu:</Text>
                                <Text style={styles.detailFieldValText}>{selectedDetail.subtitle || '-'}</Text>
                              </View>
                            </View>

                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: '#F0FDFA' }]}>
                                <MaterialCommunityIcons name="cellphone-check" size={16} color="#0D9488" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Metode Presensi:</Text>
                                <Text style={styles.detailFieldValText}>
                                  {selectedDetail.raw?.recorded_method || 'Aplikasi / LMS Terpadu'}
                                </Text>
                              </View>
                            </View>
                          </>
                        )}

                        {/* Perizinan Fields */}
                        {selectedDetail.category === 'permission' && (
                          <>
                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: '#FFFBEB' }]}>
                                <MaterialCommunityIcons name="calendar-range" size={16} color="#D97706" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Rentang Waktu Izin:</Text>
                                <Text style={styles.detailFieldValText}>{selectedDetail.subtitle}</Text>
                              </View>
                            </View>
                          </>
                        )}

                        {/* Boarding Pass Fields */}
                        {selectedDetail.category === 'boarding_pass' && (
                          <>
                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: '#FAF5FF' }]}>
                                <MaterialCommunityIcons name="ticket-confirmation-outline" size={16} color="#7C3AED" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Nomor Boarding Pass:</Text>
                                <Text style={[styles.detailFieldValText, { fontWeight: 'bold', fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace' }]}>
                                  {selectedDetail.raw?.permit_number || '-'}
                                </Text>
                              </View>
                            </View>

                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: '#F0F9FF' }]}>
                                <MaterialCommunityIcons name="map-marker-radius" size={16} color="#0284C7" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Status Keberadaan:</Text>
                                <Text style={[styles.detailFieldValText, { fontWeight: '700', color: selectedDetail.raw?.presence_status === 'berobat' ? '#D97706' : selectedDetail.raw?.presence_status === 'di_luar' ? '#2563EB' : '#059669' }]}>
                                  {selectedDetail.raw?.presence_status === 'berobat'
                                    ? 'Sedang Berobat'
                                    : selectedDetail.raw?.presence_status === 'di_luar'
                                    ? 'Sedang di Luar Pesantren'
                                    : selectedDetail.raw?.presence_status === 'pulang'
                                    ? 'Pulang ke Rumah'
                                    : 'Berada di Asrama / Pondok'}
                                </Text>
                              </View>
                            </View>

                            {selectedDetail.raw?.is_emergency && (
                              <View style={styles.detailFieldItemColored}>
                                <View style={[styles.detailFieldIconBox, { backgroundColor: '#FEF2F2' }]}>
                                  <MaterialCommunityIcons name="alert-decagram" size={16} color="#DC2626" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.detailFieldLabel}>Klasifikasi Medis:</Text>
                                  <Text style={[styles.detailFieldValText, { color: '#DC2626', fontWeight: '800' }]}>
                                    🚨 Rujukan Cepat / Darurat
                                  </Text>
                                </View>
                              </View>
                            )}

                            {selectedDetail.raw?.medical_complaint && (
                              <View style={styles.detailFieldItemColored}>
                                <View style={[styles.detailFieldIconBox, { backgroundColor: '#FFF1F2' }]}>
                                  <MaterialCommunityIcons name="medical-bag" size={16} color="#E11D48" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.detailFieldLabel}>Keluhan Sakit:</Text>
                                  <Text style={styles.detailFieldValText}>{selectedDetail.raw?.medical_complaint}</Text>
                                </View>
                              </View>
                            )}

                            {selectedDetail.raw?.medical_escort_name && (
                              <View style={styles.detailFieldItemColored}>
                                <View style={[styles.detailFieldIconBox, { backgroundColor: '#F0FDFA' }]}>
                                  <MaterialCommunityIcons name="account-heart-outline" size={16} color="#0D9488" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.detailFieldLabel}>Pendamping Medis:</Text>
                                  <Text style={styles.detailFieldValText}>{selectedDetail.raw?.medical_escort_name}</Text>
                                </View>
                              </View>
                            )}

                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: '#EEF2FF' }]}>
                                <MaterialCommunityIcons name="map-marker-outline" size={16} color="#4F46E5" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Alamat / Tujuan:</Text>
                                <Text style={styles.detailFieldValText}>{selectedDetail.raw?.medical_destination || selectedDetail.raw?.destination || '-'}</Text>
                              </View>
                            </View>

                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: selectedDetail.raw?.deadline_status === 'overdue' ? '#FEF2F2' : '#F8FAFC' }]}>
                                <MaterialCommunityIcons name="clock-alert-outline" size={16} color={selectedDetail.raw?.deadline_status === 'overdue' ? '#DC2626' : '#64748B'} />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Batas Wajib Kembali:</Text>
                                <Text style={[styles.detailFieldValText, { fontWeight: '700', color: selectedDetail.raw?.deadline_status === 'overdue' ? '#DC2626' : '#1E293B' }]}>
                                  {formatJamIndo(selectedDetail.raw?.scheduled_return_at)}
                                  {selectedDetail.raw?.deadline_status === 'overdue' ? ' (Terlambat)' : selectedDetail.raw?.deadline_status === 'near_deadline' ? ' (Mendekati Batas)' : ''}
                                </Text>
                              </View>
                            </View>

                            {selectedDetail.raw?.extension_count > 0 && (
                              <View style={styles.detailFieldItemColored}>
                                <View style={[styles.detailFieldIconBox, { backgroundColor: '#FFFBEB' }]}>
                                  <MaterialCommunityIcons name="timer-plus-outline" size={16} color="#D97706" />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.detailFieldLabel}>Riwayat Perpanjangan:</Text>
                                  <Text style={styles.detailFieldValText}>
                                    Diperpanjang {selectedDetail.raw?.extension_count}x (Batas awal: {formatJamIndo(selectedDetail.raw?.original_scheduled_return_at)})
                                  </Text>
                                </View>
                              </View>
                            )}

                            {selectedDetail.raw?.actual_return_at && (
                              <View style={styles.detailFieldItemColored}>
                                <View style={[styles.detailFieldIconBox, { backgroundColor: selectedDetail.raw?.late_minutes > 0 ? '#FEF2F2' : '#ECFDF5' }]}>
                                  <MaterialCommunityIcons name="clock-check-outline" size={16} color={selectedDetail.raw?.late_minutes > 0 ? '#DC2626' : '#059669'} />
                                </View>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.detailFieldLabel}>Absensi Kembali Riil:</Text>
                                  <Text style={[styles.detailFieldValText, { color: selectedDetail.raw?.late_minutes > 0 ? '#DC2626' : '#059669', fontWeight: 'bold' }]}>
                                    {formatJamIndo(selectedDetail.raw?.actual_return_at)} {selectedDetail.raw?.late_minutes > 0 ? `(Terlambat +${selectedDetail.raw?.late_minutes}m)` : '(Tepat Waktu)'}
                                  </Text>
                                </View>
                              </View>
                            )}

                            <View style={styles.detailFieldItemColored}>
                              <View style={[styles.detailFieldIconBox, { backgroundColor: '#F0F9FF' }]}>
                                <MaterialCommunityIcons name="account-child-outline" size={16} color="#0284C7" />
                              </View>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.detailFieldLabel}>Penjemput / Wali:</Text>
                                <Text style={styles.detailFieldValText}>
                                  {selectedDetail.raw?.guardian_name || selectedDetail.raw?.pickup_person_name || 'Orang Tua / Wali'} {selectedDetail.raw?.guardian_phone || selectedDetail.raw?.pickup_person_phone ? `(${selectedDetail.raw?.guardian_phone || selectedDetail.raw?.pickup_person_phone})` : ''}
                                </Text>
                              </View>
                            </View>
                          </>
                        )}
                      </View>

                      {/* CATATAN PRESENSI CALLOUT SECTION */}
                      {selectedDetail.notes ? (
                        <View style={[styles.modalNotesCallout, { backgroundColor: detailTone.bg, borderColor: detailTone.border, borderLeftColor: detailTone.text }]}>
                          <View style={styles.modalNotesCalloutHeader}>
                            <View style={[styles.modalNotesIconWrap, { backgroundColor: '#FFFFFF', borderColor: detailTone.border }]}>
                              <MaterialCommunityIcons name="message-draw" size={16} color={detailTone.text} />
                            </View>
                            <Text style={[styles.modalNotesCalloutTitle, { color: detailTone.text }]}>
                              Catatan Guru / Pembina Presensi:
                            </Text>
                          </View>
                          <View style={styles.modalNotesContentCard}>
                            <Text style={styles.modalNotesCalloutText}>
                              {selectedDetail.notes}
                            </Text>
                          </View>
                        </View>
                      ) : (
                        <View style={styles.modalNoNotesPill}>
                          <MaterialCommunityIcons name="information-outline" size={14} color="#94A3B8" />
                          <Text style={styles.modalNoNotesText}>Tidak ada catatan khusus dari guru untuk sesi presensi ini.</Text>
                        </View>
                      )}

                      {/* Lampiran File/Bukti jika ada */}
                      {selectedDetail.attachmentUrl ? (
                        <TouchableOpacity
                          activeOpacity={0.85}
                          onPress={() => openAttachmentPreview(selectedDetail.attachmentUrl, `Lampiran - ${selectedDetail.title}`)}
                          style={styles.modalAttachmentBtn}
                        >
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                            <View style={styles.modalAttachmentIconBox}>
                              <MaterialCommunityIcons name="file-document-outline" size={20} color="#059669" />
                            </View>
                            <View style={{ flex: 1 }}>
                              <Text style={styles.modalAttachmentTitle}>Dokumen Bukti / Surat Izin</Text>
                              <Text style={styles.modalAttachmentSub}>Ketuk untuk melihat foto atau file lampiran</Text>
                            </View>
                          </View>
                          <MaterialCommunityIcons name="open-in-new" size={18} color="#059669" />
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  </ScrollView>

                  {/* Gradient Close Button */}
                  <TouchableOpacity
                    activeOpacity={0.88}
                    onPress={() => setIsDetailModalOpen(false)}
                    style={{ marginTop: 14 }}
                  >
                    <LinearGradient
                      colors={detailTone.gradient}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.modalActionBtnGradient}
                    >
                      <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" style={{ marginRight: 6 }} />
                      <Text style={styles.modalActionBtnText}>Tutup Rincian Presensi</Text>
                    </LinearGradient>
                  </TouchableOpacity>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 2: FORM PENGAJUAN IZIN / SAKIT (PORTAL WALI & SISWA)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(isPermissionModalOpen)}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPermissionModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsPermissionModalOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Form Pengajuan Izin / Sakit</Text>
              <TouchableOpacity onPress={() => setIsPermissionModalOpen(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
              <View style={styles.formContainer}>
                {/* Info Siswa Terpilih (Dynamic, Bebas Hardcode) */}
                {headerStudent && (
                  <View style={styles.permissionStudentBadgeRow}>
                    <View style={styles.permissionStudentAvatarBox}>
                      <Image
                        source={getStudentAvatarSource(headerStudent)}
                        style={styles.permissionStudentAvatarImg}
                        resizeMode="cover"
                      />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text numberOfLines={1} style={styles.permissionStudentName}>
                        {headerStudent.name || headerStudent.full_name || headerStudent.nama_lengkap || 'Ananda'}
                      </Text>
                      <Text numberOfLines={1} style={styles.permissionStudentMeta}>
                        {[
                          headerStudent.unit?.name || headerStudent.unit_name || headerStudent.unit,
                          headerStudent.kelas?.nama_kelas || headerStudent.class_name || headerStudent.kelas,
                        ].filter(Boolean).join(' · ')}
                      </Text>
                    </View>
                    <View style={styles.permissionStudentTag}>
                      <MaterialCommunityIcons name="check-circle" size={12} color="#059669" style={{ marginRight: 3 }} />
                      <Text style={styles.permissionStudentTagText}>Siswa Terpilih</Text>
                    </View>
                  </View>
                )}

                {/* Jenis Izin Selector */}
                <Text style={styles.formFieldLabel}>Jenis Permohonan</Text>
                <View style={styles.typeSelectorRow}>
                  {['Izin', 'Sakit', 'Keperluan keluarga', 'Lainnya'].map((t) => {
                    const isPicked = permType === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        activeOpacity={0.8}
                        onPress={() => setPermType(t)}
                        style={[styles.typePill, isPicked && styles.typePillActive]}
                      >
                        <Text style={[styles.typePillText, isPicked && styles.typePillTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Tanggal Mulai */}
                <Text style={[styles.formFieldLabel, { marginTop: 14 }]}>Tanggal Mulai (YYYY-MM-DD)</Text>
                <TextInput
                  value={permStartDate}
                  onChangeText={setPermStartDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.formInput}
                />

                {/* Tanggal Selesai */}
                <Text style={[styles.formFieldLabel, { marginTop: 12 }]}>Tanggal Selesai (YYYY-MM-DD)</Text>
                <TextInput
                  value={permEndDate}
                  onChangeText={setPermEndDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.formInput}
                />

                {/* Alasan */}
                <Text style={[styles.formFieldLabel, { marginTop: 12 }]}>Alasan / Keterangan Lengkap</Text>
                <TextInput
                  value={permReason}
                  onChangeText={setPermReason}
                  placeholder="Tuliskan keterangan permohonan izin secara lengkap..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  style={[styles.formInput, styles.formInputArea]}
                />

                <Text style={styles.formHelpNote}>
                  Pengajuan akan diteruskan langsung ke sistem Wali Kelas dan tercatat otomatis pada database presensi.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.88}
              disabled={permSubmitting}
              onPress={() => void handleSubmitPermission()}
              style={[styles.modalActionBtn, permSubmitting && { opacity: 0.7 }]}
            >
              {permSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalActionBtnText}>Kirim Pengajuan Izin</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 3: FORM PENGAJUAN IZIN / SAKIT / DINAS LUAR (PEGAWAI & TU)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={isLeaveModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => setIsLeaveModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsLeaveModalOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>
                {leaveStatus === 'DINAS_LUAR' ? 'Laporan Dinas Luar' : leaveStatus === 'SAKIT' ? 'Pengajuan Keterangan Sakit' : 'Pengajuan Izin Kerja'}
              </Text>
              <TouchableOpacity onPress={() => setIsLeaveModalOpen(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.65 }}>
              <View style={styles.formContainer}>
                {/* Jenis Status Selector */}
                <Text style={styles.formFieldLabel}>Status Presensi</Text>
                <View style={styles.typeSelectorRow}>
                  {[
                    { key: 'IZIN', label: 'Izin' },
                    { key: 'SAKIT', label: 'Sakit' },
                    { key: 'DINAS_LUAR', label: 'Dinas Luar' },
                  ].map((t) => {
                    const isPicked = leaveStatus === t.key;
                    return (
                      <TouchableOpacity
                        key={t.key}
                        activeOpacity={0.8}
                        onPress={() => setLeaveStatus(t.key as any)}
                        style={[styles.typePill, isPicked && styles.typePillActive]}
                      >
                        <Text style={[styles.typePillText, isPicked && styles.typePillTextActive]}>{t.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Tanggal */}
                <Text style={[styles.formFieldLabel, { marginTop: 14 }]}>Tanggal Presensi (YYYY-MM-DD)</Text>
                <TextInput
                  value={leaveDate}
                  onChangeText={setLeaveDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.formInput}
                />

                {/* Alasan / Catatan */}
                <Text style={[styles.formFieldLabel, { marginTop: 12 }]}>
                  {leaveStatus === 'DINAS_LUAR' ? 'Keterangan Tugas / Lokasi Dinas' : 'Alasan / Keterangan'}
                </Text>
                <TextInput
                  value={leaveReason}
                  onChangeText={setLeaveReason}
                  placeholder={
                    leaveStatus === 'DINAS_LUAR'
                      ? 'Contoh: Menghadiri rapat koordinasi kurikulum di Dinas Pendidikan...'
                      : leaveStatus === 'SAKIT'
                        ? 'Contoh: Sakit demam berdarah sesuai anjuran istirahat dokter...'
                        : 'Contoh: Ada urusan keluarga mendesak...'
                  }
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  style={[styles.formInput, styles.formInputArea]}
                />

                {/* Upload Lampiran Berkas */}
                <Text style={[styles.formFieldLabel, { marginTop: 14 }]}>Lampiran Surat / Dokumen Pendukung</Text>
                <View style={styles.attachmentSectionBox}>
                  {leaveAttachment ? (
                    <View style={styles.pickedAttachmentCard}>
                      <MaterialCommunityIcons
                        name={leaveAttachment.type.includes('pdf') ? 'file-pdf-box' : 'file-image'}
                        size={28}
                        color={leaveAttachment.type.includes('pdf') ? '#DC2626' : '#059669'}
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text numberOfLines={1} style={styles.pickedAttachmentName}>
                          {leaveAttachment.name}
                        </Text>
                        <Text style={styles.pickedAttachmentSub}>Berkas siap diunggah</Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setLeaveAttachment(null)}
                        style={styles.removeAttachmentBtn}
                      >
                        <MaterialCommunityIcons name="close-circle" size={20} color="#DC2626" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <View style={styles.attachmentPickerRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handleTakePhoto}
                        style={styles.attachmentPickerOptionBtn}
                      >
                        <MaterialCommunityIcons name="camera" size={20} color="#059669" />
                        <Text style={styles.attachmentPickerOptionText}>Foto</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handlePickImage}
                        style={styles.attachmentPickerOptionBtn}
                      >
                        <MaterialCommunityIcons name="image" size={20} color="#2563EB" />
                        <Text style={styles.attachmentPickerOptionText}>Galeri</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={handlePickDocument}
                        style={styles.attachmentPickerOptionBtn}
                      >
                        <MaterialCommunityIcons name="file-document" size={20} color="#D97706" />
                        <Text style={styles.attachmentPickerOptionText}>Dokumen/PDF</Text>
                      </TouchableOpacity>
                    </View>
                  )}
                  <Text style={styles.attachmentHintText}>
                    Disarankan melampirkan foto surat dokter, surat tugas, atau surat izin resmi (Format PDF/JPG, maks 10MB).
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.modalActionButtonsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={submittingLeave}
                onPress={() => setIsLeaveModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                disabled={submittingLeave}
                onPress={() => void handleSubmitLeave()}
                style={[styles.modalSubmitBtn, submittingLeave && { opacity: 0.7 }]}
              >
                {submittingLeave ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>Simpan Presensi</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 4: PRATINJAU LAMPIRAN SURAT / DOKUMEN
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={isPreviewModalOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setIsPreviewModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsPreviewModalOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset, maxHeight: SCREEN_HEIGHT * 0.85 }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text numberOfLines={1} style={styles.modalHeaderTitle}>{previewAttachmentTitle}</Text>
                <Text style={styles.previewMetaSub}>Berkas Lampiran Resmi</Text>
              </View>
              <TouchableOpacity onPress={() => setIsPreviewModalOpen(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.previewContainer}>
              {previewAttachmentUrl ? (
                previewAttachmentUrl.match(/\.(jpeg|jpg|png|webp|gif)$/i) || !previewAttachmentUrl.toLowerCase().includes('.pdf') ? (
                  <Image
                    source={{ uri: previewAttachmentUrl }}
                    style={styles.previewImage}
                    resizeMode="contain"
                  />
                ) : (
                  <View style={styles.previewPdfFallback}>
                    <MaterialCommunityIcons name="file-pdf-box" size={64} color="#DC2626" />
                    <Text style={styles.previewPdfTitle}>Dokumen PDF Terlampir</Text>
                    <Text numberOfLines={2} style={styles.previewPdfUrl}>{previewAttachmentUrl}</Text>
                  </View>
                )
              ) : (
                <View style={styles.previewEmptyBox}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={40} color="#94A3B8" />
                  <Text style={styles.previewEmptyText}>Lampiran berkas tidak ditemukan.</Text>
                </View>
              )}
            </View>

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setIsPreviewModalOpen(false)}
              style={styles.modalActionBtn}
            >
              <Text style={styles.modalActionBtnText}>Tutup Pratinjau</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 5: KONFIRMASI VERIFIKASI IZIN SANTRI (TailGrids Standard)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(isReviewModalOpen && selectedPermForReview)}
        animationType="fade"
        transparent
        onRequestClose={() => {
          if (!submittingReview) setIsReviewModalOpen(false);
        }}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={() => {
              if (!submittingReview) setIsReviewModalOpen(false);
            }}
          />
          <View
            style={[
              styles.reviewModalCard,
              { paddingBottom: Math.max(modalBottomInset, 20) },
            ]}
          >
            {/* Top Accent Line */}
            <View
              style={[
                styles.reviewAccentLine,
                { backgroundColor: reviewAction === 'approve' ? '#059669' : '#E11D48' },
              ]}
            />

            {/* Modal Header */}
            <View style={styles.reviewModalHeaderRow}>
              <View
                style={[
                  styles.reviewIconSquircle,
                  { backgroundColor: reviewAction === 'approve' ? '#ECFDF5' : '#FFF1F2' },
                ]}
              >
                <MaterialCommunityIcons
                  name={reviewAction === 'approve' ? 'check-decagram' : 'close-octagon-outline'}
                  size={24}
                  color={reviewAction === 'approve' ? '#059669' : '#E11D48'}
                />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.reviewModalTitle}>
                  {reviewAction === 'approve' ? 'Konfirmasi Setujui Izin' : 'Konfirmasi Tolak Izin'}
                </Text>
                <Text style={styles.reviewModalSubtitle}>
                  {reviewAction === 'approve'
                    ? 'Status kehadiran santri akan otomatis diselaraskan.'
                    : 'Tuliskan catatan alasan penolakan izin santri.'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => {
                  if (!submittingReview) setIsReviewModalOpen(false);
                }}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Target Student Summary Box */}
            {selectedPermForReview && (
              <View style={styles.reviewStudentSummaryBox}>
                <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: '#E2E8F0' }}>
                  <Image
                    source={getStudentAvatarSource(selectedPermForReview.student || selectedPermForReview)}
                    style={{ width: 42, height: 42, borderRadius: 21, borderWidth: 1.5, borderColor: '#10B981', marginRight: 10 }}
                    resizeMode="cover"
                  />
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: '800', color: '#0F172A' }}>
                      {selectedPermForReview.student?.full_name || selectedPermForReview.student_name || 'Santri'}
                    </Text>
                    <Text numberOfLines={1} style={{ fontSize: 11.5, color: '#059669', fontWeight: '600' }}>
                      {selectedPermForReview.student?.school_class?.name || selectedPermForReview.class_name || 'Santri Terdaftar'}
                    </Text>
                  </View>
                </View>
                <View style={styles.reviewSummaryRow}>
                  <Text style={styles.reviewSummaryLabel}>Kelas / Rombel</Text>
                  <Text style={styles.reviewSummaryVal}>
                    {selectedPermForReview.student?.school_class?.name || selectedPermForReview.class_name || '-'}
                  </Text>
                </View>
                <View style={styles.reviewSummaryRow}>
                  <Text style={styles.reviewSummaryLabel}>Jenis Pengajuan</Text>
                  <Text style={[styles.reviewSummaryVal, { color: '#0D9488', fontWeight: 'bold' }]}>
                    {selectedPermForReview.type || 'Izin'}
                  </Text>
                </View>
                <View style={styles.reviewSummaryRow}>
                  <Text style={styles.reviewSummaryLabel}>Rentang Waktu</Text>
                  <Text style={styles.reviewSummaryVal}>
                    {formatTanggalIndo(selectedPermForReview.start_date)} s/d {formatTanggalIndo(selectedPermForReview.end_date)}
                  </Text>
                </View>
                <View style={[styles.reviewSummaryRow, { borderBottomWidth: 0, paddingBottom: 0 }]}>
                  <Text style={styles.reviewSummaryLabel}>Alasan / Info</Text>
                  <Text numberOfLines={3} style={[styles.reviewSummaryVal, { flex: 1, textAlign: 'right' }]}>
                    {selectedPermForReview.reason || '-'}
                  </Text>
                </View>
              </View>
            )}

            {/* Review Notes Input */}
            <View style={{ marginTop: 12 }}>
              <Text style={styles.formFieldLabel}>
                {reviewAction === 'reject'
                  ? 'Alasan Penolakan (Wajib Diisi)'
                  : 'Catatan Verifikasi (Opsional)'}
              </Text>
              <TextInput
                value={reviewNotes}
                onChangeText={setReviewNotes}
                placeholder={
                  reviewAction === 'reject'
                    ? 'Tuliskan alasan penolakan surat izin santri...'
                    : 'Contoh: Disetujui Kepala Sekolah / Wali Kelas...'
                }
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                style={[styles.formInput, styles.formInputArea, { minHeight: 65 }]}
              />
            </View>

            {/* Action Buttons */}
            <View style={[styles.modalActionButtonsRow, { marginTop: 14 }]}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={submittingReview}
                onPress={() => setIsReviewModalOpen(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.88}
                disabled={submittingReview}
                onPress={() => void handleConfirmReview()}
                style={[
                  styles.modalSubmitBtn,
                  reviewAction === 'reject' && { backgroundColor: '#E11D48' },
                  submittingReview && { opacity: 0.7 },
                ]}
              >
                {submittingReview ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitBtnText}>
                    {reviewAction === 'approve' ? 'Konfirmasi Setujui' : 'Konfirmasi Tolak'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL KETERANGAN PENGANTARAN / JARAK JAUH (OUTSIDE RADIUS) ── */}
      <Modal
        visible={dropOffModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setDropOffModalVisible(false)}
      >
        <View style={styles.dropOffModalOverlay}>
          <View style={styles.dropOffModalCard}>
            {/* Top Accent Strip */}
            <View style={styles.dropOffModalTopBar} />

            {/* Header */}
            <View style={styles.dropOffModalHeader}>
              <View style={styles.dropOffHeaderIconWrap}>
                <MaterialCommunityIcons
                  name={dropOffActionType === 'in' ? 'car-child-seat' : 'car-side'}
                  size={24}
                  color="#059669"
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.dropOffModalTitle}>
                  {dropOffActionType === 'in' ? 'Keterangan Pengantaran Masuk' : 'Keterangan Penjemputan Pulang'}
                </Text>
                <Text style={styles.dropOffModalSubtitle} numberOfLines={1}>
                  Presensi Jarak Jauh • {gateTargetUnit.name}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setDropOffModalVisible(false)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                style={styles.dropOffModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.dropOffModalBody}>
              {/* Distance Alert Box */}
              <View style={styles.dropOffDistanceBox}>
                <MaterialCommunityIcons name="map-marker-distance" size={20} color="#D97706" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.dropOffDistanceTitle}>Posisi Anda di Luar Radius</Text>
                  <Text style={styles.dropOffDistanceText}>
                    Terdeteksi berjarak ± {formatGateDistance(distanceToGate)} dari gerbang sekolah (radius izin: {gateTargetUnit.radius}m). Mohon berikan keterangan pengantar ananda.
                  </Text>
                </View>
              </View>

              {/* Kategori Pengantar */}
              <Text style={styles.dropOffInputLabel}>Pihak / Metode Pengantar</Text>
              <View style={styles.dropOffCategoryGrid}>
                {DROP_OFF_CATEGORIES.map((cat) => {
                  const isSelected = dropOffCategory === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      activeOpacity={0.8}
                      onPress={() => setDropOffCategory(cat.key)}
                      style={[
                        styles.dropOffCategoryChip,
                        isSelected && styles.dropOffCategoryChipSelected,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={cat.icon as any}
                        size={16}
                        color={isSelected ? '#059669' : '#64748B'}
                      />
                      <Text style={[
                        styles.dropOffCategoryChipText,
                        isSelected && styles.dropOffCategoryChipTextSelected,
                      ]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Input Nama Pengantar (Opsional) */}
              <Text style={styles.dropOffInputLabel}>Nama / Identitas Pengantar (Opsional)</Text>
              <TextInput
                style={styles.dropOffTextInput}
                placeholder="Contoh: Pak Joko (Grab Motor) / Om Ridwan"
                placeholderTextColor="#94A3B8"
                value={dropOffDriverName}
                onChangeText={setDropOffDriverName}
              />

              {/* Input Catatan Wajib */}
              <View style={styles.dropOffLabelRow}>
                <Text style={styles.dropOffInputLabel}>Catatan & Alasan Orang Tua *</Text>
                <Text style={[
                  styles.dropOffCharCount,
                  dropOffNotes.trim().length >= 5 ? { color: '#059669' } : { color: '#E11D48' },
                ]}>
                  {dropOffNotes.trim().length}/5 min
                </Text>
              </View>
              <TextInput
                style={[styles.dropOffTextInput, styles.dropOffTextArea]}
                placeholder="Tuliskan keterangan detail pengantaran, nopol kendaraan, atau alasan orang tua tidak bisa mengantar langsung..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                textAlignVertical="top"
                value={dropOffNotes}
                onChangeText={setDropOffNotes}
              />
              <Text style={styles.dropOffInputHint}>
                * Wajib diisi minimal 5 karakter untuk presensi di luar radius sekolah.
              </Text>
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.dropOffModalFooter}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setDropOffModalVisible(false)}
                disabled={gateLoading}
                style={styles.dropOffCancelBtn}
              >
                <Text style={styles.dropOffCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleConfirmDropOff}
                disabled={gateLoading || dropOffNotes.trim().length < 5}
                style={[
                  styles.dropOffSubmitBtn,
                  (gateLoading || dropOffNotes.trim().length < 5) && styles.dropOffSubmitBtnDisabled,
                ]}
              >
                {gateLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-circle" size={17} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.dropOffSubmitBtnText}>
                      Kirim Presensi {dropOffActionType === 'in' ? 'Masuk' : 'Pulang'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
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
          onClose={() => setFeedbackModal(null)}
        />
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
    zIndex: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
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
  bankSoalGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 14,
  },
  bankSoalGroupHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  bankSoalGroupHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  bankSoalGroupHeaderIconBoxWhite: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  bankSoalGroupTitleWhite: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  bankSoalGroupSubWhite: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 1,
  },
  bankSoalGroupBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  bankSoalGroupBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  kpiRowModern: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 10,
  },
  kpiCardModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.2,
  },
  kpiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiLabelModern: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  kpiValueModern: {
    fontSize: 19,
    fontWeight: '800',
    letterSpacing: -0.3,
    marginTop: 1,
  },
  kpiSubModern: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kpiProgressBannerWrapper: {
    paddingHorizontal: 12,
    paddingBottom: 12,
  },
  kpiProgressBanner: {
    borderRadius: 14,
    borderWidth: 1.2,
    padding: 12,
  },
  kpiProgressBannerEmerald: {
    backgroundColor: '#ECFDF5',
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
    color: '#64748B',
    marginTop: 1,
  },
  kpiMiniProgressBarBg: {
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  kpiMiniProgressBarFill: {
    height: '100%',
    borderRadius: 3,
  },
  kpiFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 999,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiFilterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
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
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowRadius: 4,
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
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginRight: 8,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    flexShrink: 1,
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
  studentSwitcherChipsContainer: {
    marginBottom: 10,
    zIndex: 2,
  },
  studentSwitcherChipsScroll: {
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 2,
  },
  studentSwitcherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  studentSwitcherChipActive: {
    backgroundColor: '#047857',
    borderColor: '#064E3B',
    borderWidth: 1.2,
  },
  studentSwitcherChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  studentSwitcherChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 0,
    paddingTop: 8,
    paddingBottom: 16,
    marginBottom: 6,
  },
  studentAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
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
    borderWidth: 1.5,
    borderColor: '#0D6B42',
  },
  childModalItemName: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  childModalItemSub: {
    fontSize: 12,
    color: '#64748B',
  },
  absensiGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 14,
  },
  absensiGroupCardHeaderGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  absensiGroupCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  absensiGroupHeaderIconBoxWhite: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  absensiGroupCardTitleWhite: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  absensiGroupCardSubWhite: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
  },
  absensiGroupActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 999,
  },
  absensiGroupActionBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  singleHeroCardContainer: {
    width: '100%',
    alignSelf: 'stretch',
  },
  heroCardScrollContainer: {
    marginHorizontal: -16,
  },
  heroCardScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  studentCardsTrack: {
    gap: STUDENT_CARD_GAP,
    paddingBottom: 4,
    zIndex: 1,
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

  // KPI Cards & Rate Card
  rateHighlightCard: {
    backgroundColor: '#F0FDF4',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rateHighlightEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#047857',
  },
  rateHighlightVal: {
    fontSize: 32,
    fontWeight: '900',
    color: '#065F46',
    marginVertical: 2,
  },
  rateHighlightSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
  },
  rateBadgeCircle: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: '#DCFCE7',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: (SCREEN_WIDTH - 32 - 16) / 3,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 1.5,
  },
  kpiCardEmerald: { borderColor: '#BBF7D0', backgroundColor: '#F0FDF4' },
  kpiCardTeal: { borderColor: '#99F6E4', backgroundColor: '#F0FDFA' },
  kpiCardAmber: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  kpiCardBlue: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  kpiCardPurple: { borderColor: '#E9D5FF', backgroundColor: '#FAF5FF' },
  kpiCardRose: { borderColor: '#FECDD3', backgroundColor: '#FFF1F2' },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Action Banner Card
  actionBannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionBannerTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  actionBannerSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 4,
  },
  actionBannerDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  employeeTimeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
  },
  employeeTimeBox: {
    flex: 1,
  },
  employeeTimeLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  employeeTimeVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  primaryActionBtnGreen: {
    backgroundColor: '#18A165',
  },
  primaryActionBtnOrange: {
    backgroundColor: '#D97706',
  },
  primaryActionBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Filter Tabs & Search
  filterTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterTabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabPillActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterTabPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTabPillTextActive: {
    color: '#FFFFFF',
  },
  headerActionPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  headerActionPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    marginBottom: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },

  // History List Items
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 280,
  },
  itemsListWrap: {
    gap: 10,
  },
  historyItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1.5,
  },
  historyItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemCategoryIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  itemSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  historyItemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  infoMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoMetaText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  notesBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  notesText: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },

  // Modal Bottom-Sheet Styles (Strictly from Section 6)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
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
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
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
  modalActionBtn: {
    backgroundColor: '#18A165',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    marginTop: 14,
  },
  modalActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Modal Detail Styles
  modalDetailBody: {
    gap: 14,
  },
  detailHeaderBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  detailFieldsGrid: {
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailFieldLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  detailFieldVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },
  modalTopAccentLine: {
    height: 5,
    width: '100%',
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
  },
  modalHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  detailFieldItemColored: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  detailFieldIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailFieldValText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  modalNotesCallout: {
    borderRadius: 14,
    borderWidth: 1.2,
    borderLeftWidth: 4.5,
    padding: 12,
    marginTop: 4,
  },
  modalNotesCalloutHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  modalNotesIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalNotesCalloutTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  modalNotesContentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(0,0,0,0.06)',
  },
  modalNotesCalloutText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 18,
  },
  modalNoNotesPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalNoNotesText: {
    fontSize: 11,
    color: '#64748B',
    fontStyle: 'italic',
    flex: 1,
  },
  modalAttachmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    padding: 12,
    marginTop: 4,
  },
  modalAttachmentIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAttachmentTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  modalAttachmentSub: {
    fontSize: 11,
    color: '#059669',
    marginTop: 1,
  },
  modalActionBtnGradient: {
    flexDirection: 'row',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },

  // Permission Form Styles
  formContainer: {
    paddingVertical: 4,
  },
  permissionStudentBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 16,
    padding: 10,
    marginBottom: 14,
  },
  permissionStudentAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#10B981',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  permissionStudentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  permissionStudentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
  },
  permissionStudentMeta: {
    fontSize: 11,
    fontWeight: '600',
    color: '#047857',
    marginTop: 2,
  },
  permissionStudentTag: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  permissionStudentTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  formFieldLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typePillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#18A165',
  },
  typePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  typePillTextActive: {
    color: '#059669',
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: '#0F172A',
  },
  formInputArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  formHelpNote: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 12,
  },
  errorBannerWrap: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  errorBannerContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
    marginRight: 8,
  },
  errorBannerText: {
    fontSize: 12,
    color: '#991B1B',
    fontWeight: '500',
    flex: 1,
  },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  retryBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  // Kelola Data Styles
  kelolaDataGrid: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 4,
  },
  kelolaDataCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  kelolaDataIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  kelolaDataTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  kelolaDataSub: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 13,
  },

  // Quick Leave Buttons Row
  quickLeaveBtnRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  quickLeaveBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1,
    gap: 4,
  },
  quickLeaveBtnText: {
    fontSize: 11,
    fontWeight: '700',
  },

  // Period Filter Chips
  periodChipsRow: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 2,
  },
  periodChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  periodChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  periodChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  periodChipTextActive: {
    color: '#FFFFFF',
  },

  // Attachment Button in History Card
  attachmentBadgeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    alignSelf: 'flex-start',
    marginTop: 8,
  },
  attachmentBadgeBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  // Attachment Section in Modal
  attachmentSectionBox: {
    marginTop: 6,
  },
  pickedAttachmentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 6,
  },
  pickedAttachmentName: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  pickedAttachmentSub: {
    fontSize: 10,
    color: '#059669',
    marginTop: 2,
    fontWeight: '600',
  },
  removeAttachmentBtn: {
    padding: 4,
  },
  attachmentPickerRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 6,
  },
  attachmentPickerOptionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
  },
  attachmentPickerOptionText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  attachmentHintText: {
    fontSize: 10,
    color: '#64748B',
    lineHeight: 14,
    marginTop: 4,
  },

  // Modal Action Buttons Row
  modalActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  modalCancelBtn: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  modalSubmitBtn: {
    flex: 2,
    backgroundColor: '#18A165',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#18A165',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  modalSubmitBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Preview Modal
  previewMetaSub: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  previewContainer: {
    minHeight: 220,
    maxHeight: 380,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginBottom: 14,
  },
  previewImage: {
    width: '100%',
    height: 320,
  },
  previewPdfFallback: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  previewPdfTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  previewPdfUrl: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
  },
  previewEmptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 8,
  },
  previewEmptyText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },

  // Verifikasi Izin Santri Styles (TailGrids Standard)
  permStatusFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  permStatusPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  permStatusPillActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  permStatusPillActiveAmber: {
    backgroundColor: '#FEF3C7',
    borderColor: '#F59E0B',
  },
  permStatusPillActiveEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  permStatusPillActiveRose: {
    backgroundColor: '#FFF1F2',
    borderColor: '#F43F5E',
  },
  permStatusPillText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  permStatusPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  permStatusPillTextActiveAmber: {
    color: '#D97706',
    fontWeight: '700',
  },
  permStatusPillTextActiveEmerald: {
    color: '#059669',
    fontWeight: '700',
  },
  permStatusPillTextActiveRose: {
    color: '#E11D48',
    fontWeight: '700',
  },
  reviewCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  permActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 12,
    borderRadius: 12,
    gap: 6,
  },
  permApproveBtn: {
    backgroundColor: '#059669',
  },
  permRejectBtn: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  permActionBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Review Modal Styles (TailGrids Standard)
  reviewModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    marginHorizontal: 16,
    paddingHorizontal: 20,
    paddingTop: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 25,
  },
  reviewAccentLine: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 5,
  },
  reviewModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 14,
  },
  reviewIconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  reviewModalTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  reviewModalSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 1,
  },
  reviewStudentSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    gap: 8,
  },
  reviewSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  reviewSummaryLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  reviewSummaryVal: {
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '700',
  },

  /* ── Master Data Header & Sub-Tabs Style (Harmonisasi Data Master) ── */
  masterHeaderContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  masterHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  masterBackButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterHeaderTitleWrap: {
    flex: 1,
  },
  masterHeaderBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  masterHeaderBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.6,
  },
  masterHeaderMainTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  masterRefreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterSearchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginTop: 12,
    gap: 8,
  },
  masterSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  masterKpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  masterKpiBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    overflow: 'hidden',
  },
  masterKpiBoxGradient: {
    padding: 9,
  },
  masterKpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  masterKpiIconSquare: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  masterKpiVal: {
    fontSize: 16,
    fontWeight: '900',
  },
  masterKpiLbl: {
    fontSize: 10.5,
    fontWeight: '800',
    marginTop: 4,
  },
  masterKpiSub: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },

  /* ── Master Segmented Sub-Tabs Bar ── */
  masterSegmentContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
  },
  masterSegmentScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  masterSegmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  masterSegmentBtnActive: {
    backgroundColor: '#059669',
  },
  masterSegmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  masterSegmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* ── Harmonized Form Notice Card ── */
  formNoticeCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  formNoticeHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  formNoticeIconSquare: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  formNoticeSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
  },
  formNoticeBtnRow: {
    flexDirection: 'row',
    gap: 8,
  },
  formNoticeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 12,
    borderWidth: 1.2,
  },
  formNoticeBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
  },

  // ── GATE ATTENDANCE CARD STYLES (HARMONIZED DENGAN PRESENSI MANDIRI TU) ──
  gateLiveClockCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  gateLiveClockGradient: {
    padding: 16,
  },
  gateLiveClockTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  gateGpsRadiusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#CCFBF1',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  gateGpsRadiusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  gateUnitNameText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
    flexShrink: 1,
    textAlign: 'right',
  },
  gateClockDigitsText: {
    fontSize: 32,
    fontWeight: '900',
    color: '#064E3B',
    textAlign: 'center',
    marginTop: 10,
    letterSpacing: 1.2,
  },
  gateDateSubText: {
    fontSize: 12,
    color: '#047857',
    textAlign: 'center',
    fontWeight: '700',
    marginTop: 2,
  },
  gateTargetStudentText: {
    fontSize: 11,
    color: '#0D9488',
    textAlign: 'center',
    fontWeight: '800',
    marginTop: 3,
  },

  // Live Map Container & Frame
  gateLiveMapContainer: {
    marginTop: 14,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  gateMapFrame: {
    width: '100%',
    height: 165,
    backgroundColor: '#CCFBF1',
    position: 'relative',
    overflow: 'hidden',
  },
  gateMapImage: {
    width: '100%',
    height: '100%',
  },
  gateMapLoadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
  },
  gateMapLoadingText: {
    fontSize: 11,
    color: '#0F766E',
    fontWeight: '600',
    marginTop: 6,
  },
  gateMapTopBadgesRow: {
    position: 'absolute',
    top: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  gateMapUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.94)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    maxWidth: '65%',
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  gateMapUnitBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  gateMapRadiusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#0D9488',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  gateMapRadiusPillSuccess: {
    backgroundColor: '#059669',
  },
  gateMapRadiusPillDanger: {
    backgroundColor: '#E11D48',
  },
  gateMapRadiusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gateMapBottomRow: {
    position: 'absolute',
    bottom: 8,
    left: 8,
    right: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  gateMapLegendBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    gap: 8,
  },
  gateLegendItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gateLegendDot: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
  },
  gateLegendText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  gateMapNavigateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    gap: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  gateMapNavigateBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  // Distance Info Card
  gateDistanceInfoCard: {
    padding: 10,
    backgroundColor: '#FFFFFF',
  },
  gateDistancePrimaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  gateDistanceValueCol: {
    flex: 1.1,
  },
  gateDistanceLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  gateDistanceNumberRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
    gap: 4,
  },
  gateDistanceNumberText: {
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  gateDistanceStatusCol: {
    flex: 1.3,
    alignItems: 'center',
  },
  gateDistanceStatusTag: {
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
  },
  gateDistanceStatusTagSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  gateDistanceStatusTagDanger: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  gateDistanceStatusTagPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  gateDistanceStatusTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  gateDistanceSubHint: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  gateRefreshGpsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
  },
  gateRefreshGpsBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gateCoordsStripRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 8,
    marginTop: 6,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 6,
  },
  gateCoordsStripText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '600',
  },
  gateCoordsStripDivider: {
    fontSize: 10,
    color: '#CBD5E1',
  },

  // Today Status 3-Pills Row
  gateTodayStatusRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 14,
  },
  gateStatusPillBox: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 5,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  gateStatusPillBoxActiveIn: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  gateStatusPillBoxActiveOut: {
    borderColor: '#99F6E4',
    backgroundColor: '#F0FDFA',
  },
  gateStatusPillBoxSuccess: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  gateStatusPillBoxNeutral: {
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  gateStatusPillHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3.5,
    marginBottom: 3,
  },
  gateStatusPillLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  gateStatusPillValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  gateStatusPillSub: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginTop: 2,
    textAlign: 'center',
  },

  // Action Buttons Row
  gateActionButtonsRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  gateCheckActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 48,
    borderRadius: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  gateCheckActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  gateSecondaryTapRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 12,
    marginTop: 10,
  },
  gateMiniRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 5,
    paddingHorizontal: 10,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  gateMiniRefreshBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  // ── MODAL KETERANGAN PENGANTARAN / JARAK JAUH STYLES ──
  dropOffModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.72)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  dropOffModalCard: {
    width: '100%',
    maxWidth: 440,
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 8,
  },
  dropOffModalTopBar: {
    height: 4,
    backgroundColor: '#059669',
  },
  dropOffModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  dropOffHeaderIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOffModalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  dropOffModalSubtitle: {
    fontSize: 11,
    color: '#0D9488',
    fontWeight: '600',
    marginTop: 1,
  },
  dropOffModalCloseBtn: {
    padding: 4,
  },
  dropOffModalBody: {
    padding: 16,
    gap: 10,
  },
  dropOffDistanceBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  dropOffDistanceTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#92400E',
  },
  dropOffDistanceText: {
    fontSize: 10.5,
    color: '#B45309',
    marginTop: 2,
    lineHeight: 15,
  },
  dropOffInputLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    marginTop: 4,
  },
  dropOffLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 4,
  },
  dropOffCharCount: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  dropOffCategoryGrid: {
    gap: 6,
  },
  dropOffCategoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 8,
  },
  dropOffCategoryChipSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  dropOffCategoryChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  dropOffCategoryChipTextSelected: {
    color: '#047857',
    fontWeight: '800',
  },
  dropOffTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12,
    color: '#0F172A',
  },
  dropOffTextArea: {
    minHeight: 65,
    paddingTop: 8,
  },
  dropOffInputHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  dropOffModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 10,
  },
  dropOffCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropOffCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  dropOffSubmitBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 10,
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  dropOffSubmitBtnDisabled: {
    backgroundColor: '#94A3B8',
    shadowOpacity: 0,
    elevation: 0,
  },
  dropOffSubmitBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // ── HARMONISASI MUTABAAH TU STYLE UNTUK PRESENSI ANANDA ──
  attendanceRatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexShrink: 0,
  },
  attendanceRateText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  kpiGridContainer: {
    gap: 8,
    marginTop: 6,
  },
  kpiGridRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCardItem: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 14,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 56,
  },
  kpiCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginBottom: 2,
  },
  kpiCardValue: {
    fontSize: 16,
    fontWeight: '900',
    lineHeight: 20,
    textAlign: 'center',
  },
  kpiCardLabel: {
    fontSize: 11,
    fontWeight: '700',
    lineHeight: 15,
    textAlign: 'center',
  },

  // 1. SEMUA / TOTAL (Slate/Indigo)
  kpiCardItemInactiveAll: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  kpiCardItemActiveAll: {
    backgroundColor: '#1E293B',
    borderColor: '#0F172A',
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },

  // 2. HADIR (Emerald)
  kpiCardItemInactiveHadir: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  kpiCardItemActiveHadir: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },

  // 3. IZIN (Blue)
  kpiCardItemInactiveIzin: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  kpiCardItemActiveIzin: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },

  // 4. SAKIT (Purple)
  kpiCardItemInactiveSakit: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
  },
  kpiCardItemActiveSakit: {
    backgroundColor: '#7C3AED',
    borderColor: '#6D28D9',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },

  // 5. TERLAMBAT (Amber)
  kpiCardItemInactiveTerlambat: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  kpiCardItemActiveTerlambat: {
    backgroundColor: '#D97706',
    borderColor: '#B45309',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },

  // 6. ALPA (Rose)
  kpiCardItemInactiveAlpa: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  kpiCardItemActiveAlpa: {
    backgroundColor: '#E11D48',
    borderColor: '#BE123C',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  unifiedLogHistoryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    gap: 10,
  },
  unifiedLogCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  unifiedLogHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    minWidth: 0,
  },
  unifiedLogCardIconBox: {
    width: 36,
    height: 36,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  unifiedLogCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  unifiedLogCardSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  resetFilterPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  unifiedLogDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 2,
  },
  filterBarTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  todayDateBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  todayDateBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#15803D',
  },
  customDateSelectedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  customDateBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  calendarPickerModalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 16,
    width: '100%',
    maxWidth: 500,
    alignSelf: 'center',
    gap: 12,
  },
  calendarModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  calendarHeaderIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  calendarModalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarModalSub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
  calendarQuickPresets: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  calendarPresetBtn: {
    flex: 1,
    paddingVertical: 6.5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarPresetBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  calendarPresetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  calendarPresetTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  calendarMonthNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
    paddingHorizontal: 6,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  calendarNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  calendarMonthTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  calendarDayHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    paddingVertical: 2,
  },
  calendarDayHeaderCol: {
    width: 36,
    textAlign: 'center',
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-around',
    rowGap: 6,
  },
  calendarGridCell: {
    width: 38,
    height: 38,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
    position: 'relative',
  },
  calendarGridCellActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 3,
  },
  calendarGridCellToday: {
    borderWidth: 1.2,
    borderColor: '#10B981',
    backgroundColor: '#F0FDF4',
  },
  calendarGridDayText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1E293B',
  },
  calendarGridDayTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  calendarGridDayTextToday: {
    color: '#059669',
    fontWeight: '800',
  },
  todayDotIndicator: {
    position: 'absolute',
    bottom: 3,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#059669',
  },
  calendarModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  calendarFooterCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarFooterCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  calendarFooterApplyBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  calendarFooterApplyText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  subjectFilterContainer: {
    gap: 6,
    marginTop: 2,
  },
  subjectSectionLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  subjectSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  subjectResetText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  subjectChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 2,
  },
  subjectChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    flexShrink: 0,
  },
  subjectChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
    elevation: 1.5,
  },
  subjectChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  subjectChipTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  periodSectionContainer: {
    gap: 5,
    marginTop: 2,
  },
  periodLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  mutabaahFilterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
    gap: 8,
  },
  mutabaahFilterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  mutabaahFilterCardTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  mutabaahFilterResetBtn: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  mutabaahSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  mutabaahSearchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  mutabaahScopeTabsScroll: {
    flexDirection: 'row',
    padding: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
  },
  mutabaahScopeTabsContainer: {
    flexDirection: 'row',
    padding: 3,
    backgroundColor: '#F1F5F9',
    borderRadius: 11,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  mutabaahScopePill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 11,
    borderRadius: 9,
    backgroundColor: 'transparent',
    flexShrink: 0,
  },
  mutabaahScopePillActive: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1.5,
  },
  mutabaahScopePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  mutabaahScopePillTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  mutabaahItemsList: {
    gap: 10,
  },
  mutabaahStudentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 13,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2.5,
  },
  mutabaahCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  mutabaahAvatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.2,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    flexShrink: 0,
  },
  mutabaahMetaCol: {
    flex: 1,
    marginRight: 8,
    justifyContent: 'center',
    minWidth: 0,
  },
  mutabaahStudentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  mutabaahStudentSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  mutabaahStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
    alignSelf: 'flex-start',
  },
  mutabaahStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  mutabaahCardDetailsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flexWrap: 'wrap',
    marginBottom: 8,
    marginTop: 2,
  },
  mutabaahCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
    marginTop: 6,
  },
  mutabaahDetailHint: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
    marginRight: 8,
  },
  mutabaahDetailHintText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
    flexShrink: 1,
  },
});

// ── Rekap Siswa Dedicated Styles ──────────────────────────────────────────────
const rekapStyles = StyleSheet.create({
  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 16,
  },
  headerBack: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#fff',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.80)',
    marginTop: 1,
  },
  headerRefresh: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  // Sub-Tab Segmented Controls
  subTabHeaderContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
  },
  subTabRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  subTabPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  subTabPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  subTabPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  subTabPillTextActive: {
    color: '#FFFFFF',
  },

  // 4 KPI Cards (Kelulusan, Prestasi, Mutasi)
  kpiCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  kpiBox: {
    width: '48%',
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
  },
  kpiBoxGradient: {
    padding: 12,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconSquare: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiVal: {
    fontSize: 18,
    fontWeight: '900',
  },
  kpiLbl: {
    fontSize: 12,
    fontWeight: '800',
  },
  kpiSub: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },

  // Callout Card List Items (Alumni, Prestasi, Mutasi)
  calloutCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMainInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  studentNameCallout: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  tagBadgeCallout: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagBadgeTextCallout: {
    fontSize: 10,
    fontWeight: '800',
  },
  subTextCallout: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  detailBoxCallout: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
    gap: 4,
  },
  detailItemRowCallout: {
    flexDirection: 'row',
    gap: 6,
  },
  detailItemLabelCallout: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    width: 65,
  },
  detailItemValCallout: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },

  // KPI Stats Cards (Harmonized with HomeScreen hubCard & statCard)
  statsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  statHeroCard: {
    width: '100%',
    borderRadius: 18,
    borderWidth: 1,
    padding: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 2,
  },
  statHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  statHeroIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statHeroTag: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statHeroTagText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statHeroContentRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  statHeroLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  statHeroValue: {
    fontSize: 26,
    fontWeight: '900',
    color: '#065F46',
  },
  statHeroFooterBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  statHeroFooterText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  statCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    borderRadius: 14,
    borderWidth: 1,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
    justifyContent: 'space-between',
    minHeight: 115,
  },
  statTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  statIconBox: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statTag: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statTagText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  statValue: {
    fontSize: 17,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 4,
  },
  statFooter: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: 'rgba(0,0,0,0.08)',
    paddingTop: 4,
    marginTop: 2,
  },
  statFooterText: {
    fontSize: 10,
    fontWeight: '700',
  },

  // Filter Card
  filterCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  filterCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  filterCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  filterResetBtn: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 14,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    padding: 0,
  },
  filterLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterPill: {
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
  },
  filterPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterPillTextActive: {
    color: '#fff',
  },

  // List Card
  listCard: {
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 14,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  listHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  listCountBadge: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  listCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },

  // Student Card
  studentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1FAF5',
  },
  studentAvatar: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  studentAvatarImg: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  studentAvatarInitials: {
    fontSize: 15,
    fontWeight: '900',
    color: '#059669',
  },
  studentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentNis: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginTop: 4,
  },
  studentUnitBadge: {
    backgroundColor: '#EFF6FF',
    borderRadius: 6,
    paddingHorizontal: 7,
    paddingVertical: 2,
    maxWidth: 130,
  },
  studentUnitText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#2563EB',
  },
  studentKelasDot: {
    fontSize: 11,
    color: '#CBD5E1',
  },
  studentKelas: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
    flexShrink: 1,
  },
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 4,
    marginLeft: 10,
    alignSelf: 'center',
  },
  statusBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Pagination
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 16,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1FAF5',
  },
  pagBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pagText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },

  // Detail Bottom Sheet
  detailSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 12,
    paddingHorizontal: 0,
    maxHeight: '88%',
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 24,
    elevation: 12,
  },
  detailHeaderGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    marginHorizontal: 16,
    borderRadius: 18,
    marginBottom: 16,
  },
  detailAvatar: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  detailAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 16,
  },
  detailAvatarInitials: {
    fontSize: 18,
    fontWeight: '900',
    color: '#fff',
  },
  detailName: {
    fontSize: 15,
    fontWeight: '900',
    color: '#fff',
  },
  detailNis: {
    fontSize: 11.5,
    color: 'rgba(255,255,255,0.82)',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    marginTop: 2,
  },
  detailCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailGrid: {
    marginHorizontal: 16,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    marginBottom: 16,
  },
  detailField: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  detailFieldLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
    flexShrink: 0,
  },
  detailFieldValue: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'right',
    flex: 1,
  },
  detailFooter: {
    paddingHorizontal: 16,
    gap: 10,
    marginBottom: 4,
  },
  detailActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 13,
  },
  detailActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#fff',
  },
  detailCloseActionBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    paddingVertical: 12,
  },
  detailCloseActionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },

  // Single Unit Notice Card
  singleUnitNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 5,
    elevation: 2,
  },
  singleUnitNoticeIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  singleUnitNoticeSub: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  singleUnitNoticeTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 1,
  },
  singleUnitNoticeBadge: {
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 9,
    paddingVertical: 3.5,
  },
  singleUnitNoticeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
  },

  // Dropdown Trigger Button
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 12,
    gap: 8,
  },
  dropdownTriggerText: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },

  // Dropdown Modal Pickers
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.5)',
    justifyContent: 'flex-end',
  },
  dropdownModalSheet: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '75%',
    paddingBottom: 24,
  },
  dropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  dropdownModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  dropdownItemActive: {
    backgroundColor: '#ECFDF5',
  },
  dropdownItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  dropdownItemTextActive: {
    fontWeight: '800',
    color: '#059669',
  },

  // Print Trigger Button in List Header
  printTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 9,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  printTriggerBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },

  // Print Preview Modal Header
  printModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#064E3B',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.12)',
  },
  printModalHeaderBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printModalHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#fff',
  },
  printModalHeaderSub: {
    fontSize: 11,
    color: 'rgba(255,255,255,0.85)',
    marginTop: 1,
  },
  printModalActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  printModalActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },

  // Notice Toast Banner
  printNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  printNoticeBannerText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },

  // A4 Paper Sheet Simulation
  paperSheet: {
    backgroundColor: '#fff',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },

  // Kop Resmi 3-Kolom
  paperKopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  paperKopLogoBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperKopLogoImg: {
    width: 44,
    height: 44,
  },
  paperKopYayasan: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  paperKopUnit: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#047857',
    textAlign: 'center',
    marginTop: 1.5,
    letterSpacing: 0.3,
  },
  paperKopMotto: {
    fontSize: 8.5,
    fontWeight: '600',
    fontStyle: 'italic',
    color: '#475569',
    textAlign: 'center',
    marginTop: 1.5,
  },
  paperKopAddress: {
    fontSize: 8.5,
    color: '#334155',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 12,
  },
  paperKopContact: {
    fontSize: 8,
    fontWeight: '600',
    color: '#0F172A',
    textAlign: 'center',
    marginTop: 2,
  },
  paperKopDividerThick: {
    height: 2.5,
    backgroundColor: '#0F172A',
    marginTop: 6,
  },
  paperKopDividerThin: {
    height: 1,
    backgroundColor: '#0F172A',
    marginTop: 2,
    marginBottom: 14,
  },

  // Document Title
  paperDocHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  paperDocTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
    textDecorationLine: 'underline',
  },
  paperDocSub: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginTop: 3,
  },

  // Parameter Filter Box
  paperFilterBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 14,
  },
  paperFilterBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    marginBottom: 8,
  },
  paperFilterBoxTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.3,
  },
  paperFilterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 8,
    columnGap: 12,
  },
  paperFilterCol: {
    width: '46%',
  },
  paperFilterLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  paperFilterValue: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 1,
  },

  // Table
  paperTable: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    marginBottom: 12,
  },
  paperTableHead: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#065F46',
    paddingVertical: 7,
    paddingHorizontal: 6,
  },
  paperTh: {
    fontSize: 10,
    fontWeight: '800',
    color: '#fff',
    letterSpacing: 0.3,
  },
  paperTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: '#fff',
  },
  paperTd: {
    fontSize: 10.5,
    color: '#334155',
  },
  paperTdBadge: {
    fontSize: 9,
    fontWeight: '800',
    borderRadius: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    textAlign: 'center',
    overflow: 'hidden',
  },
  paperTableNotice: {
    padding: 8,
    backgroundColor: '#FFFBEB',
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 14,
  },
  paperTableNoticeText: {
    fontSize: 9.5,
    color: '#92400E',
    fontStyle: 'italic',
    lineHeight: 13,
  },

  // Signatures
  paperSignWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 8,
    marginTop: 14,
    paddingTop: 8,
  },
  paperSignCol: {
    width: '45%',
    alignItems: 'center',
  },
  paperSignDate: {
    fontSize: 10,
    color: '#475569',
  },
  paperSignRole: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
    textAlign: 'center',
  },
  paperSignSpace: {
    height: 48,
  },
  paperSignName: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
    textDecorationLine: 'underline',
    textAlign: 'center',
  },
  paperSignNiy: {
    fontSize: 9.5,
    color: '#64748B',
    marginTop: 2,
  },

  // Bottom Floating Bar
  printBottomBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: -3 },
    elevation: 6,
  },
  printBottomBtnClose: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  printBottomBtnCloseText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  printBottomBtnDownload: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 11,
  },
  printBottomBtnDownloadText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#92400E',
  },
  printBottomBtnPrint: {
    flex: 1.2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 11,
  },
  printBottomBtnPrintText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#fff',
  },

  // Student Carousel & Quick Switcher Styles
  studentCarouselHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 8,
    marginTop: 4,
    zIndex: 2,
  },
  studentCarouselHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  studentCarouselIconCircle: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentCarouselHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  studentCarouselCountBadge: {
    backgroundColor: 'rgba(5, 150, 105, 0.1)',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: 'rgba(5, 150, 105, 0.25)',
  },
  studentCarouselCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  studentSwitcherChipsContainer: {
    marginBottom: 10,
    zIndex: 2,
  },
  studentSwitcherChipsScroll: {
    paddingHorizontal: 16,
    gap: 6,
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentSwitcherChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#003822',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  studentSwitcherChipActive: {
    backgroundColor: '#047857',
    borderColor: '#064E3B',
    borderWidth: 1.2,
  },
  studentSwitcherChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  studentSwitcherChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },

});


