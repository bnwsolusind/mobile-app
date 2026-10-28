import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Animated,
  Dimensions,
  Image,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
  TextInput as NativeTextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Background Image: Identik dengan Halaman Utama & Splash Screen
const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');
import {
  ActivityIndicator,
  Button,
  Card,
  Divider,
  HelperText,
  Text,
  TextInput,
} from 'react-native-paper';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../services/api';
import {
  mobileApiService,
  unwrapApiData,
  unwrapCollection,
} from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import {
  isAdminRole,
  isFoundationRole,
  isParentRole,
  isPrincipalRole,
  isStudentRole,
  isSuperAdminRole,
  isTeacherRole,
  isTuRole,
} from '../utils/roles';
import { getProfileImageUrl, resolveMediaUrl } from '../utils/profile';
import { isEmployeeGuru } from '../utils/employeeUtils';
import AppFeedbackModal, { FeedbackType } from '../components/AppFeedbackModal';

type Resource = 'employees' | 'students' | 'units' | 'classes' | 'positions';
type FormState = Record<string, any>;

const resourceLabels: Record<Resource, string> = {
  employees: 'Pegawai & Guru',
  students: 'Siswa',
  units: 'Unit Pendidikan',
  classes: 'Kelas & Rombel',
  positions: 'Master Jabatan',
};

const RELIGION_OPTIONS = [
  { id: 'Islam', name: 'Islam' },
  { id: 'Kristen Protestan', name: 'Kristen Protestan' },
  { id: 'Katolik', name: 'Katolik' },
  { id: 'Hindu', name: 'Hindu' },
  { id: 'Buddha', name: 'Buddha' },
  { id: 'Konghucu', name: 'Konghucu' },
];

const STUDENT_STATUS_OPTIONS = [
  { id: 'aktif', name: 'Aktif', subtitle: 'Siswa aktif mengikuti KBM' },
  { id: 'mutasi', name: 'Mutasi', subtitle: 'Pindah ke sekolah/unit lain' },
  { id: 'lulus', name: 'Lulus', subtitle: 'Telah tamat / menyelesaikan jenjang' },
  { id: 'berhenti', name: 'Berhenti', subtitle: 'Nonaktif / mengundurkan diri' },
  { id: 'cuti', name: 'Cuti', subtitle: 'Izin cuti akademik sementara' },
];

const EMPLOYEE_STATUS_OPTIONS = [
  { id: 'Tetap', name: 'Tetap', subtitle: 'Pegawai / Guru Tetap Yayasan' },
  { id: 'Kontrak', name: 'Kontrak', subtitle: 'Pegawai PKWT' },
  { id: 'Honorer', name: 'Honorer', subtitle: 'Tenaga Honorer / GTT' },
  { id: 'Magang', name: 'Magang', subtitle: 'Praktik Kerja Lapangan' },
  { id: 'Percobaan', name: 'Percobaan', subtitle: 'Masa Percobaan / Probasi' },
  { id: 'Non-Aktif', name: 'Non-Aktif', subtitle: 'Status Non-Aktif' },
];

const UNIT_LEVEL_OPTIONS = [
  { id: 'TK', name: 'TK / PAUD' },
  { id: 'SD', name: 'SD / MIT' },
  { id: 'SMP', name: 'SMP / MTs' },
  { id: 'SMA', name: 'SMA / MA' },
  { id: 'Ponpes', name: 'Pondok Pesantren' },
];

const CLASS_JENJANG_OPTIONS = [
  { id: 'TKIT', name: 'TKIT (Taman Kanak-kanak Islam Terpadu)' },
  { id: 'SDIT', name: 'SDIT (Sekolah Dasar Islam Terpadu)' },
  { id: 'SMPIT', name: 'SMPIT (Sekolah Menengah Pertama Islam Terpadu)' },
  { id: 'SMAIT', name: 'SMAIT (Sekolah Menengah Atas Islam Terpadu)' },
  { id: 'MIT', name: 'MIT (Madrasah Ibtidaiyah Terpadu)' },
  { id: 'MA', name: 'MA (Madrasah Aliyah)' },
];

const CLASS_TINGKAT_OPTIONS = [
  { id: 'TK A', name: 'Tingkat TK A' },
  { id: 'TK B', name: 'Tingkat TK B' },
  { id: '1', name: 'Tingkat 1' },
  { id: '2', name: 'Tingkat 2' },
  { id: '3', name: 'Tingkat 3' },
  { id: '4', name: 'Tingkat 4' },
  { id: '5', name: 'Tingkat 5' },
  { id: '6', name: 'Tingkat 6' },
  { id: '7', name: 'Tingkat 7' },
  { id: '8', name: 'Tingkat 8' },
  { id: '9', name: 'Tingkat 9' },
  { id: '10', name: 'Tingkat 10' },
  { id: '11', name: 'Tingkat 11' },
  { id: '12', name: 'Tingkat 12' },
];

const CLASS_STATUS_OPTIONS = [
  { id: 'Aktif', name: 'Aktif', subtitle: 'Rombel aktif beroperasi' },
  { id: 'Nonaktif', name: 'Nonaktif', subtitle: 'Rombel nonaktif / diarsipkan' },
];

const EMPLOYEE_ACTIVE_STATUS_OPTIONS = [
  { id: 'Aktif', name: 'Aktif', subtitle: 'Pegawai aktif bertugas' },
  { id: 'Cuti', name: 'Cuti', subtitle: 'Sedang menjalani cuti resmi' },
  { id: 'Resign', name: 'Resign / Nonaktif', subtitle: 'Sudah tidak bertugas / berhenti' },
];

const JABATAN_LEVEL_OPTIONS = [
  { id: '3', name: 'Level 3 - Kepala Sekolah', subtitle: 'Pimpinan Eksekutif Unit Sekolah' },
  { id: '4', name: 'Level 4 - Wakil Kepala Sekolah', subtitle: 'Waka Kurikulum / Kesiswaan / Humas' },
  { id: '5', name: 'Level 5 - Koordinator / Kaur', subtitle: 'Koordinator Bidang / Program' },
  { id: '6', name: 'Level 6 - Wali Kelas / Musyrif', subtitle: 'Pembina Kelas & Pengasuh Santri' },
  { id: '7', name: 'Level 7 - Guru / Tenaga Pendidik', subtitle: 'Dewan Guru Mata Pelajaran / Tahfizh' },
  { id: '8', name: 'Level 8 - Tata Usaha & Staf', subtitle: 'Tenaga Kependidikan / Administrasi' },
  { id: '9', name: 'Level 9 - Tenaga Teknis', subtitle: 'Security, Kebersihan, Sarpras, IT' },
  { id: '10', name: 'Level 10 - Pelaksana Lainnya', subtitle: 'Staf Magang / Kontrak Pendukung' },
];

const JABATAN_SATUAN_KERJA_OPTIONS = [
  { id: 'Unit Pendidikan', name: 'Unit Pendidikan', subtitle: 'Sekolah / Madrasah / Pondok' },
  { id: 'Bidang Pendidikan', name: 'Bidang Pendidikan', subtitle: 'Manajemen Divisi Pendidikan' },
  { id: 'Pengurus', name: 'Pengurus Yayasan', subtitle: 'Pimpinan & Yayasan' },
];

const JABATAN_SCOPE_AKSES_OPTIONS = [
  { id: 'unit_sendiri', name: 'Unit Sendiri', subtitle: 'Akses terbatas pada unit sekolah aktif' },
  { id: 'rombel_sendiri', name: 'Rombel Sendiri', subtitle: 'Hanya rombel binaan / wali kelas' },
  { id: 'kelas_mapel_sendiri', name: 'Kelas Mapel Sendiri', subtitle: 'Hanya jadwal mengajar guru' },
  { id: 'semua_unit', name: 'Semua Unit', subtitle: 'Akses lintas seluruh unit sekolah' },
];

const JABATAN_STATUS_OPTIONS = [
  { id: 'Aktif', name: 'Aktif', subtitle: 'Jabatan aktif dapat ditugaskan ke pegawai' },
  { id: 'Nonaktif', name: 'Nonaktif', subtitle: 'Jabatan dinonaktifkan sementara' },
];

const PEKERJAAN_OPTIONS = [
  { id: 'Pegawai Negeri', name: 'Pegawai Negeri (PNS/ASN)' },
  { id: 'Pegawai Swasta', name: 'Pegawai Swasta' },
  { id: 'Pegawai BUMN', name: 'Pegawai BUMN / BUMD' },
  { id: 'Wiraswasta', name: 'Wiraswasta / Pengusaha' },
  { id: 'TNI / POLRI', name: 'TNI / POLRI' },
  { id: 'Guru / Dosen', name: 'Guru / Dosen' },
  { id: 'Petani / Peternak', name: 'Petani / Peternak' },
  { id: 'Buruh', name: 'Buruh / Tenaga Harian' },
  { id: 'Ibu Rumah Tangga', name: 'Ibu Rumah Tangga' },
  { id: 'Tidak Bekerja', name: 'Tidak Bekerja' },
  { id: 'Lainnya', name: 'Lainnya' },
];

const PENDIDIKAN_OPTIONS = [
  { id: 'SD / MI', name: 'SD / MI' },
  { id: 'SMP / MTs', name: 'SMP / MTs' },
  { id: 'SMA / SMK / MA', name: 'SMA / SMK / MA' },
  { id: 'D1 / D2 / D3', name: 'D1 / D2 / D3' },
  { id: 'S1 / D4', name: 'S1 / D4 (Sarjana)' },
  { id: 'S2', name: 'S2 (Magister)' },
  { id: 'S3', name: 'S3 (Doktor)' },
  { id: 'Tidak Sekolah', name: 'Tidak Sekolah' },
];

const STATUS_SEKOLAH_OPTIONS = [
  { id: 'Formal', name: 'Formal (SD, MI, SMP, dll)' },
  { id: 'Tidak Formal', name: 'Tidak Formal / Homeschooling' },
];

const STUDENT_STEPS = [
  { id: 0, label: '1. Pribadi', icon: 'card-account-details-outline' },
  { id: 1, label: '2. Akademik', icon: 'school-outline' },
  { id: 2, label: '3. Orang Tua', icon: 'account-child-circle' },
  { id: 3, label: '4. Wali & Asal', icon: 'account-supervisor-outline' },
  { id: 4, label: 'Semua Section', icon: 'view-agenda-outline' },
];

// ── Tema visual per Tab (Siswa: Biru, Pegawai: Hijau Zamrud, Kelas: Ungu) ──
const TAB_THEMES: Record<Resource, {
  label: string;
  sub: string;
  icon: string;
  activeColors: [string, string, string];
  activeShadow: string;
  inactiveBorder: string;
  inactiveBg: [string, string];
  iconBg: string;
  iconColor: string;
  textColor: string;
  cardAccentColor: string;
}> = {
  students: {
    label: 'Buku Induk',
    sub: 'Data Siswa',
    icon: 'account-school-outline',
    activeColors: ['#0D5B41', '#059669', '#18A165'],
    activeShadow: '#059669',
    inactiveBorder: '#A7F3D0',
    inactiveBg: ['#FFFFFF', '#ECFDF5'],
    iconBg: '#D1FAE5',
    iconColor: '#0D5B41',
    textColor: '#064E3B',
    cardAccentColor: '#0D5B41',
  },
  employees: {
    label: 'Pegawai',
    sub: 'Guru & Tendik',
    icon: 'badge-account-outline',
    activeColors: ['#059669', '#0E5C44', '#004D32'],
    activeShadow: '#059669',
    inactiveBorder: '#A7F3D0',
    inactiveBg: ['#FFFFFF', '#ECFDF5'],
    iconBg: '#D1FAE5',
    iconColor: '#059669',
    textColor: '#065F46',
    cardAccentColor: '#059669',
  },
  classes: {
    label: 'Kelas',
    sub: 'Rombel KBM',
    icon: 'google-classroom',
    activeColors: ['#7C3AED', '#6D28D9', '#4C1D95'],
    activeShadow: '#7C3AED',
    inactiveBorder: '#C4B5FD',
    inactiveBg: ['#FFFFFF', '#F5F3FF'],
    iconBg: '#EDE9FE',
    iconColor: '#7C3AED',
    textColor: '#5B21B6',
    cardAccentColor: '#7C3AED',
  },
  units: {
    label: 'Unit',
    sub: 'Pendidikan',
    icon: 'domain',
    activeColors: ['#D97706', '#B45309', '#78350F'],
    activeShadow: '#D97706',
    inactiveBorder: '#FDE68A',
    inactiveBg: ['#FFFFFF', '#FEF3C7'],
    iconBg: '#FEF3C7',
    iconColor: '#D97706',
    textColor: '#92400E',
    cardAccentColor: '#D97706',
  },
  positions: {
    label: 'Jabatan',
    sub: 'Struktur PTK',
    icon: 'badge-account-horizontal-outline',
    activeColors: ['#0891B2', '#0E7490', '#155E75'],
    activeShadow: '#0891B2',
    inactiveBorder: '#A5F3FC',
    inactiveBg: ['#FFFFFF', '#ECFEFF'],
    iconBg: '#CFFAFE',
    iconColor: '#0891B2',
    textColor: '#155E75',
    cardAccentColor: '#0891B2',
  },
};

const MAIN_TABS: Resource[] = ['students', 'employees', 'classes', 'positions'];

const asText = (value: unknown): string => (value === null || value === undefined ? '' : String(value));

const nestedName = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value && typeof value === 'object') {
    const item = value as {
      nama_tampil?: string;
      nama_lengkap?: string;
      name?: string;
      nama?: string;
      nama_kelas?: string;
      title?: string;
    };
    return item.nama_tampil || item.nama_lengkap || item.name || item.nama || item.nama_kelas || item.title || '';
  }
  return '';
};

const normalizedGender = (value: unknown, resource: Resource): string => {
  if (resource === 'classes') return '';
  const gender = asText(value).toLowerCase();
  if (!gender) return resource === 'employees' ? 'L' : '';
  if (resource === 'employees') return ['p', 'female', 'perempuan'].includes(gender) ? 'P' : 'L';
  return ['l', 'male', 'laki-laki', 'laki laki'].includes(gender) ? 'male' : 'female';
};

const checkIsEmployeeGuru = isEmployeeGuru;

const isExcludedEmployee = (item: any): boolean => {
  if (!item) return false;
  const posName = String(
    item.position?.name ||
    item.position?.nama ||
    item.nama_jabatan ||
    item.jabatan ||
    item.position_name ||
    ''
  ).toLowerCase();

  const workUnit = String(
    item.position?.satuan_kerja ||
    item.satuan_kerja ||
    item.unit?.name ||
    ''
  ).toLowerCase();

  const levelJabatan = Number(item.position?.level_jabatan ?? 0);
  // Level 1: Pengurus Yayasan, Level 2: Divisi Pendidikan, Level 7: Operator Sekolah
  if (levelJabatan === 1 || levelJabatan === 2 || levelJabatan === 7) {
    return true;
  }

  if (
    workUnit.includes('yayasan') ||
    workUnit.includes('bidang pendidikan') ||
    workUnit.includes('divisi pendidikan') ||
    workUnit === 'pengurus'
  ) {
    return true;
  }

  const excludedKeywords = [
    'yayasan',
    'pembina',
    'pengawas',
    'bidang pendidikan',
    'divisi pendidikan',
    'superadmin',
    'super admin',
    'super_admin',
    'administrator',
    'operator',
  ];

  if (excludedKeywords.some((kw) => posName.includes(kw))) {
    return true;
  }

  // Cek kata admin terisolasi pada nama jabatan (misal: "Admin", "Admin Sistem", tapi tidak mencocokkan "Administrasi")
  if (/\badmin\b/i.test(posName) && !posName.includes('administrasi')) {
    return true;
  }

  // Cek email admin/superadmin/operator
  const email = String(item.email || item.user?.email || '').toLowerCase();
  if (
    email.startsWith('superadmin@') ||
    email.startsWith('admin@') ||
    email.startsWith('operator@') ||
    email.startsWith('yayasan@')
  ) {
    return true;
  }

  // Cek string role atau properti role pada data pegawai
  const roleStr = String(item.role || item.user?.role || '').toLowerCase();
  if (
    excludedKeywords.some((kw) => roleStr.includes(kw)) ||
    (/\badmin\b/i.test(roleStr) && !roleStr.includes('administrasi'))
  ) {
    return true;
  }

  // Cek array roles user jika ada
  if (Array.isArray(item.user?.roles)) {
    const hasForbiddenRole = item.user.roles.some((r: any) => {
      const rName = String(r?.name || r || '').toLowerCase();
      return (
        excludedKeywords.some((kw) => rName.includes(kw)) ||
        (/\badmin\b/i.test(rName) && !rName.includes('administrasi'))
      );
    });
    if (hasForbiddenRole) return true;
  }

  return false;
};

export default function DataManagementScreen({ route, navigation: propNavigation }: any) {
  const insets = useSafeAreaInsets();
  const hookNavigation = useNavigation<any>();
  const navigation = propNavigation || hookNavigation;

  const handleGoBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation);
    if (!handled) {
      if (navigation.canGoBack()) {
        navigation.goBack();
      } else {
        navigation.navigate('Beranda');
      }
    }
  };

  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const permissions = useAuthStore((state) => state.permissions);
  const scope = useAuthStore((state) => state.scope);
  const foundation = isFoundationRole(roles) || isFoundationRole(user?.roles || []);
  const isPrincipal = isPrincipalRole(roles) || isPrincipalRole(user?.roles || []);
  const teacher = isTeacherRole(roles) || isTeacherRole(user?.roles || []);
  const superAdmin = isSuperAdminRole(roles) || isSuperAdminRole(user?.roles || []);
  const isTu = isTuRole(roles) || isTuRole(user?.roles || []);
  const isStudent = isStudentRole(roles) || isStudentRole(user?.roles || []);
  const isParent = isParentRole(roles) || isParentRole(user?.roles || []);
  const isAdmin = isAdminRole(roles) || isAdminRole(user?.roles || []);

  const hasPermission = (...items: string[]) => superAdmin || isPrincipal || items.some((item) => permissions.includes(item));
  const canReadMaster = isPrincipal || hasPermission(
    'employee.view', 'employee.view_all', 'student.view', 'student.view_all',
    'unit.view', 'unit.view_all', 'master.view', 'sistem.master_data',
  );

  const resources: Resource[] = useMemo(() => {
    if (foundation) {
      return ['units', 'employees', 'students', 'classes', 'positions'];
    }
    if (isStudent || isParent) {
      return ['students', 'classes'];
    }
    if (superAdmin || isAdmin || isPrincipal || isTu || canReadMaster) {
      return ['students', 'employees', 'classes', 'positions'];
    }
    if (teacher) {
      return ['students', 'classes', 'employees'];
    }
    return ['students', 'classes'];
  }, [foundation, isStudent, isParent, superAdmin, isAdmin, isPrincipal, isTu, canReadMaster, teacher]);

  const targetParam = route?.params?.initialResource || route?.params?.tab || route?.params?.resource;
  const isAlumniInit = targetParam === 'alumni' || route?.params?.filterStatus === 'lulus' || route?.params?.mode === 'alumni';
  const isMutasiInit = targetParam === 'mutasi' || route?.params?.filterStatus === 'mutasi' || route?.params?.mode === 'mutasi';
  const isClassesInit = targetParam === 'classes' || targetParam === 'kelas' || route?.params?.mode === 'classes' || route?.params?.mode === 'kelas';

  let initialSelected: Resource = resources[0] || 'students';
  if (isClassesInit && resources.includes('classes')) {
    initialSelected = 'classes';
  } else if (targetParam && resources.includes(targetParam as Resource)) {
    initialSelected = targetParam as Resource;
  }

  const [resource, setResource] = useState<Resource>(initialSelected);

  useEffect(() => {
    if (!resources.includes(resource)) {
      setResource(resources[0] || 'students');
    }
  }, [resources, resource]);

  const [items, setItems] = useState<any[]>([]);
  const [employeeDashboardStats, setEmployeeDashboardStats] = useState<any>(null);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [displayLimit, setDisplayLimit] = useState(25);

  // Auto debounce search agar input mengetik terasa instan tanpa membebani thread
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim());
      setDisplayLimit(25);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  // ── Filters per resource ──
  const [filterKelas, setFilterKelas] = useState<string>('all');
  const [filterJabatan, setFilterJabatan] = useState<string>('all');
  const [filterTingkat, setFilterTingkat] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>(
    isMutasiInit ? 'mutasi' : isAlumniInit ? 'lulus' : (route?.params?.filterStatus || 'all')
  );
  const [filterGender, setFilterGender] = useState<string>('all');

  useEffect(() => {
    const target = route?.params?.initialResource || route?.params?.tab || route?.params?.resource;
    const filterStat = route?.params?.filterStatus || route?.params?.status;
    const mode = route?.params?.mode;

    if (target === 'mutasi' || filterStat === 'mutasi' || mode === 'mutasi') {
      setResource('students');
      setFilterStatus('mutasi');
    } else if (target === 'alumni' || filterStat === 'lulus' || mode === 'alumni') {
      setResource('students');
      setFilterStatus('lulus');
    } else if (target === 'classes' || target === 'kelas' || mode === 'classes' || mode === 'kelas') {
      setResource('classes');
    } else if (target && resources.includes(target as Resource)) {
      setResource(target as Resource);
      if (filterStat) {
        setFilterStatus(String(filterStat));
      }
    } else if (filterStat) {
      setFilterStatus(String(filterStat));
    }
  }, [route?.params?.initialResource, route?.params?.tab, route?.params?.resource, route?.params?.filterStatus, route?.params?.status, route?.params?.mode]);

  // ── Dropdown Modal Visible State ──
  const [filterDropdownOpen, setFilterDropdownOpen] = useState(false);
  const [dropdownSearch, setDropdownSearch] = useState('');

  const [availableClasses, setAvailableClasses] = useState<{
    id: string;
    name: string;
    unit_id?: string;
    kapasitas?: number;
    jumlah_siswa?: number;
    is_full?: boolean;
  }[]>([]);
  const [availablePositions, setAvailablePositions] = useState<{ id: string; name: string }[]>([]);
  const [availableUnits, setAvailableUnits] = useState<{
    id: string;
    name: string;
    level?: string | null;
    logo_url?: string | null;
    address?: string | null;
    phone?: string | null;
    email?: string | null;
  }[]>([]);
  const [availableAcademicYears, setAvailableAcademicYears] = useState<{ id: string; name: string; is_active?: boolean }[]>([]);
  const [activeAcademicYearName, setActiveAcademicYearName] = useState<string>('');
  const currentAyName = activeAcademicYearName || `${new Date().getFullYear()}/${new Date().getFullYear() + 1}`;
  const [availableSemesters, setAvailableSemesters] = useState<{ id: string; name: string; academic_year_id?: string; is_active?: boolean }[]>([]);
  const [availableTeachers, setAvailableTeachers] = useState<{ id: string; name: string; unit_id?: string }[]>([]);
  const [pekerjaanOptions, setPekerjaanOptions] = useState<{ id: string; name: string }[]>([]);
  const [pendidikanOptions, setPendidikanOptions] = useState<{ id: string; name: string }[]>([]);
  const [studentStatusOptions, setStudentStatusOptions] = useState<{ id: string; name: string; subtitle?: string }[]>(STUDENT_STATUS_OPTIONS);
  const [employeeStatusOptions, setEmployeeStatusOptions] = useState<{ id: string; name: string; subtitle?: string }[]>(EMPLOYEE_STATUS_OPTIONS);
  const [unitLevelOptions, setUnitLevelOptions] = useState<{ id: string; name: string }[]>(UNIT_LEVEL_OPTIONS);
  const [returnToEditId, setReturnToEditId] = useState<string | null>(null);

  // ── Two-Way Handshake Student Mutations (Pindah Unit) ──
  const [mutasiModalVisible, setMutasiModalVisible] = useState(false);
  const [mutasiStudent, setMutasiStudent] = useState<any | null>(null);
  const [mutasiForm, setMutasiForm] = useState({ unit_tujuan_id: '', alasan: '', catatan: '' });
  const [submittingMutasi, setSubmittingMutasi] = useState(false);

  // Incoming Mutations (Pindahan Masuk Menunggu Persetujuan TU)
  const [incomingMutations, setIncomingMutations] = useState<any[]>([]);
  const [incomingModalVisible, setIncomingModalVisible] = useState(false);
  const [loadingIncoming, setLoadingIncoming] = useState(false);
  const [selectedIncoming, setSelectedIncoming] = useState<any | null>(null);
  const [approvalKelasId, setApprovalKelasId] = useState('');
  const [approvalCatatan, setApprovalCatatan] = useState('');
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState('');
  const [processingApproval, setProcessingApproval] = useState(false);

  // ── Form Selection Picker Modal ──
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    fieldKey: string;
    options: {
      id: string;
      name: string;
      subtitle?: string;
      disabled?: boolean;
      disabledReason?: string;
    }[];
    onSelect?: (value: string) => void;
  } | null>(null);
  const [pickerSearch, setPickerSearch] = useState('');

  // ── Multi-select / Bulk Delete ──
  const [isSelectMode, setIsSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // ── Scroll-triggered FAB ──
  const [showScrollFab, setShowScrollFab] = useState(false);
  const scrollFabAnim = useRef(new Animated.Value(0)).current;

  const handleScrollFab = useCallback((visible: boolean) => {
    setShowScrollFab(visible);
    Animated.spring(scrollFabAnim, {
      toValue: visible ? 1 : 0,
      useNativeDriver: true,
      speed: 18,
      bounciness: 8,
    }).start();
  }, [scrollFabAnim]);

  // ── Modals: Detail Data, Print Rekap, Print Single, Form ──
  const [detailItem, setDetailItem] = useState<any | null>(null);
  const [rekapPrintModalVisible, setRekapPrintModalVisible] = useState(false);
  const [singlePrintItem, setSinglePrintItem] = useState<any | null>(null);
  const [printNotice, setPrintNotice] = useState<string | null>(null);

  const [modalVisible, setModalVisible] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>({});
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [studentFormStep, setStudentFormStep] = useState<number>(0);

  // ── Feedback Modal ──
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    actionLabel?: string;
    cancelLabel?: string;
    onConfirm?: () => void;
  } | null>(null);

  const isGlobalPersonnel = foundation || superAdmin;
  const currentUserUnitId = String(
    scope?.unit_id ||
    user?.education_unit_id ||
    user?.unit_id ||
    (user as any)?.metadata?.education_unit_id ||
    (user as any)?.metadata?.unit_id ||
    (user as any)?.employee?.unit_id ||
    (user as any)?.education_unit?.id ||
    (user as any)?.unit_details?.id ||
    ''
  );
  const isUnitLocked = (!foundation && !superAdmin && Boolean(currentUserUnitId)) || isTu || isPrincipal;
  const canCreate = resource === 'units'
    ? (foundation || superAdmin || hasPermission('unit.create'))
    : resource === 'positions'
      ? (foundation || superAdmin || hasPermission('master.create', 'employee.position.manage', 'sistem.master_data'))
      : resource === 'employees'
        ? (isTu || isPrincipal || isGlobalPersonnel || hasPermission('employee.create', 'sistem.master_data'))
        : resource === 'students'
          ? (isTu || isPrincipal || hasPermission('student.create', 'sistem.master_data'))
          : (isTu || isPrincipal || hasPermission('master.create', 'academic.schedule.create', 'sistem.master_data'));

  const canUpdate = resource === 'units'
    ? (foundation || superAdmin || hasPermission('unit.update'))
    : resource === 'positions'
      ? (foundation || superAdmin || hasPermission('master.update', 'employee.position.manage', 'sistem.master_data'))
      : resource === 'employees'
        ? (isTu || isPrincipal || isGlobalPersonnel || hasPermission('employee.update', 'sistem.master_data'))
        : resource === 'students'
          ? (isTu || isPrincipal || hasPermission('student.update', 'student.edit', 'academic.manage', 'sistem.master_data'))
          : (isTu || isPrincipal || hasPermission('master.update', 'academic.schedule.update', 'sistem.master_data'));

  const canDelete = resource === 'units'
    ? (foundation || superAdmin || hasPermission('unit.delete'))
    : resource === 'positions'
      ? (foundation || superAdmin || hasPermission('master.delete', 'employee.position.manage', 'sistem.master_data'))
      : resource === 'employees'
        ? (isTu || isPrincipal || isGlobalPersonnel || hasPermission('employee.delete', 'sistem.master_data'))
        : resource === 'students'
          ? (isTu || isPrincipal || hasPermission('student.delete', 'sistem.master_data'))
          : (isTu || isPrincipal || hasPermission('master.delete', 'academic.schedule.delete', 'sistem.master_data'));

  // Load filter options (classes, positions, units) - Eksekusi paralel berkinerja tinggi
  useEffect(() => {
    let isMounted = true;
    const loadFilterOptions = async () => {
      const activeUnitId = (!foundation && !superAdmin) ? (currentUserUnitId || scope?.unit_id || undefined) : undefined;
      const clsPromise = mobileApiService.getClasses({ per_page: 200, unit_id: activeUnitId, unit_pendidikan_id: activeUnitId });
      const posPromise = mobileApiService.getEmployeePositions();
      const unitPromise = foundation
        ? mobileApiService.getFoundationUnits({ per_page: 100 })
        : mobileApiService.getEducationUnits({ per_page: 100 });
      const ayPromise = mobileApiService.getAcademicYears();
      const optPromise = mobileApiService.getKelasOptions();

      const [clsResult, posResult, unitResult, ayResult, optResult] = await Promise.allSettled([
        clsPromise,
        posPromise,
        unitPromise,
        ayPromise,
        optPromise,
      ]);

      if (!isMounted) return;

      if (clsResult.status === 'fulfilled') {
        const rawCls = unwrapCollection(clsResult.value);
        if (Array.isArray(rawCls)) {
          let mappedCls = rawCls.map((c: any) => {
            const kapasitas = Number(c.kapasitas) || 0;
            const jumlahSiswa = Number(c.jumlah_siswa ?? c.siswa_count ?? c.students_count ?? 0);
            const isFull = kapasitas > 0 && jumlahSiswa >= kapasitas;
            return {
              id: String(c.id),
              name: c.nama_kelas || c.name || `Kelas ${c.tingkat || ''}`,
              unit_id: String(c.unit_pendidikan_id || c.unit_id || ''),
              kapasitas,
              jumlah_siswa: jumlahSiswa,
              is_full: isFull,
            };
          });
          if (isTu && currentUserUnitId) {
            mappedCls = mappedCls.filter((c) => String(c.unit_id) === String(currentUserUnitId));
          }
          setAvailableClasses(mappedCls);
        }
      }

      if (posResult.status === 'fulfilled') {
        const rawPos = unwrapCollection(posResult.value);
        if (Array.isArray(rawPos)) {
          let mappedPos = rawPos.map((p: any) => ({
            id: String(p.id || p.nama || p.name),
            name: p.nama || p.name || p.nama_jabatan || 'Jabatan',
            satuan_kerja: p.satuan_kerja || '',
            level_jabatan: p.level_jabatan,
          }));
          if (isTu) {
            mappedPos = mappedPos.filter((p: any) => {
              const name = (p.name || '').toLowerCase();
              const satuan = (p.satuan_kerja || '').toLowerCase();
              const lvl = Number(p.level_jabatan ?? 0);
              if (lvl === 1 || lvl === 2 || lvl === 7) return false;
              if (satuan.includes('yayasan') || satuan.includes('bidang pendidikan') || satuan === 'pengurus') return false;
              const excluded = ['yayasan', 'pembina', 'pengawas', 'bidang pendidikan', 'divisi pendidikan', 'superadmin', 'super admin', 'administrator', 'operator'];
              if (excluded.some((kw) => name.includes(kw))) return false;
              if (/\badmin\b/i.test(name) && !name.includes('administrasi')) return false;
              return true;
            });
          }
          setAvailablePositions(mappedPos);
        }
      }

      if (unitResult.status === 'fulfilled') {
        const rawUnits = unwrapCollection(unitResult.value);
        if (Array.isArray(rawUnits)) {
          let mappedUnits = rawUnits.map((u: any) => ({
            id: String(u.id),
            name: u.name || u.nama || 'Unit Pendidikan',
            level: u.level || u.jenjang || u.stage || null,
            logo_url: u.logo_url || u.metadata?.logo_url || u.metadata?.logo_path || null,
            address: u.metadata?.address || u.metadata?.alamat || u.address || u.alamat || null,
            phone: u.metadata?.phone || u.metadata?.telepon || u.metadata?.telp || u.phone || null,
            email: u.metadata?.email || u.email || null,
          }));
          if (isTu && currentUserUnitId) {
            mappedUnits = mappedUnits.filter((u) => String(u.id) === String(currentUserUnitId));
          }
          setAvailableUnits(mappedUnits);
        }
      }

      if (ayResult.status === 'fulfilled') {
        const rawAy = unwrapCollection(ayResult.value);
        if (Array.isArray(rawAy) && rawAy.length > 0) {
          const mapped = rawAy.map((ay: any) => ({
            id: String(ay.id || ay.name || ay.tahun),
            name: String(ay.name || ay.tahun || ay.label),
            is_active: Boolean(ay.is_active || ay.aktif),
          }));
          setAvailableAcademicYears(mapped);
          const active = mapped.find((a) => a.is_active) || mapped[0];
          if (active) {
            setActiveAcademicYearName(active.name);
          }
        }
      }

      if (optResult.status === 'fulfilled') {
        const optRes = optResult.value;
        const optData = (optRes && typeof optRes === 'object' && 'data' in optRes) ? (optRes as any).data : optRes;
        if (optData) {
          if (Array.isArray(optData.semesters)) {
            setAvailableSemesters(
              optData.semesters.map((s: any) => ({
                id: String(s.id),
                name: s.name || `Semester ${s.sequence || ''}`,
                academic_year_id: String(s.academic_year_id || ''),
                is_active: Boolean(s.is_active),
              }))
            );
          }
          const emps = optData.employees || optData.guru;
          if (Array.isArray(emps)) {
            setAvailableTeachers(
              emps.map((e: any) => ({
                id: String(e.id),
                name: e.nama_tampil || e.nama_lengkap || e.name || 'Guru',
                unit_id: String(e.unit_id || ''),
              }))
            );
          }
        }
      }

      // Load dynamic business options from database backend SSOT
      void Promise.allSettled([
        mobileApiService.getBusinessOptions('parent_occupation'),
        mobileApiService.getBusinessOptions('last_education'),
        mobileApiService.getBusinessOptions('student_status'),
        mobileApiService.getBusinessOptions('employee_status'),
        mobileApiService.getBusinessOptions('education_level'),
        mobileApiService.getBusinessOptions('marital_status'),
      ]).then(([jobRes, eduRes, stuStatusRes, empStatusRes, unitLevelRes, maritalRes]) => {
        if (!isMounted) return;
        if (jobRes.status === 'fulfilled') {
          const list = unwrapCollection(jobRes.value);
          if (Array.isArray(list) && list.length > 0) {
            setPekerjaanOptions(list.map((item: any) => ({
              id: String(item.name || item.value || item.nama || item.label || item),
              name: String(item.name || item.label || item.value || item),
            })));
          }
        }
        if (eduRes.status === 'fulfilled') {
          const list = unwrapCollection(eduRes.value);
          if (Array.isArray(list) && list.length > 0) {
            setPendidikanOptions(list.map((item: any) => ({
              id: String(item.name || item.value || item.nama || item.label || item),
              name: String(item.name || item.label || item.value || item),
            })));
          }
        }
        if (stuStatusRes.status === 'fulfilled') {
          const list = unwrapCollection(stuStatusRes.value);
          if (Array.isArray(list) && list.length > 0) {
            setStudentStatusOptions(list.map((item: any) => {
              const val = String(item.value || item.id || item.code || item.name || item);
              const label = String(item.name || item.label || item.nama || item.value || item);
              const existing = STUDENT_STATUS_OPTIONS.find((s) => s.id === val.toLowerCase());
              return {
                id: val.toLowerCase(),
                name: label,
                subtitle: existing?.subtitle || `Status santri: ${label}`,
              };
            }));
          }
        }
        if (empStatusRes.status === 'fulfilled') {
          const list = unwrapCollection(empStatusRes.value);
          if (Array.isArray(list) && list.length > 0) {
            setEmployeeStatusOptions(list.map((item: any) => {
              const val = String(item.value || item.id || item.name || item);
              const label = String(item.name || item.label || item.value || item);
              const existing = EMPLOYEE_STATUS_OPTIONS.find((e) => e.id.toLowerCase() === val.toLowerCase());
              return {
                id: val,
                name: label,
                subtitle: existing?.subtitle || `Status pegawai: ${label}`,
              };
            }));
          }
        }
        if (unitLevelRes.status === 'fulfilled') {
          const list = unwrapCollection(unitLevelRes.value);
          if (Array.isArray(list) && list.length > 0) {
            setUnitLevelOptions(list.map((item: any) => ({
              id: String(item.value || item.id || item.code || item.name || item),
              name: String(item.name || item.label || item.value || item),
            })));
          }
        }
      });
    };

    void loadFilterOptions();
    return () => {
      isMounted = false;
    };
  }, [foundation, scope?.unit_id]);

  const loadIncomingMutations = useCallback(async () => {
    try {
      setLoadingIncoming(true);
      const res = await mobileApiService.getIncomingMutations();
      const coll = unwrapCollection(res);
      setIncomingMutations(Array.isArray(coll) ? coll : []);
    } catch {
      // quiet
    } finally {
      setLoadingIncoming(false);
    }
  }, []);

  useEffect(() => {
    if (resource === 'students') {
      void loadIncomingMutations();
    }
  }, [resource, loadIncomingMutations]);

  const openAjukanMutasi = (student: any) => {
    setMutasiStudent(student);
    setMutasiForm({
      unit_tujuan_id: '',
      alasan: '',
      catatan: '',
    });
    setMutasiModalVisible(true);
  };

  const submitMutasi = async () => {
    if (!mutasiForm.unit_tujuan_id) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Pilih Unit Tujuan',
        message: 'Silakan pilih unit pendidikan tujuan mutasi terlebih dahulu.',
      });
      return;
    }
    try {
      setSubmittingMutasi(true);
      await mobileApiService.requestStudentMutation({
        student_id: mutasiStudent?.id,
        target_unit_id: mutasiForm.unit_tujuan_id,
        unit_tujuan_id: mutasiForm.unit_tujuan_id,
        jenis_mutasi: 'pindah_unit_internal',
        alasan: mutasiForm.alasan,
        catatan: mutasiForm.catatan,
      });
      setMutasiModalVisible(false);
      setMutasiStudent(null);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Pengajuan Mutasi Terkirim! 🚀',
        message: `Pengajuan pindah unit siswa berhasil dikirimkan ke antrean TU unit tujuan untuk diverifikasi.`,
      });
      await load();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Mengajukan Mutasi',
        message: getApiErrorMessage(err, 'Terjadi kesalahan saat mengajukan mutasi siswa.'),
      });
    } finally {
      setSubmittingMutasi(false);
    }
  };

  const approveIncomingMutation = async () => {
    if (!approvalKelasId) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Pilih Kelas Tujuan',
        message: 'TU wajib memilih kelas penempatan siswa di unit tujuan.',
      });
      return;
    }
    const targetClass = availableClasses.find((c) => c.id === approvalKelasId);
    if (targetClass && targetClass.is_full) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Kuota Kelas Penuh',
        message: `Kuota kelas '${targetClass.name}' sudah penuh (${targetClass.jumlah_siswa}/${targetClass.kapasitas} siswa). Silakan pilih rombel lain yang masih tersedia.`,
      });
      return;
    }
    try {
      setProcessingApproval(true);
      await mobileApiService.approveStudentMutation(selectedIncoming.id, {
        kelas_id: approvalKelasId,
        kelas_tujuan_id: approvalKelasId,
        catatan: approvalCatatan,
      });
      setSelectedIncoming(null);
      setApprovalKelasId('');
      setApprovalCatatan('');
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Siswa Diterima & Disetujui! 🎉',
        message: 'Siswa berhasil diterima, ditetapkan ke kelas tujuan, dan diaktifkan di unit ini.',
      });
      await loadIncomingMutations();
      await load();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyetujui',
        message: getApiErrorMessage(err, 'Gagal menyetujui mutasi siswa.'),
      });
    } finally {
      setProcessingApproval(false);
    }
  };

  const rejectIncomingMutation = async () => {
    if (!rejectReason.trim()) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Isi Alasan Penolakan',
        message: 'Silakan isi alasan penolakan mutasi siswa.',
      });
      return;
    }
    try {
      setProcessingApproval(true);
      await mobileApiService.rejectStudentMutation(selectedIncoming.id, {
        catatan_penolakan: rejectReason,
        alasan_penolakan: rejectReason,
      });
      setRejectModalVisible(false);
      setSelectedIncoming(null);
      setRejectReason('');
      setFeedbackModal({
        visible: true,
        type: 'info',
        title: 'Permohonan Ditolak',
        message: 'Permohonan mutasi ditolak dan status siswa dikembalikan ke unit asal.',
      });
      await loadIncomingMutations();
      await load();
    } catch (err) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menolak',
        message: getApiErrorMessage(err, 'Gagal menolak mutasi siswa.'),
      });
    } finally {
      setProcessingApproval(false);
    }
  };

  // Reset states on tab switch
  useEffect(() => {
    setIsSelectMode(false);
    setSelectedIds(new Set());
    setFilterKelas('all');
    setFilterJabatan('all');
    setFilterTingkat('all');
    setFilterDropdownOpen(false);
    setDropdownSearch('');
    setDisplayLimit(25);
  }, [resource]);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      // Muat seluruh siswa, pegawai, dan kelas di unit pendidikan role Tata Usaha (hingga kapasitas 1000 data)
      const perPage = resource === 'students' ? 1000 : (resource === 'classes' ? 200 : 500);
      const activeUnitId = (!foundation && !superAdmin) ? (currentUserUnitId || scope?.unit_id || undefined) : undefined;
      const params: any = { search: query, per_page: perPage };
      if (activeUnitId) {
        params.unit_id = activeUnitId;
        params.unit_pendidikan_id = activeUnitId;
      }
      if ((isTu || isPrincipal) && resource === 'employees') {
        params.exclude_restricted_roles = 1;
      }
      let response: any;

      if (resource === 'employees') {
        const [empRes, statsRes] = await Promise.allSettled([
          foundation
            ? mobileApiService.getFoundationEmployees(params)
            : mobileApiService.getEmployees(params),
          mobileApiService.getEmployeeDashboard({ exclude_restricted_roles: 1 }),
        ]);

        if (statsRes.status === 'fulfilled' && statsRes.value) {
          const statsData = unwrapApiData(statsRes.value);
          setEmployeeDashboardStats(statsData);
        }

        response = empRes.status === 'fulfilled' ? empRes.value : null;
      } else if (resource === 'students') {
        response = teacher && !canReadMaster
          ? await mobileApiService.getTeacherStudents(params)
          : foundation
            ? await mobileApiService.getFoundationStudents(params)
            : await mobileApiService.getStudents(params);
      } else if (resource === 'units') {
        response = foundation
          ? await mobileApiService.getFoundationUnits(params)
          : await mobileApiService.getEducationUnits(params);
      } else if (resource === 'positions') {
        response = await mobileApiService.getJabatanList(params);
      } else {
        response = foundation
          ? await mobileApiService.getFoundationClasses(params)
          : await mobileApiService.getClasses(params);
      }

      let rawList = unwrapCollection(response);
      // STRICT UNIT LOCKDOWN: Pastikan hanya data unit pendidikan milik TU yang masuk ke state
      if (isTu && currentUserUnitId) {
        rawList = rawList.filter((it: any) => {
          const itemUnit = String(
            it.unit_pendidikan_id ||
            it.unit_id ||
            it.education_unit_id ||
            it.education_unit?.id ||
            it.unit?.id ||
            it.unit?.unit_id ||
            it.kelas?.unit_pendidikan_id ||
            it.kelas?.unit_id ||
            ''
          );
          return itemUnit === currentUserUnitId;
        });
      }

      // EXCLUDE GOVERNANCE & SYSTEM ROLES FOR TU & KEPALA SEKOLAH (Pengurus Yayasan, Superadmin, Admin, Operator)
      if ((isTu || isPrincipal) && resource === 'employees') {
        rawList = rawList.filter((it: any) => !isExcludedEmployee(it));
      }

      setItems(rawList);
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Data belum berhasil dimuat. Periksa koneksi jaringan Anda.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [canReadMaster, currentUserUnitId, foundation, isTu, query, resource, scope?.unit_id, superAdmin, teacher]);

  useEffect(() => {
    void load();
  }, [load]);

  // ── Filtered Items per Active Tab & Filter ──
  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      // STRICT UNIT LOCKDOWN: Jangan pernah tampilkan data dari unit lain untuk role TU & Kepala Sekolah
      if ((isTu || isPrincipal) && currentUserUnitId) {
        const itemUnit = String(
          item.unit_pendidikan_id ||
          item.unit_id ||
          item.education_unit_id ||
          item.education_unit?.id ||
          item.unit?.id ||
          item.kelas?.unit_pendidikan_id ||
          item.kelas?.unit_id ||
          ''
        );
        if (itemUnit !== currentUserUnitId) {
          return false;
        }
      }
      // EXCLUDE GOVERNANCE & SYSTEM ROLES FOR TU & KEPALA SEKOLAH (Pengurus Yayasan, Superadmin, Admin, Operator)
      if ((isTu || isPrincipal) && resource === 'employees' && isExcludedEmployee(item)) {
        return false;
      }
      if (resource === 'students') {
        if (filterKelas !== 'all') {
          const itemKelasId = String(item.kelas_id || item.kelas?.id || '');
          const itemKelasName = nestedName(item.kelas).toLowerCase();
          const target = filterKelas.toLowerCase();
          if (itemKelasId !== filterKelas && !itemKelasName.includes(target)) {
            return false;
          }
        }
        if (filterStatus !== 'all') {
          const st = String(item.status || item.status_siswa || (item.aktif === false ? 'berhenti' : 'aktif')).toLowerCase();
          const isAlumni = st.includes('lulus') || st.includes('alumni') || item.is_alumni === true;
          const isMutasi = st.includes('mutasi');
          const isNonaktif = st.includes('berhenti') || st.includes('nonaktif') || item.aktif === false;
          const isAktif = !isAlumni && !isMutasi && !isNonaktif;

          if (filterStatus === 'aktif' && !isAktif) return false;
          if (filterStatus === 'mutasi' && !isMutasi) return false;
          if ((filterStatus === 'lulus' || filterStatus === 'alumni') && !isAlumni) return false;
          if (filterStatus === 'berhenti' && !isNonaktif) return false;
        }
        if (filterGender !== 'all') {
          const g = normalizedGender(item.gender || item.jenis_kelamin || item.jk, resource);
          if (g !== filterGender) return false;
        }
      } else if (resource === 'employees') {
        if (filterJabatan !== 'all') {
          const itemJabId = String(item.jabatan_id || item.position?.id || '');
          const itemJabName = nestedName(item.position || item.jabatan).toLowerCase();
          const target = filterJabatan.toLowerCase();
          if (itemJabId !== filterJabatan && !itemJabName.includes(target)) {
            return false;
          }
        }
        if (filterStatus !== 'all') {
          const isGuru = checkIsEmployeeGuru(item);

          if (filterStatus === 'guru' && !isGuru) return false;
          if (filterStatus === 'tendik' && isGuru) return false;
          if (filterStatus === 'aktif') {
            const isAct = item.status === 'Aktif' || item.is_active === true || (item.is_active !== false && String(item.status || '').toLowerCase() !== 'nonaktif');
            if (!isAct) return false;
          }
          const st = String(item.status || item.status_pegawai || item.employment_status || '').toLowerCase();
          if (filterStatus === 'Tetap' && !st.includes('tetap')) return false;
          if (filterStatus === 'Kontrak' && !st.includes('kontrak')) return false;
          if (filterStatus === 'Honorer' && !st.includes('honorer') && !st.includes('gtt') && !st.includes('ptt')) return false;
        }
        if (filterGender !== 'all') {
          const g = normalizedGender(item.gender || item.jenis_kelamin || item.jk, resource);
          if (g !== filterGender) return false;
        }
      } else if (resource === 'classes') {
        if (filterTingkat !== 'all') {
          const itemTingkat = String(item.tingkat || '').toLowerCase();
          const itemJenjang = String(item.jenjang || '').toLowerCase();
          const target = filterTingkat.toLowerCase();
          if (itemTingkat !== target && !itemJenjang.includes(target)) {
            return false;
          }
        }
        if (filterStatus !== 'all') {
          const isActive = item.is_active !== false && item.status !== 'nonaktif';
          if (filterStatus === 'aktif' && !isActive) return false;
          if (filterStatus === 'nonaktif' && isActive) return false;
        }
      } else if (resource === 'positions') {
        if (filterStatus !== 'all') {
          const isAct = item.status === 'Aktif' || item.is_active === true || item.status === 'active' || item.status === undefined;
          if (filterStatus === 'aktif' && !isAct) return false;
          if (filterStatus === 'nonaktif' && isAct) return false;
          const sc = String(item.scope_akses || item.scope || '').toLowerCase();
          if (filterStatus === 'unit' && !sc.includes('unit')) return false;
          if (filterStatus === 'global' && sc.includes('unit')) return false;
        }
      }
      return true;
    });
  }, [items, resource, filterKelas, filterJabatan, filterTingkat, filterStatus, filterGender]);

  // ── Master KPI Stats (Harmonized with Rekap Siswa / AbsensiScreen style) ──
  const resourceStats = useMemo(() => {
    const total = items.length;
    if (resource === 'students') {
      let aktif = 0;
      let alumni = 0;
      let mutasi = 0;
      let nonaktif = 0;
      items.forEach((item) => {
        const st = String(item.status || item.status_siswa || (item.aktif === false ? 'berhenti' : 'aktif')).toLowerCase();
        if (st.includes('lulus') || st.includes('alumni') || item.is_alumni === true) {
          alumni++;
        } else if (st.includes('mutasi')) {
          mutasi++;
        } else if (st.includes('berhenti') || st.includes('nonaktif') || item.aktif === false) {
          nonaktif++;
        } else {
          aktif++;
        }
      });
      return {
        total,
        heroLabel: 'TOTAL KESELURUHAN SISWA',
        heroSub: '100% Terdaftar',
        kpi1: { label: 'Siswa Aktif', value: aktif, sub: 'KBM Berjalan', icon: 'account-check', color: '#047857', bg: ['#ECFDF5', '#D1FAE5'], border: '#A7F3D0' },
        kpi2: { label: 'Alumni Tamat', value: alumni, sub: 'Lulusan Terdata', icon: 'school', color: '#D97706', bg: ['#FFFBEB', '#FEF3C7'], border: '#FDE68A' },
        kpi3: { label: 'Pindah/Mutasi', value: mutasi, sub: 'Mutasi Keluar/Unit', icon: 'account-arrow-right', color: '#7C3AED', bg: ['#FAF5FF', '#F3E8FF'], border: '#E9D5FF' },
        card1: { label: 'Siswa Aktif', value: aktif, icon: 'account-check', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', iconBg: '#D1FAE5', tag: 'Aktif', tagColor: '#047857' },
        card2: { label: 'Siswa Alumni', value: alumni, icon: 'school', bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', iconBg: '#FEF3C7', tag: 'Tamat', tagColor: '#B45309' },
        card3: { label: 'Pindah / Mutasi', value: mutasi, icon: 'account-arrow-right', bg: '#FAF5FF', color: '#7C3AED', border: '#E9D5FF', iconBg: '#F3E8FF', tag: 'Mutasi', tagColor: '#6B21A8' },
        card4: { label: 'Non-Aktif', value: nonaktif, icon: 'account-cancel', bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3', iconBg: '#FFE4E6', tag: 'Pasif', tagColor: '#BE123C' },
      };
    } else if (resource === 'employees') {
      let guruCount = 0;
      let tendikCount = 0;
      let aktifCount = 0;
      items.forEach((item) => {
        const isGuru = checkIsEmployeeGuru(item);
        if (isGuru) {
          guruCount++;
        } else {
          tendikCount++;
        }

        const isAct = item.status === 'Aktif' || item.is_active === true || (item.is_active !== false && String(item.status || '').toLowerCase() !== 'nonaktif');
        if (isAct) {
          aktifCount++;
        }
      });
      const totalPegawai = employeeDashboardStats?.total_pegawai ?? employeeDashboardStats?.total_employees ?? total ?? items.length;
      const guru = employeeDashboardStats?.total_guru ?? employeeDashboardStats?.total_teachers ?? guruCount;
      const tendik = employeeDashboardStats?.total_tendik ?? employeeDashboardStats?.total_staff ?? Math.max(0, totalPegawai - guru);
      const aktif = employeeDashboardStats?.total_aktif ?? employeeDashboardStats?.total_active ?? aktifCount;

      return {
        total: totalPegawai,
        heroLabel: 'TOTAL PEGAWAI & GURU',
        heroSub: '100% Terdaftar di Unit',
        kpi1: { label: 'Total Pegawai', value: totalPegawai, sub: 'Seluruh Civitas SDM', icon: 'account-group', color: '#047857', bg: ['#ECFDF5', '#D1FAE5'], border: '#A7F3D0' },
        kpi2: { label: 'Guru Pengajar', value: guru, sub: 'Tenaga Pendidik', icon: 'account-tie', color: '#1D4ED8', bg: ['#EFF6FF', '#DBEAFE'], border: '#BFDBFE' },
        kpi3: { label: 'Tenaga Kependidikan', value: tendik, sub: 'Tendik & TU', icon: 'account-check', color: '#7C3AED', bg: ['#FAF5FF', '#F3E8FF'], border: '#E9D5FF' },
        card1: { label: 'Total Pegawai', value: totalPegawai, icon: 'account-group', bg: '#ECFDF5', color: '#047857', border: '#A7F3D0', iconBg: '#D1FAE5', tag: 'Total SDM', tagColor: '#047857' },
        card2: { label: 'Guru Pengajar', value: guru, icon: 'account-tie', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', iconBg: '#DBEAFE', tag: 'Pendidik', tagColor: '#1D4ED8' },
        card3: { label: 'Tenaga Kependidikan', value: tendik, icon: 'account-check', bg: '#FAF5FF', color: '#7C3AED', border: '#E9D5FF', iconBg: '#F3E8FF', tag: 'Tendik', tagColor: '#6B21A8' },
        card4: { label: 'Pegawai Aktif', value: aktif, icon: 'checkbox-marked-circle-outline', bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', iconBg: '#FEF3C7', tag: 'Aktif', tagColor: '#B45309' },
      };
    } else if (resource === 'classes') {
      let aktif = 0;
      let waliTerisi = 0;
      let totalKapasitas = 0;
      items.forEach((item) => {
        const isActive = item.status === 'Aktif' || (item.is_active !== false && item.aktif !== false && item.status !== 'nonaktif');
        if (isActive) aktif++;
        if (item.wali_kelas_id || item.wali_kelas || item.waliKelas) waliTerisi++;
        totalKapasitas += Number(item.kapasitas) || 0;
      });
      const tanpaWali = Math.max(0, total - waliTerisi);
      return {
        total,
        heroLabel: 'TOTAL KELAS & ROMBEL',
        heroSub: 'Aktif Berjalan',
        kpi1: { label: 'Rombel Aktif', value: aktif, sub: 'KBM Berjalan', icon: 'google-classroom', color: '#1D4ED8', bg: ['#EFF6FF', '#DBEAFE'], border: '#BFDBFE' },
        kpi2: { label: 'Wali Ditugaskan', value: waliTerisi, sub: 'Pembina Kelas', icon: 'account-tie', color: '#047857', bg: ['#ECFDF5', '#D1FAE5'], border: '#A7F3D0' },
        kpi3: { label: 'Daya Tampung', value: totalKapasitas, sub: 'Kapasitas Kursi', icon: 'seat-passenger', color: '#7C3AED', bg: ['#FAF5FF', '#F3E8FF'], border: '#E9D5FF' },
        card1: { label: 'Rombel Aktif', value: aktif, icon: 'google-classroom', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', iconBg: '#DBEAFE', tag: 'Aktif', tagColor: '#1D4ED8' },
        card2: { label: 'Wali Ditugaskan', value: waliTerisi, icon: 'account-tie', bg: '#F0FDF4', color: '#059669', border: '#BBF7D0', iconBg: '#DCFCE7', tag: 'Terisi', tagColor: '#047857' },
        card3: { label: 'Belum Ada Wali', value: tanpaWali, icon: 'account-alert', bg: tanpaWali > 0 ? '#FFF1F2' : '#F8FAFC', color: tanpaWali > 0 ? '#E11D48' : '#64748B', border: tanpaWali > 0 ? '#FECDD3' : '#E2E8F0', iconBg: tanpaWali > 0 ? '#FFE4E6' : '#F1F5F9', tag: tanpaWali > 0 ? 'Perlu Atensi' : 'Lengkap', tagColor: tanpaWali > 0 ? '#BE123C' : '#475569' },
        card4: { label: 'Daya Tampung', value: totalKapasitas, icon: 'seat-passenger', bg: '#FAF5FF', color: '#7C3AED', border: '#E9D5FF', iconBg: '#F3E8FF', tag: 'Kursi', tagColor: '#6B21A8' },
      };
    } else if (resource === 'positions') {
      let aktif = 0;
      let nonaktif = 0;
      let unitScope = 0;
      let globalScope = 0;
      items.forEach((item) => {
        const isAct = item.status === 'Aktif' || item.is_active === true || item.status === 'active' || item.status === undefined;
        if (isAct) aktif++;
        else nonaktif++;
        const sc = String(item.scope_akses || item.scope || '').toLowerCase();
        if (sc.includes('unit')) unitScope++;
        else globalScope++;
      });
      return {
        total,
        heroLabel: 'TOTAL MASTER JABATAN',
        heroSub: 'Struktur Organisasi & PTK',
        kpi1: { label: 'Jabatan Aktif', value: aktif, sub: 'Tersedia PTK', icon: 'badge-account-horizontal-outline', color: '#0891B2', bg: ['#ECFEFF', '#CFFAFE'], border: '#A5F3FC' },
        kpi2: { label: 'Scope Unit', value: unitScope, sub: 'Sekolah Aktif', icon: 'domain', color: '#1D4ED8', bg: ['#EFF6FF', '#DBEAFE'], border: '#BFDBFE' },
        kpi3: { label: 'Scope Global', value: globalScope, sub: 'Lintas Yayasan', icon: 'shield-account', color: '#7C3AED', bg: ['#FAF5FF', '#F3E8FF'], border: '#E9D5FF' },
        card1: { label: 'Jabatan Aktif', value: aktif, icon: 'badge-account-horizontal-outline', bg: '#F0FDF4', color: '#059669', border: '#BBF7D0', iconBg: '#DCFCE7', tag: 'Aktif', tagColor: '#047857' },
        card2: { label: 'Scope Unit', value: unitScope, icon: 'domain', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', iconBg: '#DBEAFE', tag: 'Unit', tagColor: '#1D4ED8' },
        card3: { label: 'Scope Global/Yayasan', value: globalScope, icon: 'shield-account', bg: '#FAF5FF', color: '#7C3AED', border: '#E9D5FF', iconBg: '#F3E8FF', tag: 'Global', tagColor: '#6B21A8' },
        card4: { label: 'Non-Aktif', value: nonaktif, icon: 'briefcase-off-outline', bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3', iconBg: '#FFE4E6', tag: 'Pasif', tagColor: '#BE123C' },
      };
    } else {
      let formal = 0;
      let pesantren = 0;
      let nonformal = 0;
      items.forEach((it) => {
        const lvl = String(it.level || it.jenjang || it.tipe || '').toLowerCase();
        if (lvl.includes('ponpes') || lvl.includes('pesantren') || lvl.includes('mahad')) pesantren++;
        else if (lvl.includes('non') || lvl.includes('kursus') || lvl.includes('pelatihan')) nonformal++;
        else formal++;
      });
      return {
        total,
        heroLabel: 'TOTAL UNIT PENDIDIKAN',
        heroSub: 'Terdaftar',
        kpi1: { label: 'Unit Formal', value: formal, sub: 'Sekolah & Madrasah', icon: 'school', color: '#047857', bg: ['#ECFDF5', '#D1FAE5'], border: '#A7F3D0' },
        kpi2: { label: 'Pesantren', value: pesantren, sub: 'Pondok & Asrama', icon: 'home-city', color: '#D97706', bg: ['#FFFBEB', '#FEF3C7'], border: '#FDE68A' },
        kpi3: { label: 'Non-Formal', value: nonformal, sub: 'Pusat Belajar', icon: 'layers', color: '#7C3AED', bg: ['#FAF5FF', '#F3E8FF'], border: '#E9D5FF' },
        card1: { label: 'Total Unit', value: total, icon: 'domain', bg: '#EFF6FF', color: '#1D4ED8', border: '#BFDBFE', iconBg: '#DBEAFE', tag: 'Unit', tagColor: '#1D4ED8' },
        card2: { label: 'Unit Formal', value: formal, icon: 'school', bg: '#F0FDF4', color: '#059669', border: '#BBF7D0', iconBg: '#DCFCE7', tag: 'Formal', tagColor: '#047857' },
        card3: { label: 'Unit Pesantren', value: pesantren, icon: 'home-city', bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', iconBg: '#FEF3C7', tag: 'Ponpes', tagColor: '#B45309' },
        card4: { label: 'Non-Formal', value: nonformal, icon: 'layers', bg: '#FAF5FF', color: '#7C3AED', border: '#E9D5FF', iconBg: '#F3E8FF', tag: 'Lainnya', tagColor: '#6B21A8' },
      };
    }
  }, [items, resource]);

  // Progressive windowing agar kartu awal di-render secepat kilat (0 delay)
  const visibleItems = useMemo(() => {
    return filteredItems.slice(0, displayLimit);
  }, [filteredItems, displayLimit]);

  // Derived filter options
  const classFilterOptions = useMemo(() => {
    const list = [...availableClasses];
    items.forEach((it) => {
      const clsName = nestedName(it.kelas);
      if (clsName && !list.some((c) => c.name.toLowerCase() === clsName.toLowerCase())) {
        list.push({ id: clsName, name: clsName });
      }
    });
    return list;
  }, [availableClasses, items]);

  const positionFilterOptions = useMemo(() => {
    let list = [...availablePositions];
    if (isTu) {
      list = list.filter((p) => {
        const name = (p.name || '').toLowerCase();
        return (
          !['yayasan', 'pembina', 'pengawas', 'bidang pendidikan', 'divisi pendidikan', 'superadmin', 'super admin', 'administrator', 'operator'].some((kw) => name.includes(kw)) &&
          !(/\badmin\b/i.test(name) && !name.includes('administrasi'))
        );
      });
    }
    items.forEach((it) => {
      const posName = nestedName(it.position || it.jabatan);
      if (posName && !list.some((p) => p.name.toLowerCase() === posName.toLowerCase())) {
        if (
          !isTu ||
          (!['yayasan', 'pembina', 'pengawas', 'bidang pendidikan', 'divisi pendidikan', 'superadmin', 'super admin', 'administrator', 'operator'].some((kw) => posName.toLowerCase().includes(kw)) &&
          !(/\badmin\b/i.test(posName) && !posName.toLowerCase().includes('administrasi')))
        ) {
          list.push({ id: posName, name: posName });
        }
      }
    });
    return list;
  }, [availablePositions, isTu, items]);

  const tingkatFilterOptions = useMemo(() => {
    const set = new Set<string>();
    items.forEach((it) => {
      if (it.tingkat) set.add(String(it.tingkat));
    });
    return Array.from(set).sort((a, b) => {
      const numA = parseInt(a, 10);
      const numB = parseInt(b, 10);
      if (!isNaN(numA) && !isNaN(numB)) return numA - numB;
      return a.localeCompare(b);
    });
  }, [items]);

  // Active filter label for dropdown trigger
  const activeDropdownLabel = useMemo(() => {
    if (resource === 'students') {
      return filterKelas === 'all' ? 'Semua Kelas & Rombel' : `Kelas: ${filterKelas}`;
    }
    if (resource === 'employees') {
      return filterJabatan === 'all' ? 'Semua Jabatan Pegawai' : `Jabatan: ${filterJabatan}`;
    }
    if (resource === 'classes') {
      return filterTingkat === 'all' ? 'Semua Tingkat Kelas' : `Tingkat: ${filterTingkat}`;
    }
    if (resource === 'positions') {
      return 'Semua Master Jabatan';
    }
    return 'Semua Data';
  }, [resource, filterKelas, filterJabatan, filterTingkat]);

  // ── Multi-Select Actions ──
  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((it) => String(it.id))));
    }
  };

  const handleBulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!canDelete) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Akses Ditolak',
        message: 'Akun Anda tidak memiliki hak akses untuk menghapus data ini.',
      });
      return;
    }

    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: `Hapus ${selectedIds.size} Data ${resourceLabels[resource]}?`,
      message: `Semua ${selectedIds.size} data yang dipilih akan dihapus secara permanen dari database sekolah. Tindakan ini tidak dapat dikembalikan.`,
      actionLabel: `Ya, Hapus (${selectedIds.size}) Data`,
      cancelLabel: 'Batal',
      onConfirm: async () => {
        setLoading(true);
        const ids = Array.from(selectedIds);
        let successCount = 0;
        let failCount = 0;

        for (const id of ids) {
          try {
            if (resource === 'employees') await mobileApiService.deleteEmployee(id);
            else if (resource === 'students') await mobileApiService.deleteStudent(id);
            else if (resource === 'units') await mobileApiService.deleteEducationUnit(id);
            else if (resource === 'positions') await mobileApiService.deleteJabatan(id);
            else if (resource === 'classes') await mobileApiService.deleteClass(id);
            successCount++;
          } catch {
            failCount++;
          }
        }

        setIsSelectMode(false);
        setSelectedIds(new Set());
        await load();

        if (failCount === 0) {
          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Hapus Massal Berhasil! 🗑️',
            message: `${successCount} data ${resourceLabels[resource].toLowerCase()} telah berhasil dihapus.`,
          });
        } else {
          setFeedbackModal({
            visible: true,
            type: successCount > 0 ? 'warning' : 'error',
            title: successCount > 0 ? 'Sebagian Berhasil Dihapus' : 'Gagal Menghapus Data',
            message: `${successCount} data berhasil dihapus. ${failCount} data tidak dapat dihapus karena keterkaitan relasi database (presensi, nilai, atau jadwal aktif).`,
          });
        }
      },
    });
  };

  // ── Single Item Delete ──
  const remove = (item: any) => {
    if (!item?.id) return;
    if (!canDelete) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Akses Ditolak',
        message: 'Akun Anda tidak memiliki hak akses untuk menghapus data ini.',
      });
      return;
    }

    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: `Hapus ${resourceLabels[resource]}?`,
      message: `Data "${displayName(item)}" akan dihapus permanen dari sistem sekolah. Tindakan ini tidak dapat dibatalkan.`,
      actionLabel: 'Ya, Hapus Data',
      cancelLabel: 'Batal',
      onConfirm: async () => {
        try {
          if (resource === 'employees') await mobileApiService.deleteEmployee(String(item.id));
          else if (resource === 'students') await mobileApiService.deleteStudent(String(item.id));
          else if (resource === 'units') await mobileApiService.deleteEducationUnit(String(item.id));
          else if (resource === 'positions') await mobileApiService.deleteJabatan(String(item.id));
          else if (resource === 'classes') await mobileApiService.deleteClass(String(item.id));
          else return;

          setFeedbackModal({
            visible: true,
            type: 'success',
            title: 'Data Dihapus! 🗑️',
            message: `Data "${displayName(item)}" telah berhasil dihapus dari sistem.`,
          });
          if (detailItem?.id === item.id) setDetailItem(null);
          await load();
        } catch (requestError: any) {
          const isForbidden =
            requestError?.response?.status === 403 ||
            requestError?.status === 403 ||
            String(requestError?.message || '').includes('403') ||
            String(requestError?.response?.data?.message || '').toLowerCase().includes('permission') ||
            String(requestError?.response?.data?.message || '').toLowerCase().includes('hak akses');

          setFeedbackModal({
            visible: true,
            type: 'error',
            title: isForbidden ? 'Akses Ditolak' : 'Gagal Menghapus Data',
            message: isForbidden
              ? 'Tindakan ini memerlukan izin khusus pada server.'
              : getApiErrorMessage(requestError, 'Data belum berhasil dihapus dari server.'),
          });
        }
      },
    });
  };

  // ── Native In-App Internal Chat Handlers ──
  const openInternalChatStudent = (studentItem: any) => {
    const sName = displayName(studentItem);
    const clsName = nestedName(studentItem.kelas);
    const uName = nestedName(studentItem.education_unit || studentItem.educationUnit || studentItem.unit);

    const payload: any = {
      studentId: String(studentItem.id),
      student_id: String(studentItem.id),
      studentName: sName,
      student_name: sName,
      nis: studentItem.nis || studentItem.nisn || '',
      className: clsName,
      class_name: clsName,
      unitName: uName,
      unit_name: uName,
    };
    if (studentItem.parent_id || studentItem.parent?.id) {
      payload.parentId = String(studentItem.parent_id || studentItem.parent?.id);
    }
    if (studentItem.parent_name || studentItem.nama_ortu || studentItem.parent?.name) {
      payload.parentName = studentItem.parent_name || studentItem.nama_ortu || studentItem.parent?.name;
    }

    try {
      if (navigation?.navigate) {
        navigation.navigate('Chat Guru', payload);
        return;
      }
    } catch {}
    try {
      if (navigation?.navigate) {
        navigation.navigate('Chat', payload);
        return;
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Fitur Chat Internal',
        message: 'Ruang obrolan internal belum dapat dibuka dari halaman ini.',
      });
    }
  };

  const openInternalChatEmployee = (empItem: any) => {
    const empName = displayName(empItem);
    const empRole = nestedName(empItem.position || empItem.jabatan) || 'Guru / Pegawai';
    const payload: any = {
      teacherId: String(empItem.user_id || empItem.user?.id || empItem.id),
      employeeId: String(empItem.id),
      employeeName: empName,
      name: empName,
      role: empRole,
    };

    try {
      if (navigation?.navigate) {
        navigation.navigate('Chat Guru', payload);
        return;
      }
    } catch {}
    try {
      if (navigation?.navigate) {
        navigation.navigate('Chat', payload);
        return;
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Fitur Chat Internal',
        message: 'Ruang obrolan internal belum dapat dibuka dari halaman ini.',
      });
    }
  };

  // ── Form Modal Handlers ──
  const setField = (key: string, value: string | boolean) => {
    setForm((previous) => ({ ...previous, [key]: value }));
  };

  const openForm = (item?: any) => {
    setEditingId(item?.id ? String(item.id) : null);
    setFormError('');

    if (resource === 'employees') {
      const meta = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      setForm({
        _rawMetadata: meta,
        niy: asText(item?.niy),
        nik: asText(item?.nik),
        nama_lengkap: asText(item?.nama_lengkap || item?.name),
        nama_panggilan: asText(item?.nama_panggilan),
        gelar_depan: asText(item?.gelar_depan),
        gelar_belakang: asText(item?.gelar_belakang),
        jenis_kelamin: normalizedGender(item?.jenis_kelamin || item?.gender, resource) || 'L',
        tempat_lahir: asText(item?.tempat_lahir),
        tanggal_lahir: asText(item?.tanggal_lahir ? String(item.tanggal_lahir).split('T')[0] : ''),
        agama: asText(item?.agama || 'Islam'),
        unit_id: asText((isUnitLocked && currentUserUnitId) ? currentUserUnitId : (item?.unit_id || item?.unit?.id || scope?.unit_id || '')),
        jabatan_id: asText(item?.jabatan_id || item?.position?.id || item?.position_id),
        status_pegawai: asText(item?.status_pegawai || 'Tetap'),
        status: asText(item?.status || (item?.is_active === false ? 'Resign' : 'Aktif')),
        tanggal_masuk: asText(item?.tanggal_masuk ? String(item.tanggal_masuk).split('T')[0] : ''),
        no_hp: asText(item?.no_hp || item?.phone),
        email: asText(item?.email),
        alamat: asText(item?.alamat || item?.address),
      });
    } else if (resource === 'students') {
      setStudentFormStep(0);
      const meta = item?.metadata && typeof item.metadata === 'object' ? item.metadata : {};
      const defaultUnitId = asText((isUnitLocked && currentUserUnitId) ? currentUserUnitId : (item?.unit_id || item?.education_unit?.id || item?.educationUnit?.id || meta?.unit_id || scope?.unit_id || ''));
      const orangTua = meta.orang_tua && typeof meta.orang_tua === 'object' ? meta.orang_tua : {};

      setForm({
        _rawMetadata: meta,
        nis: asText(item?.nis),
        nisn: asText(item?.nisn || meta.nisn),
        nik: asText(meta.nik || item?.nik),
        no_kk: asText(meta.no_kk || item?.no_kk),
        no_registrasi_akta_lahir: asText(meta.no_registrasi_akta_lahir),
        full_name: asText(item?.full_name || item?.nama),
        gender: normalizedGender(item?.gender || item?.jenis_kelamin, resource) || 'male',
        unit_id: defaultUnitId,
        kelas_id: asText(item?.kelas_id || item?.kelas?.id || meta.kelas_id),
        _initialKelasId: asText(item?.kelas_id || item?.kelas?.id || meta.kelas_id),
        birth_place: asText(item?.birth_place),
        birth_date: asText(item?.birth_date ? String(item.birth_date).split('T')[0] : ''),
        agama: asText(meta.agama || item?.agama || 'Islam'),
        email: asText(item?.email || meta.email),
        status_siswa: asText(meta.status_siswa || item?.status || (item?.is_active === false ? 'berhenti' : 'aktif')),
        no_pendaftaran: asText(meta.no_pendaftaran),
        anak_ke: asText(meta.anak_ke),
        jumlah_saudara: asText(meta.jumlah_saudara),
        tahun_ajaran_masuk: asText(meta.tahun_ajaran_masuk || activeAcademicYearName || (availableAcademicYears.length > 0 ? availableAcademicYears[0].name : '')),
        jenis_pendaftaran: asText(meta.jenis_pendaftaran || 'baru'),
        unit_asal_id: asText(meta.unit_asal_id || ''),
        nis_pembayaran: asText(meta.nis_pembayaran),
        sekolah_asal: asText(meta.sekolah_asal),
        status_sekolah_asal: asText(meta.status_sekolah_asal || 'Formal'),
        nama_ayah: asText(meta.nama_ayah || orangTua.nama_ayah || item?.parent_name || item?.nama_ortu),
        hp_ayah: asText(meta.hp_ayah || meta.nomor_wa_ayah || orangTua.no_hp || item?.parent_phone || item?.telepon_ortu),
        pekerjaan_ayah: asText(meta.pekerjaan_ayah || orangTua.pekerjaan_ayah || 'Wiraswasta'),
        pendidikan_terakhir_ayah: asText(meta.pendidikan_terakhir_ayah || orangTua.pendidikan_ayah || 'SMA / SMK / MA'),
        nik_ayah: asText(meta.nik_ayah || orangTua.nik_ayah),
        nama_ibu: asText(meta.nama_ibu || orangTua.nama_ibu),
        hp_ibu: asText(meta.hp_ibu || meta.nomor_wa_ibu),
        pekerjaan_ibu: asText(meta.pekerjaan_ibu || orangTua.pekerjaan_ibu || 'Ibu Rumah Tangga'),
        pendidikan_terakhir_ibu: asText(meta.pendidikan_terakhir_ibu || orangTua.pendidikan_ibu || 'SMA / SMK / MA'),
        nik_ibu: asText(meta.nik_ibu || orangTua.nik_ibu),
        nama_wali: asText(meta.nama_wali || orangTua.nama_wali),
        hp_wali: asText(meta.hp_wali || orangTua.no_hp_wali),
        nik_wali: asText(meta.nik_wali || orangTua.nik_wali),
        pekerjaan_wali: asText(meta.pekerjaan_wali || orangTua.pekerjaan_wali),
        address: asText(item?.address || meta.alamat_siswa || item?.alamat),
        is_active: item?.is_active !== false,
      });
    } else if (resource === 'units') {
      setForm({
        code: asText(item?.code),
        name: asText(item?.name),
        level: asText(item?.level || 'SD'),
        description: asText(item?.description),
        is_active: item?.is_active !== false,
      });
    } else if (resource === 'positions') {
      setForm({
        nama_jabatan: asText(item?.nama_jabatan || item?.name || item?.title),
        kode_jabatan: asText(item?.kode_jabatan || item?.code),
        level_jabatan: asText(item?.level_jabatan || item?.level || '7'),
        satuan_kerja: asText(item?.satuan_kerja || 'Unit Pendidikan'),
        scope_akses: asText(item?.scope_akses || item?.scope || 'unit_sendiri'),
        status: asText(item?.status || (item?.is_active === false ? 'Nonaktif' : 'Aktif')),
        deskripsi: asText(item?.deskripsi || item?.description),
        is_active: item?.status !== 'Nonaktif' && item?.is_active !== false,
      });
    } else {
      const defaultUnitId = asText((isUnitLocked && currentUserUnitId) ? currentUserUnitId : (item?.unit_pendidikan_id || item?.unit_id || item?.unit?.id || scope?.unit_id || (availableUnits.length > 0 ? availableUnits[0].id : '')));
      const activeAy = availableAcademicYears.find((a) => a.is_active) || (availableAcademicYears.length > 0 ? availableAcademicYears[0] : null);
      const defaultAyId = asText(item?.tahun_ajaran_id || item?.academic_year_id || (activeAy ? activeAy.id : ''));
      const defaultSem = availableSemesters.find((s) => s.is_active) || (availableSemesters.length > 0 ? availableSemesters[0] : null);
      const defaultSemId = asText(item?.semester_id || (defaultSem ? defaultSem.id : ''));
      const matchedUnit = availableUnits.find((u) => u.id === defaultUnitId);
      const defaultJenjang = asText(item?.jenjang || item?.level || matchedUnit?.level || '');

      setForm({
        unit_pendidikan_id: defaultUnitId,
        tahun_ajaran_id: defaultAyId,
        semester_id: defaultSemId,
        jenjang: defaultJenjang,
        tingkat: asText(item?.tingkat || '1'),
        nama_kelas: asText(item?.nama_kelas || item?.name),
        kode_kelas: asText(item?.kode_kelas || item?.code),
        kapasitas: item?.kapasitas != null ? asText(item.kapasitas) : '',
        wali_kelas_id: asText(item?.wali_kelas_id || item?.wali_kelas?.id || item?.waliKelas?.id),
        ruangan: asText(item?.ruangan || item?.room),
        status: asText(item?.status || 'Aktif'),
      });
    }

    setModalVisible(true);
  };

  const textField = (key: string): string => asText(form[key]);

  const submitForm = async () => {
    setFormError('');

    const validatePhone = (phone: string, label: string): string | null => {
      const cleaned = phone.replace(/[\s\-]/g, '');
      if (!cleaned) return null;
      if (!/^(\+?62|08)\d{7,13}$/.test(cleaned)) {
        return `${label} tidak valid. Gunakan format nomor telepon/WhatsApp yang benar (diawali 08 atau +62, 9-15 digit).`;
      }
      return null;
    };

    const validateEmail = (email: string, label: string): string | null => {
      const trimmed = email.trim();
      if (!trimmed) return null;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
        return `${label} tidak valid. Masukkan format email yang benar (contoh: user@sekolah.sch.id).`;
      }
      return null;
    };

    const triggerValidationError = (msg: string, title = 'Validasi Data Belum Lengkap') => {
      setFormError(msg);
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title,
        message: msg,
      });
    };

    if (resource === 'employees') {
      if (!textField('nama_lengkap').trim()) {
        triggerValidationError('Nama lengkap pegawai wajib diisi.');
        return;
      }
      const nik = textField('nik').trim();
      if (nik && (nik.length !== 16 || !/^\d{16}$/.test(nik))) {
        triggerValidationError('NIK harus berupa tepat 16 digit angka (atau kosongkan).', 'Format NIK Tidak Sesuai');
        return;
      }
      const phoneErr = validatePhone(textField('no_hp'), 'Nomor HP/WhatsApp pegawai');
      if (phoneErr) {
        triggerValidationError(phoneErr, 'Format Nomor HP');
        return;
      }
      const emailErr = validateEmail(textField('email'), 'Email pegawai');
      if (emailErr) {
        triggerValidationError(emailErr, 'Format Email');
        return;
      }
    }
    if (resource === 'students') {
      if (!textField('nis').trim()) {
        triggerValidationError('Nomor Induk Siswa (NIS) wajib diisi.', 'Validasi NIS');
        return;
      }
      if (!textField('full_name').trim()) {
        triggerValidationError('Nama lengkap siswa wajib diisi.', 'Validasi Siswa');
        return;
      }
      if (!['male', 'female'].includes(textField('gender'))) {
        triggerValidationError('Pilih jenis kelamin siswa (Laki-laki / Perempuan).', 'Validasi Siswa');
        return;
      }
      const nisn = textField('nisn').trim();
      if (nisn && (nisn.length !== 10 || !/^\d{10}$/.test(nisn))) {
        triggerValidationError('NISN harus berupa tepat 10 digit angka (atau kosongkan jika belum memiliki NISN).', 'Format NISN');
        return;
      }
      const emailErr = validateEmail(textField('email'), 'Email siswa');
      if (emailErr) {
        triggerValidationError(emailErr, 'Format Email');
        return;
      }
      const nik = textField('nik').trim();
      if (nik && (nik.length !== 16 || !/^\d{16}$/.test(nik))) {
        triggerValidationError('NIK Siswa harus berupa tepat 16 digit angka (atau kosongkan).', 'Format NIK Siswa');
        return;
      }
      const noKk = textField('no_kk').trim();
      if (noKk && (noKk.length !== 16 || !/^\d{16}$/.test(noKk))) {
        triggerValidationError('Nomor Kartu Keluarga (No KK) harus berupa tepat 16 digit angka (atau kosongkan).', 'Format No KK');
        return;
      }
      const nikAyah = textField('nik_ayah').trim();
      if (nikAyah && (nikAyah.length !== 16 || !/^\d{16}$/.test(nikAyah))) {
        triggerValidationError('NIK Ayah harus berupa tepat 16 digit angka (atau kosongkan).', 'Format NIK Ayah');
        return;
      }
      const hpAyahErr = validatePhone(textField('hp_ayah'), 'Nomor WhatsApp/HP Ayah');
      if (hpAyahErr) {
        triggerValidationError(hpAyahErr, 'Format HP Ayah');
        return;
      }
      const nikIbu = textField('nik_ibu').trim();
      if (nikIbu && (nikIbu.length !== 16 || !/^\d{16}$/.test(nikIbu))) {
        triggerValidationError('NIK Ibu harus berupa tepat 16 digit angka (atau kosongkan).', 'Format NIK Ibu');
        return;
      }
      const hpIbuErr = validatePhone(textField('hp_ibu'), 'Nomor WhatsApp/HP Ibu');
      if (hpIbuErr) {
        triggerValidationError(hpIbuErr, 'Format HP Ibu');
        return;
      }
      const nikWali = textField('nik_wali').trim();
      if (nikWali && (nikWali.length !== 16 || !/^\d{16}$/.test(nikWali))) {
        triggerValidationError('NIK Wali harus berupa tepat 16 digit angka (atau kosongkan).', 'Format NIK Wali');
        return;
      }
      const hpWaliErr = validatePhone(textField('hp_wali'), 'Nomor WhatsApp/HP Wali');
      if (hpWaliErr) {
        triggerValidationError(hpWaliErr, 'Format HP Wali');
        return;
      }
    }
    if (resource === 'units' && !textField('name').trim()) {
      triggerValidationError('Nama unit pendidikan wajib diisi.', 'Validasi Unit');
      return;
    }
    if (resource === 'positions') {
      if (!textField('nama_jabatan').trim()) {
        triggerValidationError('Nama jabatan wajib diisi.', 'Validasi Jabatan');
        return;
      }
      if (!textField('kode_jabatan').trim()) {
        triggerValidationError('Kode jabatan wajib diisi (contoh: GUR-MAT, KEP-SEK).', 'Validasi Jabatan');
        return;
      }
    }
    if (resource === 'classes') {
      if (!textField('nama_kelas').trim()) {
        triggerValidationError('Nama rombel / kelas wajib diisi.', 'Validasi Kelas');
        return;
      }
      if (!textField('kode_kelas').trim()) {
        triggerValidationError('Kode kelas wajib diisi (contoh: 1-ABU).', 'Validasi Kelas');
        return;
      }
      if (!textField('tingkat').trim()) {
        triggerValidationError('Tingkat kelas wajib dipilih.', 'Validasi Kelas');
        return;
      }
      if (!textField('jenjang').trim()) {
        triggerValidationError('Jenjang pendidikan wajib dipilih.', 'Validasi Kelas');
        return;
      }
      if (!textField('unit_pendidikan_id')) {
        triggerValidationError('Unit pendidikan wajib dipilih.', 'Validasi Kelas');
        return;
      }
      if (!textField('tahun_ajaran_id')) {
        triggerValidationError('Tahun ajaran wajib dipilih.', 'Validasi Kelas');
        return;
      }
      if (!textField('semester_id')) {
        triggerValidationError('Semester aktif wajib dipilih.', 'Validasi Kelas');
        return;
      }
      const kap = parseInt(textField('kapasitas'), 10);
      if (isNaN(kap) || kap < 1) {
        triggerValidationError('Kapasitas kelas minimal 1 siswa.', 'Validasi Kelas');
        return;
      }
    }

    setSaving(true);
    try {
      if (resource === 'employees') {
        const existingMeta = (typeof form._rawMetadata === 'object' && form._rawMetadata !== null) ? form._rawMetadata : {};
        const nik = textField('nik').trim();
        const payload = {
          niy: textField('niy').trim() || undefined,
          nik: nik || undefined,
          nama_lengkap: textField('nama_lengkap').trim(),
          nama_panggilan: textField('nama_panggilan').trim() || undefined,
          gelar_depan: textField('gelar_depan').trim() || undefined,
          gelar_belakang: textField('gelar_belakang').trim() || undefined,
          jenis_kelamin: textField('jenis_kelamin') === 'P' ? 'P' : 'L',
          tempat_lahir: textField('tempat_lahir').trim() || undefined,
          tanggal_lahir: textField('tanggal_lahir').trim() || undefined,
          agama: textField('agama').trim() || undefined,
          unit_id: textField('unit_id') || scope?.unit_id || undefined,
          jabatan_id: textField('jabatan_id') || undefined,
          status_pegawai: textField('status_pegawai') || undefined,
          status: textField('status') || 'Aktif',
          tanggal_masuk: textField('tanggal_masuk').trim() || undefined,
          no_hp: textField('no_hp').trim() || undefined,
          email: textField('email').trim() || undefined,
          alamat: textField('alamat').trim() || undefined,
          metadata: existingMeta,
        };
        if (editingId) await mobileApiService.updateEmployee(editingId, payload);
        else await mobileApiService.createEmployee(payload);
      } else if (resource === 'students') {
        const existingMeta = (typeof form._rawMetadata === 'object' && form._rawMetadata !== null) ? { ...form._rawMetadata } : {};
        const namaAyah = textField('nama_ayah').trim();
        const namaIbu = textField('nama_ibu').trim();
        const hpAyah = textField('hp_ayah').trim();
        const hpIbu = textField('hp_ibu').trim();
        const fallbackParentName = namaAyah || namaIbu || undefined;
        const fallbackParentPhone = hpAyah || hpIbu || undefined;

        const cleanVal = (val: string): string | null => {
          const t = val.trim();
          return (t === '' || t === '-' || t === 'undefined' || t === 'null') ? null : t;
        };

        const cleanInt = (val: string, min = 0): number | null => {
          const t = val.trim();
          if (!t || isNaN(Number(t))) return null;
          return Math.max(min, parseInt(t, 10));
        };

        const unitIdVal = cleanVal(textField('unit_id')) || scope?.unit_id || null;
        const kelasIdVal = cleanVal(textField('kelas_id'));

        // VALIDASI KUOTA ROMBEL (Cegah Over-Capacity)
        if (kelasIdVal) {
          const targetCls = availableClasses.find((c) => c.id === kelasIdVal);
          const isCurrentClass = Boolean(editingId && form._initialKelasId === kelasIdVal);
          if (targetCls && targetCls.is_full && !isCurrentClass) {
            setFormError(`Kuota kelas '${targetCls.name}' sudah penuh (${targetCls.jumlah_siswa}/${targetCls.kapasitas} siswa). Silakan pilih rombel lain yang masih tersedia.`);
            setSaving(false);
            return;
          }
        }

        const jenisPendaftaran = cleanVal(textField('jenis_pendaftaran')) || 'baru';

        const payload: any = {
          nis: textField('nis').trim(),
          nisn: cleanVal(textField('nisn')),
          full_name: textField('full_name').trim(),
          gender: textField('gender') === 'female' ? 'female' : 'male',
          unit_id: unitIdVal,
          kelas_id: kelasIdVal,
          birth_place: cleanVal(textField('birth_place')),
          birth_date: cleanVal(textField('birth_date')),
          address: cleanVal(textField('address')),
          parent_name: fallbackParentName || null,
          parent_phone: fallbackParentPhone || null,
          is_active: textField('status_siswa') === 'aktif' || form.is_active !== false,
          metadata: {
            ...existingMeta,
            nik: cleanVal(textField('nik')),
            no_kk: cleanVal(textField('no_kk')),
            no_registrasi_akta_lahir: cleanVal(textField('no_registrasi_akta_lahir')),
            email: cleanVal(textField('email')),
            agama: cleanVal(textField('agama')) || 'Islam',
            status_siswa: cleanVal(textField('status_siswa')) || 'aktif',
            no_pendaftaran: cleanVal(textField('no_pendaftaran')),
            anak_ke: cleanInt(textField('anak_ke'), 1),
            jumlah_saudara: cleanInt(textField('jumlah_saudara'), 0),
            tahun_ajaran_masuk: cleanVal(textField('tahun_ajaran_masuk')) || activeAcademicYearName || null,
            jenis_pendaftaran: jenisPendaftaran,
            unit_asal_id: jenisPendaftaran === 'pindahan_internal' ? cleanVal(textField('unit_asal_id')) : null,
            nis_pembayaran: cleanVal(textField('nis_pembayaran')),
            sekolah_asal: cleanVal(textField('sekolah_asal')),
            status_sekolah_asal: cleanVal(textField('status_sekolah_asal')) || 'Formal',
            nama_ayah: cleanVal(namaAyah),
            hp_ayah: cleanVal(hpAyah),
            nomor_wa_ayah: cleanVal(hpAyah),
            pekerjaan_ayah: cleanVal(textField('pekerjaan_ayah')),
            pendidikan_terakhir_ayah: cleanVal(textField('pendidikan_terakhir_ayah')),
            nik_ayah: cleanVal(textField('nik_ayah')),
            nama_ibu: cleanVal(namaIbu),
            hp_ibu: cleanVal(hpIbu),
            nomor_wa_ibu: cleanVal(hpIbu),
            pekerjaan_ibu: cleanVal(textField('pekerjaan_ibu')),
            pendidikan_terakhir_ibu: cleanVal(textField('pendidikan_terakhir_ibu')),
            nik_ibu: cleanVal(textField('nik_ibu')),
            nama_wali: cleanVal(textField('nama_wali')),
            hp_wali: cleanVal(textField('hp_wali')),
            nik_wali: cleanVal(textField('nik_wali')),
            pekerjaan_wali: cleanVal(textField('pekerjaan_wali')),
            orang_tua: {
              ...(existingMeta.orang_tua || {}),
              nama_ayah: cleanVal(namaAyah),
              nama_ibu: cleanVal(namaIbu),
              no_hp: cleanVal(hpAyah || hpIbu),
              pekerjaan_ayah: cleanVal(textField('pekerjaan_ayah')),
              pekerjaan_ibu: cleanVal(textField('pekerjaan_ibu')),
              pendidikan_ayah: cleanVal(textField('pendidikan_terakhir_ayah')),
              pendidikan_ibu: cleanVal(textField('pendidikan_terakhir_ibu')),
              nik_ayah: cleanVal(textField('nik_ayah')),
              nik_ibu: cleanVal(textField('nik_ibu')),
              nama_wali: cleanVal(textField('nama_wali')),
              no_hp_wali: cleanVal(textField('hp_wali')),
              nik_wali: cleanVal(textField('nik_wali')),
              pekerjaan_wali: cleanVal(textField('pekerjaan_wali')),
            },
          },
        };
        if (editingId) await mobileApiService.updateStudent(editingId, payload);
        else await mobileApiService.createStudent(payload);
      } else if (resource === 'units') {
        const payload = {
          code: textField('code') || undefined,
          name: textField('name').trim(),
          level: textField('level') || undefined,
          description: textField('description') || undefined,
          is_active: form.is_active !== false,
        };
        if (editingId) await mobileApiService.updateEducationUnit(editingId, payload);
        else await mobileApiService.createEducationUnit(payload);
      } else if (resource === 'positions') {
        const payload: Record<string, unknown> = {
          nama_jabatan: textField('nama_jabatan').trim(),
          kode_jabatan: textField('kode_jabatan').trim().toUpperCase(),
          level_jabatan: parseInt(textField('level_jabatan'), 10) || 7,
          satuan_kerja: textField('satuan_kerja') || 'Unit Pendidikan',
          scope_akses: textField('scope_akses') || 'unit_sendiri',
          status: textField('status') || 'Aktif',
          deskripsi: textField('deskripsi').trim() || undefined,
        };
        if (editingId) {
          await mobileApiService.updateJabatan(editingId, payload);
        } else {
          await mobileApiService.createJabatan(payload);
        }
      } else if (resource === 'classes') {
        const rawKapasitas = textField('kapasitas').trim();
        const parsedKapasitas = parseInt(rawKapasitas, 10);
        const payload: Record<string, unknown> = {
          unit_pendidikan_id: textField('unit_pendidikan_id'),
          tahun_ajaran_id: textField('tahun_ajaran_id'),
          semester_id: textField('semester_id'),
          jenjang: textField('jenjang'),
          tingkat: textField('tingkat'),
          kode_kelas: textField('kode_kelas').trim().toUpperCase(),
          nama_kelas: textField('nama_kelas').trim(),
          ...(rawKapasitas !== '' && !isNaN(parsedKapasitas) ? { kapasitas: parsedKapasitas } : {}),
          status: textField('status') || 'Aktif',
        };
        const waliId = textField('wali_kelas_id');
        if (waliId) payload.wali_kelas_id = waliId;
        const ruangan = textField('ruangan').trim();
        if (ruangan) payload.ruangan = ruangan;

        if (editingId) {
          await mobileApiService.updateClass(editingId, payload);
        } else {
          await mobileApiService.createClass(payload);
        }
      }

      setModalVisible(false);
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: editingId ? 'Data Berhasil Diperbarui! ✨' : 'Data Berhasil Ditambahkan! ✨',
        message: `${displayName(form)} (${resourceLabels[resource]}) telah berhasil disimpan ke database sistem.`,
      });
      await load();
    } catch (requestError) {
      const errMsg = getApiErrorMessage(requestError, 'Perubahan data belum berhasil disimpan.');
      setFormError(errMsg);
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: editingId ? 'Gagal Memperbarui Data ⚠️' : 'Gagal Menyimpan Data ⚠️',
        message: errMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  const displayName = (item: any): string => {
    if (resource === 'employees') return item?.nama_lengkap || item?.name || 'Pegawai';
    if (resource === 'students') return item?.full_name || item?.nama || 'Siswa';
    if (resource === 'units') return item?.name || 'Unit pendidikan';
    if (resource === 'positions') return item?.nama_jabatan || item?.name || item?.title || 'Jabatan';
    return item?.nama_kelas || item?.name || 'Kelas';
  };

  const secondaryText = (item: any): string => {
    if (resource === 'employees') {
      return [item?.niy || item?.nik, nestedName(item?.position || item?.jabatan), nestedName(item?.unit)].filter(Boolean).join(' · ');
    }
    if (resource === 'students') {
      const cls = nestedName(item?.kelas);
      const unit = nestedName(item?.education_unit || item?.educationUnit || item?.unit);
      const parent = item?.parent_name || item?.nama_ortu || item?.parent?.name;
      const parts = [
        item?.nis ? `NIS: ${item.nis}` : null,
        item?.nisn ? `NISN: ${item.nisn}` : null,
        cls || null,
        unit || null,
        parent ? `Wali: ${parent}` : null,
      ].filter(Boolean);
      return parts.join(' · ');
    }
    if (resource === 'units') return [item?.code, item?.level, item?.is_active === false ? 'Nonaktif' : 'Aktif'].filter(Boolean).join(' · ');
    if (resource === 'positions') {
      return [
        item?.kode_jabatan || item?.code,
        item?.satuan_kerja,
        item?.level_jabatan ? `Level ${item.level_jabatan}` : '',
        item?.status || (item?.is_active === false ? 'Nonaktif' : 'Aktif'),
      ].filter(Boolean).join(' · ');
    }
    return [item?.kode_kelas || item?.code, item?.tingkat, item?.students_count ? `${item.students_count} siswa` : ''].filter(Boolean).join(' · ');
  };

  // ── Print notifications ──
  const notifyPrint = (msg: string) => {
    setPrintNotice(msg);
    setTimeout(() => {
      setPrintNotice(null);
    }, 4500);
  };

  const today = new Date();
  const formattedPrintDate = today.toLocaleDateString('id-ID', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedPrintDateShort = today.toLocaleDateString('id-ID', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const activeFilterDescription = useMemo(() => {
    if (resource === 'students') {
      return filterKelas === 'all' ? 'Semua Kelas' : `Kelas: ${filterKelas}`;
    }
    if (resource === 'employees') {
      return filterJabatan === 'all' ? 'Semua Jabatan' : `Jabatan: ${filterJabatan}`;
    }
    if (resource === 'classes') {
      return filterTingkat === 'all' ? 'Semua Tingkat' : `Tingkat: ${filterTingkat}`;
    }
    return 'Semua Data';
  }, [resource, filterKelas, filterJabatan, filterTingkat]);

  const mobileConfig = useMobileConfigStore((state) => state.config);
  const branding = mobileConfig?.branding;

  const userUnitName = useMemo(() => {
    const directUnit = nestedName(user?.unit || user?.education_unit);
    if (directUnit) return directUnit.toUpperCase();
    if (user?.metadata && typeof user.metadata === 'object' && (user.metadata as any).unit_name) {
      return String((user.metadata as any).unit_name).toUpperCase();
    }
    if (currentUserUnitId) {
      const match = availableUnits.find((u) => String(u.id) === String(currentUserUnitId));
      if (match?.name) return String(match.name).toUpperCase();
    }
    return '';
  }, [user, currentUserUnitId, availableUnits]);

  const singleItemUnitName = useMemo(() => {
    if (!singlePrintItem) return userUnitName || 'SEKOLAH ISLAM TERPADU DAR EL-IMAN';
    let rawUnit = nestedName(singlePrintItem?.education_unit || singlePrintItem?.unit);
    if (!rawUnit) {
      const unitId = String(singlePrintItem?.education_unit_id || singlePrintItem?.unit_id || singlePrintItem?.unit_pendidikan_id || '');
      const matched = availableUnits.find((u) => unitId && u.id === unitId);
      if (matched?.name) rawUnit = matched.name;
    }
    if (!rawUnit) rawUnit = userUnitName;
    if (!rawUnit) return 'SEKOLAH ISLAM TERPADU DAR EL-IMAN';
    const upper = rawUnit.toUpperCase();
    if (upper.includes('DAR EL-IMAN') || upper.includes('DAR EL - IMAN')) return upper;
    return `${upper} DAR EL-IMAN`;
  }, [singlePrintItem, userUnitName, availableUnits]);

  const singleItemUnitAddress = useMemo(() => {
    // 1. Cek langsung dari relasi item (education_unit / unit)
    const unitObj = singlePrintItem?.education_unit || singlePrintItem?.unit;
    const directAddr =
      unitObj?.metadata?.address ||
      unitObj?.metadata?.alamat ||
      unitObj?.address ||
      unitObj?.alamat;
    const directPhone =
      unitObj?.metadata?.phone ||
      unitObj?.metadata?.telepon ||
      unitObj?.metadata?.telp ||
      unitObj?.phone;

    if (directAddr) {
      return `${directAddr}${directPhone ? ` | Telp. ${directPhone}` : ''}`;
    }

    // 2. Cek dari availableUnits berdasarkan ID atau kemiripan nama
    const unitId = String(singlePrintItem?.education_unit_id || singlePrintItem?.unit_id || singlePrintItem?.unit_pendidikan_id || '');
    const unitName = nestedName(unitObj);
    const matched = availableUnits.find(
      (u) => (unitId && u.id === unitId) || (unitName && u.name.toLowerCase() === unitName.toLowerCase())
    );
    if (matched?.address) {
      return `${matched.address}${matched.phone ? ` | Telp. ${matched.phone}` : ''}`;
    }

    // 3. Fallback ke unit pengguna login jika ada
    const userUnit = availableUnits.find(
      (u) => (user?.education_unit_id && u.id === String(user.education_unit_id)) || (userUnitName && u.name.toUpperCase() === userUnitName)
    );
    if (userUnit?.address) {
      return `${userUnit.address}${userUnit.phone ? ` | Telp. ${userUnit.phone}` : ''}`;
    }

    return 'Jl. Gunung Juaro, Surau Gadang, Kec. Nanggalo, Kota Padang, Sumatera Barat | Telp. (0751) 8950123';
  }, [singlePrintItem, availableUnits, user, userUnitName]);

  const rekapSchoolUnitName = useMemo(() => {
    let name = userUnitName;
    if (!name && availableUnits.length === 1) {
      name = availableUnits[0].name.toUpperCase();
    }
    if (name) {
      if (name.includes('DAR EL-IMAN') || name.includes('DAR EL - IMAN')) return name;
      return `${name} DAR EL-IMAN`;
    }
    return 'SEKOLAH ISLAM TERPADU DAR EL-IMAN';
  }, [userUnitName, availableUnits]);

  const rekapSchoolUnitAddress = useMemo(() => {
    const userUnitId = String(user?.education_unit_id || user?.unit_id || scope?.unit_id || '');
    const matched = availableUnits.find(
      (u) => (userUnitId && u.id === userUnitId) || (userUnitName && u.name.toUpperCase() === userUnitName)
    );
    if (matched?.address) {
      return `${matched.address}${matched.phone ? ` | Telp. ${matched.phone}` : ''}`;
    }
    if (availableUnits.length === 1 && availableUnits[0].address) {
      return `${availableUnits[0].address}${availableUnits[0].phone ? ` | Telp. ${availableUnits[0].phone}` : ''}`;
    }
    return 'Jl. Gunung Juaro, Surau Gadang, Kec. Nanggalo, Kota Padang, Sumatera Barat | Telp. (0751) 8950123';
  }, [availableUnits, user, scope, userUnitName]);

  // Konfigurasi Tanda Tangan & Pengesahan Dinamis Sesuai Akun Login
  const getPrintSignConfig = useCallback((targetUnitName?: string) => {
    const rawName = user?.name || (user as any)?.nama_lengkap || (user as any)?.nama || '';
    const rawNip = (user as any)?.nip || (user as any)?.niy || (user as any)?.nuptk || (user as any)?.employee_id || '';
    const unitTitle = targetUnitName || userUnitName || rekapSchoolUnitName || '';

    // 1. Jika yang login adalah KEPALA SEKOLAH / MUDIR
    if (isPrincipal) {
      return {
        leftDate: `Padang, ${formattedPrintDateShort}`,
        leftRole: 'Petugas Tata Usaha / Operator',
        leftName: '( .................................................... )',
        leftNip: 'NIP / NIY: ______________________',
        rightHeading: 'Mengetahui,',
        rightRole: unitTitle ? `Kepala ${unitTitle}` : 'Kepala Sekolah / Mudir Unit',
        rightName: rawName || 'Kepala Sekolah',
        rightNip: rawNip ? `NIP/NIY: ${rawNip}` : 'NIP / NIY: ______________________',
      };
    }

    // 2. Jika yang login adalah PIMPINAN / PENGURUS YAYASAN
    if (foundation) {
      return {
        leftDate: `Padang, ${formattedPrintDateShort}`,
        leftRole: unitTitle ? `Kepala ${unitTitle}` : 'Kepala Unit Pendidikan',
        leftName: '( .................................................... )',
        leftNip: 'NIP / NIY: ______________________',
        rightHeading: 'Mengetahui,',
        rightRole: 'Pimpinan / Pengurus Yayasan',
        rightName: rawName || 'Pengurus Yayasan',
        rightNip: rawNip ? `NIY: ${rawNip}` : 'NIY: ______________________',
      };
    }

    // 3. Jika yang login adalah STAF TATA USAHA / OPERATOR
    if (isTu) {
      return {
        leftDate: `Padang, ${formattedPrintDateShort}`,
        leftRole: 'Petugas Tata Usaha / Operator',
        leftName: rawName || '( .................................................... )',
        leftNip: rawNip ? `NIP/NIY: ${rawNip}` : 'NIP / NIY: ______________________',
        rightHeading: 'Mengetahui,',
        rightRole: unitTitle ? `Kepala ${unitTitle}` : 'Kepala Sekolah / Mudir Unit',
        rightName: '( .................................................... )',
        rightNip: 'NIP / NIY: ______________________',
      };
    }

    // 4. Default peran lainnya (Tenaga Pendidik / Admin Unit)
    return {
      leftDate: `Padang, ${formattedPrintDateShort}`,
      leftRole: 'Petugas Administrasi / Pelaksana',
      leftName: rawName || '( .................................................... )',
      leftNip: rawNip ? `NIP/NIY: ${rawNip}` : 'NIP / NIY: ______________________',
      rightHeading: 'Mengetahui,',
      rightRole: unitTitle ? `Kepala ${unitTitle}` : 'Kepala Sekolah / Mudir Unit',
      rightName: '( .................................................... )',
      rightNip: 'NIP / NIY: ______________________',
    };
  }, [user, userUnitName, rekapSchoolUnitName, isPrincipal, foundation, isTu, formattedPrintDateShort]);

  // Logo Yayasan (Kiri) dari Site Setting / Branding Config
  const siteLogoUrl = useMemo(() => {
    const candidate = branding?.logo_header_url || branding?.logo_url || branding?.fallback_logo_url;
    if (candidate) return resolveMediaUrl(candidate);
    return null;
  }, [branding]);

  // Logo Unit Pendidikan (Kanan) untuk Lembar Biodata Siswa / Item Tunggal
  const singleItemUnitLogo = useMemo(() => {
    if (!singlePrintItem) return null;
    const directLogo =
      singlePrintItem?.education_unit?.logo_url ||
      singlePrintItem?.education_unit?.metadata?.logo_url ||
      singlePrintItem?.education_unit?.metadata?.logo_path ||
      singlePrintItem?.education_unit?.metadata?.logo ||
      singlePrintItem?.unit?.logo_url ||
      singlePrintItem?.unit?.metadata?.logo_url;
    if (directLogo) return resolveMediaUrl(directLogo);

    const unitId = String(singlePrintItem?.education_unit_id || singlePrintItem?.unit_id || singlePrintItem?.unit_pendidikan_id || '');
    const unitName = nestedName(singlePrintItem?.education_unit || singlePrintItem?.unit);
    const matched = availableUnits.find(
      (u) => (unitId && u.id === unitId) || (unitName && u.name.toLowerCase() === unitName.toLowerCase())
    );
    if (matched?.logo_url) return resolveMediaUrl(matched.logo_url);

  }, [singlePrintItem, availableUnits]);

  // Identitas Kanonis Dokumen Cetak Biodata per Resource
  const singlePrintIdentifier = useMemo(() => {
    if (!singlePrintItem) return '';
    const meta = (singlePrintItem.metadata && typeof singlePrintItem.metadata === 'object') ? singlePrintItem.metadata : {};
    if (resource === 'students') {
      const nis = singlePrintItem.nis || meta.nis;
      if (nis) return `NIS: ${nis}`;
      if (meta.no_pendaftaran) return `NO. REG: ${meta.no_pendaftaran}`;
      return 'NIS: -';
    }
    if (resource === 'employees') {
      const empId = singlePrintItem.niy || singlePrintItem.nip || meta.niy || meta.nip;
      return `NIY/NIP: ${empId || '-'}`;
    }
    if (resource === 'classes') {
      const codeVal = singlePrintItem.kode_kelas || singlePrintItem.code;
      return `KODE KELAS: ${codeVal || '-'}`;
    }
    if (resource === 'units') {
      return `KODE UNIT: ${singlePrintItem.code || '-'}`;
    }
    if (resource === 'positions') {
      const posVal = singlePrintItem.kode_jabatan || singlePrintItem.code;
      return `KODE JABATAN: ${posVal || '-'}`;
    }
    return 'KODE/IDENTITAS: -';
  }, [singlePrintItem, resource]);

  // Logo Unit Pendidikan (Kanan) untuk Laporan Batch
  const rekapUnitLogo = useMemo(() => {
    const userUnitId = String(user?.education_unit_id || user?.unit_id || scope?.unit_id || '');
    const matched = availableUnits.find(
      (u) => (userUnitId && u.id === userUnitId) || (userUnitName && u.name.toUpperCase() === userUnitName)
    );
    if (matched?.logo_url) return resolveMediaUrl(matched.logo_url);
    if (availableUnits.length === 1 && availableUnits[0].logo_url) {
      return resolveMediaUrl(availableUnits[0].logo_url);
    }
    return null;
  }, [availableUnits, user, scope, userUnitName]);

  const handleCloseSinglePrint = useCallback(() => {
    setSinglePrintItem(null);
    if (returnToEditId) {
      const editTarget = items.find((it: any) => String(it.id) === String(returnToEditId));
      if (editTarget) {
        openForm(editTarget);
      } else {
        setModalVisible(true);
      }
      setReturnToEditId(null);
    }
  }, [returnToEditId, items, openForm]);

  // ── Helper Form Field Renderers (100% Unified TailGrids Style - Component Level) ──
  const renderInputField = ({
    label,
    value,
    onChangeText,
    required = false,
    icon,
    placeholder = '',
    keyboardType = 'default',
    maxLength,
    helperText,
    hintText,
    multiline = false,
    numberOfLines = 1,
  }: {
    label: string;
    value: string;
    onChangeText: (v: string) => void;
    required?: boolean;
    icon?: string;
    placeholder?: string;
    keyboardType?: 'default' | 'numeric' | 'email-address' | 'phone-pad';
    maxLength?: number;
    helperText?: string;
    hintText?: string;
    multiline?: boolean;
    numberOfLines?: number;
  }) => {
    const currentVal = value ?? '';
    const displayHelper = helperText
      ? helperText
      : maxLength
        ? `${currentVal.length}/${maxLength} digit`
        : null;

    return (
      <View style={styles.formFieldGroup}>
        <View style={styles.formFieldHeaderRow}>
          <Text style={styles.formFieldLabelText}>
            {label} {required && <Text style={styles.formFieldRequiredStar}>*</Text>}
          </Text>
          {displayHelper ? (
            <Text style={styles.formFieldHelperText}>{displayHelper}</Text>
          ) : null}
        </View>

        <View style={[styles.formInputBox, multiline && styles.formInputBoxMultiline]}>
          {icon && (
            <View style={[styles.formInputBoxIconWrap, multiline && { marginTop: 3 }]}>
              <MaterialCommunityIcons name={icon as any} size={18} color="#059669" />
            </View>
          )}
          <NativeTextInput
            value={currentVal}
            onChangeText={onChangeText}
            placeholder={placeholder}
            placeholderTextColor="#94A3B8"
            keyboardType={keyboardType}
            maxLength={maxLength}
            multiline={multiline}
            numberOfLines={numberOfLines}
            style={[styles.formNativeInput, multiline && styles.formNativeInputMultiline]}
          />
        </View>

        {hintText ? <Text style={styles.formFieldBottomHint}>{hintText}</Text> : null}
      </View>
    );
  };

  const renderSelectField = ({
    label,
    value,
    placeholder = 'Pilih salah satu...',
    required = false,
    icon,
    onPress,
    hintText,
    helperText,
    disabled = false,
  }: {
    label: string;
    value: string;
    placeholder?: string;
    required?: boolean;
    icon?: string;
    onPress: () => void;
    hintText?: string;
    helperText?: string;
    disabled?: boolean;
  }) => (
    <View style={styles.formFieldGroup}>
      <View style={styles.formFieldHeaderRow}>
        <Text style={styles.formFieldLabelText}>
          {label} {required && <Text style={styles.formFieldRequiredStar}>*</Text>}
        </Text>
        {helperText ? <Text style={styles.formFieldHelperText}>{helperText}</Text> : null}
      </View>

      <TouchableOpacity
        activeOpacity={0.8}
        disabled={disabled}
        onPress={onPress}
        style={[styles.formSelectBox, disabled && styles.formSelectBoxDisabled]}
      >
        {icon && (
          <View style={styles.formInputBoxIconWrap}>
            <MaterialCommunityIcons name={icon as any} size={18} color={disabled ? '#94A3B8' : '#059669'} />
          </View>
        )}
        <Text
          style={[styles.formSelectText, !value && styles.formSelectPlaceholder]}
          numberOfLines={1}
        >
          {value || placeholder}
        </Text>
        <MaterialCommunityIcons
          name="chevron-down"
          size={20}
          color={disabled ? '#CBD5E1' : '#64748B'}
        />
      </TouchableOpacity>

      {hintText ? <Text style={styles.formFieldBottomHint}>{hintText}</Text> : null}
    </View>
  );

  const renderFields = () => {
    if (resource === 'students') {
      const selectedUnitId = textField('unit_id');
      const selectedUnitName = availableUnits.find((u) => u.id === selectedUnitId)?.name || '';

      const filteredClasses = availableClasses
        .filter((c) => !selectedUnitId || !c.unit_id || c.unit_id === selectedUnitId)
        .map((c) => {
          const isCurrentClass = Boolean(editingId && form._initialKelasId === c.id);
          const isFull = Boolean(c.is_full && !isCurrentClass);
          let subtitle = '';
          if (c.kapasitas && c.kapasitas > 0) {
            subtitle = isFull
              ? `⚠️ Kuota Penuh (${c.jumlah_siswa}/${c.kapasitas} Siswa)`
              : `Tersedia: ${c.jumlah_siswa}/${c.kapasitas} Siswa`;
          } else if (c.jumlah_siswa !== undefined) {
            subtitle = `${c.jumlah_siswa} Siswa`;
          }
          return {
            id: c.id,
            name: c.name,
            subtitle,
            disabled: isFull,
            disabledReason: `Kuota rombel '${c.name}' sudah penuh (${c.jumlah_siswa}/${c.kapasitas} siswa). Silakan pilih rombel lain yang masih tersedia.`,
          };
        });
      const selectedClassId = textField('kelas_id');
      const selectedClassObj = availableClasses.find((c) => c.id === selectedClassId);
      const selectedClassName = selectedClassObj
        ? `${selectedClassObj.name}${selectedClassObj.kapasitas ? ` • (${selectedClassObj.jumlah_siswa}/${selectedClassObj.kapasitas} Siswa)` : ''}`
        : '';

      const currentStatus = textField('status_siswa') || 'aktif';
      const currentStatusObj = studentStatusOptions.find((s) => s.id === currentStatus) || STUDENT_STATUS_OPTIONS.find((s) => s.id === currentStatus);

      return (
        <View style={styles.formContainer}>
          {/* ── STEP WIZARD TAB BAR UNTUK FORM SISWA ── */}
          <View style={styles.wizardBarWrapper}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.wizardScrollContent}
            >
              {STUDENT_STEPS.map((step) => {
                const isCurrent = studentFormStep === step.id;
                return (
                  <TouchableOpacity
                    key={step.id}
                    activeOpacity={0.8}
                    onPress={() => setStudentFormStep(step.id)}
                    style={[
                      styles.wizardStepBtn,
                      isCurrent && styles.wizardStepBtnActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={step.icon as any}
                      size={15}
                      color={isCurrent ? '#FFFFFF' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.wizardStepBtnText,
                        isCurrent && styles.wizardStepBtnTextActive,
                      ]}
                    >
                      {step.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* Notice Card Informasi Input Data (Step 0) */}
          {studentFormStep === 0 && (
            <View style={styles.formNoticeCard}>
              <View style={styles.formNoticeIconBox}>
                <MaterialCommunityIcons name="account-school" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.formNoticeTitle}>Formulir Registrasi Pokok Siswa</Text>
                <Text style={styles.formNoticeText}>
                  {`Lengkapi identitas pokok, penempatan rombel TP ${currentAyName}, kontak WhatsApp orang tua/wali, dan alamat domisili siswa secara akurat.`}
                </Text>
              </View>
            </View>
          )}

          {/* ── SECTION 1: IDENTITAS SISWA (STEP 0 / SEMUA) ── */}
          {(studentFormStep === 0 || studentFormStep === 4) && (
            <View style={styles.formSectionCard}>
              <View style={styles.formSectionHeader}>
                <View style={styles.formSectionIconBox}>
                  <MaterialCommunityIcons name="card-account-details-outline" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formSectionTitle}>1. Identitas Pokok Siswa</Text>
                  <Text style={styles.formSectionSubTitle}>Data primer resmi sesuai Akta Kelahiran & KK</Text>
                </View>
                <View style={styles.formSectionBadge}>
                  <Text style={styles.formSectionBadgeText}>Pokok</Text>
                </View>
              </View>

              {renderInputField({
                label: 'Nomor Induk Siswa (NIS)',
                value: textField('nis'),
                onChangeText: (v) => setField('nis', v),
                required: true,
                icon: 'card-text-outline',
                placeholder: 'Contoh: 202601001',
                hintText: 'Nomor Induk Siswa lokal lembaga sekolah',
              })}

              {renderInputField({
                label: 'Nama Lengkap Siswa',
                value: textField('full_name'),
                onChangeText: (v) => setField('full_name', v),
                required: true,
                icon: 'account-outline',
                placeholder: 'Nama lengkap resmi sesuai akta kelahiran',
                hintText: 'Nama lengkap resmi tanpa singkatan berlebihan',
              })}

              {/* Jenis Kelamin Toggle */}
              <View style={styles.formFieldGroup}>
                <View style={styles.formFieldHeaderRow}>
                  <Text style={styles.formFieldLabelText}>
                    Jenis Kelamin <Text style={styles.formFieldRequiredStar}>*</Text>
                  </Text>
                  <Text style={styles.formFieldHelperText}>Pilih salah satu</Text>
                </View>
                <View style={styles.genderRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setField('gender', 'male')}
                    style={[
                      styles.genderBtn,
                      textField('gender') === 'male' ? styles.genderBtnActiveMale : styles.genderBtnInactive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="gender-male"
                      size={20}
                      color={textField('gender') === 'male' ? '#0284C7' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.genderBtnText,
                        textField('gender') === 'male' && styles.genderBtnTextActiveMale,
                      ]}
                    >
                      Laki-laki (L)
                    </Text>
                    {textField('gender') === 'male' && (
                      <MaterialCommunityIcons name="check-circle" size={16} color="#0284C7" />
                    )}
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setField('gender', 'female')}
                    style={[
                      styles.genderBtn,
                      textField('gender') === 'female' ? styles.genderBtnActiveFemale : styles.genderBtnInactive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="gender-female"
                      size={20}
                      color={textField('gender') === 'female' ? '#EC4899' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.genderBtnText,
                        textField('gender') === 'female' && styles.genderBtnTextActiveFemale,
                      ]}
                    >
                      Perempuan (P)
                    </Text>
                    {textField('gender') === 'female' && (
                      <MaterialCommunityIcons name="check-circle" size={16} color="#EC4899" />
                    )}
                  </TouchableOpacity>
                </View>
              </View>

              {renderInputField({
                label: 'NISN (10 Digit Nasional)',
                value: textField('nisn'),
                onChangeText: (v) => setField('nisn', v),
                icon: 'identifier',
                keyboardType: 'numeric',
                maxLength: 10,
                placeholder: 'Contoh: 0081234567',
                hintText: '10 Digit Nomor Induk Siswa Nasional (Dapodik / EMIS)',
              })}

              {renderInputField({
                label: 'NIK Siswa (16 Digit)',
                value: textField('nik'),
                onChangeText: (v) => setField('nik', v),
                icon: 'card-account-details-outline',
                keyboardType: 'numeric',
                maxLength: 16,
                placeholder: '16 Digit NIK sesuai KK / KIA',
              })}

              {renderInputField({
                label: 'No. Kartu Keluarga (KK)',
                value: textField('no_kk'),
                onChangeText: (v) => setField('no_kk', v),
                icon: 'home-group',
                keyboardType: 'numeric',
                maxLength: 16,
                placeholder: '16 Digit Nomor Kartu Keluarga',
              })}

              {renderInputField({
                label: 'No. Registrasi Akta Lahir',
                value: textField('no_registrasi_akta_lahir'),
                onChangeText: (v) => setField('no_registrasi_akta_lahir', v),
                icon: 'certificate-outline',
                placeholder: 'Contoh: 1371-LT-12052012-0001',
                hintText: 'Nomor registrasi pada lembar Akta Kelahiran Disdukcapil',
              })}

              {renderInputField({
                label: 'Tempat Lahir',
                value: textField('birth_place'),
                onChangeText: (v) => setField('birth_place', v),
                icon: 'map-marker-outline',
                placeholder: 'Kota / Tempat Kelahiran',
              })}

              {renderInputField({
                label: 'Tanggal Lahir Siswa',
                value: textField('birth_date'),
                onChangeText: (v) => setField('birth_date', v),
                icon: 'calendar-month-outline',
                placeholder: 'Contoh: 2012-05-20',
                helperText: 'YYYY-MM-DD',
                hintText: 'Format tanggal resmi standar internasional: Tahun-Bulan-Tanggal',
              })}

              {renderSelectField({
                label: 'Agama',
                value: textField('agama') || 'Islam',
                icon: 'book-open-page-variant-outline',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Agama',
                    fieldKey: 'agama',
                    options: RELIGION_OPTIONS,
                  });
                },
              })}

              {renderInputField({
                label: 'Email Siswa (Opsional)',
                value: textField('email'),
                onChangeText: (v) => setField('email', v),
                icon: 'email-outline',
                keyboardType: 'email-address',
                placeholder: 'siswa@sekolah.sch.id',
              })}

              {renderInputField({
                label: 'No. Registrasi PPDB',
                value: textField('no_pendaftaran'),
                onChangeText: (v) => setField('no_pendaftaran', v),
                icon: 'file-document-outline',
                placeholder: 'Contoh: REG-2026/01',
              })}

              {renderInputField({
                label: 'Urutan Anak Ke-',
                value: textField('anak_ke'),
                onChangeText: (v) => setField('anak_ke', v),
                icon: 'numeric',
                keyboardType: 'numeric',
                placeholder: 'Contoh: 1 (Anak pertama)',
              })}

              {renderInputField({
                label: 'Jumlah Saudara Kandung',
                value: textField('jumlah_saudara'),
                onChangeText: (v) => setField('jumlah_saudara', v),
                icon: 'account-multiple-outline',
                keyboardType: 'numeric',
                placeholder: 'Contoh: 3 bersaudara',
              })}

              {/* Tombol Lanjut ke Step 2 jika di step 0 */}
              {studentFormStep === 0 && (
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setStudentFormStep(1)}
                  style={styles.stepNextSectionBtn}
                >
                  <Text style={styles.stepNextSectionBtnText}>Lanjut ke 2. Akademik & Penempatan</Text>
                  <MaterialCommunityIcons name="arrow-right" size={18} color="#059669" />
                </TouchableOpacity>
              )}
            </View>
          )}

          {/* ── SECTION 2: PENEMPATAN ROMBEL & AKADEMIK (STEP 1 / SEMUA) ── */}
          {(studentFormStep === 1 || studentFormStep === 4) && (
            <View style={styles.formSectionCard}>
              <View style={styles.formSectionHeader}>
                <View style={styles.formSectionIconBox}>
                  <MaterialCommunityIcons name="school-outline" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formSectionTitle}>2. Penempatan Rombel & Status</Text>
                  <Text style={styles.formSectionSubTitle}>{`Unit pendidikan dan kelas aktif TP ${currentAyName}`}</Text>
                </View>
                <View style={styles.formSectionBadge}>
                  <Text style={styles.formSectionBadgeText}>Akademik</Text>
                </View>
              </View>

              {renderSelectField({
                label: 'Unit Pendidikan',
                value: selectedUnitName,
                placeholder: 'Pilih Unit Pendidikan...',
                required: true,
                icon: isUnitLocked ? 'lock-outline' : 'domain',
                disabled: isUnitLocked,
                helperText: isUnitLocked ? 'Unit otomatis terkunci sesuai unit tugas Anda' : undefined,
                onPress: () => {
                  if (isUnitLocked) return;
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Unit Pendidikan',
                    fieldKey: 'unit_id',
                    options: availableUnits,
                    onSelect: (unitId) => {
                      setField('unit_id', unitId);
                      if (selectedClassId) {
                        const cls = availableClasses.find((c) => c.id === selectedClassId);
                        if (cls && cls.unit_id && cls.unit_id !== unitId) {
                          setField('kelas_id', '');
                        }
                      }
                    },
                  });
                },
              })}

              {renderSelectField({
                label: 'Kelas / Rombel',
                value: selectedClassName,
                placeholder: filteredClasses.length > 0 ? 'Pilih Kelas / Rombel...' : 'Pilih Unit Terlebih Dahulu',
                required: true,
                icon: 'google-classroom',
                disabled: filteredClasses.length === 0,
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Kelas / Rombel',
                    fieldKey: 'kelas_id',
                    options: filteredClasses,
                  });
                },
              })}

              {renderSelectField({
                label: 'Status Siswa',
                value: currentStatusObj?.name || 'Aktif',
                placeholder: 'Pilih Status Siswa...',
                required: true,
                icon: 'account-check-outline',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Status Siswa',
                    fieldKey: 'status_siswa',
                    options: studentStatusOptions,
                  });
                },
              })}

              {/* Field Khusus Alumni: Tahun Lulus & Tujuan Lanjut */}
              {textField('status_siswa') === 'lulus' && (
                <>
                  {renderInputField({
                    label: 'Tahun Kelulusan (Alumni)',
                    value: textField('tahun_lulus') || currentAyName,
                    onChangeText: (v) => setField('tahun_lulus', v),
                    icon: 'school-outline',
                    placeholder: `Contoh: ${currentAyName}`,
                    required: true,
                  })}
                  {renderInputField({
                    label: 'Tujuan Lanjut Sekolah / Studi',
                    value: textField('tujuan_lanjut'),
                    onChangeText: (v) => setField('tujuan_lanjut', v),
                    icon: 'map-marker-path',
                    placeholder: 'Contoh: SMAIT Darel Iman / Pondok / PTN',
                    hintText: 'Sekolah, universitas, atau pesantren tujuan setelah tamat',
                    required: true,
                  })}
                </>
              )}

              {/* Field Khusus Siswa Mutasi: Sekolah / Unit Tujuan & Alasan */}
              {textField('status_siswa') === 'mutasi' && (
                <>
                  {renderInputField({
                    label: 'Sekolah / Unit Tujuan Mutasi',
                    value: textField('sekolah_tujuan'),
                    onChangeText: (v) => setField('sekolah_tujuan', v),
                    icon: 'domain',
                    placeholder: 'Nama sekolah luar / unit tujuan mutasi',
                    required: true,
                  })}
                  {renderInputField({
                    label: 'Alasan Mutasi Siswa',
                    value: textField('alasan_mutasi'),
                    onChangeText: (v) => setField('alasan_mutasi', v),
                    icon: 'text-box-outline',
                    placeholder: 'Alasan kepindahan siswa (misal: pindah domisili)',
                    required: true,
                  })}
                </>
              )}

              {/* Jenis Pendaftaran (Prioritas 2: Siswa Baru, Pindahan Eksternal, Pindahan Internal) */}
              <View style={{ marginBottom: 14 }}>
                <Text style={styles.formLabel}>
                  Jenis Pendaftaran <Text style={styles.requiredStar}>*</Text>
                </Text>
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4 }}>
                  {[
                    { id: 'baru', label: 'Baru (PPDB)', icon: 'school' },
                    { id: 'pindahan_eksternal', label: 'Pindah Luar', icon: 'domain' },
                    { id: 'pindahan_internal', label: 'Pindah Unit', icon: 'swap-horizontal' },
                  ].map((jp) => {
                    const active = (textField('jenis_pendaftaran') || 'baru') === jp.id;
                    return (
                      <TouchableOpacity
                        key={jp.id}
                        activeOpacity={0.8}
                        onPress={() => setField('jenis_pendaftaran', jp.id)}
                        style={{
                          flex: 1,
                          paddingVertical: 10,
                          paddingHorizontal: 4,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: active ? '#059669' : '#E2E8F0',
                          backgroundColor: active ? '#ECFDF5' : '#FFFFFF',
                          alignItems: 'center',
                          justifyContent: 'center',
                        }}
                      >
                        <MaterialCommunityIcons
                          name={jp.icon as any}
                          size={18}
                          color={active ? '#059669' : '#64748B'}
                        />
                        <Text
                          style={{
                            fontSize: 11,
                            fontWeight: active ? '700' : '600',
                            color: active ? '#065F46' : '#64748B',
                            marginTop: 4,
                            textAlign: 'center',
                          }}
                        >
                          {jp.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Jika Pindahan Internal: Pilih Unit Asal dari Database */}
              {textField('jenis_pendaftaran') === 'pindahan_internal' && (
                renderSelectField({
                  label: 'Unit Asal (Internal Yayasan)',
                  value: availableUnits.find((u) => u.id === textField('unit_asal_id'))?.name || 'Pilih Unit Asal...',
                  placeholder: 'Pilih unit asal siswa...',
                  required: true,
                  icon: 'domain',
                  onPress: () => {
                    setPickerSearch('');
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Unit Asal Siswa',
                      fieldKey: 'unit_asal_id',
                      options: availableUnits.filter((u) => u.id !== textField('unit_id')),
                    });
                  },
                })
              )}

              {/* Jika Pindahan Eksternal: Input Sekolah Asal & Status */}
              {textField('jenis_pendaftaran') === 'pindahan_eksternal' && (
                <>
                  {renderInputField({
                    label: 'Sekolah Asal Siswa',
                    value: textField('sekolah_asal'),
                    onChangeText: (v) => setField('sekolah_asal', v),
                    icon: 'school-outline',
                    placeholder: 'Contoh: TK Islam Terpadu / SD Negeri 01',
                    required: true,
                  })}

                  {renderSelectField({
                    label: 'Status Sekolah Asal',
                    value: textField('status_sekolah_asal') || 'Formal',
                    icon: 'domain',
                    onPress: () => {
                      setPickerSearch('');
                      setPickerModal({
                        visible: true,
                        title: 'Pilih Status Sekolah Asal',
                        fieldKey: 'status_sekolah_asal',
                        options: STATUS_SEKOLAH_OPTIONS,
                      });
                    },
                  })}
                </>
              )}

              {/* Tahun Ajaran Masuk (Prioritas 3: 100% Dinamis dari Database) */}
              {renderSelectField({
                label: 'Tahun Ajaran Masuk',
                value: textField('tahun_ajaran_masuk') || activeAcademicYearName || 'Pilih Tahun Ajaran...',
                placeholder: 'Pilih tahun ajaran masuk...',
                required: true,
                icon: 'calendar-range',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Tahun Ajaran Masuk',
                    fieldKey: 'tahun_ajaran_masuk',
                    options: availableAcademicYears.length > 0
                      ? availableAcademicYears.map((ay) => ({
                          id: ay.name,
                          name: ay.name + (ay.is_active ? ' (Periode Aktif)' : ''),
                        }))
                      : [
                          { id: currentAyName, name: currentAyName },
                        ],
                  });
                },
              })}

              {renderInputField({
                label: 'NIS Tagihan / VA Pembayaran',
                value: textField('nis_pembayaran'),
                onChangeText: (v) => setField('nis_pembayaran', v),
                icon: 'credit-card-outline',
                placeholder: 'Kode Tagihan Virtual Account',
              })}

              {/* Navigasi Step 1 */}
              {studentFormStep === 1 && (
                <View style={styles.stepNavRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStudentFormStep(0)}
                    style={styles.stepPrevSectionBtn}
                  >
                    <MaterialCommunityIcons name="arrow-left" size={18} color="#64748B" />
                    <Text style={styles.stepPrevSectionBtnText}>1. Pribadi</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStudentFormStep(2)}
                    style={[styles.stepNextSectionBtn, { flex: 1.5, marginTop: 0 }]}
                  >
                    <Text style={styles.stepNextSectionBtnText}>Lanjut ke 3. Orang Tua</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#059669" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── SECTION 3: DATA ORANG TUA SISWA (STEP 2 / SEMUA) ── */}
          {(studentFormStep === 2 || studentFormStep === 4) && (
            <View style={styles.formSectionCard}>
              <View style={styles.formSectionHeader}>
                <View style={styles.formSectionIconBox}>
                  <MaterialCommunityIcons name="account-child-circle" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formSectionTitle}>3. Data Orang Tua Siswa</Text>
                  <Text style={styles.formSectionSubTitle}>Kontak terintegrasi sistem notifikasi WhatsApp</Text>
                </View>
                <View style={styles.formSectionBadge}>
                  <Text style={styles.formSectionBadgeText}>Keluarga</Text>
                </View>
              </View>

              {/* Info Box WhatsApp */}
              <View style={styles.formNoticeMiniCard}>
                <MaterialCommunityIcons name="whatsapp" size={18} color="#059669" />
                <Text style={styles.formNoticeMiniText}>
                  Nomor WhatsApp aktif digunakan untuk notifikasi presensi gerbang/kelas, mutaba'ah yaumiyyah, kartu ujian, dan pengumuman sekolah.
                </Text>
              </View>

              {/* Sub-header Data Ayah */}
              <View style={styles.formSubHeader}>
                <View style={styles.formSubHeaderLeft}>
                  <View style={styles.formSubHeaderIconWrap}>
                    <MaterialCommunityIcons name="account-tie-outline" size={16} color="#059669" />
                  </View>
                  <Text style={styles.formSubHeaderText}>DATA AYAH KANDUNG</Text>
                </View>
                <View style={styles.formSubHeaderBadge}>
                  <Text style={styles.formSubHeaderBadgeText}>Wali Utama</Text>
                </View>
              </View>

              {renderInputField({
                label: 'Nama Lengkap Ayah',
                value: textField('nama_ayah'),
                onChangeText: (v) => setField('nama_ayah', v),
                icon: 'account-tie-outline',
                placeholder: 'Nama Lengkap Ayah Kandung',
              })}

              {renderInputField({
                label: 'No. WA / HP Ayah',
                value: textField('hp_ayah'),
                onChangeText: (v) => setField('hp_ayah', v),
                icon: 'whatsapp',
                keyboardType: 'numeric',
                placeholder: '08xxxxxxxxxx',
                helperText: 'WA Notifikasi',
                hintText: 'Nomor WhatsApp aktif ayah untuk pengiriman laporan & mutabaah',
              })}

              {renderInputField({
                label: 'NIK Ayah (16 Digit)',
                value: textField('nik_ayah'),
                onChangeText: (v) => setField('nik_ayah', v),
                icon: 'card-account-details-outline',
                keyboardType: 'numeric',
                maxLength: 16,
                placeholder: '16 Digit NIK sesuai KTP / KK',
              })}

              {renderSelectField({
                label: 'Pendidikan Terakhir Ayah',
                value: textField('pendidikan_terakhir_ayah') || 'SMA / SMK / MA',
                icon: 'school-outline',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Pendidikan Terakhir Ayah',
                    fieldKey: 'pendidikan_terakhir_ayah',
                    options: pendidikanOptions,
                  });
                },
              })}

              {renderSelectField({
                label: 'Pekerjaan Utama Ayah',
                value: textField('pekerjaan_ayah') || 'Wiraswasta',
                icon: 'briefcase-outline',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Pekerjaan Ayah',
                    fieldKey: 'pekerjaan_ayah',
                    options: pekerjaanOptions,
                  });
                },
              })}

              {/* Sub-header Data Ibu */}
              <View style={[styles.formSubHeader, { marginTop: 14 }]}>
                <View style={styles.formSubHeaderLeft}>
                  <View style={styles.formSubHeaderIconWrap}>
                    <MaterialCommunityIcons name="face-woman-profile" size={16} color="#059669" />
                  </View>
                  <Text style={styles.formSubHeaderText}>DATA IBU KANDUNG</Text>
                </View>
                <View style={styles.formSubHeaderBadge}>
                  <Text style={styles.formSubHeaderBadgeText}>Wali Pendamping</Text>
                </View>
              </View>

              {renderInputField({
                label: 'Nama Lengkap Ibu',
                value: textField('nama_ibu'),
                onChangeText: (v) => setField('nama_ibu', v),
                icon: 'face-woman-profile',
                placeholder: 'Nama Lengkap Ibu Kandung',
              })}

              {renderInputField({
                label: 'No. WA / HP Ibu',
                value: textField('hp_ibu'),
                onChangeText: (v) => setField('hp_ibu', v),
                icon: 'whatsapp',
                keyboardType: 'numeric',
                placeholder: '08xxxxxxxxxx',
                helperText: 'WA Notifikasi',
                hintText: 'Nomor WhatsApp aktif ibu untuk konfirmasi kegiatan santri/siswa',
              })}

              {renderInputField({
                label: 'NIK Ibu (16 Digit)',
                value: textField('nik_ibu'),
                onChangeText: (v) => setField('nik_ibu', v),
                icon: 'card-account-details-outline',
                keyboardType: 'numeric',
                maxLength: 16,
                placeholder: '16 Digit NIK sesuai KTP / KK',
              })}

              {renderSelectField({
                label: 'Pendidikan Terakhir Ibu',
                value: textField('pendidikan_terakhir_ibu') || 'SMA / SMK / MA',
                icon: 'school-outline',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Pendidikan Terakhir Ibu',
                    fieldKey: 'pendidikan_terakhir_ibu',
                    options: pendidikanOptions,
                  });
                },
              })}

              {renderSelectField({
                label: 'Pekerjaan Utama Ibu',
                value: textField('pekerjaan_ibu') || 'Ibu Rumah Tangga',
                icon: 'briefcase-outline',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Pekerjaan Ibu',
                    fieldKey: 'pekerjaan_ibu',
                    options: pekerjaanOptions,
                  });
                },
              })}

              {/* Navigasi Step 2 */}
              {studentFormStep === 2 && (
                <View style={styles.stepNavRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStudentFormStep(1)}
                    style={styles.stepPrevSectionBtn}
                  >
                    <MaterialCommunityIcons name="arrow-left" size={18} color="#64748B" />
                    <Text style={styles.stepPrevSectionBtnText}>2. Akademik</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStudentFormStep(3)}
                    style={[styles.stepNextSectionBtn, { flex: 1.5, marginTop: 0 }]}
                  >
                    <Text style={styles.stepNextSectionBtnText}>Lanjut ke 4. Wali & Asal</Text>
                    <MaterialCommunityIcons name="arrow-right" size={18} color="#059669" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}

          {/* ── SECTION 4: DATA WALI & DOMISILI (STEP 3 / SEMUA) ── */}
          {(studentFormStep === 3 || studentFormStep === 4) && (
            <View style={styles.formSectionCard}>
              <View style={styles.formSectionHeader}>
                <View style={styles.formSectionIconBox}>
                  <MaterialCommunityIcons name="account-supervisor-outline" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formSectionTitle}>4. Data Wali & Tempat Tinggal</Text>
                  <Text style={styles.formSectionSubTitle}>Wali alternatif dan alamat domisili resmi siswa</Text>
                </View>
                <View style={styles.formSectionBadge}>
                  <Text style={styles.formSectionBadgeText}>Wali & Domisili</Text>
                </View>
              </View>

              {/* Sub-header Data Wali (Opsional) */}
              <View style={styles.formSubHeader}>
                <View style={styles.formSubHeaderLeft}>
                  <View style={styles.formSubHeaderIconWrap}>
                    <MaterialCommunityIcons name="account-supervisor-outline" size={16} color="#059669" />
                  </View>
                  <Text style={styles.formSubHeaderText}>DATA WALI (OPSIONAL)</Text>
                </View>
                <View style={[styles.formSubHeaderBadge, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
                  <Text style={[styles.formSubHeaderBadgeText, { color: '#64748B' }]}>Opsional</Text>
                </View>
              </View>

              {renderInputField({
                label: 'Nama Lengkap Wali',
                value: textField('nama_wali'),
                onChangeText: (v) => setField('nama_wali', v),
                icon: 'account-supervisor-outline',
                placeholder: 'Nama Lengkap Wali Siswa',
                hintText: 'Isi jika siswa diasuh atau tinggal bersama wali',
              })}

              {renderInputField({
                label: 'No. WA / HP Wali',
                value: textField('hp_wali'),
                onChangeText: (v) => setField('hp_wali', v),
                icon: 'whatsapp',
                keyboardType: 'numeric',
                placeholder: '08xxxxxxxxxx',
                helperText: 'WA Notifikasi',
                hintText: 'Nomor kontak aktif wali siswa yang dapat dihubungi sekolah',
              })}

              {renderInputField({
                label: 'NIK Wali Siswa (16 Digit)',
                value: textField('nik_wali'),
                onChangeText: (v) => setField('nik_wali', v),
                icon: 'card-account-details-outline',
                keyboardType: 'numeric',
                maxLength: 16,
                placeholder: '16 Digit NIK sesuai KTP / KK',
              })}

              {renderSelectField({
                label: 'Pekerjaan Wali',
                value: textField('pekerjaan_wali') || 'Wiraswasta',
                icon: 'briefcase-outline',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Pekerjaan Wali',
                    fieldKey: 'pekerjaan_wali',
                    options: pekerjaanOptions,
                  });
                },
              })}

              {/* Sub-header Alamat Tinggal */}
              <View style={[styles.formSubHeader, { marginTop: 14 }]}>
                <View style={styles.formSubHeaderLeft}>
                  <View style={styles.formSubHeaderIconWrap}>
                    <MaterialCommunityIcons name="home-map-marker" size={16} color="#059669" />
                  </View>
                  <Text style={styles.formSubHeaderText}>ALAMAT TEMPAT TINGGAL LENGKAP</Text>
                </View>
                <View style={styles.formSubHeaderBadge}>
                  <Text style={styles.formSubHeaderBadgeText}>Domisili</Text>
                </View>
              </View>

              {renderInputField({
                label: 'Alamat Tempat Tinggal Siswa',
                value: textField('address'),
                onChangeText: (v) => setField('address', v),
                icon: 'home-map-marker',
                placeholder: 'Jalan, No Rumah, RT/RW, Kelurahan, Kecamatan, Kota/Kabupaten',
                multiline: true,
                numberOfLines: 3,
                hintText: 'Sebutkan alamat lengkap tempat tinggal siswa saat ini untuk rayon dan penjemputan/transportasi.',
              })}

              {/* Navigasi Step 3 */}
              {studentFormStep === 3 && (
                <View style={styles.stepNavRow}>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStudentFormStep(2)}
                    style={styles.stepPrevSectionBtn}
                  >
                    <MaterialCommunityIcons name="arrow-left" size={18} color="#64748B" />
                    <Text style={styles.stepPrevSectionBtnText}>3. Orang Tua</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setStudentFormStep(4)}
                    style={[styles.stepNextSectionBtn, { flex: 1.5, marginTop: 0 }]}
                  >
                    <Text style={styles.stepNextSectionBtnText}>Tinjau Semua Section</Text>
                    <MaterialCommunityIcons name="check-all" size={18} color="#059669" />
                  </TouchableOpacity>
                </View>
              )}
            </View>
          )}
        </View>
      );
    }

    if (resource === 'employees') {
      const selectedUnitId = textField('unit_id');
      const selectedUnitName = availableUnits.find((u) => u.id === selectedUnitId)?.name || '';

      const selectedJabatanId = textField('jabatan_id');
      const selectedJabatanName = availablePositions.find((p) => p.id === selectedJabatanId)?.name || '';

      const currentStatusPegawai = textField('status_pegawai') || 'Tetap';
      const currentKeaktifan = textField('status') || 'Aktif';
      const currentKeaktifanObj = EMPLOYEE_ACTIVE_STATUS_OPTIONS.find((s) => s.id === currentKeaktifan);

      return (
        <View style={styles.formContainer}>
          {/* ── BAGIAN 1: IDENTITAS PEGAWAI ── */}
          <View style={styles.formSectionCard}>
            <View style={styles.formSectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <MaterialCommunityIcons name="badge-account-outline" size={18} color="#059669" />
                <Text style={styles.formSectionTitle}>Identitas Pegawai</Text>
              </View>
              <View style={styles.formSectionBadge}>
                <Text style={styles.formSectionBadgeText}>Biodata</Text>
              </View>
            </View>

            {renderInputField({
              label: 'Nama Lengkap Pegawai',
              value: textField('nama_lengkap'),
              onChangeText: (v) => setField('nama_lengkap', v),
              required: true,
              icon: 'account-outline',
              placeholder: 'Nama Lengkap Pegawai (tanpa gelar)',
            })}

            {renderInputField({
              label: 'Gelar Depan (Opsional)',
              value: textField('gelar_depan'),
              onChangeText: (v) => setField('gelar_depan', v),
              placeholder: 'Contoh: dr. / Drs. / Ust.',
              icon: 'school-outline',
            })}

            {renderInputField({
              label: 'Gelar Belakang (Opsional)',
              value: textField('gelar_belakang'),
              onChangeText: (v) => setField('gelar_belakang', v),
              placeholder: 'Contoh: S.Pd. / M.Pd. / Lc.',
              icon: 'school-outline',
            })}

            {renderInputField({
              label: 'NIY / NIP Pegawai',
              value: textField('niy'),
              onChangeText: (v) => setField('niy', v),
              icon: 'identifier',
              placeholder: 'Nomor Induk Yayasan',
            })}

            {renderInputField({
              label: 'NIK Pegawai (16 Digit)',
              value: textField('nik'),
              onChangeText: (v) => setField('nik', v),
              keyboardType: 'numeric',
              maxLength: 16,
              placeholder: '16 Digit NIK sesuai KTP / KK',
              icon: 'card-account-details-outline',
            })}

            {renderInputField({
              label: 'Nama Panggilan (Opsional)',
              value: textField('nama_panggilan'),
              onChangeText: (v) => setField('nama_panggilan', v),
              icon: 'account-outline',
              placeholder: 'Nama panggilan akrab',
            })}

            {/* Jenis Kelamin Toggle */}
            <View style={styles.formFieldGroup}>
              <View style={styles.formFieldHeaderRow}>
                <Text style={styles.formFieldLabelText}>
                  Jenis Kelamin <Text style={styles.formFieldRequiredStar}>*</Text>
                </Text>
                <Text style={styles.formFieldHelperText}>Pilih salah satu</Text>
              </View>
              <View style={styles.genderRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setField('jenis_kelamin', 'L')}
                  style={[
                    styles.genderBtn,
                    textField('jenis_kelamin') === 'L' ? styles.genderBtnActiveMale : styles.genderBtnInactive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="gender-male"
                    size={20}
                    color={textField('jenis_kelamin') === 'L' ? '#0284C7' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.genderBtnText,
                      textField('jenis_kelamin') === 'L' && styles.genderBtnTextActiveMale,
                    ]}
                  >
                    Laki-laki (L)
                  </Text>
                  {textField('jenis_kelamin') === 'L' && (
                    <MaterialCommunityIcons name="check-circle" size={16} color="#0284C7" />
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setField('jenis_kelamin', 'P')}
                  style={[
                    styles.genderBtn,
                    textField('jenis_kelamin') === 'P' ? styles.genderBtnActiveFemale : styles.genderBtnInactive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="gender-female"
                    size={20}
                    color={textField('jenis_kelamin') === 'P' ? '#EC4899' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.genderBtnText,
                      textField('jenis_kelamin') === 'P' && styles.genderBtnTextActiveFemale,
                    ]}
                  >
                    Perempuan (P)
                  </Text>
                  {textField('jenis_kelamin') === 'P' && (
                    <MaterialCommunityIcons name="check-circle" size={16} color="#EC4899" />
                  )}
                </TouchableOpacity>
              </View>
            </View>

            {renderInputField({
              label: 'Tempat Lahir',
              value: textField('tempat_lahir'),
              onChangeText: (v) => setField('tempat_lahir', v),
              placeholder: 'Kota / Tempat Kelahiran',
              icon: 'map-marker-outline',
            })}

            {renderInputField({
              label: 'Tanggal Lahir Pegawai',
              value: textField('tanggal_lahir'),
              onChangeText: (v) => setField('tanggal_lahir', v),
              placeholder: 'Contoh: 1985-08-17',
              icon: 'calendar-month-outline',
              helperText: 'YYYY-MM-DD',
              hintText: 'Format standar tanggal: Tahun-Bulan-Tanggal',
            })}

            {renderSelectField({
              label: 'Agama',
              value: textField('agama') || 'Islam',
              icon: 'book-open-page-variant-outline',
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Agama',
                  fieldKey: 'agama',
                  options: RELIGION_OPTIONS,
                });
              },
            })}
          </View>

          {/* ── BAGIAN 2: KEPEGAWAIAN & PENUGASAN ── */}
          <View style={styles.formSectionCard}>
            <View style={styles.formSectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <MaterialCommunityIcons name="briefcase-check-outline" size={18} color="#059669" />
                <Text style={styles.formSectionTitle}>Kepegawaian & Penugasan</Text>
              </View>
              <View style={styles.formSectionBadge}>
                <Text style={styles.formSectionBadgeText}>Jabatan</Text>
              </View>
            </View>

            {renderSelectField({
              label: 'Unit Pendidikan',
              value: selectedUnitName,
              placeholder: 'Pilih Unit Pendidikan...',
              icon: isUnitLocked ? 'lock-outline' : 'domain',
              disabled: isUnitLocked,
              helperText: isUnitLocked ? 'Unit otomatis terkunci sesuai unit tugas Anda' : undefined,
              onPress: () => {
                if (isUnitLocked) return;
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Unit Pendidikan',
                  fieldKey: 'unit_id',
                  options: availableUnits,
                });
              },
            })}

            {renderSelectField({
              label: 'Jabatan Pegawai',
              value: selectedJabatanName,
              placeholder: 'Pilih Jabatan Pegawai...',
              icon: 'briefcase-outline',
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Jabatan Pegawai',
                  fieldKey: 'jabatan_id',
                  options: availablePositions,
                });
              },
            })}

            {renderSelectField({
              label: 'Status Pegawai',
              value: textField('status_pegawai') || 'Tetap',
              icon: 'account-tie-outline',
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Status Pegawai',
                  fieldKey: 'status_pegawai',
                  options: employeeStatusOptions,
                });
              },
            })}

            {renderSelectField({
              label: 'Status Keaktifan Pegawai',
              value: currentKeaktifanObj?.name || 'Aktif',
              icon: 'account-clock-outline',
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Status Keaktifan',
                  fieldKey: 'status',
                  options: EMPLOYEE_ACTIVE_STATUS_OPTIONS,
                });
              },
            })}

            {renderInputField({
              label: 'Tanggal Masuk / TMT (YYYY-MM-DD)',
              value: textField('tanggal_masuk'),
              onChangeText: (v) => setField('tanggal_masuk', v),
              placeholder: 'Contoh: 2020-07-01',
              icon: 'calendar-range',
            })}
          </View>

          {/* ── BAGIAN 3: KONTAK & ALAMAT ── */}
          <View style={styles.formSectionCard}>
            <View style={styles.formSectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <MaterialCommunityIcons name="card-bulleted-settings-outline" size={18} color="#059669" />
                <Text style={styles.formSectionTitle}>Kontak & Alamat Pegawai</Text>
              </View>
              <View style={styles.formSectionBadge}>
                <Text style={styles.formSectionBadgeText}>Kontak</Text>
              </View>
            </View>

            {renderInputField({
              label: 'Nomor WhatsApp / HP Pegawai',
              value: textField('no_hp'),
              onChangeText: (v) => setField('no_hp', v),
              keyboardType: 'numeric',
              placeholder: '08xxxxxxxxxx',
              icon: 'whatsapp',
              helperText: 'WA Notifikasi',
            })}

            {renderInputField({
              label: 'Email Resmi Pegawai',
              value: textField('email'),
              onChangeText: (v) => setField('email', v),
              keyboardType: 'email-address',
              placeholder: 'pegawai@sekolah.sch.id',
              icon: 'email-outline',
            })}

            {renderInputField({
              label: 'Alamat Tinggal Domisili',
              value: textField('alamat'),
              onChangeText: (v) => setField('alamat', v),
              multiline: true,
              numberOfLines: 3,
              placeholder: 'Alamat lengkap domisili saat ini',
              icon: 'home-map-marker',
            })}
          </View>
        </View>
      );
    }

    if (resource === 'units') {
      const currentLevel = textField('level') || 'SD';
      const selectedLevelName = unitLevelOptions.find((l) => l.id === currentLevel)?.name || UNIT_LEVEL_OPTIONS.find((l) => l.id === currentLevel)?.name || currentLevel;

      return (
        <View style={styles.formContainer}>
          <View style={styles.formSectionCard}>
            <View style={styles.formSectionHeader}>
              <MaterialCommunityIcons name="domain" size={18} color="#059669" />
              <Text style={styles.formSectionTitle}>Informasi Unit</Text>
            </View>

            {renderInputField({
              label: 'Nama Unit Pendidikan',
              value: textField('name'),
              onChangeText: (v) => setField('name', v),
              required: true,
              icon: 'domain',
              placeholder: 'Contoh: SD IT Dar el-Iman',
            })}

            {renderInputField({
              label: 'Kode Unit (Opsional)',
              value: textField('code'),
              onChangeText: (v) => setField('code', v),
              icon: 'identifier',
              placeholder: 'Contoh: SDIT',
            })}

            {renderSelectField({
              label: 'Jenjang Pendidikan',
              value: selectedLevelName,
              icon: 'layers-outline',
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Jenjang',
                  fieldKey: 'level',
                  options: unitLevelOptions,
                });
              },
            })}

            {renderInputField({
              label: 'Keterangan Unit',
              value: textField('description'),
              onChangeText: (v) => setField('description', v),
              multiline: true,
              numberOfLines: 3,
              icon: 'text-box-outline',
              placeholder: 'Deskripsi singkat unit pendidikan',
            })}
          </View>
        </View>
      );
    }

    if (resource === 'positions') {
      const currentLevel = textField('level_jabatan') || '7';
      const selectedLevelName = JABATAN_LEVEL_OPTIONS.find((l) => l.id === currentLevel)?.name || `Level ${currentLevel}`;

      const currentSatuan = textField('satuan_kerja') || 'Unit Pendidikan';
      const selectedSatuanName = JABATAN_SATUAN_KERJA_OPTIONS.find((s) => s.id === currentSatuan)?.name || currentSatuan;

      const currentScope = textField('scope_akses') || 'unit_sendiri';
      const selectedScopeName = JABATAN_SCOPE_AKSES_OPTIONS.find((s) => s.id === currentScope)?.name || currentScope;

      const currentStatus = textField('status') || 'Aktif';
      const selectedStatusName = JABATAN_STATUS_OPTIONS.find((s) => s.id === currentStatus)?.name || currentStatus;

      return (
        <View style={styles.formContainer}>
          <View style={styles.formSectionCard}>
            <View style={styles.formSectionHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
                <MaterialCommunityIcons name="badge-account-horizontal-outline" size={18} color="#0891B2" />
                <Text style={styles.formSectionTitle}>Informasi Master Jabatan</Text>
              </View>
              <View style={[styles.formSectionBadge, { backgroundColor: '#ECFEFF' }]}>
                <Text style={[styles.formSectionBadgeText, { color: '#0891B2' }]}>Struktur</Text>
              </View>
            </View>

            {renderInputField({
              label: 'Nama Jabatan',
              value: textField('nama_jabatan'),
              onChangeText: (v) => setField('nama_jabatan', v),
              required: true,
              icon: 'badge-account-horizontal-outline',
              placeholder: 'Contoh: Guru Matematika / Kaur Kesiswaan',
            })}

            {renderInputField({
              label: 'Kode Jabatan',
              value: textField('kode_jabatan'),
              onChangeText: (v) => setField('kode_jabatan', v.toUpperCase()),
              required: true,
              icon: 'identifier',
              placeholder: 'Contoh: GUR-MAT / WAKA-KUR',
            })}

            {renderSelectField({
              label: 'Level Jabatan & Hierarki',
              value: selectedLevelName,
              icon: 'stairs-up',
              required: true,
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Level Jabatan',
                  fieldKey: 'level_jabatan',
                  options: JABATAN_LEVEL_OPTIONS,
                });
              },
            })}

            {renderSelectField({
              label: 'Satuan Kerja / Unit Organisasi',
              value: selectedSatuanName,
              icon: 'domain',
              required: true,
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Satuan Kerja',
                  fieldKey: 'satuan_kerja',
                  options: JABATAN_SATUAN_KERJA_OPTIONS,
                });
              },
            })}

            {renderSelectField({
              label: 'Scope Hak Akses Data',
              value: selectedScopeName,
              icon: 'shield-account-outline',
              required: true,
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Scope Hak Akses',
                  fieldKey: 'scope_akses',
                  options: JABATAN_SCOPE_AKSES_OPTIONS,
                });
              },
            })}

            {renderSelectField({
              label: 'Status Jabatan',
              value: selectedStatusName,
              icon: 'check-circle-outline',
              required: true,
              onPress: () => {
                setPickerSearch('');
                setPickerModal({
                  visible: true,
                  title: 'Pilih Status Jabatan',
                  fieldKey: 'status',
                  options: JABATAN_STATUS_OPTIONS,
                });
              },
            })}

            {renderInputField({
              label: 'Deskripsi / Uraian Tugas (Opsional)',
              value: textField('deskripsi'),
              onChangeText: (v) => setField('deskripsi', v),
              multiline: true,
              numberOfLines: 3,
              icon: 'text-box-outline',
              placeholder: 'Uraian tugas pokok dan fungsi (tupoksi) jabatan ini',
            })}
          </View>
        </View>
      );
    }

    const selectedUnitId = textField('unit_pendidikan_id');
    const selectedUnitName = availableUnits.find((u) => u.id === selectedUnitId)?.name || '';

    const selectedAyId = textField('tahun_ajaran_id');
    const selectedAyName = availableAcademicYears.find((a) => a.id === selectedAyId)?.name || activeAcademicYearName || '';

    const selectedSemId = textField('semester_id');
    const selectedSemName = availableSemesters.find((s) => s.id === selectedSemId)?.name || '';

    const selectedJenjang = textField('jenjang') || availableUnits.find((u) => u.id === selectedUnitId)?.level || '';
    const selectedJenjangName = CLASS_JENJANG_OPTIONS.find((j) => j.id === selectedJenjang)?.name || (selectedJenjang ? selectedJenjang : 'Pilih Jenjang...');

    const selectedTingkat = textField('tingkat') || '1';
    const selectedTingkatName = CLASS_TINGKAT_OPTIONS.find((t) => t.id === selectedTingkat)?.name || `Tingkat ${selectedTingkat}`;

    const selectedWaliId = textField('wali_kelas_id');
    const selectedWaliName = availableTeachers.find((t) => t.id === selectedWaliId)?.name || '';

    const selectedStatus = textField('status') || 'Aktif';

    return (
      <View style={styles.formContainer}>
        {/* Section 1: Informasi Pokok Rombel */}
        <View style={styles.formSectionCard}>
          <View style={styles.formSectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
              <Text style={styles.formSectionTitle}>Informasi Pokok Rombel / Kelas</Text>
            </View>
            <View style={styles.formSectionBadge}>
              <Text style={styles.formSectionBadgeText}>Rombel</Text>
            </View>
          </View>

          {renderInputField({
            label: 'Nama Rombel / Kelas',
            value: textField('nama_kelas'),
            onChangeText: (v) => setField('nama_kelas', v),
            required: true,
            icon: 'google-classroom',
            placeholder: 'Contoh: Kelas 1 Abu Bakar',
          })}

          {renderInputField({
            label: 'Kode Kelas',
            value: textField('kode_kelas'),
            onChangeText: (v) => setField('kode_kelas', v.toUpperCase()),
            required: true,
            icon: 'identifier',
            placeholder: 'Contoh: 1-ABU',
          })}

          {renderSelectField({
            label: 'Unit Pendidikan',
            value: selectedUnitName,
            placeholder: 'Pilih Unit Pendidikan...',
            required: true,
            icon: isUnitLocked ? 'lock-outline' : 'domain',
            disabled: isUnitLocked,
            helperText: isUnitLocked ? 'Unit otomatis terkunci sesuai unit tugas Anda' : undefined,
            onPress: () => {
              if (isUnitLocked) return;
              setPickerSearch('');
              setPickerModal({
                visible: true,
                title: 'Pilih Unit Pendidikan',
                fieldKey: 'unit_pendidikan_id',
                options: availableUnits,
              });
            },
          })}

          {renderSelectField({
            label: 'Jenjang Pendidikan',
            value: selectedJenjangName,
            placeholder: 'Pilih Jenjang...',
            required: true,
            icon: 'layers-outline',
            onPress: () => {
              setPickerSearch('');
              setPickerModal({
                visible: true,
                title: 'Pilih Jenjang Pendidikan',
                fieldKey: 'jenjang',
                options: CLASS_JENJANG_OPTIONS,
              });
            },
          })}

          {renderSelectField({
            label: 'Tingkat Kelas',
            value: selectedTingkatName,
            placeholder: 'Pilih Tingkat...',
            required: true,
            icon: 'numeric',
            onPress: () => {
              setPickerSearch('');
              setPickerModal({
                visible: true,
                title: 'Pilih Tingkat Kelas',
                fieldKey: 'tingkat',
                options: CLASS_TINGKAT_OPTIONS,
              });
            },
          })}
        </View>

        {/* Section 2: Penugasan & Kalender Akademik */}
        <View style={styles.formSectionCard}>
          <View style={styles.formSectionHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flex: 1 }}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={18} color="#059669" />
              <Text style={styles.formSectionTitle}>Penugasan & Kalender Akademik</Text>
            </View>
            <View style={[styles.formSectionBadge, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <Text style={[styles.formSectionBadgeText, { color: '#047857' }]}>Akademik</Text>
            </View>
          </View>

          {renderSelectField({
            label: 'Tahun Ajaran Aktif',
            value: selectedAyName,
            placeholder: 'Pilih Tahun Ajaran...',
            required: true,
            icon: 'calendar-range',
            onPress: () => {
              setPickerSearch('');
              setPickerModal({
                visible: true,
                title: 'Pilih Tahun Ajaran',
                fieldKey: 'tahun_ajaran_id',
                options: availableAcademicYears.map((ay) => ({
                  id: ay.id,
                  name: ay.name,
                  subtitle: ay.is_active ? 'Tahun Ajaran Aktif' : undefined,
                })),
              });
            },
          })}

          {availableSemesters.length > 0 && renderSelectField({
            label: 'Semester',
            value: selectedSemName,
            placeholder: 'Pilih Semester...',
            required: true,
            icon: 'calendar-text-outline',
            onPress: () => {
              setPickerSearch('');
              setPickerModal({
                visible: true,
                title: 'Pilih Semester',
                fieldKey: 'semester_id',
                options: availableSemesters.map((s) => ({
                  id: s.id,
                  name: s.name,
                  subtitle: s.is_active ? 'Semester Aktif' : undefined,
                })),
              });
            },
          })}

          {renderSelectField({
            label: 'Wali Kelas / Guru Pengampu (Opsional)',
            value: selectedWaliName,
            placeholder: 'Pilih Guru / Pegawai...',
            icon: 'account-tie-outline',
            onPress: () => {
              setPickerSearch('');
              const filteredTeachers = selectedUnitId
                ? availableTeachers.filter((t) => !t.unit_id || t.unit_id === selectedUnitId)
                : availableTeachers;
              setPickerModal({
                visible: true,
                title: 'Pilih Wali Kelas',
                fieldKey: 'wali_kelas_id',
                options: [
                  { id: '', name: '— Belum Ditugaskan / Kosongkan —' },
                  ...filteredTeachers,
                ],
              });
            },
          })}

          {renderInputField({
            label: 'Ruangan Kelas (Opsional)',
            value: textField('ruangan'),
            onChangeText: (v) => setField('ruangan', v),
            icon: 'door',
            placeholder: 'Contoh: Gedung A Lt. 2 R. 201',
          })}

          {renderInputField({
            label: 'Kapasitas Maksimal Siswa',
            value: textField('kapasitas'),
            onChangeText: (v) => setField('kapasitas', v),
            required: true,
            keyboardType: 'numeric',
            icon: 'account-group-outline',
            placeholder: 'Contoh: 30',
          })}

          {renderSelectField({
            label: 'Status Rombel',
            value: selectedStatus,
            icon: 'shield-check-outline',
            onPress: () => {
              setPickerSearch('');
              setPickerModal({
                visible: true,
                title: 'Pilih Status Rombel',
                fieldKey: 'status',
                options: CLASS_STATUS_OPTIONS,
              });
            },
          })}
        </View>
      </View>
    );
  };

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const currentTheme = TAB_THEMES[resource];

  return (
    <View style={styles.screen}>
      {/* ── Background Image & Gradient Identik Halaman Utama (Layer Belakang) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien berbasis warna #18A165 identik dengan Halaman Utama */}
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

      {/* ── TOP BAR & HEADER IDENTIK HALAMAN UTAMA (FLOATING CLEAN DI ATAS BACKGROUND MASJID) ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleGoBack}
            style={styles.backButton}
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color="#064E3B" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <MaterialCommunityIcons name="database-check" size={12} color="#047857" />
              <Text style={styles.headerBadgeText}>PUSAT DATA MASTER TERPADU</Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              Data {resourceLabels[resource]}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => setRekapPrintModalVisible(true)}
              style={styles.refreshButton}
              accessibilityLabel="Cetak Rekap"
            >
              <MaterialCommunityIcons name="printer-outline" size={20} color="#064E3B" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                void load();
              }}
              style={styles.refreshButton}
              accessibilityLabel="Muat Ulang"
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar langsung di Header */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
          <NativeTextInput
            style={styles.searchInput}
            placeholder={`Cari nama, NIS, NIP ${resourceLabels[resource].toLowerCase()}...`}
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setQuery(search.trim())}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setQuery(''); }}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* 3 KPI Cards Row (Harmonisasi Mutasi Siswa & TAILGRIDS_ALUMNI_MUTASI_CARDS) */}
        <View style={styles.kpiCardsRow}>
          {[resourceStats.kpi1, resourceStats.kpi2, resourceStats.kpi3].map((kpi, idx) => (
            <View key={idx} style={[styles.kpiBox, { borderColor: kpi.border }]}>
              <LinearGradient colors={kpi.bg as [string, string]} style={styles.kpiBoxGradient}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconSquare, { backgroundColor: kpi.color }]}>
                    <MaterialCommunityIcons name={kpi.icon as any} size={14} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiVal, { color: kpi.color }]}>{kpi.value}</Text>
                </View>
                <Text style={[styles.kpiLbl, { color: kpi.color }]} numberOfLines={1}>{kpi.label}</Text>
                <Text style={styles.kpiSub} numberOfLines={1}>{kpi.sub}</Text>
              </LinearGradient>
            </View>
          ))}
        </View>
      </View>

      {/* ── SEGMENTED SUB-TABS (Tepat di bawah Header) ── */}
      <View style={styles.segmentContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.segmentScroll}>
          {MAIN_TABS.map((itemKey) => {
            const isActive = resource === itemKey;
            const theme = TAB_THEMES[itemKey];
            const count = itemKey === resource ? items.length : undefined;
            return (
              <TouchableOpacity
                key={itemKey}
                activeOpacity={0.8}
                onPress={() => {
                  setResource(itemKey);
                  setQuery('');
                  setSearch('');
                  setFilterStatus('all');
                  setFilterGender('all');
                }}
                style={[
                  styles.segmentBtn,
                  isActive && { backgroundColor: theme.activeColors[0] },
                ]}
              >
                <MaterialCommunityIcons
                  name={theme.icon as any}
                  size={16}
                  color={isActive ? '#FFFFFF' : '#64748B'}
                />
                <Text style={[styles.segmentBtnText, isActive && styles.segmentBtnTextActive]}>
                  {theme.label} {count !== undefined ? `(${count})` : ''}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── KONTEN UTAMA SCROLLVIEW ── */}
      <ScrollView
        contentContainerStyle={[styles.content, (isSelectMode || (showScrollFab && canCreate)) && { paddingBottom: 220 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); void load(); }} colors={[currentTheme.activeColors[0]]} />}
        onScroll={(e) => {
          const offsetY = e.nativeEvent.contentOffset.y;
          const shouldShow = offsetY > 200;
          if (shouldShow !== showScrollFab) handleScrollFab(shouldShow);
        }}
        scrollEventThrottle={16}
      >
        {/* ── FILTER CARD: FILTER KATEGORI & STATUS (BERSIH & RINGKAS) ── */}
        <View style={styles.filterCard}>
          <View style={styles.filterCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="filter-variant" size={17} color={currentTheme.activeColors[0]} />
              <Text style={styles.filterCardTitle}>Filter Data {resourceLabels[resource]}</Text>
            </View>
            {(filterKelas !== 'all' || filterJabatan !== 'all' || filterTingkat !== 'all' || filterStatus !== 'all' || filterGender !== 'all' || search.length > 0) ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setFilterKelas('all');
                  setFilterJabatan('all');
                  setFilterTingkat('all');
                  setFilterStatus('all');
                  setFilterGender('all');
                  setSearch('');
                  setQuery('');
                }}
              >
                <Text style={styles.filterResetBtn}>Reset Filter</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* Dropdown Filter (Kelas / Jabatan / Tingkat) */}
          {resource !== 'positions' && (
            <>
              <Text style={styles.filterLabel}>
                {resource === 'students' ? 'Pilih Rombel / Kelas' : resource === 'employees' ? 'Pilih Jabatan Pegawai' : 'Pilih Tingkat / Jenjang'}
              </Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setDropdownSearch('');
                  setFilterDropdownOpen(true);
                }}
                style={styles.dropdownTrigger}
              >
                <View style={styles.dropdownTriggerLeft}>
                  <View style={styles.dropdownTriggerIconBox}>
                    <MaterialCommunityIcons
                      name={
                        resource === 'students'
                          ? 'google-classroom'
                          : resource === 'employees'
                            ? 'badge-account-outline'
                            : 'layers-outline'
                      }
                      size={18}
                      color={currentTheme.activeColors[0]}
                    />
                  </View>
                  <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                    {activeDropdownLabel}
                  </Text>
                </View>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
              </TouchableOpacity>
            </>
          )}

          {/* Status Filter Pills */}
          <Text style={[styles.filterLabel, { marginTop: resource === 'positions' ? 0 : 12 }]}>Status {resourceLabels[resource]}</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {(resource === 'students'
              ? [
                  { id: 'all', label: 'Semua Status', icon: 'account-group' },
                  { id: 'aktif', label: 'Aktif', icon: 'account-check' },
                  { id: 'mutasi', label: 'Mutasi', icon: 'swap-horizontal' },
                  { id: 'lulus', label: 'Alumni / Tamat', icon: 'school' },
                  { id: 'berhenti', label: 'Non-aktif', icon: 'account-off' },
                ]
              : resource === 'employees'
                ? [
                    { id: 'all', label: 'Semua SDM', icon: 'account-group' },
                    { id: 'guru', label: 'Guru Pengajar', icon: 'account-tie' },
                    { id: 'tendik', label: 'Tenaga Kependidikan', icon: 'account-check' },
                    { id: 'aktif', label: 'Pegawai Aktif', icon: 'checkbox-marked-circle-outline' },
                  ]
                : resource === 'positions'
                  ? [
                      { id: 'all', label: 'Semua Jabatan', icon: 'badge-account-outline' },
                      { id: 'aktif', label: 'Aktif', icon: 'check-circle' },
                      { id: 'nonaktif', label: 'Nonaktif', icon: 'close-circle' },
                      { id: 'unit', label: 'Scope Unit', icon: 'domain' },
                      { id: 'global', label: 'Scope Global', icon: 'shield-account' },
                    ]
                  : [
                      { id: 'all', label: 'Semua Kelas', icon: 'google-classroom' },
                      { id: 'aktif', label: 'Aktif', icon: 'check-circle' },
                      { id: 'nonaktif', label: 'Nonaktif', icon: 'close-circle' },
                    ]
            ).map((st) => {
              const isActive = filterStatus === st.id;
              return (
                <TouchableOpacity
                  key={st.id}
                  activeOpacity={0.8}
                  onPress={() => setFilterStatus(st.id)}
                  style={[
                    styles.filterPill,
                    isActive && { backgroundColor: currentTheme.activeColors[0], borderColor: currentTheme.activeColors[0] },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={st.icon as any}
                    size={14}
                    color={isActive ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 5 }}
                  />
                  <Text style={[
                    styles.filterPillText,
                    isActive && styles.filterPillTextActive,
                  ]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Gender Filter Pills (untuk Siswa & Pegawai) */}
          {(resource === 'students' || resource === 'employees') && (
            <>
              <Text style={[styles.filterLabel, { marginTop: 10 }]}>Jenis Kelamin</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 2 }}>
                {[
                  { key: 'all', label: 'Semua Gender' },
                  { key: 'L', label: 'Laki-laki (L)' },
                  { key: 'P', label: 'Perempuan (P)' },
                ].map((opt) => (
                  <TouchableOpacity
                    key={opt.key}
                    activeOpacity={0.8}
                    onPress={() => setFilterGender(opt.key)}
                    style={[
                      styles.filterPill,
                      filterGender === opt.key && { backgroundColor: currentTheme.activeColors[0], borderColor: currentTheme.activeColors[0] },
                    ]}
                  >
                    <Text style={[
                      styles.filterPillText,
                      filterGender === opt.key && styles.filterPillTextActive,
                    ]}>
                      {opt.label}
                    </Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </>
          )}

          {/* Baris Mode Seleksi (Pilih Banyak) */}
          {canDelete && (
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                if (isSelectMode) {
                  setIsSelectMode(false);
                  setSelectedIds(new Set());
                } else {
                  setIsSelectMode(true);
                }
              }}
              style={[styles.bulkModeToggleBtn, isSelectMode && styles.bulkModeToggleBtnActive]}
            >
              <View style={[styles.bulkModeIconBox, isSelectMode && styles.bulkModeIconBoxActive]}>
                <MaterialCommunityIcons
                  name={isSelectMode ? 'close' : 'checkbox-multiple-marked-outline'}
                  size={15}
                  color={isSelectMode ? '#FFFFFF' : currentTheme.activeColors[0]}
                />
              </View>
              <Text style={[styles.bulkModeToggleText, isSelectMode && styles.bulkModeToggleTextActive]} numberOfLines={1}>
                {isSelectMode ? 'Batalkan Mode Seleksi' : 'Mode Seleksi (Pilih Banyak)'}
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── PEMBERITAHUAN / NOTIFIKASI SISWA PINDAHAN MASUK (TWO-WAY HANDSHAKE TU) ── */}
        {resource === 'students' && !isSelectMode && (() => {
          const hasPending = incomingMutations.length > 0;
          return (
            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => {
                void loadIncomingMutations();
                setIncomingModalVisible(true);
              }}
              style={[
                styles.incomingNoticeCard,
                hasPending ? styles.incomingNoticeCardAlert : styles.incomingNoticeCardNormal,
              ]}
            >
              <LinearGradient
                colors={
                  hasPending
                    ? ['#FFF1F2', '#FFF7ED', '#FFFFFF']
                    : ['#F0FDFA', '#F0FDF4', '#FFFFFF']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.incomingNoticeGradient}
              >
                {/* Garis Aksen Gradasi Atas */}
                <View
                  style={[
                    styles.incomingTopLine,
                    { backgroundColor: hasPending ? '#F43F5E' : '#0D9488' },
                  ]}
                />

                <View style={styles.incomingNoticeBody}>
                  {/* Squircle 3D Icon Badge */}
                  <View style={styles.incomingIconWrapper}>
                    <LinearGradient
                      colors={
                        hasPending
                          ? ['#F43F5E', '#E11D48', '#BE123C']
                          : ['#0D9488', '#0F766E', '#047857']
                      }
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.incomingIconBadge}
                    >
                      <MaterialCommunityIcons
                        name={hasPending ? 'bell-ring-outline' : 'swap-horizontal-bold'}
                        size={20}
                        color="#FFFFFF"
                      />
                    </LinearGradient>
                    {hasPending && <View style={styles.incomingPulseDot} />}
                  </View>

                  {/* Text Content */}
                  <View style={styles.incomingNoticeTextCol}>
                    <View style={styles.incomingNoticeTitleRow}>
                      <Text style={styles.incomingNoticeTitle}>
                        Pemberitahuan Pindahan Masuk
                      </Text>
                      <View
                        style={[
                          styles.incomingNoticeStatusBadge,
                          hasPending
                            ? styles.incomingNoticeStatusBadgeAlert
                            : styles.incomingNoticeStatusBadgeNormal,
                        ]}
                      >
                        <Text
                          style={[
                            styles.incomingNoticeStatusBadgeText,
                            hasPending
                              ? styles.incomingNoticeStatusBadgeTextAlert
                              : styles.incomingNoticeStatusBadgeTextNormal,
                          ]}
                        >
                          {hasPending ? 'Perlu Tindakan' : 'Antrean'}
                        </Text>
                      </View>
                    </View>

                    <Text style={styles.incomingNoticeSubtitle} numberOfLines={1}>
                      {hasPending
                        ? `${incomingMutations.length} permohonan mutasi menunggu validasi TU`
                        : 'Tidak ada permohonan baru • Ketuk untuk riwayat'}
                    </Text>
                  </View>

                  {/* Right Action / Counter Badge */}
                  <View style={styles.incomingNoticeRightCol}>
                    {hasPending ? (
                      <View style={styles.incomingCounterPill}>
                        <Text style={styles.incomingCounterPillText}>
                          {incomingMutations.length}
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.incomingCheckmarkPill}>
                        <MaterialCommunityIcons name="check" size={12} color="#059669" />
                      </View>
                    )}
                    <MaterialCommunityIcons
                      name="chevron-right"
                      size={18}
                      color={hasPending ? '#E11D48' : '#059669'}
                    />
                  </View>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        })()}

        {/* ── DAFTAR RINCIAN DATA (LIST CARD BERSIH SEPERTI REKAP SISWA) ── */}
        <View style={styles.listCard}>
          <View style={styles.listHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <MaterialCommunityIcons name="format-list-bulleted" size={17} color="#059669" />
              <Text style={styles.listHeaderTitle}>
                Daftar Rincian {resourceLabels[resource]}
              </Text>
              <View style={styles.listCountBadge}>
                <Text style={styles.listCountBadgeText}>{filteredItems.length} Data</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setRekapPrintModalVisible(true)}
              style={styles.printTriggerBtn}
            >
              <MaterialCommunityIcons name="printer-eye" size={15} color="#059669" />
              <Text style={styles.printTriggerBtnText}>Cetak</Text>
            </TouchableOpacity>
          </View>

          {error ? (
            <View style={styles.error}>
              <Text style={styles.errorText}>{error}</Text>
              <Button compact onPress={() => void load()}>Coba lagi</Button>
            </View>
          ) : null}

          {loading ? (
            <View style={{ padding: 36, alignItems: 'center' }}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={{ marginTop: 10, color: '#64748B', fontSize: 13, fontWeight: '600' }}>
                Memuat data {resourceLabels[resource].toLowerCase()}...
              </Text>
            </View>
          ) : filteredItems.length === 0 ? (
            <View style={{ padding: 36, alignItems: 'center' }}>
              <MaterialCommunityIcons name="account-search-outline" size={44} color="#CBD5E1" />
              <Text style={{ marginTop: 10, color: '#0F172A', fontSize: 14, fontWeight: '700' }}>
                Belum ada data yang cocok
              </Text>
              <Text style={{ marginTop: 4, color: '#94A3B8', fontSize: 12.5, textAlign: 'center', maxWidth: 280 }}>
                Tidak ada data {resourceLabels[resource].toLowerCase()} yang sesuai dengan filter atau kata kunci pencarian.
              </Text>
            </View>
          ) : (
            <>
              {/* Tracer Study & Alumni Stats Card (Harmonized with TAILGRIDS_ALUMNI_MUTASI_CARDS) */}
              {resource === 'students' && (filterStatus === 'lulus' || filterStatus === 'alumni') && (
                <View style={styles.alumniSummaryCard}>
                  <View style={styles.alumniSummaryHeader}>
                    <View style={styles.alumniIconBox}>
                      <MaterialCommunityIcons name="school" size={20} color="#D97706" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.alumniSummaryTitle}>Kelola Alumni & Tracer Study</Text>
                      <Text style={styles.alumniSummarySub}>
                        Total {filteredItems.length} Alumni Terdata · Penelusuran Tujuan Lanjut
                      </Text>
                    </View>
                  </View>
                  {/* Mini breakdown tracer destinations */}
                  <View style={styles.alumniDestRow}>
                    <View style={styles.alumniDestBadge}>
                      <MaterialCommunityIcons name="bank" size={12} color="#2563EB" />
                      <Text style={styles.alumniDestText}>
                        PTN/Univ: {filteredItems.filter((s) => {
                          const dest = String(s.metadata?.tujuan_lanjut || s.tujuan_lanjut || '').toLowerCase();
                          return dest.includes('ptn') || dest.includes('universitas') || dest.includes('kuliah') || dest.includes('kampus') || dest.includes('negeri');
                        }).length}
                      </Text>
                    </View>
                    <View style={[styles.alumniDestBadge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                      <MaterialCommunityIcons name="school-outline" size={12} color="#059669" />
                      <Text style={[styles.alumniDestText, { color: '#047857' }]}>
                        Sekolah Lanjut: {filteredItems.filter((s) => {
                          const dest = String(s.metadata?.tujuan_lanjut || s.tujuan_lanjut || '').toLowerCase();
                          return dest.includes('sma') || dest.includes('smk') || dest.includes('ma ') || dest.includes('pesantren') || dest.includes('pondok');
                        }).length}
                      </Text>
                    </View>
                    <View style={[styles.alumniDestBadge, { backgroundColor: '#FFF7ED', borderColor: '#FED7AA' }]}>
                      <MaterialCommunityIcons name="briefcase-outline" size={12} color="#EA580C" />
                      <Text style={[styles.alumniDestText, { color: '#C2410C' }]}>
                        Karir/Kerja: {filteredItems.filter((s) => {
                          const dest = String(s.metadata?.tujuan_lanjut || s.tujuan_lanjut || '').toLowerCase();
                          return dest.includes('kerja') || dest.includes('usaha') || dest.includes('bisnis') || dest.includes('wirausaha');
                        }).length}
                      </Text>
                    </View>
                  </View>
                </View>
              )}

              {/* Mutasi Siswa Overview Card (Harmonized with TAILGRIDS_ALUMNI_MUTASI_CARDS) */}
              {resource === 'students' && filterStatus === 'mutasi' && (
                <View style={styles.mutasiSummaryCard}>
                  <View style={styles.mutasiSummaryHeader}>
                    <View style={styles.mutasiIconBox}>
                      <MaterialCommunityIcons name="account-switch" size={20} color="#7C3AED" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={styles.mutasiSummaryTitle}>Daftar Mutasi Siswa</Text>
                      <Text style={styles.mutasiSummarySub}>
                        Total {filteredItems.length} Siswa Terdaftar Mutasi · Pindah Masuk & Keluar
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setFilterStatus('all')}
                      style={styles.mutasiResetBadge}
                    >
                      <MaterialCommunityIcons name="close-circle-outline" size={13} color="#64748B" />
                      <Text style={styles.mutasiResetText}>Semua Siswa</Text>
                    </TouchableOpacity>
                  </View>
                  {/* Mini breakdown mutasi */}
                  <View style={styles.mutasiDestRow}>
                    <View style={styles.mutasiDestBadge}>
                      <MaterialCommunityIcons name="arrow-top-right-bold-box-outline" size={12} color="#7C3AED" />
                      <Text style={styles.mutasiDestText}>
                        Pindah Unit/Keluar: {filteredItems.length}
                      </Text>
                    </View>
                    {incomingMutations.length > 0 && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          void loadIncomingMutations();
                          setIncomingModalVisible(true);
                        }}
                        style={[styles.mutasiDestBadge, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}
                      >
                        <MaterialCommunityIcons name="bell-ring-outline" size={12} color="#E11D48" />
                        <Text style={[styles.mutasiDestText, { color: '#BE123C' }]}>
                          Antrean Masuk: {incomingMutations.length}
                        </Text>
                      </TouchableOpacity>
                    )}
                  </View>
                </View>
              )}
              {visibleItems.map((item, idx) => {
                const title = displayName(item);
                const itemId = String(item.id || title);
                const isSelected = selectedIds.has(itemId);
                const currentTheme = TAB_THEMES[resource];

                const parentPhone = item?.parent_phone || item?.telepon_ortu || item?.no_hp_ortu || item?.parent?.phone;
                const cleanParentPhone = parentPhone ? String(parentPhone).replace(/[^0-9]/g, '').replace(/^0/, '62') : '';

                const empPhone = item?.no_hp || item?.phone;
                const cleanEmpPhone = empPhone ? String(empPhone).replace(/[^0-9]/g, '').replace(/^0/, '62') : '';

                // Metadata extraction
                const codeLabel = resource === 'students' ? 'NIS' : resource === 'employees' ? 'NIY/NIP' : resource === 'positions' ? 'Kode' : 'Kode';
                const codeVal = resource === 'students'
                  ? (item.nis || item.nisn || '-')
                  : resource === 'employees'
                    ? (item.niy || item.nip || item.nik || '-')
                    : resource === 'positions'
                      ? (item.kode_jabatan || item.code || '-')
                      : (item.kode_kelas || item.code || '-');

                const genderVal = normalizedGender(item.gender || item.jenis_kelamin || item.jk, resource);
                const unitVal = nestedName(item.education_unit || item.educationUnit || item.unit || item.unit_pendidikan);
                const secondaryVal = resource === 'students'
                  ? nestedName(item.kelas)
                  : resource === 'employees'
                    ? nestedName(item.position || item.jabatan)
                    : resource === 'positions'
                      ? (item.satuan_kerja || (item.level_jabatan ? `Level ${item.level_jabatan}` : ''))
                      : (item.tingkat ? `Tingkat ${item.tingkat}` : (item.students_count ? `${item.students_count} Siswa` : ''));

                const classExtraVal = resource === 'classes'
                  ? (item.kapasitas ? `Kapasitas: ${item.kapasitas}` : (item.wali_kelas?.nama || item.waliKelas?.nama ? `Wali: ${nestedName(item.wali_kelas || item.waliKelas)}` : ''))
                  : '';

                // Status styling (Harmonized with Rekap Siswa)
                const statusRaw = String(item.status || item.status_siswa || item.status_pegawai || (item.is_active !== false && item.aktif !== false ? 'aktif' : 'nonaktif')).toLowerCase();
                const isAlumni = statusRaw.includes('alumni') || statusRaw.includes('lulus');
                const isMutasi = statusRaw.includes('mutasi');
                const isNonaktif = statusRaw.includes('nonaktif') || statusRaw.includes('berhenti') || item.aktif === false || item.is_active === false;
                
                const badgeBg = isAlumni ? '#FEF9EC' : isMutasi ? '#FAF5FF' : isNonaktif ? '#FFF1F2' : '#ECFDF5';
                const badgeColor = isAlumni ? '#D97706' : isMutasi ? '#7C3AED' : isNonaktif ? '#E11D48' : '#059669';
                const badgeLabel = isAlumni ? 'Alumni' : isMutasi ? 'Mutasi' : isNonaktif ? 'Non-aktif' : 'Aktif';

                const initials = (title || 'S').trim().split(' ').slice(0, 2).map((w: string) => w[0]).join('').toUpperCase();
                const itemMeta = (item?.metadata && typeof item.metadata === 'object') ? item.metadata : {};
                const rawPhotoCandidate =
                  item?.photo_url ||
                  item?.avatar_url ||
                  item?.photo ||
                  item?.photo_thumb ||
                  item?.foto_url ||
                  item?.foto ||
                  item?.avatar ||
                  itemMeta?.photo_url ||
                  itemMeta?.photo ||
                  itemMeta?.foto ||
                  itemMeta?.avatar ||
                  item?.user?.photo_url ||
                  item?.user?.avatar ||
                  item?.user?.photo;
                const photoUrl = getProfileImageUrl(item) || resolveMediaUrl(rawPhotoCandidate);

                return (
                  <View
                    key={itemId || idx}
                    style={[
                      styles.mutationCard,
                      isSelected && styles.studentCardSelected,
                    ]}
                  >
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => {
                        if (isSelectMode) {
                          toggleSelect(itemId);
                        } else {
                          setDetailItem(item);
                        }
                      }}
                      style={styles.cardTopRow}
                    >
                      {/* Checkbox for Select Mode */}
                      {isSelectMode && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => toggleSelect(itemId)}
                          style={{ marginRight: 8, alignSelf: 'center' }}
                        >
                          <MaterialCommunityIcons
                            name={isSelected ? 'checkbox-marked' : 'checkbox-blank-outline'}
                            size={22}
                            color={isSelected ? '#059669' : '#94A3B8'}
                          />
                        </TouchableOpacity>
                      )}

                      {/* Avatar inisial / Foto / Icon Kelas / Icon Jabatan */}
                      <View style={[styles.avatarCircle, { backgroundColor: currentTheme.iconBg }]}>
                        {resource === 'classes' ? (
                          <MaterialCommunityIcons name="google-classroom" size={22} color={currentTheme.iconColor} />
                        ) : resource === 'positions' ? (
                          <MaterialCommunityIcons name="badge-account-horizontal-outline" size={22} color={currentTheme.iconColor} />
                        ) : photoUrl ? (
                          <Image source={{ uri: photoUrl }} style={styles.avatarImg} />
                        ) : (
                          <Text style={[styles.avatarInitialsText, { color: currentTheme.iconColor }]}>
                            {initials}
                          </Text>
                        )}
                      </View>

                      {/* Card Main Info */}
                      <View style={styles.cardMainInfo}>
                        <View style={styles.nameRow}>
                          <Text numberOfLines={1} style={styles.studentName}>
                            {title}
                          </Text>
                          <View style={[styles.tagBadge, { backgroundColor: badgeBg }]}>
                            <Text style={[styles.tagBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                          </View>
                        </View>
                        <Text style={styles.nisText}>
                          {codeLabel}: {codeVal} • {secondaryVal || (resource === 'students' ? 'Reguler' : 'Aktif')}
                        </Text>
                      </View>
                    </TouchableOpacity>

                    {/* Detail Box (Harmonisasi Gaya Mutasi Siswa) */}
                    <View style={styles.detailBox}>
                      {unitVal ? (
                        <View style={styles.detailItemRow}>
                          <Text style={styles.detailItemLabel}>Unit:</Text>
                          <Text style={styles.detailItemVal} numberOfLines={1}>{unitVal}</Text>
                        </View>
                      ) : null}

                      {secondaryVal ? (
                        <View style={styles.detailItemRow}>
                          <Text style={styles.detailItemLabel}>
                            {resource === 'students' ? 'Rombel:' : resource === 'employees' ? 'Jabatan:' : resource === 'positions' ? 'Satuan:' : 'Jenjang:'}
                          </Text>
                          <Text style={styles.detailItemVal} numberOfLines={1}>{secondaryVal}</Text>
                        </View>
                      ) : null}

                      {resource === 'students' && (item?.parent_phone || item?.telepon_ortu || item?.parent?.name) ? (
                        <View style={styles.detailItemRow}>
                          <Text style={styles.detailItemLabel}>Wali:</Text>
                          <Text style={styles.detailItemVal} numberOfLines={1}>
                            {item?.parent?.name || 'Orang Tua / Wali'} {item?.parent_phone || item?.telepon_ortu ? `(${item?.parent_phone || item?.telepon_ortu})` : ''}
                          </Text>
                        </View>
                      ) : null}

                      {resource === 'employees' ? (
                        <View style={styles.detailItemRow}>
                          <Text style={styles.detailItemLabel}>Kategori:</Text>
                          <Text
                            style={[
                              styles.detailItemVal,
                              {
                                color: checkIsEmployeeGuru(item)
                                  ? '#1D4ED8'
                                  : '#7C3AED',
                                fontWeight: '700',
                              },
                            ]}
                            numberOfLines={1}
                          >
                            {checkIsEmployeeGuru(item)
                              ? 'Pendidik / Guru'
                              : 'Tenaga Kependidikan (Tendik)'}
                          </Text>
                        </View>
                      ) : null}

                      {resource === 'employees' && item.status_pegawai ? (
                        <View style={styles.detailItemRow}>
                          <Text style={styles.detailItemLabel}>Status:</Text>
                          <Text style={styles.detailItemVal} numberOfLines={1}>{item.status_pegawai}</Text>
                        </View>
                      ) : null}

                      {resource === 'classes' && classExtraVal ? (
                        <View style={styles.detailItemRow}>
                          <Text style={styles.detailItemLabel}>Rincian:</Text>
                          <Text style={styles.detailItemVal} numberOfLines={1}>{classExtraVal}</Text>
                        </View>
                      ) : null}

                      {resource === 'positions' && (item.scope_akses || item.scope) ? (
                        <View style={styles.detailItemRow}>
                          <Text style={styles.detailItemLabel}>Scope:</Text>
                          <Text style={styles.detailItemVal} numberOfLines={1}>{item.scope_akses || item.scope}</Text>
                        </View>
                      ) : null}

                      {isAlumni && (item?.metadata?.tujuan_lanjut || item?.tujuan_lanjut) ? (
                        <View style={styles.detailItemRow}>
                          <Text style={[styles.detailItemLabel, { color: '#B45309' }]}>Lanjut:</Text>
                          <Text style={[styles.detailItemVal, { color: '#92400E' }]} numberOfLines={1}>
                            {item?.metadata?.tujuan_lanjut || item?.tujuan_lanjut}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Bottom Action Row (Harmonisasi Gaya Mutasi Siswa) */}
                    {!isSelectMode && item?.id ? (
                      <View style={styles.cardActionsContainer}>
                        {/* Tier 1: Chat Internal & Mutasi */}
                        {(resource === 'students' || resource === 'employees') && (
                          <View style={styles.actionTier1Row}>
                            {resource === 'students' && (
                              <TouchableOpacity
                                activeOpacity={0.82}
                                style={styles.internalChatPillBtn}
                                onPress={() => openInternalChatStudent(item)}
                              >
                                <MaterialCommunityIcons name="message-text-outline" size={15} color="#FFFFFF" />
                                <Text style={styles.internalChatPillBtnText} numberOfLines={1}>Chat Internal Ortu / Siswa</Text>
                              </TouchableOpacity>
                            )}

                            {resource === 'employees' && (
                              <TouchableOpacity
                                activeOpacity={0.82}
                                style={styles.internalChatPillBtn}
                                onPress={() => openInternalChatEmployee(item)}
                              >
                                <MaterialCommunityIcons name="message-text-outline" size={15} color="#FFFFFF" />
                                <Text style={styles.internalChatPillBtnText} numberOfLines={1}>Chat Internal Pegawai</Text>
                              </TouchableOpacity>
                            )}

                            {resource === 'students' && isTu && item.status !== 'mutasi' && (
                              <TouchableOpacity
                                activeOpacity={0.82}
                                style={styles.actionPillMutasi}
                                onPress={() => openAjukanMutasi(item)}
                              >
                                <MaterialCommunityIcons name="swap-horizontal" size={15} color="#7C3AED" />
                                <Text style={styles.actionPillMutasiText} numberOfLines={1}>Pindah Unit</Text>
                              </TouchableOpacity>
                            )}
                          </View>
                        )}

                        {/* Tier 2: Aksi Manajemen Utama (Detail, Cetak, Ubah, Hapus) */}
                        <View style={styles.actionTier2Row}>
                          <TouchableOpacity
                            activeOpacity={0.82}
                            style={styles.actionTierBtnDetail}
                            onPress={() => setDetailItem(item)}
                          >
                            <MaterialCommunityIcons name="eye-outline" size={13} color="#059669" />
                            <Text style={styles.actionTierBtnTextDetail} numberOfLines={1}>Detail</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.82}
                            style={styles.actionTierBtnPrint}
                            onPress={() => setSinglePrintItem(item)}
                          >
                            <MaterialCommunityIcons name="printer-outline" size={13} color="#0F766E" />
                            <Text style={styles.actionTierBtnTextPrint} numberOfLines={1}>Cetak</Text>
                          </TouchableOpacity>

                          {canUpdate && (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={styles.actionTierBtnEdit}
                              onPress={() => openForm(item)}
                            >
                              <MaterialCommunityIcons name="pencil-outline" size={13} color="#2563EB" />
                              <Text style={styles.actionTierBtnTextEdit} numberOfLines={1}>Ubah</Text>
                            </TouchableOpacity>
                          )}

                          {canDelete && (
                            <TouchableOpacity
                              activeOpacity={0.82}
                              style={styles.actionTierBtnDelete}
                              onPress={() => remove(item)}
                            >
                              <MaterialCommunityIcons name="trash-can-outline" size={13} color="#DC2626" />
                              <Text style={styles.actionTierBtnTextDelete} numberOfLines={1}>Hapus</Text>
                            </TouchableOpacity>
                          )}
                        </View>
                      </View>
                    ) : null}
                  </View>
                );
              })}

              {/* Progressive Load More / Pagination */}
              {filteredItems.length > displayLimit && (
                <View style={styles.loadMoreWrapper}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setDisplayLimit((prev) => prev + 25)}
                    style={styles.loadMoreBtn}
                  >
                    <MaterialCommunityIcons name="arrow-down-circle-outline" size={18} color="#059669" />
                    <Text style={styles.loadMoreBtnText}>
                      Muat 25 Data Berikutnya (Tampil {visibleItems.length} dari {filteredItems.length})
                    </Text>
                  </TouchableOpacity>

                  {filteredItems.length > displayLimit + 10 && (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setDisplayLimit(filteredItems.length)}
                      style={styles.loadAllBtn}
                    >
                      <Text style={styles.loadAllBtnText}>Tampilkan Semua ({filteredItems.length} Data)</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── FLOATING SCROLL FAB: TAMBAH DATA (muncul saat scroll melewati card tabs) ── */}
      {showScrollFab && canCreate && !isSelectMode && (
        <Animated.View
          style={[
            styles.scrollFabContainer,
            {
              transform: [
                {
                  translateY: scrollFabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [80, 0],
                  }),
                },
                {
                  scale: scrollFabAnim.interpolate({
                    inputRange: [0, 1],
                    outputRange: [0.8, 1],
                  }),
                },
              ],
              opacity: scrollFabAnim,
            },
          ]}
          pointerEvents="box-none"
        >
          {/* Tambah Button */}
          <TouchableOpacity
            activeOpacity={0.88}
            onPress={() => openForm()}
            style={styles.scrollFabBtn}
          >
            <LinearGradient
              colors={TAB_THEMES[resource].activeColors}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.scrollFabBtnGradient}
            >
              <View style={styles.scrollFabIconCircle}>
                <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
              </View>
              <Text style={styles.scrollFabBtnText}>
                Tambah {resourceLabels[resource]} Baru
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* ── FLOATING BULK DELETE BAR (MODE SELEKSI) ── */}
      {isSelectMode && (
        <View style={styles.floatingBulkBar}>
          <View style={styles.floatingBulkInfo}>
            <Text style={styles.floatingBulkCount}>{selectedIds.size} dipilih</Text>
            <TouchableOpacity onPress={toggleSelectAll} style={styles.floatingBulkSelectAll}>
              <Text style={styles.floatingBulkSelectAllText}>
                {selectedIds.size === filteredItems.length && filteredItems.length > 0 ? 'Batal Semua' : 'Pilih Semua'}
              </Text>
            </TouchableOpacity>
          </View>

          <View style={styles.floatingBulkActions}>
            <TouchableOpacity
              onPress={() => {
                setIsSelectMode(false);
                setSelectedIds(new Set());
              }}
              style={styles.floatingBulkCancelBtn}
            >
              <Text style={styles.floatingBulkCancelText}>Selesai</Text>
            </TouchableOpacity>

            <TouchableOpacity
              disabled={selectedIds.size === 0}
              onPress={handleBulkDelete}
              style={[styles.floatingBulkDeleteBtn, selectedIds.size === 0 && { opacity: 0.45 }]}
            >
              <MaterialCommunityIcons name="trash-can-outline" size={18} color="#FFFFFF" />
              <Text style={styles.floatingBulkDeleteText}>Hapus ({selectedIds.size})</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── MODAL DROPDOWN SELECTOR (KELAS, JABATAN, TINGKAT) ── */}
      <Modal
        visible={filterDropdownOpen}
        animationType="fade"
        transparent
        onRequestClose={() => setFilterDropdownOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.dropdownModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setFilterDropdownOpen(false)} />
          <View style={styles.dropdownModalSheet}>
            <View style={styles.dropdownModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons
                  name={
                    resource === 'students'
                      ? 'google-classroom'
                      : resource === 'employees'
                        ? 'badge-account-outline'
                        : 'layers-outline'
                  }
                  size={20}
                  color={TAB_THEMES[resource].cardAccentColor}
                />
                <Text style={styles.dropdownModalTitle}>
                  {resource === 'students' ? 'Pilih Kelas / Rombel' : resource === 'employees' ? 'Pilih Jabatan Pegawai' : 'Pilih Tingkat Kelas'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setFilterDropdownOpen(false)} style={styles.dropdownModalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Pencarian dalam dropdown */}
            <View style={styles.dropdownSearchBox}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
              <NativeTextInput
                value={dropdownSearch}
                onChangeText={setDropdownSearch}
                placeholder="Cari dalam daftar..."
                placeholderTextColor="#94A3B8"
                style={styles.dropdownSearchNativeInput}
              />
              {dropdownSearch.length > 0 && (
                <TouchableOpacity onPress={() => setDropdownSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 340 }}>
              {/* Opsi: Semua Data */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (resource === 'students') setFilterKelas('all');
                  else if (resource === 'employees') setFilterJabatan('all');
                  else setFilterTingkat('all');
                  setFilterDropdownOpen(false);
                }}
                style={[
                  styles.dropdownItem,
                  ((resource === 'students' && filterKelas === 'all') ||
                    (resource === 'employees' && filterJabatan === 'all') ||
                    (resource === 'classes' && filterTingkat === 'all')) && styles.dropdownItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.dropdownItemText,
                    ((resource === 'students' && filterKelas === 'all') ||
                      (resource === 'employees' && filterJabatan === 'all') ||
                      (resource === 'classes' && filterTingkat === 'all')) && styles.dropdownItemTextActive,
                  ]}
                >
                  Semua {resource === 'students' ? 'Kelas & Rombel' : resource === 'employees' ? 'Jabatan' : 'Tingkat'}
                </Text>
                {((resource === 'students' && filterKelas === 'all') ||
                  (resource === 'employees' && filterJabatan === 'all') ||
                  (resource === 'classes' && filterTingkat === 'all')) && (
                  <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                )}
              </TouchableOpacity>

              {/* Daftar Opsi Siswa (Kelas) */}
              {resource === 'students' &&
                classFilterOptions
                  .filter((c) => c.name.toLowerCase().includes(dropdownSearch.toLowerCase()))
                  .map((c) => {
                    const isSelected = filterKelas === c.name || filterKelas === c.id;
                    return (
                      <TouchableOpacity
                        key={c.id}
                        activeOpacity={0.8}
                        onPress={() => {
                          setFilterKelas(c.name);
                          setFilterDropdownOpen(false);
                        }}
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                      >
                        <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                          {c.name}
                        </Text>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}

              {/* Daftar Opsi Pegawai (Jabatan) */}
              {resource === 'employees' &&
                positionFilterOptions
                  .filter((p) => p.name.toLowerCase().includes(dropdownSearch.toLowerCase()))
                  .map((p) => {
                    const isSelected = filterJabatan === p.name || filterJabatan === p.id;
                    return (
                      <TouchableOpacity
                        key={p.id}
                        activeOpacity={0.8}
                        onPress={() => {
                          setFilterJabatan(p.name);
                          setFilterDropdownOpen(false);
                        }}
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                      >
                        <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                          {p.name}
                        </Text>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}

              {/* Daftar Opsi Kelas (Tingkat) */}
              {resource === 'classes' &&
                tingkatFilterOptions
                  .filter((t) => t.toLowerCase().includes(dropdownSearch.toLowerCase()))
                  .map((t) => {
                    const isSelected = filterTingkat.toLowerCase() === t.toLowerCase();
                    return (
                      <TouchableOpacity
                        key={t}
                        activeOpacity={0.8}
                        onPress={() => {
                          setFilterTingkat(t);
                          setFilterDropdownOpen(false);
                        }}
                        style={[styles.dropdownItem, isSelected && styles.dropdownItemActive]}
                      >
                        <Text style={[styles.dropdownItemText, isSelected && styles.dropdownItemTextActive]}>
                          Tingkat {t}
                        </Text>
                        {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                      </TouchableOpacity>
                    );
                  })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL LIHAT DETAIL DATA (BERFUNGSI PENUH) ── */}
      <Modal
        visible={Boolean(detailItem)}
        animationType="slide"
        transparent
        onRequestClose={() => setDetailItem(null)}
      >
        <View style={styles.detailModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setDetailItem(null)} />
          <View style={styles.detailModalSheet}>
            {/* Header Detail Modal */}
            <View style={styles.detailModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                {(() => {
                  const detailMeta = (detailItem?.metadata && typeof detailItem.metadata === 'object') ? detailItem.metadata : {};
                  const detailPhotoRaw =
                    detailItem?.photo_url ||
                    detailItem?.avatar_url ||
                    detailItem?.photo ||
                    detailItem?.photo_thumb ||
                    detailItem?.foto_url ||
                    detailItem?.foto ||
                    detailItem?.avatar ||
                    detailMeta?.photo_url ||
                    detailMeta?.photo ||
                    detailMeta?.foto ||
                    detailItem?.user?.photo_url;
                  const detailPhoto = getProfileImageUrl(detailItem) || resolveMediaUrl(detailPhotoRaw);

                  return (
                    <View style={[styles.detailAvatarWrap, { backgroundColor: TAB_THEMES[resource].cardAccentColor, overflow: 'hidden' }]}>
                      {detailPhoto ? (
                        <Image source={{ uri: detailPhoto }} style={styles.detailAvatarImg} />
                      ) : (
                        <MaterialCommunityIcons
                          name={
                            resource === 'students'
                              ? 'account-school'
                              : resource === 'employees'
                                ? 'badge-account-horizontal'
                                : 'google-classroom'
                          }
                          size={24}
                          color="#FFFFFF"
                        />
                      )}
                    </View>
                  );
                })()}
                <View style={{ flex: 1 }}>
                  <Text style={styles.detailModalName} numberOfLines={1}>
                    {detailItem ? displayName(detailItem) : ''}
                  </Text>
                  <Text style={styles.detailModalSub}>
                    {resourceLabels[resource]} • {detailItem?.status || (detailItem?.is_active !== false ? 'Aktif' : 'Nonaktif')}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setDetailItem(null)} style={styles.detailCloseBtn}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Scrollable Detail Rows */}
            <ScrollView showsVerticalScrollIndicator={false} style={styles.detailScroll}>
              {resource === 'students' && (() => {
                const meta = (detailItem?.metadata && typeof detailItem.metadata === 'object') ? detailItem.metadata : {};
                const orangTua = (meta.orang_tua && typeof meta.orang_tua === 'object') ? meta.orang_tua : {};
                const ayahName = meta.nama_ayah || orangTua.nama_ayah || detailItem?.parent_name || detailItem?.nama_ortu || '-';
                const ayahPhone = meta.hp_ayah || meta.nomor_wa_ayah || orangTua.no_hp || detailItem?.parent_phone || detailItem?.telepon_ortu || '-';
                const ayahJob = meta.pekerjaan_ayah || orangTua.pekerjaan_ayah || '-';
                const ayahNik = meta.nik_ayah || orangTua.nik_ayah || '-';

                const ibuName = meta.nama_ibu || orangTua.nama_ibu || '-';
                const ibuPhone = meta.hp_ibu || meta.nomor_wa_ibu || '-';
                const ibuJob = meta.pekerjaan_ibu || orangTua.pekerjaan_ibu || '-';
                const ibuNik = meta.nik_ibu || orangTua.nik_ibu || '-';

                return (
                  <>
                    <View style={styles.detailSectionBox}>
                      <Text style={styles.detailSectionTitle}>INFORMASI POKOK SISWA</Text>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Nomor Induk Siswa (NIS)</Text>
                        <Text style={styles.detailValue}>{detailItem?.nis || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>NISN</Text>
                        <Text style={styles.detailValue}>{detailItem?.nisn || meta.nisn || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>NIK Siswa</Text>
                        <Text style={styles.detailValue}>{meta.nik || detailItem?.nik || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>No. Kartu Keluarga (KK)</Text>
                        <Text style={styles.detailValue}>{meta.no_kk || detailItem?.no_kk || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Kelas / Rombel</Text>
                        <Text style={[styles.detailValue, { color: '#059669', fontWeight: '800' }]}>
                          {nestedName(detailItem?.kelas) || meta.keterangan_kelas || '-'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Unit Pendidikan</Text>
                        <Text style={styles.detailValue}>
                          {nestedName(detailItem?.education_unit || detailItem?.educationUnit || detailItem?.unit) || meta.unit_pendidikan || '-'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Jenis Kelamin</Text>
                        <Text style={styles.detailValue}>
                          {detailItem?.gender === 'female' || detailItem?.jenis_kelamin === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Tempat, Tgl Lahir</Text>
                        <Text style={styles.detailValue}>
                          {[detailItem?.birth_place, detailItem?.birth_date ? String(detailItem.birth_date).split('T')[0] : null].filter(Boolean).join(', ') || '-'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Agama</Text>
                        <Text style={styles.detailValue}>{meta.agama || detailItem?.agama || 'Islam'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Status Siswa</Text>
                        <Text style={[
                          styles.detailValue, 
                          { 
                            color: (meta.status_siswa === 'lulus' ? '#6366F1' : (meta.status_siswa === 'mutasi' ? '#D97706' : (meta.status_siswa === 'berhenti' ? '#DC2626' : '#059669'))), 
                            fontWeight: '800' 
                          }
                        ]}>
                          {meta.status_siswa ? (meta.status_siswa === 'lulus' ? 'ALUMNI / LULUS' : meta.status_siswa.toUpperCase()) : (detailItem?.is_active !== false ? 'AKTIF' : 'NONAKTIF')}
                        </Text>
                      </View>
                      {(meta.status_siswa === 'lulus' || meta.tahun_lulus || meta.tujuan_lanjut) && (
                        <>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Tahun Kelulusan</Text>
                            <Text style={[styles.detailValue, { fontWeight: '700', color: '#4F46E5' }]}>{meta.tahun_lulus || '-'}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Tujuan Lanjut Studi / Sekolah</Text>
                            <Text style={styles.detailValue}>{meta.tujuan_lanjut || '-'}</Text>
                          </View>
                        </>
                      )}
                      {(meta.status_siswa === 'mutasi' || meta.sekolah_tujuan || meta.alasan_mutasi) && (
                        <>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Sekolah / Unit Tujuan Mutasi</Text>
                            <Text style={[styles.detailValue, { fontWeight: '700', color: '#B45309' }]}>{meta.sekolah_tujuan || '-'}</Text>
                          </View>
                          <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Alasan Mutasi</Text>
                            <Text style={styles.detailValue}>{meta.alasan_mutasi || '-'}</Text>
                          </View>
                        </>
                      )}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>No. Pendaftaran (PPDB)</Text>
                        <Text style={styles.detailValue}>{meta.no_pendaftaran || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Tahun Ajaran Masuk</Text>
                        <Text style={styles.detailValue}>{meta.tahun_ajaran_masuk || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>NIS Pembayaran / VA</Text>
                        <Text style={styles.detailValue}>{meta.nis_pembayaran || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Sekolah Asal</Text>
                        <Text style={styles.detailValue}>{meta.sekolah_asal || '-'}</Text>
                      </View>
                    </View>

                    {/* Section Data Orang Tua */}
                    <View style={styles.detailSectionBox}>
                      <Text style={styles.detailSectionTitle}>DATA ORANG TUA (AYAH & IBU)</Text>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Nama Ayah</Text>
                        <Text style={styles.detailValue}>{ayahName}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>No. WA / HP Ayah</Text>
                        <Text style={[styles.detailValue, { color: '#16A34A', fontWeight: '700' }]}>{ayahPhone}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Pekerjaan Ayah</Text>
                        <Text style={styles.detailValue}>{ayahJob}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>NIK Ayah</Text>
                        <Text style={styles.detailValue}>{ayahNik}</Text>
                      </View>

                      <View style={[styles.formSubHeader, { marginHorizontal: 0, marginTop: 8 }]}>
                        <MaterialCommunityIcons name="face-woman-profile" size={14} color="#059669" />
                        <Text style={styles.formSubHeaderText}>IBU KANDUNG</Text>
                      </View>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Nama Ibu</Text>
                        <Text style={styles.detailValue}>{ibuName}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>No. WA / HP Ibu</Text>
                        <Text style={[styles.detailValue, { color: '#16A34A', fontWeight: '700' }]}>{ibuPhone}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Pekerjaan Ibu</Text>
                        <Text style={styles.detailValue}>{ibuJob}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>NIK Ibu</Text>
                        <Text style={styles.detailValue}>{ibuNik}</Text>
                      </View>
                    </View>

                    {/* Section Domisili */}
                    <View style={styles.detailSectionBox}>
                      <Text style={styles.detailSectionTitle}>DOMISILI & TEMPAT TINGGAL</Text>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Alamat Lengkap</Text>
                        <Text style={styles.detailValue}>{detailItem?.address || meta.alamat_siswa || detailItem?.alamat || '-'}</Text>
                      </View>
                    </View>
                  </>
                );
              })()}

              {resource === 'employees' && (() => {
                const meta = (detailItem?.metadata && typeof detailItem.metadata === 'object') ? detailItem.metadata : {};
                const gelar = [detailItem?.gelar_depan, detailItem?.gelar_belakang].filter(Boolean).join(' / ');

                return (
                  <>
                    <View style={styles.detailSectionBox}>
                      <Text style={styles.detailSectionTitle}>INFORMASI POKOK PEGAWAI</Text>

                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>NIY / NIP</Text>
                        <Text style={styles.detailValue}>{detailItem?.niy || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>NIK Pegawai</Text>
                        <Text style={styles.detailValue}>{detailItem?.nik || meta.nik || '-'}</Text>
                      </View>
                      {gelar ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Gelar Akademik</Text>
                          <Text style={styles.detailValue}>{gelar}</Text>
                        </View>
                      ) : null}
                      {detailItem?.nama_panggilan ? (
                        <View style={styles.detailRow}>
                          <Text style={styles.detailLabel}>Nama Panggilan</Text>
                          <Text style={styles.detailValue}>{detailItem.nama_panggilan}</Text>
                        </View>
                      ) : null}
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Jabatan / Posisi</Text>
                        <Text style={[styles.detailValue, { color: '#059669', fontWeight: '800' }]}>
                          {nestedName(detailItem?.position || detailItem?.jabatan) || '-'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Unit Pendidikan</Text>
                        <Text style={styles.detailValue}>{nestedName(detailItem?.unit) || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Status Pegawai</Text>
                        <Text style={styles.detailValue}>{detailItem?.status_pegawai || 'Pegawai Tetap'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Status Keaktifan</Text>
                        <Text style={[styles.detailValue, { color: '#059669', fontWeight: '800' }]}>
                          {detailItem?.status || (detailItem?.is_active !== false ? 'Aktif' : 'Nonaktif')}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Jenis Kelamin</Text>
                        <Text style={styles.detailValue}>
                          {detailItem?.jenis_kelamin === 'P' || detailItem?.gender === 'female' ? 'Perempuan (P)' : 'Laki-laki (L)'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Tempat, Tgl Lahir</Text>
                        <Text style={styles.detailValue}>
                          {[detailItem?.tempat_lahir, detailItem?.tanggal_lahir ? String(detailItem.tanggal_lahir).split('T')[0] : null].filter(Boolean).join(', ') || '-'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Tanggal Masuk (TMT)</Text>
                        <Text style={styles.detailValue}>
                          {detailItem?.tanggal_masuk ? String(detailItem.tanggal_masuk).split('T')[0] : '-'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Agama</Text>
                        <Text style={styles.detailValue}>{detailItem?.agama || 'Islam'}</Text>
                      </View>
                    </View>

                    <View style={styles.detailSectionBox}>
                      <Text style={styles.detailSectionTitle}>KONTAK & DOMISILI</Text>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Nomor WhatsApp / HP</Text>
                        <Text style={[styles.detailValue, { color: '#16A34A', fontWeight: '700' }]}>
                          {detailItem?.no_hp || detailItem?.phone || '-'}
                        </Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Email Resmi</Text>
                        <Text style={styles.detailValue}>{detailItem?.email || '-'}</Text>
                      </View>
                      <View style={styles.detailRow}>
                        <Text style={styles.detailLabel}>Alamat Lengkap</Text>
                        <Text style={styles.detailValue}>{detailItem?.address || detailItem?.alamat || '-'}</Text>
                      </View>
                    </View>
                  </>
                );
              })()}

              {resource === 'classes' && (
                <View style={styles.detailSectionBox}>
                  <Text style={styles.detailSectionTitle}>INFORMASI ROMBEL KELAS</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Kode Rombel</Text>
                    <Text style={styles.detailValue}>{detailItem?.kode_kelas || detailItem?.code || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Tingkat / Jenjang</Text>
                    <Text style={styles.detailValue}>
                      Tingkat {detailItem?.tingkat || '-'} ({detailItem?.jenjang || '-'})
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Wali Kelas</Text>
                    <Text style={styles.detailValue}>{nestedName(detailItem?.waliKelas || detailItem?.wali_kelas) || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Kapasitas Siswa</Text>
                    <Text style={styles.detailValue}>{detailItem?.kapasitas != null ? `${detailItem.kapasitas} Siswa` : '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Jumlah Siswa Terdaftar</Text>
                    <Text style={[styles.detailValue, { color: '#059669', fontWeight: '800' }]}>
                      {detailItem?.students_count || detailItem?.siswa_count || 0} Siswa
                    </Text>
                  </View>
                </View>
              )}

              {resource === 'units' && (
                <View style={styles.detailSectionBox}>
                  <Text style={styles.detailSectionTitle}>INFORMASI UNIT PENDIDIKAN</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Kode Unit</Text>
                    <Text style={styles.detailValue}>{detailItem?.code || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Jenjang</Text>
                    <Text style={styles.detailValue}>{detailItem?.level || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status</Text>
                    <Text style={[styles.detailValue, { color: '#059669', fontWeight: '800' }]}>
                      {detailItem?.is_active !== false ? 'Aktif' : 'Nonaktif'}
                    </Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Keterangan</Text>
                    <Text style={styles.detailValue}>{detailItem?.description || '-'}</Text>
                  </View>
                </View>
              )}

              {resource === 'positions' && (
                <View style={styles.detailSectionBox}>
                  <Text style={styles.detailSectionTitle}>INFORMASI MASTER JABATAN</Text>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Nama Jabatan</Text>
                    <Text style={[styles.detailValue, { color: '#0891B2', fontWeight: '800' }]}>{detailItem?.nama_jabatan || detailItem?.name || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Kode Jabatan</Text>
                    <Text style={styles.detailValue}>{detailItem?.kode_jabatan || detailItem?.code || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Level Jabatan</Text>
                    <Text style={styles.detailValue}>Level {detailItem?.level_jabatan || detailItem?.level || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Satuan Kerja</Text>
                    <Text style={styles.detailValue}>{detailItem?.satuan_kerja || '-'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Scope Hak Akses</Text>
                    <Text style={styles.detailValue}>{detailItem?.scope_akses || detailItem?.scope || 'unit_sendiri'}</Text>
                  </View>
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Status Keaktifan</Text>
                    <Text style={[styles.detailValue, { color: detailItem?.status === 'Aktif' || detailItem?.is_active !== false ? '#059669' : '#DC2626', fontWeight: '800' }]}>
                      {detailItem?.status || (detailItem?.is_active !== false ? 'Aktif' : 'Nonaktif')}
                    </Text>
                  </View>
                  {detailItem?.deskripsi || detailItem?.description ? (
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Deskripsi Tugas</Text>
                      <Text style={styles.detailValue}>{detailItem?.deskripsi || detailItem?.description}</Text>
                    </View>
                  ) : null}
                </View>
              )}
            </ScrollView>

            {/* Action Bar Footer di Modal Detail */}
            <View style={styles.detailModalFooter}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.detailPrintBtn}
                onPress={() => {
                  const target = detailItem;
                  setDetailItem(null);
                  setSinglePrintItem(target);
                }}
              >
                <LinearGradient
                  colors={['#059669', '#0D9488', '#004D32']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.detailPrintBtnGradient}
                >
                  <MaterialCommunityIcons name="printer-outline" size={19} color="#FFFFFF" />
                  <Text style={styles.detailPrintBtnText}>Cetak Biodata A4</Text>
                </LinearGradient>
              </TouchableOpacity>

              <View style={styles.detailSecondaryActions}>
                {canUpdate && (
                  <TouchableOpacity
                    style={styles.detailEditBtn}
                    onPress={() => {
                      const target = detailItem;
                      setDetailItem(null);
                      openForm(target);
                    }}
                  >
                    <MaterialCommunityIcons name="pencil-outline" size={16} color="#059669" />
                    <Text style={styles.detailEditBtnText}>Ubah</Text>
                  </TouchableOpacity>
                )}

                {resource === 'students' && canUpdate && (
                  <TouchableOpacity
                    style={[styles.detailEditBtn, { backgroundColor: '#F0FDFA', borderColor: '#CCFBF1' }]}
                    onPress={() => {
                      const target = detailItem;
                      setDetailItem(null);
                      openAjukanMutasi(target);
                    }}
                  >
                    <MaterialCommunityIcons name="swap-horizontal" size={16} color="#0D9488" />
                    <Text style={[styles.detailEditBtnText, { color: '#0D9488' }]}>Pindah Unit</Text>
                  </TouchableOpacity>
                )}
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL CETAK 1 DATA KHUSUS (BIODATA / PROFIL A4) ── */}
      <Modal
        visible={Boolean(singlePrintItem)}
        animationType="slide"
        transparent={false}
        onRequestClose={handleCloseSinglePrint}
      >
        <View style={styles.printScreen}>
          <View style={styles.printHeader}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleCloseSinglePrint}
              style={styles.printHeaderBackBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <Text numberOfLines={1} style={styles.printHeaderTitle}>
                Cetak Biodata {resourceLabels[resource]}
              </Text>
              <Text numberOfLines={1} style={styles.printHeaderSub}>
                {singlePrintItem ? displayName(singlePrintItem) : ''} • Format A4
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => notifyPrint(`Perintah cetak biodata "${displayName(singlePrintItem)}" telah dikirim ke printer.`)}
                style={styles.printHeaderActionBtn}
              >
                <MaterialCommunityIcons name="printer" size={16} color="#004D32" />
                <Text style={styles.printHeaderActionBtnText}>Cetak</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => notifyPrint(`Dokumen PDF biodata "${displayName(singlePrintItem)}" berhasil diunduh.`)}
                style={[styles.printHeaderActionBtn, { backgroundColor: '#FDE68A' }]}
              >
                <MaterialCommunityIcons name="download" size={16} color="#78350F" />
                <Text style={[styles.printHeaderActionBtnText, { color: '#78350F' }]}>PDF</Text>
              </TouchableOpacity>
            </View>
          </View>

          {printNotice ? (
            <View style={styles.printNoticeBanner}>
              <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
              <Text style={styles.printNoticeBannerText}>{printNotice}</Text>
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1, backgroundColor: '#CBD5E1' }}
            contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.paperSheet}>
              {/* KOP RESMI STANDAR DATA MASTER: LOGO YAYASAN (KIRI) & LOGO UNIT (KANAN) */}
              <View style={styles.paperKopRow}>
                {/* Logo Kiri: Logo Yayasan (dari Site Settings / Branding) */}
                <View style={styles.paperKopLogoBox}>
                  {siteLogoUrl ? (
                    <Image source={{ uri: siteLogoUrl }} style={styles.paperKopLogoImg} resizeMode="contain" />
                  ) : (
                    <Image source={require('../../assets/logo.png')} style={styles.paperKopLogoImg} resizeMode="contain" />
                  )}
                </View>
                <View style={styles.paperKopCenterBox}>
                  <Text style={styles.paperKopOrgName}>{branding?.school_name?.toUpperCase() || 'YAYASAN DAR EL-IMAN PADANG'}</Text>
                  <Text style={styles.paperKopSchoolUnit}>{singleItemUnitName}</Text>
                  <Text style={styles.paperKopAddress}>{singleItemUnitAddress}</Text>
                </View>
                {/* Logo Kanan: Logo Unit Pendidikan */}
                <View style={styles.paperKopLogoBox}>
                  {singleItemUnitLogo ? (
                    <Image source={{ uri: singleItemUnitLogo }} style={styles.paperKopLogoImg} resizeMode="contain" />
                  ) : siteLogoUrl ? (
                    <Image source={{ uri: siteLogoUrl }} style={styles.paperKopLogoImg} resizeMode="contain" />
                  ) : (
                    <Image source={require('../../assets/logo.png')} style={styles.paperKopLogoImg} resizeMode="contain" />
                  )}
                </View>
              </View>

              <View style={styles.paperKopDividerContainer}>
                <View style={styles.paperKopDividerThick} />
                <View style={styles.paperKopDividerThin} />
              </View>

              <View style={styles.paperDocHeader}>
                <Text style={styles.paperDocTitle}>
                  LEMBAR BIODATA RESMI {resourceLabels[resource].toUpperCase()}
                </Text>
                <Text style={styles.paperDocSub}>
                  {singlePrintIdentifier} • TAHUN AJARAN {currentAyName}
                </Text>
                <View style={styles.paperDocMetaRow}>
                  <Text style={styles.paperDocMetaText}>Dicetak pada: {formattedPrintDate} WIB</Text>
                  <Text style={styles.paperDocMetaBullet}>•</Text>
                  <Text style={styles.paperDocMetaText}>Status: Terverifikasi Sistem</Text>
                  <Text style={styles.paperDocMetaBullet}>•</Text>
                  <Text style={styles.paperDocMetaBadge}>Dokumen Resmi</Text>
                </View>
              </View>

              <View style={styles.paperBioTable}>
                {resource !== 'students' && (
                  <View style={styles.paperBioRow}>
                    <Text style={styles.paperBioKey}>1. Nama Lengkap</Text>
                    <Text style={styles.paperBioVal}>: {displayName(singlePrintItem)}</Text>
                  </View>
                )}

                {resource === 'students' && (() => {
                  const meta = (singlePrintItem?.metadata && typeof singlePrintItem.metadata === 'object') ? singlePrintItem.metadata : {};
                  const orangTua = (meta.orang_tua && typeof meta.orang_tua === 'object') ? meta.orang_tua : {};
                  const ayahName = meta.nama_ayah || orangTua.nama_ayah || singlePrintItem?.parent_name || singlePrintItem?.nama_ortu || '-';
                  const ayahPhone = meta.hp_ayah || meta.nomor_wa_ayah || orangTua.no_hp || singlePrintItem?.parent_phone || singlePrintItem?.telepon_ortu || '-';
                  const ayahJob = meta.pekerjaan_ayah || orangTua.pekerjaan_ayah || '-';
                  const ayahNik = meta.nik_ayah || orangTua.nik_ayah || '-';
                  const ayahEdu = meta.pendidikan_terakhir_ayah || orangTua.pendidikan_ayah || '-';

                  const ibuName = meta.nama_ibu || orangTua.nama_ibu || '-';
                  const ibuPhone = meta.hp_ibu || meta.nomor_wa_ibu || '-';
                  const ibuJob = meta.pekerjaan_ibu || orangTua.pekerjaan_ibu || '-';
                  const ibuNik = meta.nik_ibu || orangTua.nik_ibu || '-';
                  const ibuEdu = meta.pendidikan_terakhir_ibu || orangTua.pendidikan_ibu || '-';

                  const waliName = meta.nama_wali || '-';
                  const waliPhone = meta.hp_wali || meta.nomor_wa_wali || '-';
                  const waliJob = meta.pekerjaan_wali || '-';
                  const waliNik = meta.nik_wali || '-';

                  const jenisPendaftaranMap: Record<string, string> = {
                    baru: 'Siswa Baru (PPDB)',
                    pindahan_eksternal: 'Pindahan Eksternal (Luar Sekolah)',
                    pindahan_internal: 'Pindahan Internal (Antar Unit Yayasan)',
                  };
                  const jenisDaftarText = jenisPendaftaranMap[meta.jenis_pendaftaran] || meta.jenis_pendaftaran || 'Siswa Baru (PPDB)';

                  const unitAsalName = meta.unit_asal_id
                    ? availableUnits.find((u) => u.id === meta.unit_asal_id)?.name
                    : null;
                  const sekolahAsalText = [meta.sekolah_asal || unitAsalName, meta.status_sekolah_asal ? `(${meta.status_sekolah_asal})` : null]
                    .filter(Boolean)
                    .join(' ') || '-';

                  return (
                    <>
                      {/* SECTION A: IDENTITAS PRIBADI SISWA */}
                      <View style={styles.paperBioSectionHeader}>
                        <Text style={styles.paperBioSectionHeaderText}>A. IDENTITAS POKOK SISWA</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>1. Nama Lengkap Siswa</Text>
                        <Text style={styles.paperBioVal}>: {displayName(singlePrintItem)}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>2. Jenis Kelamin</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.gender === 'female' ? 'Perempuan (P)' : 'Laki-laki (L)'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>3. NIS (Nomor Induk Siswa)</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.nis || meta.nis || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>4. NISN (Nomor Nasional)</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.nisn || meta.nisn || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>5. NIK Siswa (16 Digit)</Text>
                        <Text style={styles.paperBioVal}>: {meta.nik || singlePrintItem?.nik || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>6. No. Kartu Keluarga (KK)</Text>
                        <Text style={styles.paperBioVal}>: {meta.no_kk || singlePrintItem?.no_kk || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>7. No. Reg. Akta Lahir</Text>
                        <Text style={styles.paperBioVal}>: {meta.no_registrasi_akta_lahir || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>8. Tempat, Tanggal Lahir</Text>
                        <Text style={styles.paperBioVal}>: {[singlePrintItem?.birth_place, singlePrintItem?.birth_date ? String(singlePrintItem.birth_date).split('T')[0] : null].filter(Boolean).join(', ') || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>9. Agama</Text>
                        <Text style={styles.paperBioVal}>: {meta.agama || singlePrintItem?.agama || 'Islam'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>10. Urutan Anak / Saudara</Text>
                        <Text style={styles.paperBioVal}>: {meta.anak_ke ? `Anak ke-${meta.anak_ke} dari ${meta.jumlah_saudara || '-'} bersaudara` : (meta.jumlah_saudara ? `${meta.jumlah_saudara} Bersaudara` : '-')}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>11. Alamat Email Siswa</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.email || meta.email || '-'}</Text>
                      </View>

                      {/* SECTION B: PENEMPATAN KELAS & AKADEMIK */}
                      <View style={styles.paperBioSectionHeader}>
                        <Text style={styles.paperBioSectionHeaderText}>B. DATA AKADEMIK & PENEMPATAN ROMBEL</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>12. Unit Pendidikan</Text>
                        <Text style={styles.paperBioVal}>: {nestedName(singlePrintItem?.education_unit || singlePrintItem?.unit) || meta.unit_pendidikan || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>13. Kelas / Rombel Aktif</Text>
                        <Text style={styles.paperBioVal}>: {nestedName(singlePrintItem?.kelas) || meta.keterangan_kelas || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>14. Status Keaktifan</Text>
                        <Text style={styles.paperBioVal}>: {meta.status_siswa ? meta.status_siswa.toUpperCase() : (singlePrintItem?.is_active !== false ? 'AKTIF' : 'NONAKTIF')}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>15. Jenis Pendaftaran</Text>
                        <Text style={styles.paperBioVal}>: {jenisDaftarText}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>16. Sekolah / Unit Asal</Text>
                        <Text style={styles.paperBioVal}>: {sekolahAsalText}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>17. Tahun Ajaran Masuk</Text>
                        <Text style={styles.paperBioVal}>: {meta.tahun_ajaran_masuk || currentAyName}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>18. No. Registrasi PPDB</Text>
                        <Text style={styles.paperBioVal}>: {meta.no_pendaftaran || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>19. Kode Virtual Account (VA)</Text>
                        <Text style={styles.paperBioVal}>: {meta.nis_pembayaran || '-'}</Text>
                      </View>

                      {/* SECTION C: DATA ORANG TUA KANDUNG */}
                      <View style={styles.paperBioSectionHeader}>
                        <Text style={styles.paperBioSectionHeaderText}>C. DATA ORANG TUA KANDUNG</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>20. Nama Lengkap Ayah</Text>
                        <Text style={styles.paperBioVal}>: {ayahName}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>21. NIK Ayah (16 Digit)</Text>
                        <Text style={styles.paperBioVal}>: {ayahNik}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>22. Pendidikan Terakhir Ayah</Text>
                        <Text style={styles.paperBioVal}>: {ayahEdu}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>23. Pekerjaan Utama Ayah</Text>
                        <Text style={styles.paperBioVal}>: {ayahJob}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>24. No. WA / Kontak Ayah</Text>
                        <Text style={styles.paperBioVal}>: {ayahPhone}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>25. Nama Lengkap Ibu</Text>
                        <Text style={styles.paperBioVal}>: {ibuName}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>26. NIK Ibu (16 Digit)</Text>
                        <Text style={styles.paperBioVal}>: {ibuNik}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>27. Pendidikan Terakhir Ibu</Text>
                        <Text style={styles.paperBioVal}>: {ibuEdu}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>28. Pekerjaan Utama Ibu</Text>
                        <Text style={styles.paperBioVal}>: {ibuJob}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>29. No. WA / Kontak Ibu</Text>
                        <Text style={styles.paperBioVal}>: {ibuPhone}</Text>
                      </View>

                      {/* SECTION D: DATA WALI SISWA (OPSIONAL) */}
                      {(waliName !== '-' || waliPhone !== '-' || waliNik !== '-') && (
                        <>
                          <View style={styles.paperBioSectionHeader}>
                            <Text style={styles.paperBioSectionHeaderText}>D. DATA WALI SISWA</Text>
                          </View>
                          <View style={styles.paperBioRow}>
                            <Text style={styles.paperBioKey}>30. Nama Lengkap Wali</Text>
                            <Text style={styles.paperBioVal}>: {waliName}</Text>
                          </View>
                          <View style={styles.paperBioRow}>
                            <Text style={styles.paperBioKey}>31. NIK Wali Siswa</Text>
                            <Text style={styles.paperBioVal}>: {waliNik}</Text>
                          </View>
                          <View style={styles.paperBioRow}>
                            <Text style={styles.paperBioKey}>32. Pekerjaan Utama Wali</Text>
                            <Text style={styles.paperBioVal}>: {waliJob}</Text>
                          </View>
                          <View style={styles.paperBioRow}>
                            <Text style={styles.paperBioKey}>33. No. WA / Kontak Wali</Text>
                            <Text style={styles.paperBioVal}>: {waliPhone}</Text>
                          </View>
                        </>
                      )}

                      {/* SECTION E: ALAMAT DOMISILI */}
                      <View style={styles.paperBioSectionHeader}>
                        <Text style={styles.paperBioSectionHeaderText}>E. ALAMAT TEMPAT TINGGAL (DOMISILI)</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>34. Alamat Lengkap Domisili</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.address || meta.alamat_siswa || singlePrintItem?.alamat || '-'}</Text>
                      </View>
                    </>
                  );
                })()}

                {resource === 'employees' && (() => {
                  const meta = (singlePrintItem?.metadata && typeof singlePrintItem.metadata === 'object') ? singlePrintItem.metadata : {};
                  const gelar = [singlePrintItem?.gelar_depan, singlePrintItem?.gelar_belakang].filter(Boolean).join(' / ');

                  return (
                    <>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>2. NIY / NIP</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.niy || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>3. NIK Pegawai</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.nik || meta.nik || '-'}</Text>
                      </View>
                      {gelar ? (
                        <View style={styles.paperBioRow}>
                          <Text style={styles.paperBioKey}>4. Gelar Akademik</Text>
                          <Text style={styles.paperBioVal}>: {gelar}</Text>
                        </View>
                      ) : null}
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>5. Jabatan / Penugasan</Text>
                        <Text style={styles.paperBioVal}>: {nestedName(singlePrintItem?.position || singlePrintItem?.jabatan) || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>6. Unit Pendidikan</Text>
                        <Text style={styles.paperBioVal}>: {nestedName(singlePrintItem?.unit) || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>7. Status Kepegawaian</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.status_pegawai || 'Pegawai Tetap'} • Status: {singlePrintItem?.status || 'Aktif'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>8. Tanggal Masuk (TMT)</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.tanggal_masuk ? String(singlePrintItem.tanggal_masuk).split('T')[0] : '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>9. Jenis Kelamin</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.jenis_kelamin === 'P' ? 'Perempuan (P)' : 'Laki-laki (L)'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>10. Kontak WhatsApp / HP</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.no_hp || singlePrintItem?.phone || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>11. Email Resmi</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.email || '-'}</Text>
                      </View>
                      <View style={styles.paperBioRow}>
                        <Text style={styles.paperBioKey}>12. Alamat Domisili</Text>
                        <Text style={styles.paperBioVal}>: {singlePrintItem?.alamat || singlePrintItem?.address || '-'}</Text>
                      </View>
                    </>
                  );
                })()}

                {resource === 'classes' && (
                  <>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>2. Kode Rombel</Text>
                      <Text style={styles.paperBioVal}>: {singlePrintItem?.kode_kelas || singlePrintItem?.code || '-'}</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>3. Tingkat / Jenjang</Text>
                      <Text style={styles.paperBioVal}>: Tingkat {singlePrintItem?.tingkat || '-'} ({singlePrintItem?.jenjang || '-'})</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>4. Wali Kelas</Text>
                      <Text style={styles.paperBioVal}>: {nestedName(singlePrintItem?.waliKelas || singlePrintItem?.wali_kelas) || '-'}</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>5. Kapasitas / Terisi</Text>
                      <Text style={styles.paperBioVal}>: {singlePrintItem?.kapasitas != null ? `${singlePrintItem.kapasitas} Siswa` : '-'} / {singlePrintItem?.students_count || 0} Terdaftar</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>6. Status Rombel</Text>
                      <Text style={styles.paperBioVal}>: {singlePrintItem?.status || 'Aktif'}</Text>
                    </View>
                  </>
                )}

                {resource === 'positions' && (
                  <>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>2. Kode Jabatan</Text>
                      <Text style={styles.paperBioVal}>: {singlePrintItem?.kode_jabatan || singlePrintItem?.code || '-'}</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>3. Level Jabatan</Text>
                      <Text style={styles.paperBioVal}>: Level {singlePrintItem?.level_jabatan || singlePrintItem?.level || '-'}</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>4. Satuan Kerja</Text>
                      <Text style={styles.paperBioVal}>: {singlePrintItem?.satuan_kerja || '-'}</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>5. Scope Hak Akses</Text>
                      <Text style={styles.paperBioVal}>: {singlePrintItem?.scope_akses || singlePrintItem?.scope || 'unit_sendiri'}</Text>
                    </View>
                    <View style={styles.paperBioRow}>
                      <Text style={styles.paperBioKey}>6. Status Keaktifan</Text>
                      <Text style={styles.paperBioVal}>: {singlePrintItem?.status || (singlePrintItem?.is_active !== false ? 'Aktif' : 'Nonaktif')}</Text>
                    </View>
                  </>
                )}
              </View>

              <View style={styles.paperSignWrapper}>
                {(() => {
                  const sign = getPrintSignConfig(singleItemUnitName);
                  return (
                    <>
                      <View style={styles.paperSignCol}>
                        <Text style={styles.paperSignDate}>{sign.leftDate}</Text>
                        <Text style={styles.paperSignRole}>{sign.leftRole}</Text>
                        <View style={styles.paperSignSpace} />
                        <Text style={styles.paperSignName}>{sign.leftName}</Text>
                        <Text style={styles.paperSignNiy}>{sign.leftNip}</Text>
                      </View>
                      <View style={styles.paperSignCol}>
                        <Text style={styles.paperSignDate}>{sign.rightHeading}</Text>
                        <Text style={styles.paperSignRole}>{sign.rightRole}</Text>
                        <View style={styles.paperSignSpace} />
                        <Text style={styles.paperSignName}>{sign.rightName}</Text>
                        <Text style={styles.paperSignNiy}>{sign.rightNip}</Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── MODAL CETAK REKAPITULASI A4 / UNDUH PDF (FILTER DINAMIS) ── */}
      <Modal
        visible={rekapPrintModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setRekapPrintModalVisible(false)}
      >
        <View style={styles.printScreen}>
          <View style={styles.printHeader}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setRekapPrintModalVisible(false)}
              style={styles.printHeaderBackBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <Text numberOfLines={1} style={styles.printHeaderTitle}>
                Pratinjau Cetak {resourceLabels[resource]}
              </Text>
              <Text numberOfLines={1} style={styles.printHeaderSub}>
                Format Dokumen A4 • {filteredItems.length} Data Terfilter
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => notifyPrint(`Perintah cetak laporan ${resourceLabels[resource].toLowerCase()} telah dikirim ke printer.`)}
                style={styles.printHeaderActionBtn}
              >
                <MaterialCommunityIcons name="printer" size={16} color="#004D32" />
                <Text style={styles.printHeaderActionBtnText}>Cetak</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => notifyPrint(`Dokumen PDF rekapitulasi data ${resourceLabels[resource].toLowerCase()} berhasil diunduh.`)}
                style={[styles.printHeaderActionBtn, { backgroundColor: '#FDE68A' }]}
              >
                <MaterialCommunityIcons name="download" size={16} color="#78350F" />
                <Text style={[styles.printHeaderActionBtnText, { color: '#78350F' }]}>PDF</Text>
              </TouchableOpacity>
            </View>
          </View>

          {printNotice ? (
            <View style={styles.printNoticeBanner}>
              <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
              <Text style={styles.printNoticeBannerText}>{printNotice}</Text>
            </View>
          ) : null}

          <ScrollView
            style={{ flex: 1, backgroundColor: '#CBD5E1' }}
            contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.paperSheet}>
              {/* KOP RESMI STANDAR DATA MASTER: LOGO YAYASAN (KIRI) & LOGO UNIT (KANAN) */}
              <View style={styles.paperKopRow}>
                {/* Logo Kiri: Logo Yayasan (dari Site Settings / Branding) */}
                <View style={styles.paperKopLogoBox}>
                  {siteLogoUrl ? (
                    <Image source={{ uri: siteLogoUrl }} style={styles.paperKopLogoImg} resizeMode="contain" />
                  ) : (
                    <Image source={require('../../assets/logo.png')} style={styles.paperKopLogoImg} resizeMode="contain" />
                  )}
                </View>
                <View style={styles.paperKopCenterBox}>
                  <Text style={styles.paperKopOrgName}>{branding?.school_name?.toUpperCase() || 'YAYASAN DAR EL-IMAN PADANG'}</Text>
                  <Text style={styles.paperKopSchoolUnit}>{rekapSchoolUnitName}</Text>
                  <Text style={styles.paperKopAddress}>{rekapSchoolUnitAddress}</Text>
                </View>
                {/* Logo Kanan: Logo Unit Pendidikan */}
                <View style={styles.paperKopLogoBox}>
                  {rekapUnitLogo ? (
                    <Image source={{ uri: rekapUnitLogo }} style={styles.paperKopLogoImg} resizeMode="contain" />
                  ) : siteLogoUrl ? (
                    <Image source={{ uri: siteLogoUrl }} style={styles.paperKopLogoImg} resizeMode="contain" />
                  ) : (
                    <Image source={require('../../assets/logo.png')} style={styles.paperKopLogoImg} resizeMode="contain" />
                  )}
                </View>
              </View>

              <View style={styles.paperKopDividerContainer}>
                <View style={styles.paperKopDividerThick} />
                <View style={styles.paperKopDividerThin} />
              </View>

              <View style={styles.paperDocHeader}>
                <Text style={styles.paperDocTitle}>
                  LAPORAN DATA MASTER {resourceLabels[resource].toUpperCase()}
                </Text>
                <Text style={styles.paperDocSub}>
                  {activeFilterDescription.toUpperCase()} • TAHUN AJARAN {currentAyName}
                </Text>
                <View style={styles.paperDocMetaRow}>
                  <Text style={styles.paperDocMetaText}>Dicetak pada: {formattedPrintDate} WIB</Text>
                  <Text style={styles.paperDocMetaBullet}>•</Text>
                  <Text style={styles.paperDocMetaText}>Total Record: {filteredItems.length} Data</Text>
                  <Text style={styles.paperDocMetaBullet}>•</Text>
                  <Text style={styles.paperDocMetaBadge}>Dokumen Resmi</Text>
                </View>
              </View>

              <View style={styles.paperFilterBox}>
                <View style={styles.paperFilterBoxHeader}>
                  <MaterialCommunityIcons name="tune-variant" size={14} color="#004D32" />
                  <Text style={styles.paperFilterBoxTitle}>PARAMETER & FILTER LAPORAN</Text>
                </View>
                <View style={styles.paperFilterGrid}>
                  <View style={styles.paperFilterCol}>
                    <Text style={styles.paperFilterLabel}>Kategori Data</Text>
                    <Text style={styles.paperFilterValue}>{resourceLabels[resource]}</Text>
                  </View>
                  <View style={styles.paperFilterCol}>
                    <Text style={styles.paperFilterLabel}>Filter Aktif</Text>
                    <Text style={styles.paperFilterValue}>{activeFilterDescription}</Text>
                  </View>
                  <View style={styles.paperFilterCol}>
                    <Text style={styles.paperFilterLabel}>Tanggal Cetak</Text>
                    <Text style={styles.paperFilterValue}>{formattedPrintDate}</Text>
                  </View>
                  <View style={styles.paperFilterCol}>
                    <Text style={styles.paperFilterLabel}>Total Data</Text>
                    <Text style={[styles.paperFilterValue, { color: '#059669', fontWeight: '800' }]}>
                      {filteredItems.length} {resourceLabels[resource]} ditemukan
                    </Text>
                  </View>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                <View style={styles.paperTable}>
                  <View style={styles.paperTableHead}>
                    <Text style={[styles.paperTh, { width: 34, textAlign: 'center' }]}>NO</Text>
                    <Text style={[styles.paperTh, { width: 90 }]}>
                      {resource === 'students' ? 'NIS / NISN' : resource === 'employees' ? 'NIY / NIP' : 'KODE'}
                    </Text>
                    <Text style={[styles.paperTh, { width: 160 }]}>NAMA LENGKAP</Text>
                    <Text style={[styles.paperTh, { width: 110 }]}>
                      {resource === 'students' ? 'KELAS / UNIT' : resource === 'employees' ? 'JABATAN' : 'JENJANG / TINGKAT'}
                    </Text>
                    <Text style={[styles.paperTh, { width: 40, textAlign: 'center' }]}>JK</Text>
                    <Text style={[styles.paperTh, { width: 75, textAlign: 'center' }]}>STATUS</Text>
                    <Text style={[styles.paperTh, { width: 100 }]}>KONTAK</Text>
                  </View>

                  {filteredItems.length === 0 ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <Text style={{ fontSize: 12, color: '#94A3B8', fontStyle: 'italic' }}>
                        Tidak ada data yang memenuhi filter yang dipilih.
                      </Text>
                    </View>
                  ) : (
                    filteredItems.slice(0, 100).map((st: any, idx: number) => {
                      const idCode = st.nis || st.niy || st.kode_kelas || st.code || '-';
                      const titleName = displayName(st);
                      const detailInfo = resource === 'students'
                        ? nestedName(st.kelas) || nestedName(st.unit) || '-'
                        : resource === 'employees'
                          ? nestedName(st.position || st.jabatan) || '-'
                          : `${st.tingkat || ''} (${st.jenjang || ''})`;
                      const gender = st.jenis_kelamin || st.gender || '-';
                      const statusVal = st.status || (st.is_active !== false ? 'Aktif' : 'Nonaktif');
                      const contact = st.parent_phone || st.no_hp || st.phone || '-';

                      return (
                        <View
                          key={st.id || `print-row-${idx}`}
                          style={[
                            styles.paperTableRow,
                            idx % 2 === 1 && { backgroundColor: '#F8FAFC' },
                          ]}
                        >
                          <Text style={[styles.paperTd, { width: 34, textAlign: 'center', fontWeight: '700' }]}>
                            {idx + 1}
                          </Text>
                          <Text style={[styles.paperTd, { width: 90, fontFamily: 'monospace', fontSize: 10 }]}>
                            {idCode}
                          </Text>
                          <Text numberOfLines={1} style={[styles.paperTd, { width: 160, fontWeight: '700', color: '#0F172A' }]}>
                            {titleName}
                          </Text>
                          <Text numberOfLines={1} style={[styles.paperTd, { width: 110, fontSize: 10.5 }]}>
                            {detailInfo}
                          </Text>
                          <Text style={[styles.paperTd, { width: 40, textAlign: 'center', fontWeight: '700' }]}>
                            {gender === 'female' ? 'P' : gender === 'male' ? 'L' : gender}
                          </Text>
                          <View style={{ width: 75, alignItems: 'center' }}>
                            <Text style={[
                              styles.paperTdBadge,
                              statusVal === 'Aktif' ? { backgroundColor: '#D1FAE5', color: '#065F46' } : { backgroundColor: '#F1F5F9', color: '#475569' },
                            ]}>
                              {statusVal}
                            </Text>
                          </View>
                          <Text numberOfLines={1} style={[styles.paperTd, { width: 100, fontSize: 10 }]}>
                            {contact}
                          </Text>
                        </View>
                      );
                    })
                  )}
                </View>
              </ScrollView>

              {filteredItems.length > 100 && (
                <View style={styles.paperTableNotice}>
                  <Text style={styles.paperTableNoticeText}>
                    * Menampilkan 100 dari total {filteredItems.length} data pada pratinjau mobile. Seluruh {filteredItems.length} data akan tercetak lengkap saat dicetak atau diunduh ke PDF.
                  </Text>
                </View>
              )}

              <View style={styles.paperSignWrapper}>
                {(() => {
                  const sign = getPrintSignConfig(rekapSchoolUnitName);
                  return (
                    <>
                      <View style={styles.paperSignCol}>
                        <Text style={styles.paperSignDate}>{sign.leftDate}</Text>
                        <Text style={styles.paperSignRole}>{sign.leftRole}</Text>
                        <View style={styles.paperSignSpace} />
                        <Text style={styles.paperSignName}>{sign.leftName}</Text>
                        <Text style={styles.paperSignNiy}>{sign.leftNip}</Text>
                      </View>
                      <View style={styles.paperSignCol}>
                        <Text style={styles.paperSignDate}>{sign.rightHeading}</Text>
                        <Text style={styles.paperSignRole}>{sign.rightRole}</Text>
                        <View style={styles.paperSignSpace} />
                        <Text style={styles.paperSignName}>{sign.rightName}</Text>
                        <Text style={styles.paperSignNiy}>{sign.rightNip}</Text>
                      </View>
                    </>
                  );
                })()}
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── MODAL FORM TAMBAH / UBAH DATA ── */}
      <Modal visible={modalVisible} animationType="slide" onRequestClose={() => setModalVisible(false)}>
        <KeyboardAvoidingView style={styles.modalScreen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          {/* Header Hero Modern */}
          <View style={styles.modalHeroHeaderWrapper}>
            <LinearGradient
              colors={['#004D32', '#0E5C44', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.modalHeroHeaderGradient}
            >
              <View style={styles.modalTopAccentLine} />
              <View style={styles.modalHeroHeaderContent}>
                <View style={styles.modalHeroIconBox}>
                  <MaterialCommunityIcons
                    name={
                      resource === 'students'
                        ? 'account-school-outline'
                        : resource === 'employees'
                          ? 'badge-account-outline'
                          : 'google-classroom'
                    }
                    size={24}
                    color="#FFFFFF"
                  />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={styles.modalBadgeRow}>
                    <View style={styles.modalRoleBadge}>
                      <Text style={styles.modalRoleBadgeText}>
                        {editingId ? 'MODE PERBARUI DATA' : 'REGISTRASI BARU'}
                      </Text>
                    </View>
                    <View style={styles.modalYearBadge}>
                      <Text style={styles.modalYearBadgeText}>TP {currentAyName}</Text>
                    </View>
                  </View>
                  <Text style={styles.modalHeroTitle} numberOfLines={1}>
                    {editingId ? 'Ubah' : 'Tambah'} Data {resourceLabels[resource]}
                  </Text>
                  <Text style={styles.modalHeroSubtitle} numberOfLines={1}>
                    Sistem Manajemen Sekolah Terpadu • TP {currentAyName}
                  </Text>
                </View>

                {editingId && resource === 'students' ? (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const currentStudent = items.find((it: any) => String(it.id) === String(editingId)) || form;
                      setReturnToEditId(editingId);
                      setModalVisible(false);
                      setSinglePrintItem(currentStudent);
                    }}
                    style={styles.modalHeroQuickPrintBtn}
                  >
                    <MaterialCommunityIcons name="printer" size={20} color="#FFFFFF" />
                  </TouchableOpacity>
                ) : null}

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setModalVisible(false)}
                  style={styles.modalHeroCloseBtn}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </LinearGradient>
          </View>

          {/* Body Form */}
          <ScrollView
            contentContainerStyle={styles.modalContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {renderFields()}

            {/* Status Keaktifan Data Card */}
            {resource !== 'employees' && resource !== 'classes' ? (
              <View style={styles.activeStatusCard}>
                <View style={styles.activeStatusIconBox}>
                  <MaterialCommunityIcons
                    name={form.is_active !== false ? 'check-decagram' : 'close-circle-outline'}
                    size={22}
                    color={form.is_active !== false ? '#059669' : '#94A3B8'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.activeStatusTitle}>Status Keaktifan Data</Text>
                  <Text style={styles.activeStatusSub}>
                    {form.is_active !== false
                      ? 'Data berstatus aktif dan terdaftar pada sistem'
                      : 'Data dinonaktifkan sementara dari operasional'}
                  </Text>
                </View>
                <Switch
                  value={form.is_active !== false}
                  onValueChange={(value) => setField('is_active', value)}
                  trackColor={{ false: '#CBD5E1', true: '#A7F3D0' }}
                  thumbColor={form.is_active !== false ? '#059669' : '#64748B'}
                />
              </View>
            ) : null}
          </ScrollView>

          {/* Sticky Modal Bottom Footer */}
          <View style={styles.modalStickyFooter}>
            {formError ? (
              <View style={styles.modalErrorBanner}>
                <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#BE123C" />
                <Text style={styles.modalErrorBannerText}>{formError}</Text>
              </View>
            ) : null}

            {editingId && resource === 'students' ? (
              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => {
                  const currentStudent = items.find((it: any) => String(it.id) === String(editingId)) || form;
                  setReturnToEditId(editingId);
                  setModalVisible(false);
                  setSinglePrintItem(currentStudent);
                }}
                style={styles.modalPrintBannerBtn}
              >
                <LinearGradient
                  colors={['#ECFDF5', '#D1FAE5']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalPrintBannerGradient}
                >
                  <View style={styles.modalPrintBannerIconWrap}>
                    <MaterialCommunityIcons name="printer-eye" size={20} color="#047857" />
                  </View>
                  <View style={styles.modalPrintBannerTextWrap}>
                    <Text style={styles.modalPrintBannerTitle}>Cetak Biodata A4 Siswa</Text>
                    <Text style={styles.modalPrintBannerSubtitle}>Pratinjau formulir resmi lengkap KOP Yayasan & Unit</Text>
                  </View>
                  <View style={styles.modalPrintBannerBadge}>
                    <Text style={styles.modalPrintBannerBadgeText}>Format A4</Text>
                    <MaterialCommunityIcons name="chevron-right" size={16} color="#047857" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>
            ) : null}

            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={saving}
                onPress={() => setModalVisible(false)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={saving}
                onPress={() => void submitForm()}
                style={[styles.modalSaveBtn, saving && { opacity: 0.7 }]}
              >
                <LinearGradient
                  colors={['#059669', '#0E5C44', '#004D32']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.modalSaveBtnGradient}
                >
                  {saving ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <MaterialCommunityIcons name="content-save-check-outline" size={19} color="#FFFFFF" />
                  )}
                  <Text style={styles.modalSaveBtnText}>
                    {saving ? 'Menyimpan...' : (editingId ? 'Simpan Perubahan' : 'Simpan Data ' + resourceLabels[resource])}
                  </Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL PICKER SELEKSI FIELD FORM (UNIT, KELAS, AGAMA, STATUS, DLL) ── */}
      <Modal
        visible={!!pickerModal?.visible}
        animationType="fade"
        transparent
        onRequestClose={() => setPickerModal(null)}
        statusBarTranslucent
      >
        <View style={styles.dropdownModalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setPickerModal(null)} />
          <View style={[styles.dropdownModalSheet, { maxHeight: 460 }]}>
            <View style={styles.dropdownModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <MaterialCommunityIcons name="format-list-checks" size={20} color="#059669" />
                <Text style={styles.dropdownModalTitle}>{pickerModal?.title || 'Pilih Opsi'}</Text>
              </View>
              <TouchableOpacity onPress={() => setPickerModal(null)} style={styles.dropdownModalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Pencarian dalam opsi picker jika opsi lebih dari 4 */}
            {(pickerModal?.options?.length || 0) > 4 && (
              <View style={styles.dropdownSearchBox}>
                <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
                <NativeTextInput
                  value={pickerSearch}
                  onChangeText={setPickerSearch}
                  placeholder="Cari dalam pilihan..."
                  placeholderTextColor="#94A3B8"
                  style={styles.dropdownSearchNativeInput}
                />
                {pickerSearch.length > 0 && (
                  <TouchableOpacity onPress={() => setPickerSearch('')}>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            )}

            <ScrollView showsVerticalScrollIndicator={true} style={{ maxHeight: 320 }}>
              {(!pickerModal?.options || pickerModal.options.length === 0) ? (
                <View style={{ padding: 24, alignItems: 'center', justifyContent: 'center' }}>
                  <MaterialCommunityIcons name="database-off-outline" size={32} color="#94A3B8" />
                  <Text style={{ marginTop: 8, fontSize: 13, color: '#64748B', textAlign: 'center', fontWeight: '600' }}>
                    Belum ada pilihan master di database.
                  </Text>
                  <Text style={{ marginTop: 4, fontSize: 11, color: '#94A3B8', textAlign: 'center' }}>
                    Silakan kelola opsi di menu Pengaturan Opsi Bisnis.
                  </Text>
                </View>
              ) : (
                pickerModal?.options
                  ?.filter((opt) =>
                    !pickerSearch ||
                    opt.name.toLowerCase().includes(pickerSearch.toLowerCase()) ||
                    (opt.subtitle && opt.subtitle.toLowerCase().includes(pickerSearch.toLowerCase()))
                  )
                  .map((option) => {
                  const isSelected = textField(pickerModal.fieldKey) === option.id;
                  return (
                    <TouchableOpacity
                      key={option.id}
                      activeOpacity={option.disabled ? 0.9 : 0.8}
                      onPress={() => {
                        if (option.disabled) {
                          setFeedbackModal({
                            visible: true,
                            type: 'warning',
                            title: 'Kuota Rombel Penuh',
                            message: option.disabledReason || `Kelas '${option.name}' sudah mencapai kapasitas maksimal. Silakan pilih kelas atau rombel lain yang masih tersedia.`,
                            actionLabel: 'Mengerti',
                            onConfirm: () => setFeedbackModal(null),
                          });
                          return;
                        }
                        if (pickerModal.onSelect) {
                          pickerModal.onSelect(option.id);
                        } else {
                          setField(pickerModal.fieldKey, option.id);
                        }
                        setPickerModal(null);
                        setPickerSearch('');
                      }}
                      style={[
                        styles.dropdownItem,
                        isSelected && styles.dropdownItemActive,
                        option.disabled && { backgroundColor: '#F8FAFC', opacity: 0.7 },
                      ]}
                    >
                      <View style={{ flex: 1, paddingRight: 8 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text
                            style={[
                              styles.dropdownItemText,
                              isSelected && styles.dropdownItemTextActive,
                              option.disabled && { color: '#94A3B8' },
                            ]}
                          >
                            {option.name}
                          </Text>
                          {option.disabled && (
                            <View style={{ backgroundColor: '#FEE2E2', paddingHorizontal: 6, paddingVertical: 1.5, borderRadius: 6 }}>
                              <Text style={{ fontSize: 9.5, fontWeight: '800', color: '#DC2626' }}>PENUH</Text>
                            </View>
                          )}
                        </View>
                        {option.subtitle ? (
                          <Text
                            style={{
                              fontSize: 11,
                              color: option.disabled ? '#EF4444' : isSelected ? '#059669' : '#64748B',
                              marginTop: 2,
                              fontWeight: option.disabled ? '600' : '400',
                            }}
                          >
                            {option.subtitle}
                          </Text>
                        ) : null}
                      </View>
                      {option.disabled ? (
                        <MaterialCommunityIcons name="lock-outline" size={17} color="#DC2626" />
                      ) : isSelected ? (
                        <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                      ) : null}
                    </TouchableOpacity>
                  );
                })
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL AJUKAN PINDAH UNIT (TWO-WAY HANDSHAKE) ── */}
      <Modal
        visible={mutasiModalVisible && Boolean(mutasiStudent)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setMutasiModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.formModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setMutasiModalVisible(false)} />
          <View style={styles.formModalCard}>
            <LinearGradient
              colors={['#0D9488', '#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalTopAccentStrip}
            />
            <View style={styles.formModalHeader}>
              <View style={styles.formModalHeaderLeft}>
                <LinearGradient
                  colors={['#0D9488', '#0F766E', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.formModalIcon}
                >
                  <MaterialCommunityIcons name="swap-horizontal" size={20} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formModalTitle}>Ajukan Pindah Unit</Text>
                  <Text style={styles.formModalSubtitle} numberOfLines={1}>
                    {mutasiStudent?.full_name || mutasiStudent?.nama_lengkap || mutasiStudent?.name}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setMutasiModalVisible(false)} style={styles.formModalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
              {renderSelectField({
                label: 'Unit Pendidikan Tujuan',
                value: availableUnits.find((u) => u.id === mutasiForm.unit_tujuan_id)?.name || 'Pilih Unit Tujuan...',
                placeholder: 'Pilih unit tujuan...',
                required: true,
                icon: 'domain',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Unit Tujuan',
                    fieldKey: 'unit_tujuan_id',
                    options: availableUnits.filter((u) => u.id !== String(mutasiStudent?.unit_id || mutasiStudent?.unit?.id)),
                    onSelect: (val) => setMutasiForm((p) => ({ ...p, unit_tujuan_id: val })),
                  });
                },
              })}

              <View>
                <Text style={styles.formLabel}>Alasan Pindah Unit</Text>
                <TextInput
                  value={mutasiForm.alasan}
                  onChangeText={(val) => setMutasiForm((p) => ({ ...p, alasan: val }))}
                  placeholder="Contoh: Naik jenjang dari TK ke SD, pindah domisili..."
                  placeholderTextColor="#94A3B8"
                  style={styles.formTextInput}
                />
              </View>

              <View>
                <Text style={styles.formLabel}>Catatan untuk TU Tujuan</Text>
                <TextInput
                  value={mutasiForm.catatan}
                  onChangeText={(val) => setMutasiForm((p) => ({ ...p, catatan: val }))}
                  placeholder="Catatan dokumen atau berkas siswa..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={2}
                  style={[styles.formTextInput, { height: 60 }]}
                />
              </View>

              <View style={styles.formNoticeCard}>
                <MaterialCommunityIcons name="shield-airplane-outline" size={20} color="#0D9488" />
                <View style={{ flex: 1 }}>
                  <Text style={styles.formNoticeTitle}>Alur Persetujuan (Two-Way Handshake)</Text>
                  <Text style={styles.formNoticeText}>
                    Setelah dikirim, status siswa menjadi 'Proses Mutasi'. TU unit tujuan akan menerima notifikasi antrean untuk verifikasi berkas dan penetapan rombel kelas tujuan.
                  </Text>
                </View>
              </View>
            </ScrollView>

            <View style={styles.formModalFooter}>
              <TouchableOpacity
                style={styles.formCancelBtn}
                onPress={() => setMutasiModalVisible(false)}
                disabled={submittingMutasi}
              >
                <Text style={styles.formCancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formSubmitBtn, { backgroundColor: '#0D9488' }]}
                onPress={submitMutasi}
                disabled={submittingMutasi || !mutasiForm.unit_tujuan_id}
              >
                {submittingMutasi ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.formSubmitBtnText}>Kirim Pengajuan</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL ANTREAN PINDAHAN MASUK (TU APPROVAL) ── */}
      <Modal
        visible={incomingModalVisible}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setIncomingModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.formModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIncomingModalVisible(false)} />
          <View style={[styles.formModalCard, { maxHeight: '88%' }]}>
            <LinearGradient
              colors={['#0D9488', '#10B981', '#059669']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalTopAccentStrip}
            />
            <View style={styles.formModalHeader}>
              <View style={styles.formModalHeaderLeft}>
                <LinearGradient
                  colors={['#0D9488', '#0F766E', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.formModalIcon}
                >
                  <MaterialCommunityIcons name="swap-horizontal-bold" size={20} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.formModalTitle}>Siswa Pindahan Masuk</Text>
                    <View style={styles.modalHeaderPill}>
                      <Text style={styles.modalHeaderPillText}>Verifikasi TU</Text>
                    </View>
                  </View>
                  <Text style={styles.formModalSubtitle}>Daftar Permohonan Mutasi Masuk Unit Ini</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setIncomingModalVisible(false)} style={styles.formModalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16 }} showsVerticalScrollIndicator={false}>
              {loadingIncoming ? (
                <View style={styles.incomingLoadingBox}>
                  <ActivityIndicator size="small" color="#059669" />
                  <Text style={styles.incomingLoadingText}>Memuat permohonan mutasi...</Text>
                </View>
              ) : incomingMutations.length === 0 ? (
                <View style={styles.emptyIncomingCard}>
                  {/* Visual 3D Icon Cluster */}
                  <View style={styles.emptyIncomingIconOuter}>
                    <LinearGradient
                      colors={['#10B981', '#059669', '#047857']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 1 }}
                      style={styles.emptyIncomingIconInner}
                    >
                      <MaterialCommunityIcons name="shield-check" size={30} color="#FFFFFF" />
                    </LinearGradient>
                    <View style={styles.emptyIncomingIconSparkle}>
                      <MaterialCommunityIcons name="creation" size={13} color="#F59E0B" />
                    </View>
                  </View>

                  {/* Lencana Status */}
                  <View style={styles.emptyIncomingBadge}>
                    <MaterialCommunityIcons name="check-decagram" size={13} color="#047857" />
                    <Text style={styles.emptyIncomingBadgeText}>SEMUA DATA TERVERIFIKASI</Text>
                  </View>

                  {/* Judul & Deskripsi Informatif */}
                  <Text style={styles.emptyIncomingTitle}>Tidak Ada Mutasi Masuk</Text>
                  <Text style={styles.emptyIncomingDesc}>
                    Saat ini belum ada berkas santri atau siswa mutasi yang menunggu verifikasi pada unit sekolah Anda.
                  </Text>

                  {/* Callout Notice Info Box */}
                  <View style={styles.emptyIncomingCallout}>
                    <MaterialCommunityIcons name="information-outline" size={18} color="#0D9488" style={{ marginTop: 1 }} />
                    <Text style={styles.emptyIncomingCalloutText}>
                      Permohonan perpindahan dari unit asal akan otomatis masuk ke antrean ini secara real-time dan memicu notifikasi.
                    </Text>
                  </View>

                  {/* Tombol Periksa Ulang Antrean */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => void loadIncomingMutations()}
                    style={styles.emptyIncomingRefreshBtn}
                  >
                    <MaterialCommunityIcons name="refresh" size={16} color="#059669" />
                    <Text style={styles.emptyIncomingRefreshBtnText}>Periksa Ulang Antrean</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                <View style={{ gap: 12 }}>
                  {incomingMutations.map((mutasi) => {
                    const st = mutasi.student || {};
                    return (
                      <View key={mutasi.id} style={styles.incomingItemCard}>
                        {/* Header Item */}
                        <View style={styles.incomingItemHeader}>
                          <View style={styles.incomingItemAvatar}>
                            <MaterialCommunityIcons name="account-school" size={20} color="#059669" />
                          </View>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.incomingItemName}>
                              {st.full_name || st.nama_lengkap || st.name || 'Siswa'}
                            </Text>
                            <Text style={styles.incomingItemSub}>
                              NIS: {st.nis || '-'} • NISN: {st.nisn || '-'}
                            </Text>
                          </View>
                          <View style={styles.incomingUnitBadge}>
                            <MaterialCommunityIcons name="office-building" size={12} color="#0D9488" />
                            <Text style={styles.incomingUnitBadgeText}>
                              Asal: {mutasi.unit_asal?.nama_unit || mutasi.unit_asal?.name || '-'}
                            </Text>
                          </View>
                        </View>

                        {Boolean(mutasi.alasan) && (
                          <View style={styles.incomingReasonBox}>
                            <MaterialCommunityIcons name="format-quote-open" size={14} color="#94A3B8" />
                            <Text style={styles.incomingReasonText}>
                              {mutasi.alasan}
                            </Text>
                          </View>
                        )}

                        {Boolean(mutasi.catatan) && (
                          <Text style={styles.incomingNoteText}>
                            Catatan: {mutasi.catatan}
                          </Text>
                        )}

                        {/* Action Buttons */}
                        <View style={styles.incomingItemActions}>
                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => {
                              setSelectedIncoming(mutasi);
                              setApprovalKelasId('');
                              setApprovalCatatan('');
                            }}
                            style={styles.incomingApproveBtn}
                          >
                            <LinearGradient
                              colors={['#059669', '#0E5C44', '#004D32']}
                              start={{ x: 0, y: 0 }}
                              end={{ x: 1, y: 0 }}
                              style={styles.incomingApproveBtnGrad}
                            >
                              <MaterialCommunityIcons name="check-circle" size={16} color="#FFFFFF" />
                              <Text style={styles.incomingApproveBtnText}>Terima & Tentukan Kelas</Text>
                            </LinearGradient>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.85}
                            onPress={() => {
                              setSelectedIncoming(mutasi);
                              setRejectModalVisible(true);
                              setRejectReason('');
                            }}
                            style={styles.incomingRejectBtn}
                          >
                            <MaterialCommunityIcons name="close-circle" size={16} color="#E11D48" />
                            <Text style={styles.incomingRejectBtnText}>Tolak</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )}
            </ScrollView>

            <View style={styles.formModalFooter}>
              <TouchableOpacity
                style={[styles.formCancelBtn, { width: '100%' }]}
                onPress={() => setIncomingModalVisible(false)}
              >
                <Text style={styles.formCancelBtnText}>Tutup Pemberitahuan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── SUB-MODAL TETAPKAN KELAS TUJUAN (APPROVE MUTASI) ── */}
      <Modal
        visible={Boolean(selectedIncoming && !rejectModalVisible)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setSelectedIncoming(null)}
        statusBarTranslucent
      >
        <View style={styles.formModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedIncoming(null)} />
          <View style={styles.formModalCard}>
            <LinearGradient
              colors={['#059669', '#10B981', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalTopAccentStrip}
            />
            <View style={styles.formModalHeader}>
              <View style={styles.formModalHeaderLeft}>
                <LinearGradient
                  colors={['#059669', '#047857', '#065F46']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.formModalIcon}
                >
                  <MaterialCommunityIcons name="check-decagram" size={20} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formModalTitle}>Tetapkan Kelas Tujuan</Text>
                  <Text style={styles.formModalSubtitle} numberOfLines={1}>
                    {selectedIncoming?.student?.full_name || selectedIncoming?.student?.nama_lengkap}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedIncoming(null)} style={styles.formModalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
              {renderSelectField({
                label: 'Kelas / Rombel Tujuan',
                value: availableClasses.find((c) => c.id === approvalKelasId)?.name || 'Pilih Kelas Tujuan...',
                placeholder: 'Pilih kelas penempatan...',
                required: true,
                icon: 'google-classroom',
                onPress: () => {
                  setPickerSearch('');
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Kelas Tujuan',
                    fieldKey: 'approvalKelasId',
                    options: availableClasses.map((c) => ({
                      id: c.id,
                      name: c.name,
                      subtitle: c.kapasitas && c.kapasitas > 0
                        ? (c.is_full ? `⚠️ Kuota Penuh (${c.jumlah_siswa}/${c.kapasitas} Siswa)` : `Tersedia: ${c.jumlah_siswa}/${c.kapasitas} Siswa`)
                        : (c.jumlah_siswa !== undefined ? `${c.jumlah_siswa} Siswa` : ''),
                      disabled: Boolean(c.is_full),
                      disabledReason: `Kuota kelas '${c.name}' sudah penuh (${c.jumlah_siswa}/${c.kapasitas} siswa). Silakan pilih rombel lain yang masih tersedia.`,
                    })),
                    onSelect: (val) => setApprovalKelasId(val),
                  });
                },
              })}

              <View>
                <Text style={styles.formLabel}>Catatan Persetujuan TU</Text>
                <TextInput
                  value={approvalCatatan}
                  onChangeText={setApprovalCatatan}
                  placeholder="Contoh: Berkas lengkap, dimasukkan ke rombel reguler"
                  placeholderTextColor="#94A3B8"
                  style={styles.formTextInput}
                />
              </View>
            </ScrollView>

            <View style={styles.formModalFooter}>
              <TouchableOpacity
                style={styles.formCancelBtn}
                onPress={() => setSelectedIncoming(null)}
                disabled={processingApproval}
              >
                <Text style={styles.formCancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formSubmitBtn, { backgroundColor: '#059669' }]}
                onPress={approveIncomingMutation}
                disabled={processingApproval || !approvalKelasId}
              >
                {processingApproval ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-check" size={16} color="#FFFFFF" />
                    <Text style={styles.formSubmitBtnText}>Setujui & Simpan</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── SUB-MODAL TOLAK MUTASI SISWA ── */}
      <Modal
        visible={Boolean(rejectModalVisible && selectedIncoming)}
        animationType="slide"
        transparent={true}
        onRequestClose={() => setRejectModalVisible(false)}
        statusBarTranslucent
      >
        <View style={styles.formModalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setRejectModalVisible(false)} />
          <View style={styles.formModalCard}>
            <LinearGradient
              colors={['#F43F5E', '#E11D48', '#BE123C']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.modalTopAccentStrip}
            />
            <View style={styles.formModalHeader}>
              <View style={styles.formModalHeaderLeft}>
                <LinearGradient
                  colors={['#F43F5E', '#E11D48', '#BE123C']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.formModalIcon}
                >
                  <MaterialCommunityIcons name="close-circle-outline" size={20} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.formModalTitle}>Tolak Mutasi Siswa</Text>
                  <Text style={styles.formModalSubtitle} numberOfLines={1}>
                    {selectedIncoming?.student?.full_name || selectedIncoming?.student?.nama_lengkap}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setRejectModalVisible(false)} style={styles.formModalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }} showsVerticalScrollIndicator={false}>
              <View>
                <Text style={styles.formLabel}>
                  Alasan Penolakan <Text style={styles.requiredStar}>*</Text>
                </Text>
                <TextInput
                  value={rejectReason}
                  onChangeText={setRejectReason}
                  placeholder="Contoh: Kuota rombel penuh, berkas belum memenuhi syarat..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={3}
                  style={[styles.formTextInput, { height: 80 }]}
                />
              </View>
            </ScrollView>

            <View style={styles.formModalFooter}>
              <TouchableOpacity
                style={styles.formCancelBtn}
                onPress={() => setRejectModalVisible(false)}
                disabled={processingApproval}
              >
                <Text style={styles.formCancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.formSubmitBtn, { backgroundColor: '#E11D48' }]}
                onPress={rejectIncomingMutation}
                disabled={processingApproval || !rejectReason.trim()}
              >
                {processingApproval ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#FFFFFF" />
                    <Text style={styles.formSubmitBtnText}>Konfirmasi Tolak</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── FEEDBACK MODAL (SIMPAN, UBAH, HAPUS SATUAN & MASSAL, ERROR) ── */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          actionLabel={feedbackModal.actionLabel}
          cancelLabel={feedbackModal.cancelLabel}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}

      {/* ── FLOATING BUTTON: TAMBAH DATA (MATCHING MUTASI SISWA STYLE) ── */}
      {canCreate && !isSelectMode && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => openForm()}
          style={[styles.fabBtn, { shadowColor: currentTheme.activeColors[0] }]}
        >
          <LinearGradient
            colors={currentTheme.activeColors}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
            <Text style={styles.fabText}>Tambah {resourceLabels[resource]}</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F0FDF4' },
  content: { padding: 14, paddingBottom: 120 },

  /* ── Background Mosque & School (Identik Halaman Utama) ── */
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

  /* ── Header Halaman Data Master (Clean Top Bar Identik Halaman Utama) ── */
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    backgroundColor: 'transparent',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
    alignSelf: 'flex-start',
  },
  headerBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },
  headerMainTitle: {
    fontSize: 19,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
    marginTop: 2,
  },
  refreshButton: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    height: 44,
    marginTop: 12,
    gap: 8,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.2,
    overflow: 'hidden',
  },
  kpiBoxGradient: {
    padding: 9,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kpiIconSquare: {
    width: 24,
    height: 24,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiVal: {
    fontSize: 16,
    fontWeight: '900',
  },
  kpiLbl: {
    fontSize: 10.5,
    fontWeight: '800',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },

  /* ── Segmented Sub-Tabs Bar ── */
  segmentContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
  },
  segmentScroll: {
    paddingHorizontal: 14,
    gap: 8,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    gap: 6,
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* ── Mutation Card & Detail Box (Matching Mutasi Siswa & Modern Squircle) ── */
  mutationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 13,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 11,
  },
  avatarCircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 44,
    height: 44,
    borderRadius: 14,
  },
  avatarInitialsText: {
    fontSize: 15.5,
    fontWeight: '900',
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
  tagBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    flexShrink: 0,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  nisText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  detailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    padding: 10,
    marginTop: 9,
    gap: 5,
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailItemLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
    width: 65,
  },
  detailItemVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },

  /* ── Floating Action Button (FAB) ── */
  fabBtn: {
    position: 'absolute',
    bottom: 24,
    right: 18,
    borderRadius: 24,
    elevation: 6,
    shadowOpacity: 0.35,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  fabGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 12,
    borderRadius: 24,
  },
  fabText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── Filter Card (Harmonized with Rekap Siswa filterCard) ── */
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 16,
    marginBottom: 14,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  filterCardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
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
  filterLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  filterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 12,
    paddingVertical: 6.5,
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
    color: '#FFFFFF',
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  dropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  dropdownTriggerIconBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownTriggerText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },

  /* ── Action Bar: Tambah Data, Cetak, Mode Seleksi ── */
  subActionBar: {
    marginBottom: 14,
  },
  primaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addPillBtn: {
    flex: 1.15,
    height: 44,
    borderRadius: 14,
    overflow: 'hidden',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 4,
    elevation: 3,
  },
  addPillBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 7,
  },
  addPillBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  rekapPillBtn: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 12,
    gap: 7,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  rekapPillIconBox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rekapPillText: {
    color: '#065F46',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.1,
  },
  bulkModeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 8.5,
    paddingHorizontal: 14,
    marginTop: 8,
    gap: 7,
  },
  bulkModeToggleBtnActive: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECDD3',
  },
  bulkModeIconBox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bulkModeIconBoxActive: {
    backgroundColor: '#EF4444',
  },
  bulkModeToggleText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  bulkModeToggleTextActive: {
    color: '#DC2626',
    fontWeight: '800',
  },

  /* Pemberitahuan Siswa Pindahan Masuk Styles */
  incomingNoticeCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginTop: 4,
    marginBottom: 12,
    borderWidth: 1.5,
  },
  incomingNoticeCardAlert: {
    borderColor: '#FDA4AF',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.16,
    shadowRadius: 6,
    elevation: 3,
  },
  incomingNoticeCardNormal: {
    borderColor: '#99F6E4',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  incomingNoticeGradient: {
    position: 'relative',
    paddingTop: 3,
  },
  incomingTopLine: {
    height: 3,
    width: '100%',
  },
  incomingNoticeBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    gap: 10,
  },
  incomingIconWrapper: {
    position: 'relative',
  },
  incomingIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
  },
  incomingPulseDot: {
    position: 'absolute',
    top: -2,
    right: -2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  incomingNoticeTextCol: {
    flex: 1,
    justifyContent: 'center',
  },
  incomingNoticeTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  incomingNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  incomingNoticeStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  incomingNoticeStatusBadgeAlert: {
    backgroundColor: '#FFE4E6',
    borderColor: '#FECDD3',
  },
  incomingNoticeStatusBadgeNormal: {
    backgroundColor: '#CCFBF1',
    borderColor: '#99F6E4',
  },
  incomingNoticeStatusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  incomingNoticeStatusBadgeTextAlert: {
    color: '#BE123C',
  },
  incomingNoticeStatusBadgeTextNormal: {
    color: '#0F766E',
  },
  incomingNoticeSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  incomingNoticeRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  incomingCounterPill: {
    backgroundColor: '#E11D48',
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 2,
    minWidth: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.3,
    shadowRadius: 2,
    elevation: 2,
  },
  incomingCounterPillText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '900',
  },
  incomingCheckmarkPill: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Modal Mutasi & Pemberitahuan Pindahan Masuk Styles ── */
  formModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(2, 6, 23, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  formModalCard: {
    backgroundColor: '#FFFFFF',
    width: '100%',
    maxWidth: 480,
    borderRadius: 24,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 20,
    elevation: 10,
  },
  modalTopAccentStrip: {
    height: 4,
    width: '100%',
  },
  formModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  formModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
    marginRight: 8,
  },
  formModalIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modalHeaderPill: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#99F6E4',
  },
  modalHeaderPillText: {
    color: '#0F766E',
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  formModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  formModalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  formModalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  requiredStar: {
    color: '#EF4444',
    fontWeight: '800',
  },
  formTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  formModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FAFAFA',
  },
  formCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#475569',
  },
  formSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  formSubmitBtnText: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  /* ── Empty State Pemberitahuan Tidak Ada Mutasi Masuk ── */
  emptyIncomingCard: {
    alignItems: 'center',
    paddingVertical: 26,
    paddingHorizontal: 18,
    backgroundColor: '#F8FAFC',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderStyle: 'dashed',
    marginVertical: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 1,
  },
  emptyIncomingIconOuter: {
    position: 'relative',
    marginBottom: 14,
  },
  emptyIncomingIconInner: {
    width: 66,
    height: 66,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.28,
    shadowRadius: 10,
    elevation: 5,
  },
  emptyIncomingIconSparkle: {
    position: 'absolute',
    top: -4,
    right: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#FEF3C7',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#F59E0B',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.2,
    shadowRadius: 2,
    elevation: 2,
  },
  emptyIncomingBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 10,
  },
  emptyIncomingBadgeText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.4,
  },
  emptyIncomingTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
    textAlign: 'center',
  },
  emptyIncomingDesc: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
    maxWidth: 290,
    marginBottom: 14,
  },
  emptyIncomingCallout: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    borderRadius: 12,
    padding: 10,
    width: '100%',
    marginBottom: 14,
  },
  emptyIncomingCalloutText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '500',
    color: '#115E59',
    lineHeight: 16,
  },
  emptyIncomingRefreshBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1,
  },
  emptyIncomingRefreshBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },

  /* ── Incoming Mutations List Items ── */
  incomingLoadingBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 10,
  },
  incomingLoadingText: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  incomingItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    padding: 14,
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  incomingItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  incomingItemAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  incomingItemName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  incomingItemSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  incomingUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  incomingUnitBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  incomingReasonBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderLeftWidth: 3,
    borderLeftColor: '#CBD5E1',
    padding: 8,
    borderRadius: 6,
  },
  incomingReasonText: {
    fontSize: 11.5,
    color: '#334155',
    fontWeight: '500',
    flex: 1,
  },
  incomingNoteText: {
    fontSize: 10.5,
    color: '#64748B',
    fontStyle: 'italic',
  },
  incomingItemActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 4,
  },
  incomingApproveBtn: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
  },
  incomingApproveBtnGrad: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
  },
  incomingApproveBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  incomingRejectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
  },
  incomingRejectBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#E11D48',
  },
  dropdownSection: {
    marginBottom: 10,
  },
  dropdownSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 5,
  },

  actionPillBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingVertical: 9.5,
    paddingHorizontal: 6,
    gap: 5,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  actionPillBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  actionPillIconBox: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionPillIconBoxActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  actionPillText: {
    color: '#065F46',
    fontSize: 12,
    fontWeight: '700',
  },
  actionPillTextActive: {
    color: '#FFFFFF',
  },
  resetFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 4,
    marginLeft: 'auto',
  },
  resetFilterText: {
    color: '#B45309',
    fontSize: 11,
    fontWeight: '700',
  },

  summaryBar: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 12,
  },
  summaryText: {
    color: '#64748B',
    fontSize: 11.5,
  },
  summaryBold: {
    color: '#0F172A',
    fontWeight: '800',
  },
  summaryFiltered: {
    color: '#059669',
    fontWeight: '700',
  },

  error: { backgroundColor: '#FEF2F2', borderRadius: 12, padding: 12, marginBottom: 12 },
  errorText: { color: '#B91C1C', fontSize: 12, lineHeight: 18 },
  loader: { marginVertical: 28 },

  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16, marginTop: 10 },
  emptyTitle: { color: '#0F172A', fontWeight: '800', marginTop: 10, fontSize: 15 },
  emptyText: { color: '#64748B', fontSize: 12, marginTop: 4, textAlign: 'center', paddingHorizontal: 20 },

  /* ── Rincian Data List Container (Gaya Rekap Siswa) ── */
  listCard: {
    marginBottom: 20,
  },
  listHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  listHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  listCountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  listCountBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  printTriggerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  printTriggerBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },

  /* ── Tracer Study & Alumni Overview Card ── */
  alumniSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  alumniSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  alumniIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  alumniSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#92400E',
  },
  alumniSummarySub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B45309',
    marginTop: 1,
  },
  alumniDestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  alumniDestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  alumniDestText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E40AF',
  },

  /* ── Mutasi Siswa Overview Card ── */
  mutasiSummaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  mutasiSummaryHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  mutasiIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutasiSummaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#5B21B6',
  },
  mutasiSummarySub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#7C3AED',
    marginTop: 1,
  },
  mutasiResetBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    gap: 4,
  },
  mutasiResetText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mutasiDestRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  mutasiDestBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FAF5FF',
    borderWidth: 1,
    borderColor: '#E9D5FF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  mutasiDestText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#6D28D9',
  },

  /* ── Student / Entity Item Card (Clean Elevated Modern Card) ── */
  studentCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  studentCardSelected: {
    backgroundColor: '#F0FDF4',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
  },
  studentCardMain: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  studentAvatarImg: {
    width: 46,
    height: 46,
    borderRadius: 14,
  },
  studentAvatarInitials: {
    fontSize: 16,
    fontWeight: '900',
  },
  studentName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  codeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 3,
  },
  codePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 5,
  },
  codePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
  },
  genderPill: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  genderPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  employmentPill: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 5,
  },
  employmentPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    rowGap: 5,
    columnGap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#DBEAFE',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    maxWidth: 160,
  },
  studentUnitText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1D4ED8',
    flexShrink: 1,
  },
  studentKelasBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 7,
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    maxWidth: 160,
  },
  studentKelasText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
    flexShrink: 1,
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

  /* ── Status Badge ── */
  statusBadge: {
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3,
    alignSelf: 'flex-start',
    flexShrink: 0,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.2,
  },

  /* ── Action Buttons Container & Tiers ── */
  cardActionsContainer: {
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionTier1Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  internalChatPillBtn: {
    flex: 1,
    height: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#0D9488',
    borderRadius: 10,
    paddingHorizontal: 10,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.18,
    shadowRadius: 3,
    elevation: 2,
  },
  internalChatPillBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontWeight: '800',
    flexShrink: 1,
  },
  actionPillMutasi: {
    flex: 1,
    height: 35,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F5F3FF',
    borderWidth: 1.5,
    borderColor: '#DDD6FE',
    borderRadius: 10,
    paddingHorizontal: 8,
  },
  actionPillMutasiText: {
    color: '#7C3AED',
    fontSize: 11,
    fontWeight: '800',
    flexShrink: 1,
  },
  actionTier2Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  actionTierBtnDetail: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  actionTierBtnTextDetail: {
    color: '#047857',
    fontSize: 10.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  actionTierBtnPrint: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  actionTierBtnTextPrint: {
    color: '#0F766E',
    fontSize: 10.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  actionTierBtnEdit: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  actionTierBtnTextEdit: {
    color: '#1D4ED8',
    fontSize: 10.5,
    fontWeight: '700',
    flexShrink: 1,
  },
  actionTierBtnDelete: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 9,
    paddingHorizontal: 4,
  },
  actionTierBtnTextDelete: {
    color: '#DC2626',
    fontSize: 10.5,
    fontWeight: '700',
    flexShrink: 1,
  },

  /* Legacy action pill classes preserved for compatibility */
  studentCardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  actionPillSoft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  actionPillSoftText: {
    color: '#059669',
    fontSize: 10.5,
    fontWeight: '700',
  },
  actionPillEdit: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  actionPillEditText: {
    color: '#2563EB',
    fontSize: 10.5,
    fontWeight: '700',
  },
  actionPillDelete: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  actionPillDeleteText: {
    color: '#DC2626',
    fontSize: 10.5,
    fontWeight: '700',
  },

  /* Floating Bulk Bar */
  floatingBulkBar: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 92,
    left: 16,
    right: 16,
    backgroundColor: '#0F172A',
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.35,
    shadowRadius: 10,
    elevation: 20,
    zIndex: 9999,
  },
  floatingBulkInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  floatingBulkCount: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 13,
  },
  floatingBulkSelectAll: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  floatingBulkSelectAllText: {
    color: '#6EE7B7',
    fontSize: 11,
    fontWeight: '700',
  },
  floatingBulkActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  floatingBulkCancelBtn: {
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  floatingBulkCancelText: {
    color: '#94A3B8',
    fontSize: 12,
    fontWeight: '700',
  },
  floatingBulkDeleteBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DC2626',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 6,
  },
  floatingBulkDeleteText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  loadMoreWrapper: {
    paddingVertical: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    gap: 8,
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 11,
    paddingHorizontal: 18,
    borderRadius: 14,
    width: '100%',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  loadMoreBtnText: {
    color: '#047857',
    fontSize: 12.5,
    fontWeight: '800',
  },
  loadAllBtn: {
    paddingVertical: 6,
    paddingHorizontal: 12,
  },
  loadAllBtnText: {
    color: '#64748B',
    fontSize: 11.5,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },

  /* Modal Dropdown Selector Styles */
  dropdownModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'flex-end',
  },
  dropdownModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 36,
    maxHeight: '75%',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 12,
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
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownSearchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
    marginVertical: 10,
  },
  dropdownSearchNativeInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  dropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginVertical: 2,
  },
  dropdownItemActive: {
    backgroundColor: '#ECFDF5',
  },
  dropdownItemText: {
    fontSize: 13,
    color: '#334155',
    fontWeight: '600',
  },
  dropdownItemTextActive: {
    color: '#059669',
    fontWeight: '800',
  },

  /* Detail Modal Styles */
  detailModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  detailModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 14,
    resizeMode: 'cover',
  },
  detailModalName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailModalSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  detailCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailScroll: {
    marginVertical: 12,
  },
  detailSectionBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 12,
  },
  detailSectionTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: 0.6,
    marginBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 4,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    alignItems: 'flex-start',
    gap: 10,
  },
  detailLabel: {
    fontSize: 11.5,
    color: '#64748B',
    flex: 1,
    lineHeight: 16,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1.3,
    textAlign: 'right',
    lineHeight: 16,
  },
  detailModalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 8,
  },
  detailPrintBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 4,
  },
  detailPrintBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 7,
    paddingHorizontal: 12,
  },
  detailPrintBtnText: {
    color: '#FFFFFF',
    fontWeight: '900',
    fontSize: 13.5,
    letterSpacing: 0.2,
  },
  detailSecondaryActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    width: '100%',
  },
  detailEditBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    height: 44,
    gap: 6,
  },
  detailEditBtnText: {
    color: '#059669',
    fontWeight: '800',
    fontSize: 13,
  },

  /* Form Modal */
  modalScreen: { flex: 1, backgroundColor: '#F1F5F9' },
  modalHeroHeaderWrapper: {
    overflow: 'hidden',
  },
  modalHeroHeaderGradient: {
    paddingTop: Platform.OS === 'ios' ? 44 : 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
  },
  modalTopAccentLine: {
    height: 3,
    backgroundColor: '#34D399',
    marginBottom: 12,
    borderRadius: 2,
  },
  modalHeroHeaderContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  modalHeroIconBox: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.28)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 3,
  },
  modalRoleBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalRoleBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  modalYearBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalYearBadgeText: {
    color: '#92400E',
    fontSize: 9.5,
    fontWeight: '800',
  },
  modalHeroTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: -0.3,
  },
  modalHeroSubtitle: {
    color: '#A7F3D0',
    fontSize: 11.5,
    fontWeight: '600',
    marginTop: 1,
  },
  modalHeroCloseBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalHeroQuickPrintBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 6,
  },
  modalContent: {
    padding: 16,
    paddingBottom: 24,
  },
  formInput: {
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },

  /* Sticky Footer Styles */
  modalStickyFooter: {
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'ios' ? 24 : 14,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 8,
  },
  modalFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F1F5F9',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalCancelBtnText: {
    color: '#475569',
    fontSize: 13,
    fontWeight: '800',
  },
  modalPrintBannerBtn: {
    borderRadius: 14,
    marginBottom: 10,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalPrintBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
  },
  modalPrintBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalPrintBannerTextWrap: {
    flex: 1,
  },
  modalPrintBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  modalPrintBannerSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },
  modalPrintBannerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 2,
  },
  modalPrintBannerBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  modalSaveBtn: {
    flex: 1,
    height: 48,
    borderRadius: 14,
    overflow: 'hidden',
  },
  modalSaveBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  modalSaveBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '900',
  },
  modalErrorBanner: {
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  modalErrorBannerText: {
    color: '#BE123C',
    fontSize: 12,
    fontWeight: '700',
    flex: 1,
  },

  /* Active Status Card */
  activeStatusCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginTop: 4,
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  activeStatusIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  activeStatusTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeStatusSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },

  /* Legacy Fallbacks */
  modalHeader: {
    backgroundColor: '#FFFFFF',
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  modalTitle: { color: '#0F172A', fontWeight: '800' },
  switchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 5,
    marginBottom: 12,
  },
  switchLabel: { color: '#334155', fontWeight: '700' },
  formError: { paddingHorizontal: 0, marginBottom: 6 },
  saveButton: { backgroundColor: '#059669', borderRadius: 14, marginTop: 4 },
  cancelButton: { borderRadius: 14, marginTop: 10 },

  /* Form Enhancement Styles */
  formContainer: {
    gap: 12,
    marginBottom: 8,
  },
  formNoticeIconBox: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
    marginBottom: 10,
  },
  formSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 10,
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  formSectionIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSectionTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  formSectionSubTitle: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },
  fieldHintText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: -4,
    marginBottom: 10,
    marginLeft: 4,
  },
  fieldLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  fieldLabelHelper: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  /* Form Field Uniform System */
  formFieldGroup: {
    marginBottom: 18,
  },
  formFieldHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  formFieldLabelText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    flex: 1,
    marginRight: 8,
  },
  formFieldRequiredStar: {
    color: '#E11D48',
    fontWeight: '800',
  },
  formFieldHelperText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    flexShrink: 0,
  },
  formFieldBottomHint: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 5,
    marginLeft: 2,
    fontWeight: '400',
    lineHeight: 15,
  },
  formInputBox: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  formInputBoxMultiline: {
    height: undefined,
    minHeight: 88,
    alignItems: 'flex-start',
    paddingTop: 10,
    paddingBottom: 10,
  },
  formInputBoxIconWrap: {
    marginRight: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  formNativeInput: {
    flex: 1,
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '500',
    paddingVertical: 0,
    paddingHorizontal: 0,
  },
  formNativeInputMultiline: {
    textAlignVertical: 'top',
    minHeight: 68,
  },
  formSelectBox: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  formSelectBoxDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  formSelectContainer: {
    marginBottom: 12,
  },
  formSelectLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  formSelectButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 48,
  },
  formSelectIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  formSelectLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  formSelectText: {
    fontSize: 13.5,
    color: '#0F172A',
    fontWeight: '600',
    flex: 1,
  },
  formSelectPlaceholder: {
    color: '#94A3B8',
    fontWeight: '400',
  },
  genderRow: {
    flexDirection: 'row',
    gap: 10,
  },
  genderBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    height: 48,
    borderRadius: 12,
    borderWidth: 1.5,
  },
  genderBtnInactive: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  genderBtnActiveMale: {
    backgroundColor: '#EFF6FF',
    borderColor: '#0284C7',
  },
  genderBtnActiveFemale: {
    backgroundColor: '#FDF2F8',
    borderColor: '#EC4899',
  },
  genderBtnText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  genderBtnTextActiveMale: {
    color: '#0369A1',
    fontWeight: '800',
  },
  genderBtnTextActiveFemale: {
    color: '#BE185D',
    fontWeight: '800',
  },
  genderBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  /* Step Wizard Styles */
  wizardBarWrapper: {
    marginBottom: 12,
  },
  wizardScrollContent: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  wizardStepBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 11,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  wizardStepBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  wizardStepBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  wizardStepBtnTextActive: {
    color: '#FFFFFF',
  },
  stepNavRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 8,
  },
  stepNextSectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginTop: 8,
  },
  stepNextSectionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#059669',
  },
  stepPrevSectionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 12,
  },
  stepPrevSectionBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  formRow: {
    flexDirection: 'row',
    gap: 10,
  },
  formSectionBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  formSectionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  formNoticeMiniCard: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  formNoticeMiniText: {
    color: '#166534',
    fontSize: 11,
    flex: 1,
    lineHeight: 15,
  },
  formSubHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 12,
    paddingBottom: 8,
    marginTop: 10,
    marginBottom: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  formSubHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  formSubHeaderIconWrap: {
    width: 24,
    height: 24,
    borderRadius: 6,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formSubHeaderText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },
  formSubHeaderBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  formSubHeaderBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  formNoticeCard: {
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  formNoticeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  formNoticeText: {
    fontSize: 11.5,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  formReadOnlyCard: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 10,
    marginBottom: 8,
  },
  formReadOnlyLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  formReadOnlyValue: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },

  /* Print Modal Styles */
  printScreen: { flex: 1, backgroundColor: '#004D32', paddingTop: Platform.OS === 'ios' ? 44 : 20 },
  printHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
    backgroundColor: '#004D32',
  },
  printHeaderBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printHeaderTitle: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '800',
  },
  printHeaderSub: {
    color: '#A7F3D0',
    fontSize: 11,
    marginTop: 1,
  },
  printHeaderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
  },
  printHeaderActionBtnText: {
    color: '#004D32',
    fontSize: 12,
    fontWeight: '800',
  },
  printNoticeBanner: {
    backgroundColor: '#ECFDF5',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    gap: 8,
  },
  printNoticeBannerText: {
    color: '#065F46',
    fontSize: 11.5,
    fontWeight: '600',
    flex: 1,
  },

  paperSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 3,
  },
  paperKopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 2,
  },
  paperKopLogoBox: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperKopLogoImg: {
    width: 48,
    height: 48,
  },
  paperKopCenterBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  paperKopOrgName: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    textAlign: 'center',
  },
  paperKopSchoolUnit: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    textAlign: 'center',
    marginTop: 1.5,
  },
  paperKopAddress: {
    fontSize: 8,
    fontWeight: '500',
    color: '#475569',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 11.5,
  },
  paperKopDividerContainer: {
    marginTop: 5,
    marginBottom: 10,
  },
  paperKopDividerThick: {
    height: 2.5,
    backgroundColor: '#0F172A',
  },
  paperKopDividerThin: {
    height: 1,
    backgroundColor: '#0F172A',
    marginTop: 2.5,
  },

  paperDocHeader: {
    alignItems: 'center',
    marginBottom: 12,
  },
  paperDocTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.5,
    textAlign: 'center',
    textTransform: 'uppercase',
  },
  paperDocSub: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2.5,
    textAlign: 'center',
  },
  paperDocMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 5,
    paddingBottom: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    borderStyle: 'dashed',
    width: '100%',
  },
  paperDocMetaText: {
    fontSize: 8.5,
    color: '#64748B',
    fontWeight: '500',
  },
  paperDocMetaBullet: {
    fontSize: 8.5,
    color: '#94A3B8',
  },
  paperDocMetaBadge: {
    fontSize: 8.5,
    color: '#059669',
    fontWeight: '700',
  },

  paperFilterBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 12,
  },
  paperFilterBoxHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingBottom: 6,
    marginBottom: 6,
  },
  paperFilterBoxTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: 0.5,
  },
  paperFilterGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  paperFilterCol: {
    width: '47%',
  },
  paperFilterLabel: {
    fontSize: 9,
    color: '#64748B',
  },
  paperFilterValue: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 1,
  },

  /* Single Bio Table */
  paperBioTable: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    padding: 12,
    backgroundColor: '#F8FAFC',
  },
  paperBioSectionHeader: {
    backgroundColor: '#ECFDF5',
    borderTopWidth: 1.5,
    borderBottomWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 5,
    paddingHorizontal: 8,
    marginTop: 8,
    marginBottom: 4,
    borderRadius: 4,
  },
  paperBioSectionHeaderText: {
    color: '#065F46',
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  paperBioRow: {
    flexDirection: 'row',
    paddingVertical: 5,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  paperBioKey: {
    width: 145,
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  paperBioVal: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0F172A',
  },

  paperTable: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    overflow: 'hidden',
  },
  paperTableHead: {
    flexDirection: 'row',
    backgroundColor: '#004D32',
    paddingVertical: 6,
  },
  paperTh: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
    paddingHorizontal: 6,
  },
  paperTableRow: {
    flexDirection: 'row',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    paddingVertical: 5,
    alignItems: 'center',
  },
  paperTd: {
    fontSize: 9.5,
    color: '#334155',
    paddingHorizontal: 6,
  },
  paperTdBadge: {
    fontSize: 8.5,
    fontWeight: '700',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  paperTableNotice: {
    marginTop: 8,
    padding: 6,
    backgroundColor: '#FFFBEB',
    borderRadius: 4,
  },
  paperTableNoticeText: {
    fontSize: 8.5,
    color: '#92400E',
    fontStyle: 'italic',
  },

  paperSignWrapper: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 12,
  },
  paperSignCol: {
    alignItems: 'center',
    width: '45%',
  },
  paperSignDate: {
    fontSize: 9.5,
    color: '#1E293B',
  },
  paperSignRole: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  paperSignSpace: {
    height: 48,
  },
  paperSignName: {
    fontSize: 10,
    fontWeight: '800',
    color: '#0F172A',
    textDecorationLine: 'underline',
  },
  paperSignNiy: {
    fontSize: 8.5,
    color: '#64748B',
    marginTop: 2,
  },
  /* Scroll FAB - Tambah Data */
  scrollFabContainer: {
    position: 'absolute',
    bottom: Platform.OS === 'ios' ? 100 : 92,
    left: 16,
    right: 16,
    alignItems: 'center',
    gap: 6,
    pointerEvents: 'box-none',
    zIndex: 9998,
    elevation: 15,
  },
  scrollFabTabChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
    alignSelf: 'center',
  },
  scrollFabTabChipText: {
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  scrollFabBtn: {
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.22,
    shadowRadius: 12,
    elevation: 10,
  },
  scrollFabBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 13,
    paddingHorizontal: 20,
    gap: 10,
  },
  scrollFabIconCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scrollFabBtnText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    letterSpacing: 0.3,
    flex: 1,
  },
});
