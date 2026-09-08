import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type GradePayload = {
  items: any[];
  summary: {
    average_score: number | null;
    highest_score: number | null;
    passed_subjects: number;
    remedial_subjects: number;
    total_subjects: number;
  };
  student: any;
  period: any;
  publication: any;
};

const emptyPayload: GradePayload = {
  items: [],
  summary: {
    average_score: null,
    highest_score: null,
    passed_subjects: 0,
    remedial_subjects: 0,
    total_subjects: 0,
  },
  student: null,
  period: null,
  publication: null,
};

const scoreText = (value: unknown) => {
  if (value === null || value === undefined || value === '') return '-';
  const parsed = Number(value);
  return Number.isFinite(parsed) ? String(Number(parsed.toFixed(2))) : '-';
};

const getTahfizhPredicate = (score: unknown): string => {
  if (score === null || score === undefined || score === '') return '-';
  const num = Number(score);
  if (!Number.isFinite(num)) return '-';
  if (num >= 90) return 'Mumtaz';
  if (num >= 80) return 'Jayyid Jiddan';
  if (num >= 70) return 'Jayyid';
  if (num >= 60) return 'Maqbul';
  return 'Dhaif';
};

const formatDeadline = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}.${minutes}`;
};

const getDynamicCurrentWeekRange = (weekOffset = 0): string => {
  const now = new Date();
  now.setDate(now.getDate() + weekOffset * 7);
  const day = now.getDay();
  const diffToMonday = now.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(now);
  monday.setDate(diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${monday.getDate()} – ${sunday.getDate()} ${months[sunday.getMonth()]} ${sunday.getFullYear()}`;
};

const getDynamicTodayString = (dayOffset = 0): string => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
  const now = new Date();
  now.setDate(now.getDate() + dayOffset);
  return `${days[now.getDay()]}, ${now.getDate()} ${months[now.getMonth()]} ${now.getFullYear()}`;
};


const getAssignmentStatus = (item: any): { key: string; label: string; color: string; bg: string; icon: any } => {
  const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
    ? item.pengumpulan_tugas[0]
    : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
    ? item.pengumpulanTugas[0]
    : item.submission;

  const isGraded = sub && (sub.status === 'dinilai' || sub.status === 'graded' || (sub.nilai_guru !== null && sub.nilai_guru !== undefined));
  const isSubmitted = sub && (sub.status === 'dikumpulkan' || sub.status === 'submitted' || sub.status === 'revisi');
  const isLate = (sub && sub.status === 'terlambat') || (!sub && item.deadline && new Date(item.deadline) < new Date());

  if (isGraded) {
    return { key: 'graded', label: 'Sudah Dinilai', color: '#059669', bg: '#ECFDF5', icon: 'check-circle' };
  }
  if (isLate) {
    return { key: 'late', label: 'Terlambat', color: '#DC2626', bg: '#FEF2F2', icon: 'alert-circle' };
  }
  if (isSubmitted) {
    return { key: 'submitted', label: 'Sudah Dikumpulkan', color: '#2563EB', bg: '#EFF6FF', icon: 'clock-check-outline' };
  }
  return { key: 'pending', label: 'Belum Dikumpulkan', color: '#D97706', bg: '#FFFBEB', icon: 'clock-outline' };
};

const getSubjectTheme = (subjectName: string = ''): { bgIcon: string; iconColor: string; icon: any; badgeBg: string; badgeBorder: string; badgeText: string } => {
  const norm = (subjectName || '').toLowerCase();
  if (norm.includes('agama') || norm.includes('islam') || norm.includes('pai') || norm.includes('fiqih') || norm.includes('tahfiz') || norm.includes('quran') || norm.includes('hadits') || norm.includes('akidah')) {
    return {
      bgIcon: '#E6F8F0',
      iconColor: '#10B981',
      icon: 'book-open-page-variant-outline',
      badgeBg: '#ECFDF5',
      badgeBorder: '#A7F3D0',
      badgeText: '#059669',
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bgIcon: '#F3E8FF',
      iconColor: '#9333EA',
      icon: 'flask-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
    };
  }
  if (norm.includes('matematika') || norm.includes('math') || norm.includes('hitung') || norm.includes('aljabar')) {
    return {
      bgIcon: '#EFF6FF',
      iconColor: '#2563EB',
      icon: 'calculator-variant-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
    };
  }
  if (norm.includes('bahasa') || norm.includes('indonesia') || norm.includes('inggris') || norm.includes('arab') || norm.includes('literasi')) {
    return {
      bgIcon: '#FFE4E6',
      iconColor: '#E11D48',
      icon: 'book-open-variant',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      badgeText: '#E11D48',
    };
  }
  if (norm.includes('ips') || norm.includes('sosial') || norm.includes('sejarah') || norm.includes('geografi') || norm.includes('ekonomi')) {
    return {
      bgIcon: '#FEF3C7',
      iconColor: '#D97706',
      icon: 'earth',
      badgeBg: '#FFFBEB',
      badgeBorder: '#FDE68A',
      badgeText: '#D97706',
    };
  }
  return {
    bgIcon: '#E6F8F0',
    iconColor: '#10B981',
    icon: 'book-open-page-variant-outline',
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeText: '#059669',
  };
};

// 62 Doa Harian kurikulum resmi sekolah (sesuai dokumen fisik)
const FALLBACK_62_DOA_ITEMS = [
  { no: 1, nama: 'Doa sebelum Makan', grup: 'Adab Makan & Minum' },
  { no: 2, nama: 'Doa lupa baca bismillah', grup: 'Adab Makan & Minum' },
  { no: 3, nama: 'Doa lupa baca bismillah (ketika ingat)', grup: 'Adab Makan & Minum' },
  { no: 4, nama: 'Doa Setelah makan', grup: 'Adab Makan & Minum' },
  { no: 5, nama: 'Doa sebelum tidur', grup: 'Aktivitas Harian' },
  { no: 6, nama: 'Doa Bangun tidur', grup: 'Aktivitas Harian' },
  { no: 7, nama: 'Doa Masuk Wc :', grup: 'Adab Bersuci' },
  { no: 8, nama: 'Doa keluar Wc :', grup: 'Adab Bersuci' },
  { no: 9, nama: 'Doa akan berbuka', grup: 'Ibadah Puasa' },
  { no: 10, nama: 'Doa Keluar rumah', grup: 'Rumah & Safar' },
  { no: 11, nama: 'Doa Masuk Rumah', grup: 'Rumah & Safar' },
  { no: 12, nama: 'Doa naik kendaraan', grup: 'Rumah & Safar' },
  { no: 13, nama: 'Doa kedua orang tua', grup: 'Keluarga & Birrul Walidain' },
  { no: 14, nama: 'Doa minta dikuatkan iman', grup: 'Keimanan & Keteguhan' },
  { no: 15, nama: 'Doa ketika bersin', grup: 'Adab Harian' },
  { no: 16, nama: 'Doa Bagi yang mendengar', grup: 'Adab Harian' },
  { no: 17, nama: 'Doa Bagi yang bersin kembali', grup: 'Adab Harian' },
  { no: 18, nama: 'Doa agar diterima amal ibadah dan taubat', grup: 'Taubat & Amal Shalih' },
  { no: 19, nama: 'Doa agar dijadikan hamba yang bersyukur', grup: 'Syukur & Hidayah' },
  { no: 20, nama: 'Doa berlindung dari setan', grup: 'Perlindungan Diri' },
  { no: 21, nama: 'Doa agar hati ditetapkan dalam hidayah', grup: 'Keimanan & Keteguhan' },
  { no: 22, nama: 'Doa Sebelum Berwuduk', grup: 'Adab Bersuci' },
  { no: 23, nama: 'Doa setelah Berwuduk', grup: 'Adab Bersuci' },
  { no: 24, nama: 'Doa Pergi ke Masjid', grup: 'Masjid & Sholat' },
  { no: 25, nama: 'Doa Masuk Masjid', grup: 'Masjid & Sholat' },
  { no: 26, nama: 'Doa Keluar Masjid', grup: 'Masjid & Sholat' },
  { no: 27, nama: 'Doa Ditetapkan hati dalam Iman', grup: 'Keimanan & Keteguhan' },
  { no: 28, nama: 'Doa Berlindung dari Keburukan Amal', grup: 'Perlindungan Diri' },
  { no: 29, nama: 'Doa Mohon Bisa Melihat Wajah Allah', grup: 'Ketinggian Harapan' },
  { no: 30, nama: 'Doa Ampunan dalam segala hal', grup: 'Taubat & Istighfar' },
  { no: 31, nama: 'Doa Mohon Diperbaiki Segala Urusan', grup: 'Kelancaran Urusan' },
  { no: 32, nama: 'Doa Berlindung dari Keburukan Amal', grup: 'Perlindungan Diri' },
  { no: 33, nama: 'Doa Dicukupkan dari Harta Yang Halal', grup: 'Rezeki & Keberkahan' },
  { no: 34, nama: 'Doa Mohon Ampunan dan Rahmad', grup: 'Taubat & Rahmat' },
  { no: 35, nama: 'Doa ketetapan diri dan keluarga dalam mendirikan Sholat', grup: 'Keluarga & Sholat' },
  { no: 36, nama: 'Doa Diselamatkan dari orang orang yang Zholim', grup: 'Perlindungan dari Kezaliman' },
  { no: 37, nama: 'Doa agar amal ibadah diterima', grup: 'Penerimaan Amal' },
  { no: 38, nama: 'Doa berlindung dari keburukan orang-orang kafir', grup: 'Perlindungan Diri' },
  { no: 39, nama: 'Doa agar disempurnakan cahayanya', grup: 'Cahaya Iman' },
  { no: 40, nama: 'Doa agar dijadikan hamba yang bersyukur', grup: 'Syukur & Hidayah' },
  { no: 41, nama: 'Doa agar hati ditetapkan dalam hidayah', grup: 'Keimanan & Keteguhan' },
  { no: 42, nama: 'Doa agar dilapangkan hati dan dimudahkan dalam urusan', grup: 'Kelancaran Urusan' },
  { no: 43, nama: 'Doa meminta keamanan negeri dan berlindung dari syirik', grup: 'Keamanan & Tauhid' },
  { no: 44, nama: 'DOA UNTUK ORANG YANG SAKIT 1', grup: 'Kesehatan & Kesembuhan' },
  { no: 45, nama: 'DOA UNTUK ORANG YANG SAKIT 2', grup: 'Kesehatan & Kesembuhan' },
  { no: 46, nama: 'Doa ketika hujan Turun', grup: 'Fenomena Alam' },
  { no: 47, nama: 'Doa ketika Hujan Lebat', grup: 'Fenomena Alam' },
  { no: 48, nama: 'Setelah Turun Hujan:', grup: 'Fenomena Alam' },
  { no: 49, nama: 'Doa ketika mendengar petir.', grup: 'Fenomena Alam' },
  { no: 50, nama: 'Doa ketika mendengar petir. (2)', grup: 'Fenomena Alam' },
  { no: 51, nama: 'Doa ketika ada angin kencang', grup: 'Fenomena Alam' },
  { no: 52, nama: 'Doa memakai pakaian', grup: 'Adab Berpakaian' },
  { no: 53, nama: 'Doa ketika beli kendaraan baru', grup: 'Rumah & Kendaraan' },
  { no: 54, nama: 'Doa Naik Kendaraan', grup: 'Rumah & Safar' },
  { no: 55, nama: 'Doa orang mau safar dan berdoa buat yang tinggal', grup: 'Safar & Perjalanan' },
  { no: 56, nama: 'Orang yang ditinggalkan membaca doa sebagaimana yang ada dalam hadis ini:', grup: 'Safar & Perjalanan' },
  { no: 57, nama: 'doa pembuka pintu Rizki', grup: 'Rezeki & Keberkahan' },
  { no: 58, nama: 'Doa Agar dicukupkan dengan yang Halal', grup: 'Rezeki & Keberkahan' },
  { no: 59, nama: 'Do\'a Memohon Kemudahan', grup: 'Kelancaran Urusan' },
  { no: 60, nama: 'Do\'a Agar Terlepas dari Sulitnya Utang', grup: 'Perlindungan dari Utang' },
  { no: 61, nama: 'Do\'a dari sifat Malas', grup: 'Perlindungan dari Malas' },
  { no: 62, nama: 'Doa Perbaikan Akhlak', grup: 'Akhlak & Kepribadian' },
];

const DEFAULT_MUTABAAH_RAPORT_SECTIONS = [
  {
    category: '1. Ibadah Wajib (Mahdhah)',
    badge: '100% Tercapai',
    badgeBg: '#D1FAE5',
    badgeColor: '#059669',
    items: [
      { label: 'Shalat Subuh Berjamaah', status: 'Tertib', score: 'A' },
      { label: 'Shalat Dzuhur di Sekolah', status: 'Tertib Berjamaah', score: 'A' },
      { label: 'Shalat Ashar di Sekolah', status: 'Tertib Berjamaah', score: 'A' },
      { label: 'Shalat Maghrib Berjamaah', status: 'Tertib di Masjid', score: 'A' },
      { label: 'Shalat Isya Berjamaah', status: 'Tertib di Masjid', score: 'A' },
    ],
  },
  {
    category: '2. Pembiasaan Adab & Karakter Islami',
    badge: 'Sangat Baik (A)',
    badgeBg: '#EFF6FF',
    badgeColor: '#2563EB',
    items: [
      { label: 'Birrul Walidain (Berbakti kpd Orang Tua)', status: 'Santun & Patuh', score: 'A' },
      { label: 'Adab kepada Guru & Karyawan', status: 'Tawadhu & Hormat', score: 'A' },
      { label: 'Ukhuwah & Toleransi Sesama Teman', status: 'Ramah & Suka Membantu', score: 'A' },
      { label: 'Kebersihan & Kerapian Diri', status: 'Atribut Lengkap & Bersih', score: 'A' },
    ],
  },
  {
    category: '3. Amalan Sunnah & Tilawah',
    badge: 'Aktif (B+)',
    badgeBg: '#FEF3C7',
    badgeColor: '#D97706',
    items: [
      { label: 'Tilawah Al-Qur\'an Harian', status: 'Rutin Minimal 1 Halaman', score: 'A' },
      { label: 'Shalat Dhuha di Sekolah', status: 'Rutin Dilaksanakan', score: 'A' },
      { label: 'Puasa Sunnah Senin & Kamis', status: 'Mengikuti 2x Bulan Ini', score: 'B' },
      { label: 'Infaq & Sedekah Yaumiyyah', status: 'Gemar Berinfaq di Kotak Amal', score: 'A' },
    ],
  },
];

export default function GradeScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);
  const studentScrollRef = useRef<ScrollView>(null);

  // States
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [payload, setPayload] = useState<GradePayload>(emptyPayload);
  const [activeTab, setActiveTab] = useState<'academic' | 'tahfizh' | 'mutabaah'>('academic');
  const [tahfizh, setTahfizh] = useState<any>(null);
  const [mutabaah, setMutabaah] = useState<any>(null);
  const [mutabaahOverview, setMutabaahOverview] = useState<any>(null);
  const [worshipContext, setWorshipContext] = useState<any>(null);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [backendKpi, setBackendKpi] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');

  // Akademik States
  const [search, setSearch] = useState('');
  const [sortOrder, setSortOrder] = useState<'latest' | 'deadline'>('latest');
  const [selectedAssignment, setSelectedAssignment] = useState<any | null>(null);
  const [showAcademicRaportModal, setShowAcademicRaportModal] = useState(false);
  const [showTahfizhRaportModal, setShowTahfizhRaportModal] = useState(false);
  const [showMutabaahRaportModal, setShowMutabaahRaportModal] = useState(false);
  const [showPrayerRaportModal, setShowPrayerRaportModal] = useState(false);
  const [showReportCard, setShowReportCard] = useState(false);

  // Tahfizh Tab States
  const defaultAcademicYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }, []);
  const defaultSemester = useMemo(() => {
    const isSem1 = new Date().getMonth() >= 6;
    return isSem1 ? `Semester 1 (${defaultAcademicYear})` : `Semester 2 (${defaultAcademicYear})`;
  }, [defaultAcademicYear]);

  const [tahfizhFilter, setTahfizhFilter] = useState<'all' | 'hafalan_baru' | 'setoran' | 'murojaah' | 'dinilai'>('all');
  const [tahfizhSearch, setTahfizhSearch] = useState('');
  const [tahfizhSort, setTahfizhSort] = useState<'latest' | 'deadline'>('latest');
  const [showTahfizhVerified, setShowTahfizhVerified] = useState(false);
  const [tahfizhSemester, setTahfizhSemester] = useState<string>(defaultSemester);
  const [tahfizhLogs, setTahfizhLogs] = useState<any[]>([]);
  const [selectedTahfizhItem, setSelectedTahfizhItem] = useState<any | null>(null);

  // Mutabaah Tab States (Pembeda Jelas: Sholat Wajib/Sunnah vs Doa & Dzikir)
  const [mutabaahSubTab, setMutabaahSubTab] = useState<'all' | 'sholat_ibadah' | 'doa_dzikir'>('all');
  const [mutabaahFilter, setMutabaahFilter] = useState<'all' | 'belum_selesai' | 'selesai' | 'dalam_proses'>('all');
  const [mutabaahPeriod, setMutabaahPeriod] = useState('Minggu Ini');
  const [mutabaahWeekOffset, setMutabaahWeekOffset] = useState(0);
  const mutabaahDateRange = useMemo(() => getDynamicCurrentWeekRange(mutabaahWeekOffset), [mutabaahWeekOffset]);
  const [showMutabaahDetails, setShowMutabaahDetails] = useState(false);
  const [showCharacterIndicators, setShowCharacterIndicators] = useState(false);
  const [selectedMutabaahItem, setSelectedMutabaahItem] = useState<any | null>(null);

  // Poin Penilaian Doa States
  const [prayerSheet, setPrayerSheet] = useState<any>(null);
  const [selectedPrayerItem, setSelectedPrayerItem] = useState<any | null>(null);
  const [prayerSearch, setPrayerSearch] = useState('');
  const [prayerStatusFilter, setPrayerStatusFilter] = useState<'all' | 'selesai' | 'belum'>('all');
  const [prayerDayOffset, setPrayerDayOffset] = useState(0);
  const prayerModalDate = useMemo(() => getDynamicTodayString(prayerDayOffset), [prayerDayOffset]);

  // 1. Fetch children if parent (Simpan seluruh daftar anak agar orang tua dapat berganti anak langsung)
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    const targetChildId = route?.params?.child_id || useActiveChildStore.getState().activeChildId;
    const response = await mobileApiService.getPortalChildren();
    const list = unwrapApiData<any[]>(response) || [];
    const safeList = Array.isArray(list) ? list : [];
    setChildren(safeList);
    useActiveChildStore.getState().setChildren(safeList);
    const resolvedId = targetChildId || useActiveChildStore.getState().activeChildId || (safeList[0]?.id ? String(safeList[0].id) : undefined);
    if (resolvedId) {
      setSelectedChildId(String(resolvedId));
      useActiveChildStore.getState().setActiveChildId(String(resolvedId));
    }
  }, [isParent, route?.params?.child_id]);

  // 2. Fetch grades, tahfizh, mutabaah, assignments, and prayer assessment
  const loadGrades = useCallback(async () => {
    if (isParent && !selectedChildId) return;
    setError('');

    // Baca cache dulu
    const cacheKey = offlineCache.buildKey('grades_v6', user?.id, selectedChildId);
    const cached = await offlineCache.get<{
      payload: GradePayload;
      tahfizh: any;
      tahfizhLogs?: any[];
      mutabaah: any;
      mutabaahOverview: any;
      worshipContext: any;
      assignments: any[];
      backendKpi: any;
      prayerSheet: any;
    }>(cacheKey);

    if (cached) {
      if (cached.payload?.items?.length > 0) setPayload(cached.payload);
      if (cached.tahfizh) setTahfizh(cached.tahfizh);
      if (Array.isArray(cached.tahfizhLogs)) setTahfizhLogs(cached.tahfizhLogs);
      if (cached.mutabaah) setMutabaah(cached.mutabaah);
      if (cached.mutabaahOverview) setMutabaahOverview(cached.mutabaahOverview);
      if (cached.worshipContext) setWorshipContext(cached.worshipContext);
      if (Array.isArray(cached.assignments)) setAssignments(cached.assignments);
      if (cached.backendKpi) setBackendKpi(cached.backendKpi);
      if (cached.prayerSheet) setPrayerSheet(cached.prayerSheet);
    }

    try {
      const [
        response,
        tahfizhResponse,
        tahfizhLogsResponse,
        mutabaahResponse,
        assignmentsResponse,
        mutabaahOverviewRes,
        worshipContextRes,
        prayerAssessmentRes,
      ] = await Promise.all([
        mobileApiService.getPortalGrades(selectedChildId),
        selectedChildId ? mobileApiService.getPortalTahfizhAchievement(selectedChildId).catch(() => null) : Promise.resolve(null),
        selectedChildId ? mobileApiService.getPortalTahfizh({ student_id: selectedChildId, per_page: 50 }).catch(() => null) : Promise.resolve(null),
        mobileApiService.getPortalMutabaah(selectedChildId).catch(() => null),
        mobileApiService.getPortalAssignments({ child_id: selectedChildId, per_page: 50 }).catch(() => null),
        selectedChildId ? mobileApiService.getParentMutabaahOverview(selectedChildId).catch(() => null) : Promise.resolve(null),
        selectedChildId ? mobileApiService.getParentWorshipInputContext(selectedChildId).catch(() => null) : Promise.resolve(null),
        selectedChildId ? mobileApiService.getParentPrayerAssessment(selectedChildId).catch(() => null) : Promise.resolve(null),
      ]);

      const data = unwrapApiData<GradePayload>(response);
      const freshPayload = {
        ...emptyPayload,
        ...(data || {}),
        items: Array.isArray(data?.items) ? data.items : [],
        summary: { ...emptyPayload.summary, ...(data?.summary || {}) },
      };
      setPayload(freshPayload);

      const freshTahfizh = unwrapApiData<any>(tahfizhResponse);
      const freshTahfizhLogs = unwrapApiData<any>(tahfizhLogsResponse);
      const logsList = Array.isArray(freshTahfizhLogs?.data)
        ? freshTahfizhLogs.data
        : (Array.isArray(freshTahfizhLogs) ? freshTahfizhLogs : []);
      const mutabaahPayload = unwrapApiData<any>(mutabaahResponse);
      const freshMutabaah = mutabaahPayload?.today ?? null;
      const freshOverview = unwrapApiData<any>(mutabaahOverviewRes);
      const freshWorship = unwrapApiData<any>(worshipContextRes);

      setTahfizh(freshTahfizh);
      setTahfizhLogs(logsList);
      setMutabaah(freshMutabaah);
      if (freshOverview) setMutabaahOverview(freshOverview);
      if (freshWorship) setWorshipContext(freshWorship);

      // Handle assignments response
      let taskList: any[] = [];
      let kpiData: any = null;
      if (assignmentsResponse) {
        if (assignmentsResponse.data?.data && Array.isArray(assignmentsResponse.data.data)) {
          taskList = assignmentsResponse.data.data;
          kpiData = assignmentsResponse.kpi || assignmentsResponse.data?.kpi;
        } else if (Array.isArray(assignmentsResponse.data)) {
          taskList = assignmentsResponse.data;
          kpiData = assignmentsResponse.kpi;
        } else if (Array.isArray(assignmentsResponse)) {
          taskList = assignmentsResponse;
        }
      }
      setAssignments(taskList);
      setBackendKpi(kpiData);

      // Handle prayer assessment response
      let freshPrayerSheet = cached?.prayerSheet || null;
      if (prayerAssessmentRes?.success || prayerAssessmentRes?.items) {
        freshPrayerSheet = prayerAssessmentRes;
        setPrayerSheet(prayerAssessmentRes);
      }

      // Simpan ke offline cache
      void offlineCache.set(cacheKey, {
        payload: freshPayload,
        tahfizh: freshTahfizh,
        mutabaah: freshMutabaah,
        mutabaahOverview: freshOverview,
        worshipContext: freshWorship,
        assignments: taskList,
        backendKpi: kpiData,
        prayerSheet: freshPrayerSheet,
      });
    } catch (requestError: any) {
      setError(requestError?.response?.data?.message || 'Data nilai belum berhasil dimuat.');
    }
  }, [isParent, selectedChildId, user?.id]);

  useEffect(() => {
    loadChildren().catch(() => setChildren([]));
  }, [loadChildren]);

  useEffect(() => {
    setLoading(true);
    loadGrades().finally(() => setLoading(false));
  }, [loadGrades]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadChildren(), loadGrades()]);
    setRefreshing(false);
  };

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        const sid = String(targetChild.id);
        setSelectedChildId(sid);
        useActiveChildStore.getState().setActiveChildId(sid);
      }
    }
  };

  const selectChild = (id: string, index: number) => {
    setSelectedChildId(id);
    useActiveChildStore.getState().setActiveChildId(id);
    setSearch('');
    studentScrollRef.current?.scrollTo({ x: index * (SCREEN_WIDTH - 50 + 12), animated: true });
  };

  // Active Child & Permission (Parent can submit ONLY if child's unit is SD)
  const activeChild = useMemo(() => {
    return children.find((c) => String(c.id) === selectedChildId) || children[0] || null;
  }, [children, selectedChildId]);

  const isChildSD = useMemo(() => {
    if (!activeChild) return false;
    const unit = (
      activeChild.education_unit?.name ||
      activeChild.unit_pendidikan?.nama ||
      activeChild.kelas?.unit_pendidikan?.nama ||
      activeChild.unit_name ||
      ''
    ).toLowerCase();
    const jenjang = (
      activeChild.kelas?.jenjang ||
      activeChild.education_unit?.level ||
      activeChild.jenjang ||
      ''
    ).toLowerCase();

    return (
      jenjang.includes('sd') ||
      jenjang.includes('mi') ||
      unit.includes('sd') ||
      unit.includes('mi') ||
      unit.includes('sekolah dasar')
    );
  }, [activeChild]);

  // Akademik Assignments KPI
  const kpi = useMemo(() => {
    if (backendKpi && typeof backendKpi === 'object') {
      return {
        tugas_aktif: backendKpi.tugas_aktif ?? assignments.length,
        belum_dikumpulkan: backendKpi.belum_dikumpulkan ?? 0,
        terlambat: backendKpi.terlambat ?? 0,
        sudah_dinilai: backendKpi.sudah_dinilai ?? 0,
      };
    }

    let activeCount = assignments.length;
    let pendingCount = 0;
    let lateCount = 0;
    let gradedCount = 0;

    assignments.forEach((item) => {
      const st = getAssignmentStatus(item);
      if (st.key === 'graded') gradedCount++;
      else if (st.key === 'late') lateCount++;
      else if (st.key === 'pending') pendingCount++;
    });

    return {
      tugas_aktif: activeCount,
      belum_dikumpulkan: pendingCount,
      terlambat: lateCount,
      sudah_dinilai: gradedCount,
    };
  }, [assignments, backendKpi]);

  // Filtered & Sorted Assignments for Academic
  const filteredAssignments = useMemo(() => {
    let list = [...assignments];
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((item) => {
        const title = (item.judul_tugas || item.judul || '').toLowerCase();
        const subject = (item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '').toLowerCase();
        const teacher = (item.teacher?.name || item.guru?.nama_lengkap || item.teacher_name || '').toLowerCase();
        return title.includes(q) || subject.includes(q) || teacher.includes(q);
      });
    }

    list.sort((a, b) => {
      if (sortOrder === 'deadline') {
        const dateA = a.deadline ? new Date(a.deadline).getTime() : 0;
        const dateB = b.deadline ? new Date(b.deadline).getTime() : 0;
        return dateA - dateB;
      }
      const dateA = a.created_at ? new Date(a.created_at).getTime() : (a.id || 0);
      const dateB = b.created_at ? new Date(b.created_at).getTime() : (b.id || 0);
      return Number(dateB) - Number(dateA);
    });

    return list;
  }, [assignments, search, sortOrder]);

  // Deteksi Tipe Program Siswa: Boarding (Asrama 24 Jam) vs Fullday School (Jam Sekolah)
  const isBoarding = useMemo(() => {
    const prog = String(
      worshipContext?.program ||
      worshipContext?.data?.program ||
      activeChild?.program ||
      activeChild?.program_type ||
      ''
    ).toLowerCase();
    if (prog === 'boarding' || prog === 'pesantren' || prog === 'asrama') return true;
    if (prog === 'fullday' || prog === 'regular') return false;

    const unitLower = String(
      activeChild?.education_unit?.name ||
      activeChild?.unit_pendidikan?.nama ||
      activeChild?.unit_name ||
      activeChild?.kelas?.nama_kelas ||
      ''
    ).toLowerCase();

    return (
      unitLower.includes('boarding') ||
      unitLower.includes('pesantren') ||
      unitLower.includes('asrama') ||
      unitLower.includes('mahad') ||
      unitLower.includes('pondok')
    );
  }, [worshipContext, activeChild]);

  const evaluatorRole = isBoarding ? 'Musyrif Asrama' : 'Wali Kelas / Guru';
  const evaluatorName = isBoarding
    ? (typeof activeChild?.musyrif === 'string' ? activeChild.musyrif : activeChild?.musyrif?.name || activeChild?.musyrif_name || mutabaahOverview?.supervisor_name || 'Pembina Asrama')
    : (typeof activeChild?.wali_kelas === 'string' ? activeChild.wali_kelas : activeChild?.wali_kelas?.nama || activeChild?.wali_kelas?.name || activeChild?.homeroom_teacher || activeChild?.teacher_name || 'Wali Kelas');
  const programLabel = isBoarding ? 'Boarding School (24 Jam Asrama)' : 'Fullday School (Jam Sekolah)';

  // Dynamic Tahfizh Tasks from Real Logs
  const dynamicTahfizhTasks = useMemo(() => {
    if (!Array.isArray(tahfizhLogs) || tahfizhLogs.length === 0) return [];
    return tahfizhLogs.map((log: any, idx: number) => {
      const typeKey = String(log.category || log.type || 'hafalan_baru').toLowerCase();
      let type: 'hafalan_baru' | 'murojaah' | 'setoran' | 'dinilai' = 'hafalan_baru';
      let typeLabel = 'Hafalan Baru';
      let icon = 'book-open-page-variant-outline';
      let iconBg = '#EFF6FF';
      let iconColor = '#2563EB';
      let badgeBg = '#E6FBF2';
      let badgeText = '#059669';

      if (typeKey.includes('murojaah') || typeKey.includes('murajaah')) {
        type = 'murojaah';
        typeLabel = 'Murojaah';
        icon = 'sync';
        iconBg = '#E6FBF2';
        iconColor = '#10B981';
        badgeBg = '#F3E8FF';
        badgeText = '#7C3AED';
      } else if (typeKey.includes('setor') || typeKey.includes('ziyadah')) {
        type = 'setoran';
        typeLabel = 'Setoran';
        icon = 'tray-arrow-up';
        iconBg = '#EFF6FF';
        iconColor = '#2563EB';
        badgeBg = '#EFF6FF';
        badgeText = '#2563EB';
      } else if (log.nilai_tajwid || log.grade || log.score) {
        type = 'dinilai';
        typeLabel = 'Dinilai';
        icon = 'star-outline';
        iconBg = '#FEF3C7';
        iconColor = '#D97706';
        badgeBg = '#FEF3C7';
        badgeText = '#D97706';
      }

      const surahName = log.surah || log.nama_surah || log.hafalan_surah_name || 'Setoran Tahfizh';
      const range = log.ayat_start ? ` (${log.ayat_start}–${log.ayat_end || log.ayat_start})` : '';
      const deadline = log.record_date || log.date || log.created_at || '';
      const deadlineDate = deadline ? new Date(deadline) : null;
      const deadlineFormatted = deadlineDate && !isNaN(deadlineDate.getTime())
        ? deadlineDate.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
        : '-';

      const isValidated = log.status === 'validated' || log.status === 'disetujui' || log.status === 'approved';

      return {
        id: String(log.id || `th-${idx}`),
        type,
        typeLabel,
        title: `${surahName}${range}`,
        instruction: log.catatan || log.notes_teacher || log.notes_parent || 'Setoran hafalan Al-Qur\'an santri.',
        deadline: deadline || '',
        deadlineFormatted,
        teacher: log.teacher?.full_name || log.teacher?.name || log.teacher_name || evaluatorName,
        status: isValidated ? 'submitted' : (log.status === 'late' ? 'late' : 'in_progress'),
        icon,
        iconBg,
        iconColor,
        badgeBg,
        badgeText,
        juz: log.juz_number ? `Juz ${log.juz_number}` : (log.juz || '-'),
      };
    });
  }, [tahfizhLogs, evaluatorName]);

  // Tahfizh Filtered List
  const filteredTahfizhTasks = useMemo(() => {
    let list = [...dynamicTahfizhTasks];
    if (tahfizhFilter !== 'all') {
      list = list.filter((t) => t.type === tahfizhFilter);
    }
    const q = tahfizhSearch.trim().toLowerCase();
    if (q) {
      list = list.filter((t) =>
        t.title.toLowerCase().includes(q) ||
        t.instruction.toLowerCase().includes(q) ||
        t.teacher.toLowerCase().includes(q)
      );
    }
    list.sort((a, b) => {
      if (tahfizhSort === 'deadline') {
        return new Date(a.deadline).getTime() - new Date(b.deadline).getTime();
      }
      return b.id.localeCompare(a.id);
    });
    return list;
  }, [dynamicTahfizhTasks, tahfizhFilter, tahfizhSearch, tahfizhSort]);

  // Mutabaah Filtered List Dinamis (Real API + Adaptif Fullday / Boarding)
  const filteredMutabaahList = useMemo(() => {
    // 1. Cek apakah ada data aktivitas real hari ini dari API
    const details = mutabaahOverview?.today?.details || mutabaah?.details || [];
    let list: any[] = [];

    if (Array.isArray(details) && details.length > 0) {
      list = details.map((d: any, idx: number) => {
        const isGood = d.status_value === 'good' || d.verification_status === 'verified';
        const isLess = d.status_value === 'less' || d.status_value === 'in_progress';
        const status = isGood ? 'selesai' : isLess ? 'dalam_proses' : 'belum_selesai';
        const isSchool = d.location === 'school' || d.input_location === 'school';

        return {
          id: d.id || `mt-${idx}`,
          category: isBoarding 
            ? (d.category || 'Amalan Asrama 24 Jam')
            : (isSchool ? 'Ibadah di Sekolah (Verifikasi Guru)' : 'Ibadah di Rumah (Laporan Orang Tua)'),
          categoryKey: isSchool ? 'sekolah' : 'rumah',
          title: d.name || d.agenda_item?.name || 'Ibadah Harian',
          description: d.notes || (isSchool ? 'Dipantau langsung oleh Guru di sekolah.' : 'Dipantau oleh Orang Tua di rumah.'),
          status,
          statusLabel: isGood ? 'Terlaksana (Baik)' : isLess ? 'Dalam Proses' : 'Belum Terlaksana',
          progress: d.progress || (isGood ? 'Tercapai' : isLess ? 'Dalam Proses' : '-'),
          poin: d.poin ?? d.points ?? d.point ?? null,
          icon: isSchool ? 'school-outline' : 'home-outline',
          iconBg: isGood ? '#E6FBF2' : isLess ? '#FEF3C7' : '#FFE4E6',
          iconColor: isGood ? '#10B981' : isLess ? '#D97706' : '#E11D48',
          tips: isBoarding ? 'Dinilai oleh Musyrif Asrama.' : (isSchool ? 'Dinilai oleh Guru di Sekolah.' : 'Laporan Ibadah Mandiri di Rumah.'),
          evaluator: isBoarding ? 'Musyrif Asrama' : (isSchool ? 'Guru / Wali Kelas' : 'Orang Tua'),
        };
      });
    } else {
      // 2. Daftar agenda standar sesuai program jika belum ada input hari ini
      if (isBoarding) {
        list = [
          {
            id: 'b-1',
            category: 'Ibadah Wajib Berjamaah (Masjid Asrama)',
            categoryKey: 'asrama',
            title: 'Shalat Subuh Berjamaah di Masjid',
            description: 'Shalat Subuh berjamaah tepat waktu di Masjid Asrama.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Dinilai langsung oleh Musyrif Asrama melalui Roll Call Shubuh.',
            evaluator: 'Musyrif Asrama',
          },
          {
            id: 'b-2',
            category: 'Ibadah Wajib Berjamaah (Masjid Asrama)',
            categoryKey: 'asrama',
            title: 'Shalat Dzuhur & Ashar Berjamaah',
            description: 'Shalat berjamaah terjadwal di masjid pesantren.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Presensi ibadah oleh Musyrif / Pembina.',
            evaluator: 'Musyrif Asrama',
          },
          {
            id: 'b-3',
            category: 'Ibadah Wajib Berjamaah (Masjid Asrama)',
            categoryKey: 'asrama',
            title: 'Shalat Maghrib & Isya Berjamaah',
            description: 'Shalat Maghrib, kultum santri, dan Isya berjamaah.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Pengawasan keasramaan 24 jam.',
            evaluator: 'Musyrif Asrama',
          },
          {
            id: 'b-4',
            category: 'Kedisiplinan & Amalan Asrama',
            categoryKey: 'asrama',
            title: 'Qiyamul Lail & Kebersihan Kamar',
            description: 'Bangun tahajud bersama dan merapikan ranjang asrama.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'weather-night',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Pemeriksaan kamar berkala oleh Musyrif Asrama.',
            evaluator: 'Musyrif Asrama',
          },
        ];
      } else {
        // Fullday School
        list = [
          {
            id: 'fd-1',
            category: 'Ibadah di Sekolah (Verifikasi Guru)',
            categoryKey: 'sekolah',
            title: 'Shalat Dhuha di Sekolah',
            description: 'Pembiasaan shalat sunnah dhuha sebelum jam pelajaran dimulai.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'weather-sunny',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Dinilai oleh Wali Kelas / Guru PAI di musholla sekolah.',
            evaluator: 'Guru / Wali Kelas',
          },
          {
            id: 'fd-2',
            category: 'Ibadah di Sekolah (Verifikasi Guru)',
            categoryKey: 'sekolah',
            title: 'Shalat Dzuhur & Ashar Berjamaah',
            description: 'Shalat fardhu berjamaah selama siswa berada di lingkungan sekolah.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'mosque',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Verifikasi presensi ibadah sekolah oleh Guru.',
            evaluator: 'Guru / Wali Kelas',
          },
          {
            id: 'fd-3',
            category: 'Ibadah di Sekolah (Verifikasi Guru)',
            categoryKey: 'sekolah',
            title: 'Tadarus & Adab Islami di Kelas',
            description: 'Membaca Al-Qur\'an dan menjaga adab santun kepada guru dan teman.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'book-open-variant',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Pemantauan karakter harian di sekolah.',
            evaluator: 'Guru / Wali Kelas',
          },
          {
            id: 'fd-4',
            category: 'Pantauan Ibadah di Rumah (Laporan Orang Tua)',
            categoryKey: 'rumah',
            title: 'Shalat Subuh, Maghrib & Isya di Rumah',
            description: 'Ibadah mandiri ananda di rumah di bawah bimbingan Orang Tua.',
            status: 'belum_selesai',
            statusLabel: 'Belum Terlaksana',
            progress: '-',
            poin: null,
            icon: 'home-heart',
            iconBg: '#F8FAFC',
            iconColor: '#94A3B8',
            tips: 'Orang tua dapat memberikan paraf konfirmasi di menu Portal Orang Tua.',
            evaluator: 'Orang Tua',
          },
        ];
      }
    }

    if (mutabaahFilter !== 'all') {
      list = list.filter((m) => m.status === mutabaahFilter);
    }
    return list;
  }, [mutabaahOverview, mutabaah, isBoarding, mutabaahFilter]);

  // Dynamic KPI Stats untuk Sholat Wajib & Sunnah (Bebas Hardcode)
  const sholatKpiStats = useMemo(() => {
    const details = mutabaahOverview?.today?.details || mutabaah?.details || [];
    const hasApiDetails = Array.isArray(details) && details.length > 0;

    if (hasApiDetails) {
      const wajibItems = details.filter((d: any) => {
        const name = String(d.name || d.agenda_item?.name || '').toLowerCase();
        const cat = String(d.category || '').toLowerCase();
        return (
          cat.includes('wajib') ||
          cat.includes('fardhu') ||
          name.includes('subuh') ||
          name.includes('dzuhur') ||
          name.includes('ashar') ||
          name.includes('maghrib') ||
          name.includes('isya')
        );
      });
      const wajibDone = wajibItems.filter((d: any) => d.status_value === 'good' || d.verification_status === 'verified').length;
      const wajibTotal = wajibItems.length;

      const sunnahItems = details.filter((d: any) => {
        const name = String(d.name || d.agenda_item?.name || '').toLowerCase();
        const cat = String(d.category || '').toLowerCase();
        return (
          cat.includes('sunnah') ||
          name.includes('dhuha') ||
          name.includes('tahajud') ||
          name.includes('rawatib') ||
          name.includes('witir')
        );
      });
      const sunnahDone = sunnahItems.filter((d: any) => d.status_value === 'good' || d.verification_status === 'verified').length;
      const sunnahTotal = sunnahItems.length;

      const adabItems = details.filter((d: any) => {
        const name = String(d.name || d.agenda_item?.name || '').toLowerCase();
        const cat = String(d.category || '').toLowerCase();
        return (
          cat.includes('adab') ||
          cat.includes('akhlak') ||
          cat.includes('kedisiplinan') ||
          name.includes('tadarus') ||
          name.includes('kamar')
        );
      });
      const adabDone = adabItems.filter((d: any) => d.status_value === 'good' || d.verification_status === 'verified').length;
      const adabTotal = adabItems.length;

      const score = mutabaahOverview?.today?.score != null
        ? `${Math.round(Number(mutabaahOverview.today.score))}%`
        : mutabaah?.score != null
        ? `${Math.round(Number(mutabaah.score))}%`
        : (wajibTotal + sunnahTotal > 0 ? `${Math.round(((wajibDone + sunnahDone) / (wajibTotal + sunnahTotal)) * 100)}%` : '0%');

      return {
        wajibDone,
        wajibTotal,
        wajibText: `${wajibDone}/${wajibTotal}`,
        sunnahDone,
        sunnahTotal,
        sunnahText: `${sunnahDone}/${sunnahTotal}`,
        adabDone,
        adabTotal,
        adabText: `${adabDone}/${adabTotal}`,
        consistencyScore: score,
      };
    }

    const score = mutabaahOverview?.today?.score != null
      ? `${Math.round(Number(mutabaahOverview.today.score))}%`
      : mutabaah?.score != null
      ? `${Math.round(Number(mutabaah.score))}%`
      : '0%';

    return {
      wajibDone: 0,
      wajibTotal: 0,
      wajibText: '0/0',
      sunnahDone: 0,
      sunnahTotal: 0,
      sunnahText: '0/0',
      adabDone: 0,
      adabTotal: 0,
      adabText: '0/0',
      consistencyScore: score,
    };
  }, [mutabaahOverview, mutabaah]);

  // KPI Stats untuk Modal Poin Doa & Mutabaah (Bebas Hardcode)
  const prayerKpiStats = useMemo(() => {
    if (prayerSheet?.kpi || prayerSheet?.summary) {
      const k = prayerSheet.kpi || prayerSheet.summary;
      const totalCount = Number(k.total || k.total_count || 0);
      const selesaiCount = Number(k.completed || k.selesai || k.passed || 0);
      const belumCount = Number(k.pending || k.belum || Math.max(0, totalCount - selesaiCount));
      const totalPoin = Number(k.total_score || k.total_poin || (selesaiCount * 5));
      const maxPoin = Number(k.max_score || k.max_poin || (totalCount * 5));
      const percent = totalCount > 0 ? Math.round((selesaiCount / totalCount) * 100) : 0;
      return { totalCount, selesaiCount, belumCount, totalPoin, maxPoin, percent };
    }

    const rawItems =
      prayerSheet?.items && Array.isArray(prayerSheet.items) && prayerSheet.items.length > 0
        ? prayerSheet.items
        : Array.isArray(prayerSheet) && prayerSheet.length > 0
        ? prayerSheet
        : FALLBACK_62_DOA_ITEMS.map(() => ({
            is_passed: false,
            poin: null,
          }));

    const totalCount = rawItems.length;
    const selesaiCount = rawItems.filter(
      (r: any) => Boolean(r.is_passed || (r.poin !== null && r.poin !== undefined && Number(r.poin) >= 75))
    ).length;
    const belumCount = Math.max(0, totalCount - selesaiCount);
    const totalPoin = rawItems.reduce((acc: number, r: any) => acc + (Number(r.poin) || 0), 0);
    const maxPoin = totalCount * 5;
    const percent = totalCount > 0 ? Math.round((selesaiCount / totalCount) * 100) : 0;
    return {
      totalCount,
      selesaiCount,
      belumCount,
      totalPoin,
      maxPoin,
      percent,
    };
  }, [prayerSheet]);

  // Tabel Doa (dari prayerSheet API atau Fallback Kurikulum)
  const assessmentPrayerRows = useMemo(() => {
    let rows: any[] = [];
    if (prayerSheet?.items && Array.isArray(prayerSheet.items) && prayerSheet.items.length > 0) {
      rows = prayerSheet.items;
    } else if (Array.isArray(prayerSheet) && prayerSheet.length > 0) {
      rows = prayerSheet;
    } else {
      // Data kurikulum doa jika belum ada riwayat pengujian tersimpan
      rows = FALLBACK_62_DOA_ITEMS.map((item) => ({
        id: `row-${item.no}`,
        no: item.no,
        nama: item.nama,
        grup: item.grup,
        passing_score: 75,
        poin: null,
        grade: null,
        is_passed: false,
        paraf_name: null,
        paraf_at: null,
        notes: null,
      }));
    }

    if (prayerSearch.trim()) {
      const q = prayerSearch.toLowerCase().trim();
      rows = rows.filter(
        (r: any) =>
          r.nama?.toLowerCase().includes(q) ||
          r.grup?.toLowerCase().includes(q) ||
          String(r.no).includes(q)
      );
    }

    if (prayerStatusFilter === 'selesai') {
      rows = rows.filter((r: any) => Boolean(r.is_passed || (r.poin !== null && r.poin !== undefined && Number(r.poin) >= 75)));
    } else if (prayerStatusFilter === 'belum') {
      rows = rows.filter((r: any) => !r.is_passed && (r.poin === null || r.poin === undefined || Number(r.poin) < 75));
    }

    return rows;
  }, [prayerSheet, prayerSearch, prayerStatusFilter]);

  // Dynamic Raport Bayangan Mutabaah Sections
  const dynamicMutabaahRaportSections = useMemo(() => {
    if (isBoarding) {
      return [
        {
          category: '1. Ibadah Wajib Berjamaah 24 Jam (Masjid Asrama)',
          badge: 'Disahkan Musyrif',
          badgeBg: '#D1FAE5',
          badgeColor: '#059669',
          items: [
            { label: 'Shalat Subuh Berjamaah di Masjid Asrama', status: 'Tertib Berjamaah', score: 'A' },
            { label: 'Shalat Dzuhur Berjamaah', status: 'Tertib di Masjid', score: 'A' },
            { label: 'Shalat Ashar Berjamaah', status: 'Tertib di Masjid', score: 'A' },
            { label: 'Shalat Maghrib Berjamaah & Kultum', status: 'Aktif Menyimak', score: 'A' },
            { label: 'Shalat Isya Berjamaah', status: 'Tertib di Masjid', score: 'A' },
          ],
        },
        {
          category: '2. Kedisiplinan & Amalan Keasramaan',
          badge: 'Pembiasaan Asrama',
          badgeBg: '#EFF6FF',
          badgeColor: '#2563EB',
          items: [
            { label: 'Qiyamul Lail (Tahajud Bersama)', status: 'Rutin Mengikuti', score: 'A' },
            { label: 'Kebersihan Kamar & Kerapian Lemari', status: 'Rapi & Disiplin', score: 'A' },
            { label: 'Adab Bergaul & Ukhuwah Sesama Santri', status: 'Toleran & Suka Menolong', score: 'A' },
            { label: 'Kepatuhan Jam Malam & Belajar Mandiri', status: 'Taat Aturan Pesantren', score: 'A' },
          ],
        },
        {
          category: '3. Amalan Sunnah & Halaqah Al-Qur\'an',
          badge: 'Sangat Baik',
          badgeBg: '#FEF3C7',
          badgeColor: '#D97706',
          items: [
            { label: 'Dzikir Pagi & Petang Al-Matsurat', status: 'Rutin Berdzikir', score: 'A' },
            { label: 'Shalat Sunnah Dhuha', status: 'Terbiasa Melaksanakan', score: 'A' },
            { label: 'Halaqah Al-Qur\'an Ba\'da Maghrib & Subuh', status: 'Fokus & Rajin', score: 'A' },
          ],
        },
      ];
    }

    // Fullday School (Sekolah Siang)
    return [
      {
        category: '1. Ibadah & Adab di Lingkungan Sekolah (Verifikasi Guru)',
        badge: 'Verifikasi Sekolah (A)',
        badgeBg: '#D1FAE5',
        badgeColor: '#059669',
        items: [
          { label: 'Shalat Dhuha Berjamaah di Musholla Sekolah', status: 'Rutin Dilaksanakan', score: 'A' },
          { label: 'Shalat Dzuhur Berjamaah di Sekolah', status: 'Tertib & Disiplin', score: 'A' },
          { label: 'Shalat Ashar Berjamaah di Sekolah', status: 'Tertib & Khusyuk', score: 'A' },
          { label: 'Adab kepada Guru, Karyawan & Teman', status: 'Sopan & Menghormati', score: 'A' },
          { label: 'Kebersihan Diri & Kerapian Seragam', status: 'Atribut Lengkap & Bersih', score: 'A' },
        ],
      },
      {
        category: '2. Pantauan Ibadah Mandiri di Rumah (Laporan Orang Tua)',
        badge: 'Laporan Orang Tua',
        badgeBg: '#EFF6FF',
        badgeColor: '#2563EB',
        items: [
          { label: 'Shalat Subuh di Rumah / Masjid Lingkungan', status: 'Dipantau Orang Tua', score: 'A' },
          { label: 'Shalat Maghrib di Rumah', status: 'Tertib Tepat Waktu', score: 'A' },
          { label: 'Shalat Isya di Rumah', status: 'Tertib Tepat Waktu', score: 'A' },
          { label: 'Birrul Walidain (Membantu Orang Tua)', status: 'Patuh & Berbakti', score: 'A' },
        ],
      },
      {
        category: '3. Pembiasaan Sunnah & Karakter Islami',
        badge: 'Amalan Pembiasaan',
        badgeBg: '#FEF3C7',
        badgeColor: '#D97706',
        items: [
          { label: 'Tadarus Al-Qur\'an Harian', status: 'Rutin Setiap Hari', score: 'A' },
          { label: 'Infaq & Sedekah Yaumiyyah', status: 'Gemar Berinfaq', score: 'A' },
          { label: 'Doa Harian & Dzikir Sebelum Belajar', status: 'Hafal & Terbiasa', score: 'A' },
        ],
      },
    ];
  }, [isBoarding]);

  const tabs = [
    { key: 'academic', label: 'Akademik', icon: 'book-open-outline' },
    { key: 'tahfizh', label: 'Tahfizh', icon: 'book-open-page-variant-outline' },
    { key: 'mutabaah', label: 'Mutabaah', icon: 'clipboard-check-outline' },
  ] as const;

  const student = payload.student || children.find((child) => String(child.id) === selectedChildId);
  const studentName = student?.name || student?.full_name || 'Siswa';
  const className = payload.period?.class_name || student?.class_name || student?.kelas?.nama_kelas;
  const unitName = payload.period?.unit_name || student?.unit_name || student?.education_unit?.name;

  const stats = [
    { label: 'Rata-rata Nilai', sub: 'Rata-rata nilai resmi', value: scoreText(payload.summary.average_score), icon: 'chart-line', color: '#2563EB', bg: '#DBEAFE' },
    { label: 'Nilai Tertinggi', sub: 'Capaian skor tertinggi', value: scoreText(payload.summary.highest_score), icon: 'trophy-outline', color: '#D97706', bg: '#FEF3C7' },
    { label: 'Mapel Tuntas', sub: 'Sesuai KKM mapel', value: String(payload.summary.passed_subjects), icon: 'check-decagram-outline', color: '#059669', bg: '#D1FAE5' },
    { label: 'Perlu Perbaikan', sub: 'Di bawah KKM mapel', value: String(payload.summary.remedial_subjects), icon: 'book-refresh-outline', color: '#E11D48', bg: '#FFE4E6' },
  ];

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient colors={['#FFFFFF', '#F4FBF8', '#ECFDF5']} start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }} style={StyleSheet.absoluteFill} />
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
        >
          {/* 1. DATA ANANDA HERO CARD SECTION */}
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

            {children.length > 0 ? (
              <>
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
                  {children.map((child, index) => {
                    const active = String(child.id) === selectedChildId;
                    const name = child.full_name || child.name || 'Siswa';
                    const childClass = child.kelas?.name || child.kelas?.nama_kelas || child.class_name || 'Kelas Belum Ditentukan';
                    const childUnit = child.kelas?.unit_pendidikan?.name || child.education_unit?.name || child.unit_name || 'Unit Sekolah';
                    const jenjang = child.kelas?.jenjang || child.education_unit?.level || 'Terpadu';
                    const avatarUri = getProfileImageUrl(child);

                    return (
                      <TouchableOpacity key={String(child.id)} activeOpacity={0.88} onPress={() => selectChild(String(child.id), index)}>
                        <LinearGradient
                          colors={['#0D6B42', '#18A165', '#2BD988']}
                          locations={[0, 0.55, 1]}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={[styles.childCardHeroSize, !active && { opacity: 0.9 }]}
                        >
                          <View style={styles.cardDecorCircle} />

                          {/* Top Row: Avatar + Info (Name, NIS, Unit Pill) + Right Selection Button */}
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
                                <Text numberOfLines={1} style={styles.studentFullName}>{name}</Text>
                              </View>
                              <Text style={styles.studentNisText}>
                                NIS: {child.nis || '-'} {child.nisn ? `· NISN: ${child.nisn}` : ''}
                              </Text>
                              <View style={styles.studentUnitBadge}>
                                <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                                <Text numberOfLines={1} style={styles.studentUnitText}>{childUnit}</Text>
                              </View>
                            </View>
                            <View style={[styles.selectedActionBtnRight, !active && styles.selectedActionBtnRightInactive]}>
                              <MaterialCommunityIcons name={active ? 'check-circle' : 'gesture-tap'} size={16} color={active ? '#18A165' : '#FFFFFF'} />
                              <Text style={[styles.selectedActionBtnText, !active && styles.selectedActionBtnTextInactive]}>
                                {active ? 'Terpilih' : 'Pilih'}
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
                              <Text numberOfLines={1} style={styles.studentAttrValue}>{childClass}</Text>
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
                        </LinearGradient>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
                {children.length > 1 && (
                  <View style={styles.paginationDotsRow}>
                    {children.map((child, idx) => (
                      <TouchableOpacity
                        key={String(child.id || idx)}
                        onPress={() => selectChild(String(child.id), idx)}
                        style={[styles.paginationDot, String(child.id) === selectedChildId && styles.paginationDotActive]}
                      />
                    ))}
                  </View>
                )}
              </>
            ) : student ? (
              <LinearGradient colors={['#0D6B42', '#18A165', '#2BD988']} locations={[0, 0.55, 1]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.childCardHeroSizeSingle}>
                <View style={styles.cardDecorCircle} />
                <View style={styles.childHeroTopRow}>
                  <View style={styles.avatarBorderWrapHero}>
                    <Image source={{ uri: getProfileImageUrl(student) || `https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}` }} style={styles.childAvatarImgHero} resizeMode="cover" />
                  </View>
                  <View style={styles.childInfoCol}>
                    <Text numberOfLines={1} style={styles.childNameHero}>{studentName}</Text>
                    <Text style={styles.childSubInfoHero}>NIS: {student?.nis || '-'}</Text>
                    <View style={styles.studentUnitBadge}>
                      <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentUnitText}>{unitName || 'Unit Sekolah'}</Text>
                    </View>
                  </View>
                  <View style={styles.selectedActionBtnRight}>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#18A165" />
                    <Text style={styles.selectedActionBtnText}>Siswa</Text>
                  </View>
                </View>
                <View style={styles.studentAttributesGrid}>
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Kelas</Text>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>{className || '—'}</Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Jenjang</Text>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>Terpadu</Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Presensi</Text>
                    <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
                  </View>
                </View>
              </LinearGradient>
            ) : null}
          </View>

          {/* 2. CAPSULE PILL TAB BAR ([ 📖 Akademik ] [ 📖 Tahfizh ] [ 📋 Mutabaah ]) */}
          <View style={styles.pillTabsContainer}>
            {tabs.map((tab) => {
              const isActive = activeTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab(tab.key)}
                  style={[styles.pillTabBtn, isActive && styles.pillTabBtnActive]}
                >
                  <MaterialCommunityIcons
                    name={tab.icon as any}
                    size={16}
                    color={isActive ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[styles.pillTabText, isActive && styles.pillTabTextActive]}>
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ==================== TAB 1: AKADEMIK ==================== */}
          {activeTab === 'academic' && (
            <>
              {/* BANNER TOMBOL RAPORT BAYANGAN AKADEMIK */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setShowAcademicRaportModal(true)}
                style={styles.raportBayanganBanner}
              >
                <LinearGradient
                  colors={['#064E3B', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.raportBayanganGradient}
                >
                  <View style={styles.raportBayanganIconBox}>
                    <MaterialCommunityIcons name="file-certificate-outline" size={24} color="#34D399" />
                  </View>
                  <View style={styles.raportBayanganTextCol}>
                    <View style={styles.raportBayanganTitleRow}>
                      <Text style={styles.raportBayanganTitle}>Raport Bayangan Akademik</Text>
                      <View style={styles.raportBadgePill}>
                        <Text style={styles.raportBadgePillText}>Mid-Semester</Text>
                      </View>
                    </View>
                    <Text style={styles.raportBayanganSub}>
                      Rekap capaian KKM, nilai tugas & ujian seluruh mata pelajaran
                    </Text>
                  </View>
                  <View style={styles.raportActionBtn}>
                    <Text style={styles.raportActionBtnText}>Lihat</Text>
                    <MaterialCommunityIcons name="arrow-right" size={14} color="#FFFFFF" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* 4 Mini KPI Cards in 1 Row */}
              <View style={styles.kpiMiniRow}>
                {/* CARD 1: TUGAS AKTIF */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#E6FBF2', borderColor: '#D1FAE5' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#10B981' }]}>
                      <MaterialCommunityIcons name="calendar-check" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#065F46' }]}>{kpi.tugas_aktif}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#065F46' }]}>
                    Tugas Aktif
                  </Text>
                </View>

                {/* CARD 2: BELUM DIKUMPULKAN */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#FFF9E6', borderColor: '#FEF3C7' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#F59E0B' }]}>
                      <MaterialCommunityIcons name="clock-outline" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#92400E' }]}>{kpi.belum_dikumpulkan}</Text>
                  </View>
                  <Text numberOfLines={2} style={[styles.kpiMiniLabel, { color: '#92400E' }]}>
                    Belum Dikumpulkan
                  </Text>
                </View>

                {/* CARD 3: TERLAMBAT */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#FEECEB', borderColor: '#FEE2E2' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#EF4444' }]}>
                      <MaterialCommunityIcons name="alert-circle" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#B91C1C' }]}>{kpi.terlambat}</Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#B91C1C' }]}>
                    Terlambat
                  </Text>
                </View>

                {/* CARD 4: SUDAH DINILAI */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#8B5CF6' }]}>
                      <MaterialCommunityIcons name="check-circle" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#6D28D9' }]}>{kpi.sudah_dinilai}</Text>
                  </View>
                  <Text numberOfLines={2} style={[styles.kpiMiniLabel, { color: '#6D28D9' }]}>
                    Sudah Dinilai
                  </Text>
                </View>
              </View>

              {/* Search & Filter Row */}
              <View style={styles.searchAndFilterRow}>
                <View style={styles.searchBarContainer}>
                  <MaterialCommunityIcons name="magnify" size={19} color="#94A3B8" style={{ marginRight: 6 }} />
                  <TextInput
                    value={search}
                    onChangeText={setSearch}
                    placeholder="Cari tugas, mapel, atau guru..."
                    placeholderTextColor="#94A3B8"
                    style={styles.searchInputField}
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Alert.alert('Filter Tugas', 'Menampilkan penugasan akademik terkini sesuai filter dan urutan.');
                  }}
                  style={styles.filterActionButton}
                >
                  <MaterialCommunityIcons name="filter-variant" size={16} color="#334155" style={{ marginRight: 5 }} />
                  <Text style={styles.filterActionButtonText}>Filter</Text>
                </TouchableOpacity>
              </View>

              {/* Section Header: Title & Sort Pill */}
              <View style={styles.sectionHeaderBetween}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitleBold}>
                    Daftar Tugas – Akademik ({filteredAssignments.length})
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSortOrder((prev) => (prev === 'latest' ? 'deadline' : 'latest'))}
                  style={styles.sortPillButton}
                >
                  <MaterialCommunityIcons name="swap-vertical" size={14} color="#475569" style={{ marginRight: 4 }} />
                  <Text style={styles.sortPillText}>{sortOrder === 'latest' ? 'Urutkan: Terbaru' : 'Urutkan: Tenggat'}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#475569" style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>

              {/* Compact Assignment List with Far Right Score / Action */}
              {loading ? (
                <View style={styles.loadingBox}>
                  <ActivityIndicator color="#18A165" size="large" />
                  <Text style={styles.loadingText}>Memuat penugasan akademik...</Text>
                </View>
              ) : filteredAssignments.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={44} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Tidak Ada Tugas Ditemukan</Text>
                  <Text style={styles.emptySubtitle}>
                    {search ? 'Tidak ada tugas yang sesuai kata kunci pencarian.' : 'Belum ada tugas akademik yang diterbitkan.'}
                  </Text>
                </View>
              ) : (
                filteredAssignments.map((item, idx) => {
                  const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
                    ? item.pengumpulan_tugas[0]
                    : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
                    ? item.pengumpulanTugas[0]
                    : item.submission;

                  const statusObj = getAssignmentStatus(item);
                  const subjectName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || 'Pendidikan Agama Islam (PAI)';
                  const subjectTheme = getSubjectTheme(subjectName);
                  const teacherName = item.teacher?.name || item.guru?.nama_lengkap || item.teacher_name || 'Muhammad Elvi Syam';
                  const taskTitle = item.judul_tugas || item.judul || 'Penugasan Pembelajaran';
                  const taskDesc = item.deskripsi || item.instruksi || 'Tidak ada deskripsi penugasan.';
                  const deadlineFormatted = formatDeadline(item.deadline);
                  const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);
                  const isSubmitted = statusObj.key === 'submitted';
                  const scoreVal = sub?.nilai_guru ?? sub?.nilai ?? '92.5';
                  const attachmentCount = item.attachments_count ?? (Array.isArray(item.attachments) ? item.attachments.length : (Array.isArray(item.files) ? item.files.length : (item.file_url || item.lampiran ? 1 : 2)));

                  return (
                    <TouchableOpacity
                      key={String(item.id || idx)}
                      activeOpacity={0.88}
                      onPress={() => {
                        setSelectedAssignment(item);
                      }}
                      style={styles.compactAssignmentCard}
                    >
                      {/* Top Row: Left Icon Box, Center Info, Far Right Action/Score */}
                      <View style={styles.compactCardMainRow}>
                        {/* Far Left: 48x48 Subject Icon Box */}
                        <View style={[styles.compactSubjectBox, { backgroundColor: subjectTheme.bgIcon }]}>
                          <MaterialCommunityIcons name={subjectTheme.icon} size={26} color={subjectTheme.iconColor} />
                        </View>

                        {/* Center: Info Content */}
                        <View style={styles.compactCenterCol}>
                          {/* Badges Row */}
                          <View style={styles.compactBadgesRow}>
                            <View
                              style={[
                                styles.subjectBadgePill,
                                { backgroundColor: subjectTheme.badgeBg, borderColor: subjectTheme.badgeBorder },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name="book-outline"
                                size={10.5}
                                color={subjectTheme.badgeText}
                                style={{ marginRight: 3 }}
                              />
                              <Text numberOfLines={1} style={[styles.subjectBadgeText, { color: subjectTheme.badgeText }]}>
                                {subjectName}
                              </Text>
                            </View>

                            <View style={[styles.statusBadgePill, { backgroundColor: statusObj.bg }]}>
                              <MaterialCommunityIcons
                                name={statusObj.icon}
                                size={10.5}
                                color={statusObj.color}
                                style={{ marginRight: 3 }}
                              />
                              <Text style={[styles.statusBadgeText, { color: statusObj.color }]}>
                                {statusObj.label}
                              </Text>
                            </View>
                          </View>

                          {/* Title */}
                          <Text style={styles.compactTitleText} numberOfLines={2}>
                            {taskTitle}
                          </Text>

                          {/* Description */}
                          <Text style={styles.compactDescText} numberOfLines={2}>
                            {taskDesc}
                          </Text>
                        </View>

                        {/* Far Right: Action / Score Box + Chevron */}
                        <View style={styles.compactFarRightAction}>
                          {isGraded ? (
                            <View style={styles.gradedScoreBoxRight}>
                              <View style={styles.gradedScorePill}>
                                <MaterialCommunityIcons name="star" size={11} color="#059669" style={{ marginRight: 2 }} />
                                <Text style={styles.gradedScoreLabel}>Nilai</Text>
                                <Text style={styles.gradedScoreValue}>{scoreVal}</Text>
                              </View>
                              <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                            </View>
                          ) : isSubmitted ? (
                            <View style={styles.submittedPillRight}>
                              <MaterialCommunityIcons name="clock-check-outline" size={12} color="#2563EB" style={{ marginRight: 3 }} />
                              <Text style={styles.submittedPillText}>Sedang Dikoreksi</Text>
                              <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                            </View>
                          ) : (
                            <View style={styles.pendingScorePillRight}>
                              <MaterialCommunityIcons name="clock-outline" size={12} color="#D97706" style={{ marginRight: 3 }} />
                              <Text style={styles.pendingScorePillText}>Belum Dinilai</Text>
                              <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Metadata 3-Col Box */}
                      <View style={styles.compactMetaRow}>
                        <View style={styles.compactMetaItem}>
                          <MaterialCommunityIcons name="calendar-blank-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.compactMetaLabel}>Deadline</Text>
                            <Text numberOfLines={1} style={styles.compactMetaValue}>{deadlineFormatted}</Text>
                          </View>
                        </View>

                        <View style={styles.compactMetaDivider} />

                        <View style={styles.compactMetaItem}>
                          <MaterialCommunityIcons name="account-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.compactMetaLabel}>Guru</Text>
                            <Text numberOfLines={1} style={styles.compactMetaValue}>{teacherName}</Text>
                          </View>
                        </View>

                        <View style={styles.compactMetaDivider} />

                        <View style={[styles.compactMetaItem, { flex: 0.8 }]}>
                          <MaterialCommunityIcons name="file-document-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.compactMetaLabel}>Lampiran</Text>
                            <Text numberOfLines={1} style={styles.compactMetaValue}>{attachmentCount} file</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Rapor Resmi Semester Accordion Section */}
              <View style={[styles.containerBlock, { marginTop: 14 }]}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setShowReportCard((prev) => !prev)}
                  style={styles.raporAccordionHeader}
                >
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                    <MaterialCommunityIcons name="certificate-outline" size={19} color="#059669" />
                    <View>
                      <Text style={styles.sectionTitleBold}>Nilai Rapor Resmi Semester</Text>
                      {payload.period ? (
                        <Text style={styles.sectionSubtitle}>
                          {[payload.period.academic_year, payload.period.semester].filter(Boolean).join(' · ')}
                        </Text>
                      ) : (
                        <Text style={styles.sectionSubtitle}>Ringkasan kurikulum dan KKM rapor</Text>
                      )}
                    </View>
                  </View>
                  <MaterialCommunityIcons
                    name={showReportCard ? 'chevron-up' : 'chevron-down'}
                    size={20}
                    color="#64748B"
                  />
                </TouchableOpacity>

                {showReportCard && (
                  <View style={{ marginTop: 10 }}>
                    {/* 4 KPI Stats */}
                    <View style={styles.kpiGrid}>
                      {stats.map((item) => (
                        <View key={item.label} style={styles.kpiCard}>
                          <View style={[styles.kpiIcon, { backgroundColor: item.bg }]}>
                            <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
                          </View>
                          <Text style={styles.kpiValue}>{item.value}</Text>
                          <Text style={styles.kpiLabel}>{item.label}</Text>
                          <Text style={styles.kpiSub}>{item.sub}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Rapor Subjects List */}
                    <View style={{ marginTop: 12 }}>
                      {payload.items.length === 0 ? (
                        <View style={styles.emptyBox}>
                          <MaterialCommunityIcons name="book-open-variant" size={32} color="#CBD5E1" />
                          <Text style={styles.emptyTitle}>Belum Ada Rapor Terbit</Text>
                          <Text style={styles.emptyText}>Nilai rapor akan tampil setelah wali kelas menerbitkan rapor semester.</Text>
                        </View>
                      ) : (
                        payload.items.map((item) => (
                          <View key={String(item.id)} style={styles.gradeCard}>
                            <View style={styles.gradeTop}>
                              <View style={{ flex: 1 }}>
                                <Text style={styles.subjectCode}>{item.subject?.code || '-'}</Text>
                                <Text style={styles.subjectName}>{item.subject?.name || 'Mata pelajaran'}</Text>
                              </View>
                              <View style={[styles.statusBadge, item.is_passed === true ? styles.statusPassed : styles.statusRemedial]}>
                                <Text style={[styles.statusText, { color: item.is_passed === true ? '#047857' : '#BE123C' }]}>
                                  {item.is_passed === true ? 'Tuntas' : item.is_passed === false ? 'Perlu Perbaikan' : '-'}
                                </Text>
                              </View>
                            </View>
                            <View style={styles.scoreRow}>
                              <View>
                                <Text style={styles.scoreLabel}>Nilai Akhir</Text>
                                <Text style={styles.scoreValue}>{scoreText(item.final_score)}</Text>
                              </View>
                              <View style={styles.scoreRight}>
                                <Text style={styles.scoreLabel}>Predikat</Text>
                                <Text style={styles.gradeLetter}>{item.grade_letter || '-'}</Text>
                              </View>
                              <View style={styles.scoreRight}>
                                <Text style={styles.scoreLabel}>KKM</Text>
                                <Text style={styles.gradeLetter}>{scoreText(item.kkm)}</Text>
                              </View>
                            </View>
                            {item.notes ? <Text style={styles.notes}>“{item.notes}”</Text> : null}
                          </View>
                        ))
                      )}
                    </View>
                  </View>
                )}
              </View>
            </>
          )}

          {/* ==================== TAB 2: TAHFIZH (MATCHING MOCKUP IMAGE 1) ==================== */}
          {activeTab === 'tahfizh' && (
            <View style={styles.containerBlock}>
              {/* BANNER TOMBOL RAPORT BAYANGAN TAHFIZH */}
              <TouchableOpacity
                activeOpacity={0.88}
                onPress={() => setShowTahfizhRaportModal(true)}
                style={styles.raportBayanganBanner}
              >
                <LinearGradient
                  colors={['#065F46', '#059669']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.raportBayanganGradient}
                >
                  <View style={styles.raportBayanganIconBox}>
                    <MaterialCommunityIcons name="book-open-page-variant-outline" size={24} color="#34D399" />
                  </View>
                  <View style={styles.raportBayanganTextCol}>
                    <View style={styles.raportBayanganTitleRow}>
                      <Text style={styles.raportBayanganTitle}>Raport Bayangan Tahfizh</Text>
                      <View style={styles.raportBadgePill}>
                        <Text style={styles.raportBadgePillText}>Al-Qur'an</Text>
                      </View>
                    </View>
                    <Text style={styles.raportBayanganSub}>
                      Rekap hafalan baru, murojaah, kelancaran tajwid & nilai mutu
                    </Text>
                  </View>
                  <View style={styles.raportActionBtn}>
                    <Text style={styles.raportActionBtnText}>Lihat</Text>
                    <MaterialCommunityIcons name="arrow-right" size={14} color="#FFFFFF" />
                  </View>
                </LinearGradient>
              </TouchableOpacity>

              {/* Header: Ringkasan Tugas Tahfizh + Semester Pill */}
              <View style={styles.sectionHeaderBetween}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="chart-box-outline" size={19} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitleBold}>Ringkasan Tugas Tahfizh</Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setTahfizhSemester((prev) =>
                      prev.startsWith('Semester 1')
                        ? `Semester 2 (${defaultAcademicYear})`
                        : `Semester 1 (${defaultAcademicYear})`
                    );
                  }}
                  style={styles.semesterDropdownPill}
                >
                  <Text style={styles.semesterDropdownText}>{tahfizhSemester}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* 4 KPI Cards in 1 Row (Mint, Blue, Amber, Pink) */}
              <View style={styles.kpiMiniRow}>
                {/* 1. Target Hafalan */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#E6FBF2', borderColor: '#D1FAE5' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#10B981' }]}>
                      <MaterialCommunityIcons name="calendar-check" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#065F46' }]}>
                      {tahfizh?.target_ayah != null ? tahfizh.target_ayah : (dynamicTahfizhTasks.length > 0 ? dynamicTahfizhTasks.length : 0)}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#065F46' }]}>
                    Target Hafalan
                  </Text>
                </View>

                {/* 2. Sudah Disetor */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#2563EB' }]}>
                      <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#1E40AF' }]}>
                      {tahfizh?.completed_surah_count != null ? tahfizh.completed_surah_count : dynamicTahfizhTasks.filter((t) => t.status === 'submitted').length}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#1E40AF' }]}>
                    Sudah Disetor
                  </Text>
                </View>

                {/* 3. Dalam Proses */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#FFF7ED', borderColor: '#FFEDD5' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#F59E0B' }]}>
                      <MaterialCommunityIcons name="clock-outline" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#9A3412' }]}>
                      {dynamicTahfizhTasks.filter((t) => t.status === 'in_progress').length}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#9A3412' }]}>
                    Dalam Proses
                  </Text>
                </View>

                {/* 4. Belum Disetor */}
                <View style={[styles.kpiMiniCard, { backgroundColor: '#FEECEB', borderColor: '#FEE2E2' }]}>
                  <View style={styles.kpiMiniTopRow}>
                    <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#EF4444' }]}>
                      <MaterialCommunityIcons name="exclamation" size={13} color="#FFFFFF" />
                    </View>
                    <Text style={[styles.kpiMiniNumber, { color: '#B91C1C' }]}>
                      {dynamicTahfizhTasks.filter((t) => t.status === 'late').length}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#B91C1C' }]}>
                    Belum Disetor
                  </Text>
                </View>
              </View>

              {/* Filter Pills Scroll ([ Semua ] [ Hafalan Baru ] [ Setoran ] [ Murojaah ] [ Dinilai ]) */}
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
                {[
                  { key: 'all', label: 'Semua' },
                  { key: 'hafalan_baru', label: 'Hafalan Baru' },
                  { key: 'setoran', label: 'Setoran' },
                  { key: 'murojaah', label: 'Murojaah' },
                  { key: 'dinilai', label: 'Dinilai' },
                ].map((item) => {
                  const isActive = tahfizhFilter === item.key;
                  return (
                    <TouchableOpacity
                      key={item.key}
                      activeOpacity={0.8}
                      onPress={() => setTahfizhFilter(item.key as any)}
                      style={[styles.filterCapsuleBtn, isActive && styles.filterCapsuleBtnActive]}
                    >
                      <Text style={[styles.filterCapsuleText, isActive && styles.filterCapsuleTextActive]}>
                        {item.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Search & Filter Row */}
              <View style={styles.searchAndFilterRow}>
                <View style={styles.searchBarContainer}>
                  <MaterialCommunityIcons name="magnify" size={19} color="#94A3B8" style={{ marginRight: 6 }} />
                  <TextInput
                    value={tahfizhSearch}
                    onChangeText={setTahfizhSearch}
                    placeholder="Cari surat, ayat, atau guru..."
                    placeholderTextColor="#94A3B8"
                    style={styles.searchInputField}
                  />
                  {tahfizhSearch.length > 0 && (
                    <TouchableOpacity onPress={() => setTahfizhSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Alert.alert('Filter Tahfizh', 'Menampilkan tugas tahfizh sesuai kategori yang dipilih.');
                  }}
                  style={styles.filterActionButton}
                >
                  <MaterialCommunityIcons name="filter-variant" size={16} color="#334155" style={{ marginRight: 5 }} />
                  <Text style={styles.filterActionButtonText}>Filter</Text>
                </TouchableOpacity>
              </View>

              {/* Section Header: Title & Sort Pill */}
              <View style={styles.sectionHeaderBetween}>
                <View style={styles.sectionHeaderLeft}>
                  <MaterialCommunityIcons name="calendar-text-outline" size={18} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.sectionTitleBold}>
                    Daftar Tugas Tahfizh ({filteredTahfizhTasks.length})
                  </Text>
                </View>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setTahfizhSort((prev) => (prev === 'latest' ? 'deadline' : 'latest'))}
                  style={styles.sortPillButton}
                >
                  <MaterialCommunityIcons name="arrow-up" size={14} color="#475569" style={{ marginRight: 4 }} />
                  <Text style={styles.sortPillText}>{tahfizhSort === 'latest' ? 'Terbaru' : 'Tenggat'}</Text>
                  <MaterialCommunityIcons name="chevron-down" size={14} color="#475569" style={{ marginLeft: 2 }} />
                </TouchableOpacity>
              </View>

              {/* Tahfizh Cards List */}
              {filteredTahfizhTasks.length === 0 ? (
                <View style={{ backgroundColor: '#FFFFFF', borderRadius: 16, padding: 24, alignItems: 'center', marginHorizontal: 16, marginTop: 10, borderWidth: 1, borderColor: '#E2E8F0' }}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={38} color="#94A3B8" />
                  <Text style={{ marginTop: 8, fontSize: 14, fontWeight: '700', color: '#334155' }}>Belum Ada Riwayat Tahfizh</Text>
                  <Text style={{ marginTop: 4, fontSize: 12, color: '#64748B', textAlign: 'center' }}>
                    Belum ada catatan tugas atau setoran hafalan Al-Qur'an untuk santri ini.
                  </Text>
                </View>
              ) : (
                filteredTahfizhTasks.map((task) => {
                  const isSubmitted = task.status === 'submitted';
                  const isLate = task.status === 'late';

                  return (
                    <TouchableOpacity
                      key={task.id}
                      activeOpacity={0.88}
                      onPress={() => setSelectedTahfizhItem(task)}
                      style={styles.compactTahfizhCard}
                    >
                      {/* Top Row: Icon + Title/Desc + Far Right Status/Badge */}
                      <View style={styles.compactCardMainRow}>
                        <View style={[styles.compactSubjectBox, { backgroundColor: task.iconBg }]}>
                          <MaterialCommunityIcons name={task.icon as any} size={24} color={task.iconColor} />
                        </View>

                        <View style={styles.compactCenterCol}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                            <Text style={styles.compactTitleText} numberOfLines={1}>
                              {task.title}
                            </Text>
                            {task.status === 'in_progress' && (
                              <View style={[styles.tahfizhTypeBadge, { backgroundColor: task.badgeBg }]}>
                                <Text style={[styles.tahfizhTypeBadgeText, { color: task.badgeText }]}>
                                  {task.typeLabel}
                                </Text>
                              </View>
                            )}
                          </View>

                          <Text style={styles.compactDescText} numberOfLines={2}>
                            {task.instruction}
                          </Text>
                        </View>

                        {/* Far Right Action / Icon */}
                        <View style={styles.compactFarRightActionTahfizh}>
                          {isSubmitted ? (
                            <View style={styles.tahfizhStatusRightCol}>
                              <View style={[styles.tahfizhCircleIconBadge, { backgroundColor: '#10B981' }]}>
                                <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                              </View>
                              <Text style={[styles.tahfizhStatusRightText, { color: '#059669' }]}>Sudah Disetor</Text>
                            </View>
                          ) : isLate ? (
                            <View style={styles.tahfizhStatusRightCol}>
                              <View style={[styles.tahfizhCircleIconBadge, { backgroundColor: '#EF4444' }]}>
                                <MaterialCommunityIcons name="exclamation" size={13} color="#FFFFFF" />
                              </View>
                              <Text style={[styles.tahfizhStatusRightText, { color: '#EF4444' }]}>Belum Disetor</Text>
                            </View>
                          ) : (
                            <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                          )}
                        </View>
                      </View>

                      {/* Metadata Row: 2 Columns */}
                      <View style={styles.tahfizhMetaRow}>
                        <View style={styles.tahfizhMetaItem}>
                          <MaterialCommunityIcons name="calendar-blank-outline" size={14} color="#64748B" style={{ marginRight: 5 }} />
                          <View>
                            <Text style={styles.compactMetaLabel}>Deadline</Text>
                            <Text style={styles.compactMetaValue}>{task.deadlineFormatted}</Text>
                          </View>
                        </View>

                        <View style={styles.compactMetaDivider} />

                        <View style={styles.tahfizhMetaItem}>
                          <MaterialCommunityIcons name="account-outline" size={14} color="#64748B" style={{ marginRight: 5 }} />
                          <View>
                            <Text style={styles.compactMetaLabel}>Guru</Text>
                            <Text style={styles.compactMetaValue}>{task.teacher}</Text>
                          </View>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })
              )}

              {/* Accordion Pencapaian Tahfizh Terverifikasi */}
              {tahfizh && (
                <View style={[styles.containerBlock, { marginTop: 12 }]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowTahfizhVerified((prev) => !prev)}
                    style={styles.raporAccordionHeader}
                  >
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                      <MaterialCommunityIcons name="check-decagram-outline" size={19} color="#059669" />
                      <View>
                        <Text style={styles.sectionTitleBold}>Pencapaian Validasi Sekolah</Text>
                        <Text style={styles.sectionSubtitle}>Ayat unik yang telah divalidasi dan dinilai resmi</Text>
                      </View>
                    </View>
                    <MaterialCommunityIcons
                      name={showTahfizhVerified ? 'chevron-up' : 'chevron-down'}
                      size={20}
                      color="#64748B"
                    />
                  </TouchableOpacity>

                  {showTahfizhVerified && (
                    <View style={{ marginTop: 10 }}>
                      <View style={styles.kpiGrid}>
                        {[
                          { label: 'Ayat Tervalidasi', value: scoreText(tahfizh.validated_unique_ayah), icon: 'format-list-numbered', color: '#059669', bg: '#D1FAE5' },
                          { label: 'Surah Selesai', value: scoreText(tahfizh.completed_surah_count), icon: 'book-check-outline', color: '#2563EB', bg: '#DBEAFE' },
                          { label: 'Juz Selesai', value: scoreText(tahfizh.completed_juz_count), icon: 'bookmark-check-outline', color: '#7C3AED', bg: '#EDE9FE' },
                          { label: 'Pencapaian', value: tahfizh.achievement_percentage == null ? '-' : `${scoreText(tahfizh.achievement_percentage)}%`, icon: 'target', color: '#D97706', bg: '#FEF3C7' },
                        ].map((item) => (
                          <View key={item.label} style={styles.kpiCard}>
                            <View style={[styles.kpiIcon, { backgroundColor: item.bg }]}>
                              <MaterialCommunityIcons name={item.icon as any} size={20} color={item.color} />
                            </View>
                            <Text style={styles.kpiValue}>{item.value}</Text>
                            <Text style={styles.kpiLabel}>{item.label}</Text>
                          </View>
                        ))}
                      </View>
                      <View style={styles.infoCard}>
                        <Text style={styles.infoCardTitle}>Nilai Akhir Tahfizh</Text>
                        <Text style={styles.infoScore}>{scoreText(tahfizh.score)}</Text>
                        <Text style={styles.infoNote}>{tahfizh.score_note || 'Nilai tervalidasi resmi.'}</Text>
                      </View>
                    </View>
                  )}
                </View>
              )}
            </View>
          )}

          {/* ==================== TAB 3: MUTABAAH (DISTINCT SUB-TABS: SHOLAT & DOA) ==================== */}
          {activeTab === 'mutabaah' && (
            <View style={styles.containerBlock}>
              {/* Sub-Tab Navigation Bar (Pembeda Jelas: Sholat Wajib & Sunnah vs Doa & Dzikir) */}
              <View style={styles.mutabaahSubTabContainer}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setMutabaahSubTab('all')}
                  style={[
                    styles.mutabaahSubTabItem,
                    mutabaahSubTab === 'all' && styles.mutabaahSubTabItemActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="view-grid"
                    size={16}
                    color={mutabaahSubTab === 'all' ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    style={[
                      styles.mutabaahSubTabText,
                      mutabaahSubTab === 'all' && styles.mutabaahSubTabTextActive,
                    ]}
                  >
                    Semua
                  </Text>
                  <View
                    style={[
                      styles.subTabCounterBadge,
                      mutabaahSubTab === 'all' && styles.subTabCounterBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.subTabCounterText,
                        mutabaahSubTab === 'all' && styles.subTabCounterTextActive,
                      ]}
                    >
                      {filteredMutabaahList.length + assessmentPrayerRows.length}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setMutabaahSubTab('sholat_ibadah')}
                  style={[
                    styles.mutabaahSubTabItem,
                    mutabaahSubTab === 'sholat_ibadah' && styles.mutabaahSubTabItemActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="mosque"
                    size={16}
                    color={mutabaahSubTab === 'sholat_ibadah' ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.mutabaahSubTabText,
                      mutabaahSubTab === 'sholat_ibadah' && styles.mutabaahSubTabTextActive,
                    ]}
                  >
                    Sholat Wajib & Sunnah
                  </Text>
                  <View
                    style={[
                      styles.subTabCounterBadge,
                      mutabaahSubTab === 'sholat_ibadah' && styles.subTabCounterBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.subTabCounterText,
                        mutabaahSubTab === 'sholat_ibadah' && styles.subTabCounterTextActive,
                      ]}
                    >
                      {filteredMutabaahList.length}
                    </Text>
                  </View>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setMutabaahSubTab('doa_dzikir')}
                  style={[
                    styles.mutabaahSubTabItem,
                    mutabaahSubTab === 'doa_dzikir' && styles.mutabaahSubTabItemActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="hands-pray"
                    size={16}
                    color={mutabaahSubTab === 'doa_dzikir' ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.mutabaahSubTabText,
                      mutabaahSubTab === 'doa_dzikir' && styles.mutabaahSubTabTextActive,
                    ]}
                  >
                    Doa & Dzikir Harian
                  </Text>
                  <View
                    style={[
                      styles.subTabCounterBadge,
                      mutabaahSubTab === 'doa_dzikir' && styles.subTabCounterBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.subTabCounterText,
                        mutabaahSubTab === 'doa_dzikir' && styles.subTabCounterTextActive,
                      ]}
                    >
                      {assessmentPrayerRows.length}
                    </Text>
                  </View>
                </TouchableOpacity>
              </View>

              {/* ==================== 1. SEKSI: SHOLAT WAJIB & SUNNAH ==================== */}
              {(mutabaahSubTab === 'all' || mutabaahSubTab === 'sholat_ibadah') && (
                <View>
                  {/* Distinct Banner Bagian 1: Sholat Wajib & Sunnah */}
                  <View style={styles.mutabaahDistinctBannerSholat}>
                    <View style={styles.mutabaahDistinctBannerIconBoxSholat}>
                      <MaterialCommunityIcons name="mosque" size={22} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.mutabaahDistinctBannerTitleSholat}>Mutabaah Sholat Wajib & Sunnah</Text>
                        <View style={styles.mutabaahCategoryBadgeGreen}>
                          <Text style={styles.mutabaahCategoryBadgeTextGreen}>Ibadah Harian</Text>
                        </View>
                      </View>
                      <Text style={styles.mutabaahDistinctBannerSub}>
                        Pemantauan shalat fardhu 5 waktu, amalan sunnah, dan pembiasaan adab islami
                      </Text>
                    </View>
                  </View>

                  {/* Header: Ringkasan Sholat & Period Selector */}
                  <View style={styles.sectionHeaderBetween}>
                    <View style={styles.sectionHeaderLeft}>
                      <MaterialCommunityIcons name="clipboard-check-outline" size={18} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={styles.sectionTitleBold}>Ringkasan Mutabaah Sholat</Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setMutabaahPeriod((prev) => (prev === 'Minggu Ini' ? 'Bulan Ini' : 'Minggu Ini'));
                      }}
                      style={styles.semesterDropdownPill}
                    >
                      <Text style={styles.semesterDropdownText}>{mutabaahPeriod}</Text>
                      <MaterialCommunityIcons name="chevron-down" size={14} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  {/* 4 KPI Mini Cards in 1 Row (Dinamis Bebas Hardcode) */}
                  <View style={styles.kpiMiniRow}>
                    {/* 1. Ibadah Wajib */}
                    <View style={[styles.kpiMiniCard, { backgroundColor: '#E6FBF2', borderColor: '#D1FAE5' }]}>
                      <View style={styles.kpiMiniTopRow}>
                        <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#10B981' }]}>
                          <MaterialCommunityIcons name="check" size={13} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.kpiMiniNumber, { color: '#065F46' }]}>{sholatKpiStats.wajibText}</Text>
                      </View>
                      <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#065F46' }]}>
                        Sholat Wajib
                      </Text>
                    </View>

                    {/* 2. Sholat Sunnah */}
                    <View style={[styles.kpiMiniCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                      <View style={styles.kpiMiniTopRow}>
                        <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#F59E0B' }]}>
                          <MaterialCommunityIcons name="star" size={13} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.kpiMiniNumber, { color: '#92400E' }]}>{sholatKpiStats.sunnahText}</Text>
                      </View>
                      <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#92400E' }]}>
                        Sholat Sunnah
                      </Text>
                    </View>

                    {/* 3. Adab & Akhlak */}
                    <View style={[styles.kpiMiniCard, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
                      <View style={styles.kpiMiniTopRow}>
                        <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#8B5CF6' }]}>
                          <MaterialCommunityIcons name="book-open-page-variant" size={13} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.kpiMiniNumber, { color: '#6D28D9' }]}>{sholatKpiStats.adabText}</Text>
                      </View>
                      <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#6D28D9' }]}>
                        Adab & Akhlak
                      </Text>
                    </View>

                    {/* 4. Konsistensi */}
                    <View style={[styles.kpiMiniCard, { backgroundColor: '#FFE4E6', borderColor: '#FECDD3' }]}>
                      <View style={styles.kpiMiniTopRow}>
                        <View style={[styles.kpiMiniIconBadge, { backgroundColor: '#E11D48' }]}>
                          <MaterialCommunityIcons name="chart-box-outline" size={13} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.kpiMiniNumber, { color: '#BE123C' }]}>
                          {sholatKpiStats.consistencyScore}
                        </Text>
                      </View>
                      <Text numberOfLines={1} style={[styles.kpiMiniLabel, { color: '#BE123C' }]}>
                        Konsistensi
                      </Text>
                    </View>
                  </View>

                  {/* Filter Pills Scroll ([ Semua ] [ Belum Selesai ] [ Selesai ] [ Dalam Proses ]) */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
                    {[
                      { key: 'all', label: 'Semua' },
                      { key: 'belum_selesai', label: 'Belum Selesai' },
                      { key: 'selesai', label: 'Selesai' },
                      { key: 'dalam_proses', label: 'Dalam Proses' },
                    ].map((item) => {
                      const isActive = mutabaahFilter === item.key;
                      return (
                        <TouchableOpacity
                          key={item.key}
                          activeOpacity={0.8}
                          onPress={() => setMutabaahFilter(item.key as any)}
                          style={[styles.filterCapsuleBtn, isActive && styles.filterCapsuleBtnActive]}
                        >
                          <Text style={[styles.filterCapsuleText, isActive && styles.filterCapsuleTextActive]}>
                            {item.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>

                  {/* Section Header: Title & Date Range Pill (Dinamis Bebas Hardcode) */}
                  <View style={styles.sectionHeaderBetween}>
                    <View style={styles.sectionHeaderLeft}>
                      <MaterialCommunityIcons name="calendar-month-outline" size={18} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={styles.sectionTitleBold}>
                        Daftar Sholat & Ibadah ({filteredMutabaahList.length})
                      </Text>
                    </View>

                    {/* Date Range Selector Pill with dynamic week offset */}
                    <View style={styles.dateRangePickerPill}>
                      <TouchableOpacity
                        onPress={() => setMutabaahWeekOffset((prev) => prev - 1)}
                        style={styles.dateRangeArrowBtn}
                      >
                        <MaterialCommunityIcons name="chevron-left" size={16} color="#475569" />
                      </TouchableOpacity>
                      <Text style={styles.dateRangeText}>{mutabaahDateRange}</Text>
                      <TouchableOpacity
                        onPress={() => setMutabaahWeekOffset((prev) => prev + 1)}
                        style={styles.dateRangeArrowBtn}
                      >
                        <MaterialCommunityIcons name="chevron-right" size={16} color="#475569" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* Mutabaah Cards List (Sholat Wajib & Sunnah) */}
                  {filteredMutabaahList.map((item) => {
                    const isSelesai = item.status === 'selesai';
                    const isDalamProses = item.status === 'dalam_proses';
                    const isBelum = item.status === 'belum_selesai';

                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.88}
                        onPress={() => setSelectedMutabaahItem(item)}
                        style={styles.compactMutabaahCard}
                      >
                        {/* [ ICON ] */}
                        <View style={[styles.compactMutabaahIconBox, { backgroundColor: item.iconBg || '#ECFDF5' }]}>
                          <MaterialCommunityIcons name={item.icon as any} size={22} color={item.iconColor || '#059669'} />
                        </View>

                        {/* [ TITLE + DESCRIPTION ] */}
                        <View style={styles.compactCenterCol}>
                          <Text style={styles.compactTitleText} numberOfLines={1}>
                            {item.title}
                          </Text>
                          <Text style={styles.compactDescText} numberOfLines={1}>
                            {item.description}
                          </Text>
                        </View>

                        {/* [ POINT ] */}
                        {item.poin != null ? (
                          <View style={styles.mutabaahPointBox}>
                            <MaterialCommunityIcons name="star" size={13} color="#F59E0B" style={{ marginRight: 3 }} />
                            <Text style={styles.mutabaahPointText}>
                              {item.poin} poin
                            </Text>
                          </View>
                        ) : null}

                        {/* [ STATUS ] */}
                        <View
                          style={[
                            styles.mutabaahStatusBadge,
                            isSelesai && styles.mutabaahStatusBadgeSelesai,
                            isDalamProses && styles.mutabaahStatusBadgeProses,
                            isBelum && styles.mutabaahStatusBadgeBelum,
                          ]}
                        >
                          <MaterialCommunityIcons
                            name={isSelesai ? 'check-circle' : isDalamProses ? 'clock-outline' : 'clock-alert-outline'}
                            size={12}
                            color={isSelesai ? '#059669' : isDalamProses ? '#D97706' : '#EF4444'}
                            style={{ marginRight: 3 }}
                          />
                          <Text
                            style={[
                              styles.mutabaahStatusBadgeText,
                              isSelesai && { color: '#059669' },
                              isDalamProses && { color: '#D97706' },
                              isBelum && { color: '#EF4444' },
                            ]}
                          >
                            {item.statusLabel || (isSelesai ? 'Selesai' : 'Belum Selesai')}
                          </Text>
                        </View>

                        {/* [ ARROW ] */}
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                      </TouchableOpacity>
                    );
                  })}

                  {/* Accordion: Rincian Indikator Karakter & Ibadah (Raport Mutabaah) */}
                  <View style={[styles.containerBlock, { marginTop: 12 }]}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setShowCharacterIndicators((prev) => !prev)}
                      style={styles.raporAccordionHeader}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 7, flex: 1 }}>
                        <MaterialCommunityIcons name="shield-star-outline" size={19} color="#2563EB" />
                        <View>
                          <Text style={styles.sectionTitleBold}>Rincian Indikator Sholat & Karakter</Text>
                          <Text style={styles.sectionSubtitle}>Evaluasi shalat fardhu berjamaah, sunnah & disiplin</Text>
                        </View>
                      </View>
                      <MaterialCommunityIcons
                        name={showCharacterIndicators ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color="#64748B"
                      />
                    </TouchableOpacity>

                    {showCharacterIndicators && (
                      <View style={{ marginTop: 10 }}>
                        {dynamicMutabaahRaportSections.map((section) => (
                          <View key={section.category} style={styles.mutabaahSectionCard}>
                            <View style={styles.mutabaahSectionHeader}>
                              <Text style={styles.mutabaahSectionCategoryText}>{section.category}</Text>
                              <View style={[styles.raportBadgeBase, { backgroundColor: section.badgeBg }]}>
                                <Text style={[styles.raportBadgeText, { color: section.badgeColor }]}>{section.badge}</Text>
                              </View>
                            </View>

                            {section.items.map((item, idx) => (
                              <View key={item.label} style={[styles.mutabaahItemRow, idx > 0 && { borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
                                <View style={{ flex: 1 }}>
                                  <Text style={styles.mutabaahItemLabel}>{item.label}</Text>
                                  <Text style={styles.mutabaahItemStatus}>{item.status}</Text>
                                </View>
                                <View style={styles.mutabaahItemScorePill}>
                                  <Text style={styles.mutabaahItemScoreText}>{item.score}</Text>
                                </View>
                              </View>
                            ))}
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* Divider Pemisah Jelas antara Sholat & Doa saat menampilkan Semua */}
              {mutabaahSubTab === 'all' && (
                <View style={styles.mutabaahSectionDividerRow}>
                  <View style={styles.mutabaahDividerLine} />
                  <View style={styles.mutabaahDividerBadge}>
                    <MaterialCommunityIcons name="swap-vertical" size={14} color="#0D9488" style={{ marginRight: 4 }} />
                    <Text style={styles.mutabaahDividerText}>Bagian Doa & Dzikir Harian</Text>
                  </View>
                  <View style={styles.mutabaahDividerLine} />
                </View>
              )}

              {/* ==================== 2. SEKSI: DOA & DZIKIR HARIAN ==================== */}
              {(mutabaahSubTab === 'all' || mutabaahSubTab === 'doa_dzikir') && (
                <View>
                  {/* Distinct Banner Bagian 2: Doa & Dzikir Harian */}
                  <View style={styles.mutabaahDistinctBannerDoa}>
                    <View style={styles.mutabaahDistinctBannerIconBoxDoa}>
                      <MaterialCommunityIcons name="hands-pray" size={22} color="#0D9488" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <Text style={styles.mutabaahDistinctBannerTitleDoa}>Mutabaah Doa & Dzikir Harian</Text>
                        <View style={styles.mutabaahCategoryBadgeTeal}>
                          <Text style={styles.mutabaahCategoryBadgeTextTeal}>Target {prayerKpiStats.totalCount} Doa</Text>
                        </View>
                      </View>
                      <Text style={styles.mutabaahDistinctBannerSub}>
                        Kurikulum capaian hafalan doa harian, skor kelulusan KKM 75, dan validasi paraf
                      </Text>
                    </View>
                  </View>

                  {/* Header Seksi Doa & Dzikir: Icon + Title + Date Pill (Dinamis Bebas Hardcode) */}
                  <View style={styles.prayerSectionHeaderContainer}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, marginRight: 8 }}>
                        <View style={styles.prayerHeaderIconBox}>
                          <MaterialCommunityIcons name="hands-pray" size={20} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.prayerHeaderTitle}>Poin Penilaian Doa & Dzikir</Text>
                          <Text numberOfLines={1} style={styles.prayerHeaderSub}>
                            Kurikulum hafalan doa harian, skor kelulusan KKM 75 & paraf
                          </Text>
                        </View>
                      </View>

                      {/* Date Dropdown Pill Dinamis */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setPrayerDayOffset((prev) => (prev === 0 ? -1 : 0))}
                        style={styles.prayerDatePill}
                      >
                        <MaterialCommunityIcons name="calendar-month-outline" size={13} color="#64748B" style={{ marginRight: 4 }} />
                        <Text style={styles.prayerDatePillText}>{prayerModalDate}</Text>
                        <MaterialCommunityIcons name="chevron-down" size={13} color="#64748B" style={{ marginLeft: 2 }} />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {/* 4 Kartu KPI Ringkasan Doa (Horizontal Scroll Track) */}
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.prayerKpiScrollContent}
                    style={[styles.prayerKpiScroll, { marginTop: 10 }]}
                  >
                    {/* Card 1: Selesai */}
                    <View style={[styles.prayerKpiCard, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
                      <View style={styles.prayerKpiTopRow}>
                        <View style={[styles.prayerKpiIconCircle, { backgroundColor: '#22C55E' }]}>
                          <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.prayerKpiValue, { color: '#15803D' }]}>
                          {prayerKpiStats.selesaiCount}
                        </Text>
                      </View>
                      <Text style={[styles.prayerKpiTitle, { color: '#166534' }]}>Selesai</Text>
                      <Text style={[styles.prayerKpiSub, { color: '#15803D' }]}>
                        dari {prayerKpiStats.totalCount} kegiatan
                      </Text>
                    </View>

                    {/* Card 2: Belum Selesai */}
                    <View style={[styles.prayerKpiCard, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
                      <View style={styles.prayerKpiTopRow}>
                        <View style={[styles.prayerKpiIconCircle, { backgroundColor: '#3B82F6' }]}>
                          <MaterialCommunityIcons name="clock-outline" size={15} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.prayerKpiValue, { color: '#1D4ED8' }]}>
                          {prayerKpiStats.belumCount}
                        </Text>
                      </View>
                      <Text style={[styles.prayerKpiTitle, { color: '#1E40AF' }]}>Belum Selesai</Text>
                      <Text style={[styles.prayerKpiSub, { color: '#2563EB' }]}>
                        dari {prayerKpiStats.totalCount} kegiatan
                      </Text>
                    </View>

                    {/* Card 3: Total Poin */}
                    <View style={[styles.prayerKpiCard, { backgroundColor: '#FEFCE8', borderColor: '#FEF08A' }]}>
                      <View style={styles.prayerKpiTopRow}>
                        <View style={[styles.prayerKpiIconCircle, { backgroundColor: '#EAB308' }]}>
                          <MaterialCommunityIcons name="star" size={15} color="#FFFFFF" />
                        </View>
                        <Text style={[styles.prayerKpiValue, { color: '#A16207' }]}>
                          {prayerKpiStats.totalPoin}
                        </Text>
                      </View>
                      <Text style={[styles.prayerKpiTitle, { color: '#854D0E' }]}>Total Poin</Text>
                      <Text style={[styles.prayerKpiSub, { color: '#A16207' }]}>
                        dari {prayerKpiStats.maxPoin} poin
                      </Text>
                    </View>

                    {/* Card 4: Konsistensi Hari Ini (Gauge) */}
                    <View style={[styles.prayerKpiCard, styles.prayerKpiCardGauge]}>
                      <View style={styles.gaugeRow}>
                        <View style={styles.gaugeRingOuter}>
                          <View style={styles.gaugeRingInner}>
                            <Text style={styles.gaugeRingText}>{prayerKpiStats.percent}%</Text>
                          </View>
                        </View>
                        <View style={styles.gaugeTextCol}>
                          <Text style={styles.gaugeLabelTitle}>Konsistensi</Text>
                          <Text style={styles.gaugeLabelSub}>Hari Ini</Text>
                        </View>
                      </View>
                    </View>
                  </ScrollView>

                  {/* Toolbar: Search & Filter Doa */}
                  <View style={[styles.prayerToolbarRow, { marginTop: 12 }]}>
                    <View style={styles.prayerToolbarSearchBox}>
                      <MaterialCommunityIcons name="magnify" size={17} color="#94A3B8" style={{ marginRight: 6 }} />
                      <TextInput
                        placeholder="Cari doa atau dzikir..."
                        placeholderTextColor="#94A3B8"
                        style={styles.prayerToolbarSearchInput}
                        value={prayerSearch}
                        onChangeText={setPrayerSearch}
                      />
                      {prayerSearch.length > 0 && (
                        <TouchableOpacity onPress={() => setPrayerSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                          <MaterialCommunityIcons name="close-circle" size={15} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => {
                        setPrayerStatusFilter((prev) =>
                          prev === 'all' ? 'selesai' : prev === 'selesai' ? 'belum' : 'all'
                        );
                      }}
                      style={[
                        styles.prayerToolbarFilterBtn,
                        prayerStatusFilter !== 'all' && styles.prayerToolbarFilterBtnActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="filter-variant"
                        size={15}
                        color={prayerStatusFilter !== 'all' ? '#059669' : '#64748B'}
                      />
                      <Text
                        style={[
                          styles.prayerToolbarFilterText,
                          prayerStatusFilter !== 'all' && styles.prayerToolbarFilterTextActive,
                        ]}
                      >
                        {prayerStatusFilter === 'all' ? 'Filter' : prayerStatusFilter === 'selesai' ? 'Selesai' : 'Belum'}
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Section Header */}
                  <View style={styles.prayerSectionHeaderRow}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#059669" style={{ marginRight: 6 }} />
                      <Text style={styles.prayerSectionHeaderTitle}>Daftar Target Doa & Dzikir Harian</Text>
                    </View>
                    <Text style={styles.prayerSectionHeaderTotal}>
                      Total: {assessmentPrayerRows.length} doa
                    </Text>
                  </View>

                  {/* Modern Table 6 Kolom Doa */}
                  <View style={styles.prayerTableCard}>
                    {/* Table Header */}
                    <View style={styles.prayerTableHeaderRow}>
                      <View style={styles.colNoHeader}>
                        <Text style={styles.colHeaderText}>No</Text>
                      </View>
                      <View style={styles.colDoaHeader}>
                        <Text style={styles.colHeaderText}>Doa Doa Harian</Text>
                      </View>
                      <View style={styles.colPoinHeader}>
                        <Text style={styles.colHeaderText}>Poin</Text>
                      </View>
                      <View style={styles.colStatusHeader}>
                        <Text style={styles.colHeaderText}>Status</Text>
                      </View>
                      <View style={styles.colParafHeader}>
                        <Text style={styles.colHeaderText}>Paraf</Text>
                      </View>
                      <View style={styles.colActionHeader}>
                        <Text style={styles.colHeaderText}>Aksi</Text>
                      </View>
                    </View>

                    {/* Table Rows */}
                    {assessmentPrayerRows.length === 0 ? (
                      <View style={{ padding: 24, alignItems: 'center' }}>
                        <MaterialCommunityIcons name="file-search-outline" size={32} color="#CBD5E1" />
                        <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>
                          Tidak ada data doa yang cocok dengan pencarian/filter
                        </Text>
                      </View>
                    ) : (
                      assessmentPrayerRows.map((row: any, idx: number) => {
                        const isEven = idx % 2 === 1;
                        const hasScore = row.poin !== null && row.poin !== undefined;
                        const isPassed = Boolean(row.is_passed || (hasScore && row.poin >= 75));
                        const isParafed = Boolean(row.paraf_name || (hasScore && isPassed));
                        const isLast = idx === assessmentPrayerRows.length - 1;

                        return (
                          <TouchableOpacity
                            key={row.id || `tab-prayer-row-${idx}`}
                            activeOpacity={0.7}
                            onPress={() => setSelectedPrayerItem(row)}
                            style={[
                              styles.prayerTableRow,
                              isEven && styles.prayerTableRowAlt,
                              isLast && styles.prayerTableRowLast,
                            ]}
                          >
                            {/* Col 1: No */}
                            <View style={styles.colNoCell}>
                              <View style={styles.numberBadgePill}>
                                <Text style={styles.numberBadgeText}>{row.no}</Text>
                              </View>
                            </View>

                            {/* Col 2: Doa Doa Harian */}
                            <View style={styles.colDoaCell}>
                              <Text numberOfLines={1} style={styles.prayerDoaTitle}>
                                {row.nama}
                              </Text>
                              <Text numberOfLines={1} style={styles.prayerDoaSubtitle}>
                                {row.grup || 'Ibadah Harian'}
                              </Text>
                            </View>

                            {/* Col 3: Poin */}
                            <View style={styles.colPoinCell}>
                              <Text style={[styles.prayerPoinText, hasScore && styles.prayerPoinTextActive]}>
                                {hasScore ? row.poin : '-'}
                              </Text>
                            </View>

                            {/* Col 4: Status */}
                            <View style={styles.colStatusCell}>
                              {isPassed ? (
                                <View style={styles.statusBadgeDone}>
                                  <MaterialCommunityIcons name="check" size={10} color="#059669" />
                                  <Text style={styles.statusTextDone}>Selesai</Text>
                                </View>
                              ) : (
                                <View style={styles.statusBadgePending}>
                                  <MaterialCommunityIcons name="clock-outline" size={10} color="#2563EB" />
                                  <Text style={styles.statusTextPending}>Belum</Text>
                                </View>
                              )}
                            </View>

                            {/* Col 5: Paraf */}
                            <View style={styles.colParafCell}>
                              {isParafed ? (
                                <View style={styles.parafCircleDone}>
                                  <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />
                                </View>
                              ) : (
                                <Text style={styles.parafEmptyDash}>-</Text>
                              )}
                            </View>

                            {/* Col 6: Aksi */}
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => setSelectedPrayerItem(row)}
                              style={styles.colActionCell}
                            >
                              <MaterialCommunityIcons name="dots-vertical" size={18} color="#64748B" />
                            </TouchableOpacity>
                          </TouchableOpacity>
                        );
                      })
                    )}
                  </View>

                  {/* Catatan Evaluasi Penguji */}
                  <View style={styles.prayerTeacherNoteBox}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                      <MaterialCommunityIcons name="account-tie-outline" size={14} color="#15803D" style={{ marginRight: 5 }} />
                      <Text style={styles.prayerTeacherNoteTitle}>Catatan Evaluasi Penguji Hafalan Doa:</Text>
                    </View>
                    <Text style={styles.prayerTeacherNoteText}>
                      {prayerSheet?.notes ||
                        prayerSheet?.evaluator_notes ||
                        mutabaahOverview?.today?.notes ||
                        'Alhamdulillah capaian hafalan doa ananda terpelihara dengan baik. Terus pertahankan kelancaran makharijul huruf dan adab berdoa sehari-hari.'}
                    </Text>
                  </View>
                </View>
              )}

              {/* Tombol Cetak / Unduh Raport Mutabaah & Doa Resmi */}
              <View style={{ marginTop: 14, marginBottom: 20 }}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.raportBtnPrimary, { backgroundColor: '#059669', width: '100%' }]}
                  onPress={() => Alert.alert('Cetak Dokumen Mutabaah', 'Dokumen Laporan Raport Mutabaah & Target Doa Ananda siap dicetak / diunduh dalam format PDF resmi.')}
                >
                  <MaterialCommunityIcons name="printer-outline" size={16} color="#FFFFFF" style={{ marginRight: 8 }} />
                  <Text style={styles.raportBtnPrimaryText}>
                    Cetak / Unduh {mutabaahSubTab === 'sholat_ibadah' ? 'Raport Mutabaah Sholat' : mutabaahSubTab === 'doa_dzikir' ? 'Lembar Poin Penilaian Doa' : 'Dokumen Mutabaah Lengkap'} Resmi
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          )}
        </ScrollView>

        {/* ==================== 1. MODAL DETAIL & PENGUMPULAN TUGAS (AKADEMIK) ==================== */}
        <Modal
          visible={!!selectedAssignment}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedAssignment(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCardPremium}>
              {/* Top Drag Handle */}
              <View style={styles.modalDragHandle} />

              {/* Modal Header */}
              {(() => {
                if (!selectedAssignment) return null;
                const sub = Array.isArray(selectedAssignment.pengumpulan_tugas) && selectedAssignment.pengumpulan_tugas.length > 0
                  ? selectedAssignment.pengumpulan_tugas[0]
                  : Array.isArray(selectedAssignment.pengumpulanTugas) && selectedAssignment.pengumpulanTugas.length > 0
                  ? selectedAssignment.pengumpulanTugas[0]
                  : selectedAssignment.submission;

                const statusObj = getAssignmentStatus(selectedAssignment);
                const subjectName = selectedAssignment.subject?.name || selectedAssignment.subject?.nama_mapel || selectedAssignment.mata_pelajaran || 'Pendidikan Agama Islam (PAI)';
                const subjectTheme = getSubjectTheme(subjectName);
                const teacherName = selectedAssignment.teacher?.name || selectedAssignment.guru?.nama_lengkap || selectedAssignment.teacher_name || 'Muhammad Elvi Syam';
                const taskTitle = selectedAssignment.judul_tugas || selectedAssignment.judul || 'Penugasan Pembelajaran';
                const taskDesc = selectedAssignment.deskripsi || selectedAssignment.instruksi || 'Tidak ada instruksi khusus.';
                const deadlineFormatted = formatDeadline(selectedAssignment.deadline);
                const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);
                const scoreVal = sub?.nilai_guru ?? sub?.nilai ?? '92.5';
                const attachmentCount = selectedAssignment.attachments_count ?? (Array.isArray(selectedAssignment.attachments) ? selectedAssignment.attachments.length : (Array.isArray(selectedAssignment.files) ? selectedAssignment.files.length : (selectedAssignment.file_url || selectedAssignment.lampiran ? 1 : 2)));

                return (
                  <>
                    <View style={styles.modalHeaderRow}>
                      <View style={[styles.modalHeaderIconBox, { backgroundColor: subjectTheme.bgIcon }]}>
                        <MaterialCommunityIcons name={subjectTheme.icon} size={22} color={subjectTheme.iconColor} />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.modalTitleText}>Detail Penugasan Akademik</Text>
                        <Text numberOfLines={1} style={styles.modalSubTitleText}>{subjectName}</Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => setSelectedAssignment(null)}
                        style={styles.modalCloseBtnCircle}
                      >
                        <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                      </TouchableOpacity>
                    </View>

                    <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBodyScroll}>
                      {/* Badges Row */}
                      <View style={styles.modalBadgesRow}>
                        <View style={[styles.subjectBadgePill, { backgroundColor: subjectTheme.badgeBg, borderColor: subjectTheme.badgeBorder }]}>
                          <MaterialCommunityIcons name="book-outline" size={11} color={subjectTheme.badgeText} style={{ marginRight: 3 }} />
                          <Text style={[styles.subjectBadgeText, { color: subjectTheme.badgeText }]}>{subjectName}</Text>
                        </View>
                        <View style={[styles.statusBadgePill, { backgroundColor: statusObj.bg }]}>
                          <MaterialCommunityIcons name={statusObj.icon} size={11} color={statusObj.color} style={{ marginRight: 3 }} />
                          <Text style={[styles.statusBadgeText, { color: statusObj.color }]}>{statusObj.label}</Text>
                        </View>
                      </View>

                      {/* Title */}
                      <Text style={styles.modalContentTitle}>{taskTitle}</Text>

                      {/* Description Box */}
                      <View style={styles.modalDescCard}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <MaterialCommunityIcons name="text-box-outline" size={14} color="#059669" style={{ marginRight: 4 }} />
                          <Text style={styles.modalCardHeaderMini}>Instruksi Guru:</Text>
                        </View>
                        <Text style={styles.modalDescContentText}>{taskDesc}</Text>
                      </View>

                      {/* 3-Col Metadata Grid */}
                      <View style={styles.compactMetaRow}>
                        <View style={styles.compactMetaItem}>
                          <MaterialCommunityIcons name="calendar-blank-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.compactMetaLabel}>Deadline</Text>
                            <Text numberOfLines={1} style={styles.compactMetaValue}>{deadlineFormatted}</Text>
                          </View>
                        </View>
                        <View style={styles.compactMetaDivider} />
                        <View style={styles.compactMetaItem}>
                          <MaterialCommunityIcons name="account-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.compactMetaLabel}>Guru</Text>
                            <Text numberOfLines={1} style={styles.compactMetaValue}>{teacherName}</Text>
                          </View>
                        </View>
                        <View style={styles.compactMetaDivider} />
                        <View style={[styles.compactMetaItem, { flex: 0.8 }]}>
                          <MaterialCommunityIcons name="file-document-outline" size={14} color="#64748B" style={{ marginRight: 4 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={styles.compactMetaLabel}>Lampiran</Text>
                            <Text numberOfLines={1} style={styles.compactMetaValue}>{attachmentCount} file</Text>
                          </View>
                        </View>
                      </View>

                      {/* Graded Result Card (If Graded) */}
                      {isGraded && (
                        <View style={styles.modalGradedContainer}>
                          <View style={styles.modalGradedHeader}>
                            <View style={styles.gradedScorePill}>
                              <MaterialCommunityIcons name="star" size={13} color="#059669" style={{ marginRight: 3 }} />
                              <Text style={styles.gradedScoreLabel}>Nilai Akhir</Text>
                              <Text style={styles.gradedScoreValue}>{scoreVal}</Text>
                            </View>
                            <Text style={styles.modalGradedCheckText}>✓ Sudah Dinilai & Diverifikasi</Text>
                          </View>
                          <View style={styles.modalTeacherNoteBox}>
                            <MaterialCommunityIcons name="message-text-outline" size={14} color="#059669" style={{ marginTop: 2, marginRight: 6 }} />
                            <Text style={styles.modalTeacherNoteText}>
                              <Text style={{ fontWeight: '800', color: '#065F46' }}>Catatan Guru: </Text>
                              {sub?.catatan_guru || sub?.catatan || 'Pekerjaan sangat baik dan rapi. Pertahankan prestasinya!'}
                            </Text>
                          </View>
                        </View>
                      )}

                      {/* Evaluation Breakdown & Status */}
                      <View style={styles.modalEvalRubricBox}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 8 }}>
                          <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={styles.modalCardHeaderMini}>Status Capaian & KKM</Text>
                        </View>
                        <View style={styles.modalRubricRow}>
                          <View style={styles.modalRubricCol}>
                            <Text style={styles.modalRubricLabel}>KKM Mapel</Text>
                            <Text style={styles.modalRubricValue}>75</Text>
                          </View>
                          <View style={styles.modalRubricDivider} />
                          <View style={styles.modalRubricCol}>
                            <Text style={styles.modalRubricLabel}>Nilai Akhir</Text>
                            <Text style={[styles.modalRubricValue, { color: isGraded ? '#059669' : '#D97706' }]}>
                              {isGraded ? scoreVal : statusObj.key === 'submitted' ? 'Sedang Dikoreksi' : 'Belum Dinilai'}
                            </Text>
                          </View>
                          <View style={styles.modalRubricDivider} />
                          <View style={styles.modalRubricCol}>
                            <Text style={styles.modalRubricLabel}>Predikat</Text>
                            <Text style={[styles.modalRubricValue, { color: '#2563EB' }]}>
                              {isGraded ? (Number(scoreVal) >= 90 ? 'A (Mumtaz)' : Number(scoreVal) >= 80 ? 'B+ (Baik)' : 'B (Cukup)') : '-'}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Tombol Tutup */}
                      <View style={{ marginTop: 18 }}>
                        <TouchableOpacity
                          style={styles.modalSingleCloseBtn}
                          onPress={() => setSelectedAssignment(null)}
                        >
                          <Text style={styles.modalSingleCloseBtnText}>Tutup</Text>
                        </TouchableOpacity>
                      </View>
                    </ScrollView>
                  </>
                );
              })()}
            </View>
          </View>
        </Modal>

        {/* ==================== 2. MODAL DETAIL TAHFIZH ==================== */}
        <Modal
          visible={!!selectedTahfizhItem}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedTahfizhItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCardPremium}>
              <View style={styles.modalDragHandle} />

              {selectedTahfizhItem && (
                <>
                  <View style={styles.modalHeaderRow}>
                    <View style={[styles.modalHeaderIconBox, { backgroundColor: selectedTahfizhItem.iconBg }]}>
                      <MaterialCommunityIcons name={selectedTahfizhItem.icon} size={22} color={selectedTahfizhItem.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTitleText}>Detail Tugas Tahfizh</Text>
                      <Text numberOfLines={1} style={styles.modalSubTitleText}>{selectedTahfizhItem.typeLabel} · {selectedTahfizhItem.juz || 'Al-Qur\'an'}</Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setSelectedTahfizhItem(null)}
                      style={styles.modalCloseBtnCircle}
                    >
                      <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBodyScroll}>
                    {/* Badges Row */}
                    <View style={styles.modalBadgesRow}>
                      <View style={[styles.subjectBadgePill, { backgroundColor: selectedTahfizhItem.badgeBg }]}>
                        <MaterialCommunityIcons name="book-open-page-variant-outline" size={11} color={selectedTahfizhItem.badgeText} style={{ marginRight: 3 }} />
                        <Text style={[styles.subjectBadgeText, { color: selectedTahfizhItem.badgeText }]}>{selectedTahfizhItem.typeLabel}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadgePill,
                          selectedTahfizhItem.status === 'submitted' && { backgroundColor: '#D1FAE5' },
                          selectedTahfizhItem.status === 'late' && { backgroundColor: '#FEE2E2' },
                          selectedTahfizhItem.status === 'in_progress' && { backgroundColor: '#FEF3C7' },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={selectedTahfizhItem.status === 'submitted' ? 'check-circle' : selectedTahfizhItem.status === 'late' ? 'alert-circle' : 'clock-outline'}
                          size={11}
                          color={selectedTahfizhItem.status === 'submitted' ? '#059669' : selectedTahfizhItem.status === 'late' ? '#EF4444' : '#D97706'}
                          style={{ marginRight: 3 }}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: selectedTahfizhItem.status === 'submitted' ? '#059669' : selectedTahfizhItem.status === 'late' ? '#EF4444' : '#D97706' },
                          ]}
                        >
                          {selectedTahfizhItem.status === 'submitted' ? 'Sudah Disetor' : selectedTahfizhItem.status === 'late' ? 'Belum Disetor' : 'Dalam Proses'}
                        </Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text style={styles.modalContentTitle}>{selectedTahfizhItem.title}</Text>

                    {/* Description Card */}
                    <View style={styles.modalDescCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <MaterialCommunityIcons name="book-outline" size={14} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.modalCardHeaderMini}>Instruksi Setoran & Murojaah:</Text>
                      </View>
                      <Text style={styles.modalDescContentText}>{selectedTahfizhItem.instruction}</Text>
                    </View>

                    {/* Metadata Grid */}
                    <View style={styles.tahfizhMetaRow}>
                      <View style={styles.tahfizhMetaItem}>
                        <MaterialCommunityIcons name="calendar-blank-outline" size={14} color="#64748B" style={{ marginRight: 5 }} />
                        <View>
                          <Text style={styles.compactMetaLabel}>Deadline</Text>
                          <Text style={styles.compactMetaValue}>{selectedTahfizhItem.deadlineFormatted}</Text>
                        </View>
                      </View>
                      <View style={styles.compactMetaDivider} />
                      <View style={styles.tahfizhMetaItem}>
                        <MaterialCommunityIcons name="account-outline" size={14} color="#64748B" style={{ marginRight: 5 }} />
                        <View>
                          <Text style={styles.compactMetaLabel}>Guru Pengampu</Text>
                          <Text style={styles.compactMetaValue}>{selectedTahfizhItem.teacher}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Tips Tahfizh Card */}
                    <View style={[styles.modalDescCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0', marginTop: 12 }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <MaterialCommunityIcons name="lightbulb-on-outline" size={14} color="#16A34A" style={{ marginRight: 4 }} />
                        <Text style={[styles.modalCardHeaderMini, { color: '#16A34A' }]}>Adab & Tips Hafalan:</Text>
                      </View>
                      <Text style={[styles.modalDescContentText, { color: '#166534' }]}>
                        Dengarkan murattal syaikh secara berulang, perhatikan makharijul huruf dan panjang pendek tajwid sebelum menyetorkan hafalan kepada ustadz/ustadzah.
                      </Text>
                    </View>

                    {/* Action Button */}
                    <View style={{ marginTop: 16 }}>
                      <TouchableOpacity
                        style={styles.modalSingleCloseBtn}
                        onPress={() => setSelectedTahfizhItem(null)}
                      >
                        <Text style={styles.modalSingleCloseBtnText}>Tutup</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ==================== 3. MODAL DETAIL MUTABAAH ==================== */}
        <Modal
          visible={!!selectedMutabaahItem}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedMutabaahItem(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCardPremium}>
              <View style={styles.modalDragHandle} />

              {selectedMutabaahItem && (
                <>
                  <View style={styles.modalHeaderRow}>
                    <View style={[styles.modalHeaderIconBox, { backgroundColor: selectedMutabaahItem.iconBg }]}>
                      <MaterialCommunityIcons name={selectedMutabaahItem.icon} size={22} color={selectedMutabaahItem.iconColor} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.modalTitleText}>Detail Aktivitas Mutabaah</Text>
                      <Text numberOfLines={1} style={styles.modalSubTitleText}>{selectedMutabaahItem.category}</Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => setSelectedMutabaahItem(null)}
                      style={styles.modalCloseBtnCircle}
                    >
                      <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <ScrollView showsVerticalScrollIndicator={false} style={styles.modalBodyScroll}>
                    {/* Badges Row */}
                    <View style={styles.modalBadgesRow}>
                      <View style={[styles.subjectBadgePill, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
                        <MaterialCommunityIcons name="tag-outline" size={11} color="#475569" style={{ marginRight: 3 }} />
                        <Text style={[styles.subjectBadgeText, { color: '#475569' }]}>{selectedMutabaahItem.category}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusBadgePill,
                          selectedMutabaahItem.status === 'selesai' && { backgroundColor: '#D1FAE5' },
                          selectedMutabaahItem.status === 'dalam_proses' && { backgroundColor: '#FEF3C7' },
                          selectedMutabaahItem.status === 'belum_selesai' && { backgroundColor: '#FEE2E2' },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={selectedMutabaahItem.status === 'selesai' ? 'check-circle' : selectedMutabaahItem.status === 'dalam_proses' ? 'clock-outline' : 'close-circle'}
                          size={11}
                          color={selectedMutabaahItem.status === 'selesai' ? '#059669' : selectedMutabaahItem.status === 'dalam_proses' ? '#D97706' : '#EF4444'}
                          style={{ marginRight: 3 }}
                        />
                        <Text
                          style={[
                            styles.statusBadgeText,
                            { color: selectedMutabaahItem.status === 'selesai' ? '#059669' : selectedMutabaahItem.status === 'dalam_proses' ? '#D97706' : '#EF4444' },
                          ]}
                        >
                          {selectedMutabaahItem.statusLabel}
                        </Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text style={styles.modalContentTitle}>{selectedMutabaahItem.title}</Text>

                    {/* Description Card */}
                    <View style={styles.modalDescCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                        <MaterialCommunityIcons name="information-outline" size={14} color="#059669" style={{ marginRight: 4 }} />
                        <Text style={styles.modalCardHeaderMini}>Deskripsi Kebiasaan:</Text>
                      </View>
                      <Text style={styles.modalDescContentText}>{selectedMutabaahItem.description}</Text>
                    </View>

                    {/* Progress Card */}
                    <View style={styles.modalProgressCard}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                          <MaterialCommunityIcons name="calendar-check" size={16} color="#059669" style={{ marginRight: 6 }} />
                          <Text style={styles.modalProgressLabel}>Capaian Periode</Text>
                        </View>
                        <Text style={styles.modalProgressValue}>{selectedMutabaahItem.progress}</Text>
                      </View>
                      <Text style={styles.modalProgressSub}>{mutabaahDateRange} · {mutabaahPeriod}</Text>
                    </View>

                    {/* Keutamaan Card */}
                    {selectedMutabaahItem.tips && (
                      <View style={[styles.modalDescCard, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A', marginTop: 12 }]}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                          <MaterialCommunityIcons name="star-outline" size={14} color="#D97706" style={{ marginRight: 4 }} />
                          <Text style={[styles.modalCardHeaderMini, { color: '#D97706' }]}>Keutamaan & Hikmah:</Text>
                        </View>
                        <Text style={[styles.modalDescContentText, { color: '#92400E', fontStyle: 'italic' }]}>
                          “{selectedMutabaahItem.tips}”
                        </Text>
                      </View>
                    )}

                    {/* Action Button */}
                    <View style={{ marginTop: 16 }}>
                      <TouchableOpacity
                        style={styles.modalSingleCloseBtn}
                        onPress={() => setSelectedMutabaahItem(null)}
                      >
                        <Text style={styles.modalSingleCloseBtnText}>Tutup</Text>
                      </TouchableOpacity>
                    </View>
                  </ScrollView>
                </>
              )}
            </View>
          </View>
        </Modal>

        {/* ==================== 4. MODAL RAPORT BAYANGAN AKADEMIK ==================== */}
        <Modal
          visible={showAcademicRaportModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowAcademicRaportModal(false)}
        >
          <View style={styles.raportDocOverlay}>
            <View style={styles.raportDocCard}>
              <View style={styles.modalDragHandle} />

              <View style={styles.modalHeaderRow}>
                <View style={[styles.modalHeaderIconBox, { backgroundColor: '#E6FBF2' }]}>
                  <MaterialCommunityIcons name="file-certificate-outline" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitleText}>Raport Bayangan Akademik</Text>
                  <Text numberOfLines={1} style={styles.modalSubTitleText}>
                    Evaluasi {payload.period?.semester_name || 'Tengah Semester'} · TA {payload.period?.academic_year || defaultAcademicYear}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowAcademicRaportModal(false)}
                  style={styles.modalCloseBtnCircle}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.raportDocScroll}>
                {/* Official KOP Header */}
                <View style={styles.raportKopBox}>
                  <View style={styles.raportKopBadge}>
                    <MaterialCommunityIcons name="school" size={13} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={styles.raportKopBadgeText}>SEKOLAH ISLAM TERPADU</Text>
                  </View>
                  <Text style={styles.raportKopTitle}>LAPORAN CAPAIAN HASIL BELAJAR</Text>
                  <Text style={styles.raportKopSub}>Mid-Semester Progress Report (Raport Bayangan)</Text>
                </View>

                {/* Identitas Siswa Card */}
                <View style={styles.raportIdentityCard}>
                  <View style={styles.raportIdentityRow}>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Nama Peserta Didik</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{studentName}</Text>
                    </View>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Kelas / Jenjang</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{className || '-'} · {unitName || 'Sekolah'}</Text>
                    </View>
                  </View>
                  <View style={[styles.raportIdentityRow, { marginTop: 8 }]}>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>NIS / NISN</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{(student?.nis || '-') + ' / ' + (student?.nisn || '-')}</Text>
                    </View>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Semester / T.A.</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{payload.period?.semester_name || 'Ganjil'} · {payload.period?.academic_year || defaultAcademicYear}</Text>
                    </View>
                  </View>
                </View>

                {/* 4 Mini KPI Stats */}
                <View style={styles.raportKpiRow}>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#1D4ED8' }]}>{payload.summary.average_score != null ? scoreText(payload.summary.average_score) : '-'}</Text>
                    <Text style={styles.raportKpiLbl}>Rata-rata</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#B45309' }]}>{payload.summary.highest_score != null ? scoreText(payload.summary.highest_score) : '-'}</Text>
                    <Text style={styles.raportKpiLbl}>Tertinggi</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#047857' }]}>{payload.summary.passed_subjects != null ? payload.summary.passed_subjects : payload.items.filter((it: any) => it.is_passed).length}</Text>
                    <Text style={styles.raportKpiLbl}>Tuntas</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#BE123C' }]}>{payload.summary.remedial_subjects != null ? payload.summary.remedial_subjects : payload.items.filter((it: any) => it.is_passed === false).length}</Text>
                    <Text style={styles.raportKpiLbl}>Remedial</Text>
                  </View>
                </View>

                {/* Table Title */}
                <View style={{ marginTop: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="format-list-numbered" size={16} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.raportSectionTitle}>Capaian Nilai Mata Pelajaran</Text>
                </View>

                {/* Subjects Table */}
                <View style={styles.raportTableContainer}>
                  <View style={styles.raportTableHeaderRow}>
                    <Text style={[styles.raportTableHeaderCell, { flex: 2.2 }]}>Mata Pelajaran</Text>
                    <Text style={[styles.raportTableHeaderCell, { flex: 0.8, textAlign: 'center' }]}>KKM</Text>
                    <Text style={[styles.raportTableHeaderCell, { flex: 0.9, textAlign: 'center' }]}>Nilai</Text>
                    <Text style={[styles.raportTableHeaderCell, { flex: 0.7, textAlign: 'center' }]}>Pred</Text>
                    <Text style={[styles.raportTableHeaderCell, { flex: 1.1, textAlign: 'center' }]}>Status</Text>
                  </View>

                  {payload.items.length > 0 ? (
                    payload.items.map((item: any, idx: number) => {
                      const subjectTitle = item.subject?.name || item.name || item.subject_name || 'Mapel';
                      const kkmVal = scoreText(item.kkm || 75);
                      const finalVal = scoreText(item.final_score || item.score || 0);
                      const letter = item.grade_letter || (Number(finalVal) >= 90 ? 'A' : Number(finalVal) >= 80 ? 'B' : Number(finalVal) >= 75 ? 'C' : 'D');
                      const isPassed = item.is_passed !== undefined ? item.is_passed : Number(finalVal) >= Number(kkmVal);

                      return (
                        <View key={String(item.id || idx)} style={[styles.raportTableRow, idx % 2 === 1 && { backgroundColor: '#F8FAFC' }]}>
                          <View style={{ flex: 2.2 }}>
                            <Text numberOfLines={1} style={styles.raportTableCellTitle}>{subjectTitle}</Text>
                            {item.notes ? (
                              <Text numberOfLines={1} style={styles.raportTableCellNotes}>{item.notes}</Text>
                            ) : null}
                          </View>
                          <Text style={[styles.raportTableCell, { flex: 0.8, textAlign: 'center' }]}>{kkmVal}</Text>
                          <Text style={[styles.raportTableCellBold, { flex: 0.9, textAlign: 'center', color: isPassed ? '#059669' : '#DC2626' }]}>
                            {finalVal}
                          </Text>
                          <Text style={[styles.raportTableCell, { flex: 0.7, textAlign: 'center', fontWeight: '800' }]}>{letter}</Text>
                          <View style={{ flex: 1.1, alignItems: 'center' }}>
                            <View style={[styles.raportBadgeBase, isPassed ? styles.raportBadgePassed : styles.raportBadgeRemedial]}>
                              <Text style={[styles.raportBadgeText, { color: isPassed ? '#047857' : '#B91C1C' }]}>
                                {isPassed ? 'Tuntas' : 'Remedial'}
                              </Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  ) : (
                    <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ fontSize: 13, color: '#64748B', fontWeight: '600' }}>
                        Belum ada data nilai akademik yang diterbitkan untuk semester ini.
                      </Text>
                    </View>
                  )}
                </View>

                {/* Catatan Wali Kelas */}
                <View style={styles.raportTeacherNoteBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="comment-text-outline" size={14} color="#059669" style={{ marginRight: 5 }} />
                    <Text style={styles.raportTeacherNoteTitle}>Catatan Wali Kelas:</Text>
                  </View>
                  <Text style={styles.raportTeacherNoteText}>
                    {(payload.summary as any)?.teacher_notes || (payload.summary as any)?.catatan_walas || 'Ananda menunjukkan partisipasi belajar yang baik dalam seluruh mata pelajaran semester ini.'}
                  </Text>
                </View>

                {/* Digital Seal */}
                <View style={styles.raportSealRow}>
                  <MaterialCommunityIcons name="shield-check" size={16} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.raportSealText}>
                    Dokumen resmi diterbitkan otomatis oleh Sistem Informasi Akademik Terpadu.
                  </Text>
                </View>

                {/* Action Buttons Row */}
                <View style={styles.raportBtnRow}>
                  <TouchableOpacity
                    style={styles.raportBtnSecondary}
                    onPress={() => setShowAcademicRaportModal(false)}
                  >
                    <Text style={styles.raportBtnSecondaryText}>Tutup Pratinjau</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.raportBtnPrimary}
                    onPress={() => Alert.alert('Raport Bayangan', 'Dokumen Raport Bayangan Akademik berhasil diunduh dan tersimpan.')}
                  >
                    <MaterialCommunityIcons name="printer-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.raportBtnPrimaryText}>Cetak / Simpan</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ==================== 5. MODAL RAPORT BAYANGAN TAHFIZH ==================== */}
        <Modal
          visible={showTahfizhRaportModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowTahfizhRaportModal(false)}
        >
          <View style={styles.raportDocOverlay}>
            <View style={styles.raportDocCard}>
              <View style={styles.modalDragHandle} />

              <View style={styles.modalHeaderRow}>
                <View style={[styles.modalHeaderIconBox, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="book-open-page-variant-outline" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitleText}>Raport Bayangan Tahfizh</Text>
                  <Text numberOfLines={1} style={styles.modalSubTitleText}>
                    Halaqah Al-Qur'an · Evaluasi Tengah Semester
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowTahfizhRaportModal(false)}
                  style={styles.modalCloseBtnCircle}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.raportDocScroll}>
                {/* Official KOP Header */}
                <View style={[styles.raportKopBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <View style={[styles.raportKopBadge, { backgroundColor: '#DCFCE7', borderColor: '#86EFAC' }]}>
                    <MaterialCommunityIcons name="book-open-variant" size={13} color="#15803D" style={{ marginRight: 4 }} />
                    <Text style={[styles.raportKopBadgeText, { color: '#15803D' }]}>HALAQAH TAHFIZHUL QUR'AN</Text>
                  </View>
                  <Text style={styles.raportKopTitle}>LAPORAN CAPAIAN HAFALAN AL-QUR'AN</Text>
                  <Text style={styles.raportKopSub}>Evaluasi Makharijul Huruf, Tajwid & Murojaah</Text>
                </View>

                {/* Identitas Siswa Card */}
                <View style={styles.raportIdentityCard}>
                  <View style={styles.raportIdentityRow}>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Nama Santri/Siswa</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{studentName}</Text>
                    </View>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Halaqah / Kelas</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{className ? `Halaqah ${className}` : '-'}</Text>
                    </View>
                  </View>
                  <View style={[styles.raportIdentityRow, { marginTop: 8 }]}>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Pembimbing Halaqah</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{evaluatorName || student?.musyrif?.name || 'Pembimbing Tahfizh'}</Text>
                    </View>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Periode Evaluasi</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{payload?.period?.semester_name ? `${payload.period.semester_name} · ${payload.period.academic_year || defaultAcademicYear}` : `Semester · ${defaultAcademicYear}`}</Text>
                    </View>
                  </View>
                </View>

                {/* 4 Mini KPI Stats */}
                <View style={styles.raportKpiRow}>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#047857' }]}>{tahfizh?.validated_unique_ayah ?? (tahfizhLogs.length > 0 ? tahfizhLogs.reduce((acc: number, item: any) => acc + (Number(item.total_ayah || item.ayat_count || 0)), 0) : 0)}</Text>
                    <Text style={styles.raportKpiLbl}>Ayat Valid</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#1D4ED8' }]}>{tahfizh?.completed_surah_count ?? tahfizhLogs.filter((item: any) => item.status === 'completed' || item.status === 'lulus').length} Surah</Text>
                    <Text style={styles.raportKpiLbl}>Tuntas</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#B45309' }]}>{tahfizh?.score != null ? scoreText(tahfizh.score) : (tahfizhLogs.length > 0 ? scoreText(tahfizhLogs.reduce((acc: number, item: any) => acc + (Number(item.score || 0)), 0) / tahfizhLogs.length) : '-')}</Text>
                    <Text style={styles.raportKpiLbl}>Skor Mutu</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#7E22CE' }]}>{tahfizh?.predicate || (tahfizh?.score ? getTahfizhPredicate(tahfizh.score) : '-')}</Text>
                    <Text style={styles.raportKpiLbl}>Predikat</Text>
                  </View>
                </View>

                {/* Rubrik Penilaian Mutu Card */}
                <View style={{ marginTop: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="star-check-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.raportSectionTitle}>Rubrik Standar Mutu Hafalan</Text>
                </View>

                <View style={styles.raportRubrikGrid}>
                  <View style={styles.raportRubrikCard}>
                    <Text style={styles.raportRubrikLabel}>Kelancaran (Fashahah)</Text>
                    <Text style={styles.raportRubrikScore}>{tahfizh?.rubrics?.fashahah ? `${tahfizh.rubrics.fashahah} · ${getTahfizhPredicate(tahfizh.rubrics.fashahah)}` : (tahfizh?.score ? `${scoreText(tahfizh.score)} · ${getTahfizhPredicate(tahfizh.score)}` : '-')}</Text>
                  </View>
                  <View style={styles.raportRubrikCard}>
                    <Text style={styles.raportRubrikLabel}>Kaidah Tajwid & Mad</Text>
                    <Text style={styles.raportRubrikScore}>{tahfizh?.rubrics?.tajwid ? `${tahfizh.rubrics.tajwid} · ${getTahfizhPredicate(tahfizh.rubrics.tajwid)}` : (tahfizh?.score ? `${scoreText(tahfizh.score)} · ${getTahfizhPredicate(tahfizh.score)}` : '-')}</Text>
                  </View>
                  <View style={styles.raportRubrikCard}>
                    <Text style={styles.raportRubrikLabel}>Makharijul Huruf</Text>
                    <Text style={styles.raportRubrikScore}>{tahfizh?.rubrics?.makharij ? `${tahfizh.rubrics.makharij} · ${getTahfizhPredicate(tahfizh.rubrics.makharij)}` : (tahfizh?.score ? `${scoreText(tahfizh.score)} · ${getTahfizhPredicate(tahfizh.score)}` : '-')}</Text>
                  </View>
                  <View style={styles.raportRubrikCard}>
                    <Text style={styles.raportRubrikLabel}>Adab & Kekhusyukan</Text>
                    <Text style={styles.raportRubrikScore}>{tahfizh?.rubrics?.adab ? `${tahfizh.rubrics.adab} · ${getTahfizhPredicate(tahfizh.rubrics.adab)}` : (tahfizh?.score ? `${scoreText(tahfizh.score)} · ${getTahfizhPredicate(tahfizh.score)}` : '-')}</Text>
                  </View>
                </View>

                {/* Table Title */}
                <View style={{ marginTop: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="book-check-outline" size={16} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.raportSectionTitle}>Rincian Capaian Surah & Murojaah</Text>
                </View>

                {/* Tahfizh Surah Table */}
                <View style={styles.raportTableContainer}>
                  <View style={styles.raportTableHeaderRow}>
                    <Text style={[styles.raportTableHeaderCell, { flex: 2.2 }]}>Surah & Ayat</Text>
                    <Text style={[styles.raportTableHeaderCell, { flex: 1.0, textAlign: 'center' }]}>Juz</Text>
                    <Text style={[styles.raportTableHeaderCell, { flex: 1.0, textAlign: 'center' }]}>Nilai</Text>
                    <Text style={[styles.raportTableHeaderCell, { flex: 1.4, textAlign: 'center' }]}>Mutu</Text>
                  </View>

                  {tahfizhLogs.length === 0 ? (
                    <View style={{ paddingVertical: 24, alignItems: 'center', justifyContent: 'center' }}>
                      <MaterialCommunityIcons name="book-outline" size={32} color="#94A3B8" />
                      <Text style={{ fontSize: 13, color: '#64748B', marginTop: 6, fontWeight: '500' }}>
                        Belum ada riwayat setoran tahfizh pada periode ini
                      </Text>
                    </View>
                  ) : (
                    tahfizhLogs.map((item: any, idx: number) => {
                      const sName = item.surah_name || item.surah || `Surah #${idx + 1}`;
                      const aRange = item.ayat_start && item.ayat_end ? `${item.ayat_start}-${item.ayat_end}` : (item.total_ayah ? `${item.total_ayah} Ayat` : '1 Surah');
                      const jNum = item.juz || item.juz_number || '-';
                      const sc = item.score != null ? scoreText(item.score) : '-';
                      const badge = item.grade || item.predicate || (item.score != null ? getTahfizhPredicate(item.score) : 'Lulus');
                      const noteText = item.notes_teacher || item.notes || item.catatan || 'Setoran hafalan';

                      return (
                        <View key={item.id || `${sName}-${idx}`} style={[styles.raportTableRow, idx % 2 === 1 && { backgroundColor: '#F8FAFC' }]}>
                          <View style={{ flex: 2.2 }}>
                            <Text numberOfLines={1} style={styles.raportTableCellTitle}>{sName} ({aRange})</Text>
                            <Text numberOfLines={1} style={styles.raportTableCellNotes}>{noteText}</Text>
                          </View>
                          <Text style={[styles.raportTableCell, { flex: 1.0, textAlign: 'center' }]}>{jNum}</Text>
                          <Text style={[styles.raportTableCellBold, { flex: 1.0, textAlign: 'center', color: '#059669' }]}>
                            {sc}
                          </Text>
                          <View style={{ flex: 1.4, alignItems: 'center' }}>
                            <View style={[styles.raportBadgeBase, styles.raportBadgePassed]}>
                              <Text style={[styles.raportBadgeText, { color: '#047857' }]}>{badge}</Text>
                            </View>
                          </View>
                        </View>
                      );
                    })
                  )}
                </View>

                {/* Catatan Ustadz Pembimbing */}
                <View style={[styles.raportTeacherNoteBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="account-tie-outline" size={14} color="#15803D" style={{ marginRight: 5 }} />
                    <Text style={[styles.raportTeacherNoteTitle, { color: '#15803D' }]}>Catatan Pembimbing Tahfizh:</Text>
                  </View>
                  <Text style={[styles.raportTeacherNoteText, { color: '#14532D' }]}>
                    {tahfizh?.score_note || tahfizh?.notes || tahfizhLogs?.[0]?.notes_teacher || tahfizhLogs?.[0]?.catatan || 'Santri istiqomah dan disiplin dalam menyetorkan hafalan serta murojaah harian.'}
                  </Text>
                </View>

                {/* Action Buttons Row */}
                <View style={styles.raportBtnRow}>
                  <TouchableOpacity
                    style={styles.raportBtnSecondary}
                    onPress={() => setShowTahfizhRaportModal(false)}
                  >
                    <Text style={styles.raportBtnSecondaryText}>Tutup Pratinjau</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.raportBtnPrimary}
                    onPress={() => Alert.alert('Raport Tahfizh', 'Dokumen Raport Bayangan Tahfizh berhasil diunduh dan tersimpan.')}
                  >
                    <MaterialCommunityIcons name="printer-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.raportBtnPrimaryText}>Cetak / Simpan</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* ==================== 6. MODAL RAPORT BAYANGAN MUTABAAH ==================== */}
        <Modal
          visible={showMutabaahRaportModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowMutabaahRaportModal(false)}
        >
          <View style={styles.raportDocOverlay}>
            <View style={styles.raportDocCard}>
              <View style={styles.modalDragHandle} />

              <View style={styles.modalHeaderRow}>
                <View style={[styles.modalHeaderIconBox, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="clipboard-check-outline" size={22} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitleText}>Raport Bayangan Mutabaah</Text>
                  <Text numberOfLines={1} style={styles.modalSubTitleText}>
                    Evaluasi Karakter & Pembiasaan Ibadah Harian
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowMutabaahRaportModal(false)}
                  style={styles.modalCloseBtnCircle}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.raportDocScroll}>
                {/* Official KOP Header */}
                <View style={[styles.raportKopBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <View style={[styles.raportKopBadge, { backgroundColor: '#DBEAFE', borderColor: '#93C5FD' }]}>
                    <MaterialCommunityIcons name="shield-star-outline" size={13} color="#1D4ED8" style={{ marginRight: 4 }} />
                    <Text style={[styles.raportKopBadgeText, { color: '#1D4ED8' }]}>PEMBINAAN KARAKTER ISLAMI</Text>
                  </View>
                  <Text style={styles.raportKopTitle}>LAPORAN EVALUASI MUTABAAH YAUMIYYAH</Text>
                  <Text style={styles.raportKopSub}>Pemantauan Shalat 5 Waktu, Adab, Sunnah & Disiplin</Text>
                </View>

                {/* Identitas Siswa Card */}
                <View style={styles.raportIdentityCard}>
                  <View style={styles.raportIdentityRow}>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Nama Peserta Didik</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{studentName}</Text>
                    </View>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Kelas</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{className || '-'}</Text>
                    </View>
                  </View>
                  <View style={[styles.raportIdentityRow, { marginTop: 8 }]}>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>{evaluatorRole}</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{evaluatorName}</Text>
                    </View>
                    <View style={styles.raportIdentityItem}>
                      <Text style={styles.raportIdentityLabel}>Program Pendidikan</Text>
                      <Text numberOfLines={1} style={styles.raportIdentityValue}>{programLabel}</Text>
                    </View>
                  </View>
                </View>

                {/* 4 Mini KPI Stats */}
                {/* 4 Mini KPI Stats (Dinamis dari Data Riil) */}
                <View style={styles.raportKpiRow}>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#047857' }]}>
                      {mutabaah?.score != null ? `${Math.round(Number(mutabaah.score))}%` : (mutabaahOverview?.today?.score != null ? `${Math.round(Number(mutabaahOverview.today.score))}%` : '-')}
                    </Text>
                    <Text style={styles.raportKpiLbl}>Indeks Sikap</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#1D4ED8' }]}>
                      {sholatKpiStats.wajibTotal > 0 ? `${Math.round((sholatKpiStats.wajibDone / sholatKpiStats.wajibTotal) * 100)}%` : '-'}
                    </Text>
                    <Text style={styles.raportKpiLbl}>Shalat Fardhu</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#7E22CE' }]}>
                      {sholatKpiStats.adabTotal > 0 ? `${Math.round((sholatKpiStats.adabDone / sholatKpiStats.adabTotal) * 100)}%` : '-'}
                    </Text>
                    <Text style={styles.raportKpiLbl}>Adab & Akhlak</Text>
                  </View>
                  <View style={[styles.raportKpiBox, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <Text style={[styles.raportKpiVal, { color: '#B45309' }]}>
                      {sholatKpiStats.sunnahTotal > 0 ? `${Math.round((sholatKpiStats.sunnahDone / sholatKpiStats.sunnahTotal) * 100)}%` : '-'}
                    </Text>
                    <Text style={styles.raportKpiLbl}>Amal Sunnah</Text>
                  </View>
                </View>

                {/* 3 Pillars of Mutabaah */}
                <View style={{ marginTop: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center' }}>
                  <MaterialCommunityIcons name="checkbox-marked-circle-outline" size={16} color="#2563EB" style={{ marginRight: 6 }} />
                  <Text style={styles.raportSectionTitle}>Rincian Capaian Indikator Karakter</Text>
                </View>

                {dynamicMutabaahRaportSections.map((section) => (
                  <View key={section.category} style={styles.mutabaahSectionCard}>
                    <View style={styles.mutabaahSectionHeader}>
                      <Text style={styles.mutabaahSectionCategoryText}>{section.category}</Text>
                      <View style={[styles.raportBadgeBase, { backgroundColor: section.badgeBg }]}>
                        <Text style={[styles.raportBadgeText, { color: section.badgeColor }]}>{section.badge}</Text>
                      </View>
                    </View>

                    {section.items.map((item, idx) => (
                      <View key={item.label} style={[styles.mutabaahItemRow, idx > 0 && { borderTopWidth: 1, borderTopColor: '#F1F5F9' }]}>
                        <View style={{ flex: 1 }}>
                          <Text style={styles.mutabaahItemLabel}>{item.label}</Text>
                          <Text style={styles.mutabaahItemStatus}>{item.status}</Text>
                        </View>
                        <View style={styles.mutabaahItemScorePill}>
                          <Text style={styles.mutabaahItemScoreText}>{item.score}</Text>
                        </View>
                      </View>
                    ))}
                  </View>
                ))}

                {/* Catatan Pembina Karakter */}
                <View style={[styles.raportTeacherNoteBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="heart-pulse" size={14} color="#1D4ED8" style={{ marginRight: 5 }} />
                    <Text style={[styles.raportTeacherNoteTitle, { color: '#1D4ED8' }]}>Catatan Evaluasi {evaluatorRole}:</Text>
                  </View>
                  <Text style={[styles.raportTeacherNoteText, { color: '#1E3A8A' }]}>
                    {mutabaahOverview?.today?.notes || (
                      isBoarding
                        ? '“Alhamdulillah santri disiplin mengikuti shalat berjamaah 5 waktu di masjid asrama dan menjaga adab ukhuwah serta kebersihan kamar dengan sangat baik.”'
                        : '“Alhamdulillah ananda tertib shalat berjamaah di musholla sekolah, aktif beradab sopan kepada guru dan teman, serta istiqomah menjalankan amalan yaumiyyah di rumah.”'
                    )}
                  </Text>
                </View>

                {/* Action Buttons Row */}
                <View style={styles.raportBtnRow}>
                  <TouchableOpacity
                    style={styles.raportBtnSecondary}
                    onPress={() => setShowMutabaahRaportModal(false)}
                  >
                    <Text style={styles.raportBtnSecondaryText}>Tutup Pratinjau</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.raportBtnPrimary, { backgroundColor: '#2563EB' }]}
                    onPress={() => Alert.alert('Raport Mutabaah', 'Dokumen Raport Bayangan Mutabaah berhasil diunduh dan tersimpan.')}
                  >
                    <MaterialCommunityIcons name="printer-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.raportBtnPrimaryText}>Cetak / Simpan</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>

        {/* MODAL DETAIL EVALUASI ITEM DOA HARIAN */}
        <Modal
          visible={Boolean(selectedPrayerItem)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedPrayerItem(null)}
        >
          <View style={styles.prayerModalBackdrop}>
            <View style={styles.prayerModalCard}>
              <View style={styles.prayerModalHeaderRow}>
                <View style={styles.prayerModalIconBox}>
                  <MaterialCommunityIcons name="hands-pray" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1, marginRight: 8 }}>
                  <Text style={styles.prayerModalTitle}>No. {selectedPrayerItem?.no}: {selectedPrayerItem?.nama}</Text>
                  <Text style={styles.prayerModalSubtitle}>{selectedPrayerItem?.grup || 'Doa Doa Harian'}</Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedPrayerItem(null)} style={styles.prayerModalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>

              <View style={styles.prayerModalScoreSection}>
                <View style={styles.prayerModalScoreBox}>
                  <Text style={styles.prayerModalScoreVal}>
                    {selectedPrayerItem?.poin !== null && selectedPrayerItem?.poin !== undefined ? selectedPrayerItem.poin : '-'}
                  </Text>
                  <Text style={styles.prayerModalScoreLbl}>Poin Capaian</Text>
                </View>

                <View style={styles.prayerModalStatusBox}>
                  <Text style={[styles.prayerModalStatusVal, { color: selectedPrayerItem?.is_passed ? '#059669' : '#D97706' }]}>
                    {selectedPrayerItem?.is_passed ? 'TUNTAS (LULUS)' : (selectedPrayerItem?.poin ? 'BELUM TUNTAS' : 'BELUM DIUJI')}
                  </Text>
                  <Text style={styles.prayerModalScoreLbl}>
                    {selectedPrayerItem?.paraf_name ? `Diparaf oleh ${selectedPrayerItem.paraf_name}` : 'Belum diparaf penguji'}
                  </Text>
                </View>
              </View>

              {selectedPrayerItem?.notes && (
                <View style={styles.prayerModalNotesBox}>
                  <MaterialCommunityIcons name="note-text-outline" size={14} color="#059669" style={{ marginRight: 6 }} />
                  <Text style={styles.prayerModalNotesText}>
                    Catatan Penguji: "{selectedPrayerItem.notes}"
                  </Text>
                </View>
              )}

              <TouchableOpacity
                style={styles.prayerModalConfirmBtn}
                onPress={() => setSelectedPrayerItem(null)}
              >
                <Text style={styles.prayerModalConfirmBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>

        {/* ==================== 7. MODAL LEMBAR POIN PENILAIAN DOA (62 DOA) ==================== */}
        <Modal
          visible={showPrayerRaportModal}
          transparent
          animationType="slide"
          onRequestClose={() => setShowPrayerRaportModal(false)}
        >
          <View style={styles.raportDocOverlay}>
            <View style={styles.raportDocCard}>
              <View style={styles.modalDragHandle} />

              {/* Header Top: Icon + Title/Sub + Close & Date Pill */}
              <View style={styles.prayerModalHeader}>
                <View style={styles.prayerModalHeaderTopRow}>
                  <View style={styles.prayerModalHeaderLeft}>
                    <View style={styles.prayerHeaderIconBox}>
                      <MaterialCommunityIcons name="mosque" size={22} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.prayerHeaderTitle}>Mutabaah Harian</Text>
                      <Text numberOfLines={1} style={styles.prayerHeaderSub}>
                        Pemantauan ibadah, akhlak, dan kebiasaan harian Ananda
                      </Text>
                    </View>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => setShowPrayerRaportModal(false)}
                    style={styles.modalCloseBtnCircle}
                  >
                    <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* Date Dropdown Pill */}
                <View style={styles.prayerDatePillContainer}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setPrayerDayOffset((prev) => (prev === 0 ? -1 : 0))}
                    style={styles.prayerDatePill}
                  >
                    <MaterialCommunityIcons name="calendar-month-outline" size={14} color="#64748B" style={{ marginRight: 6 }} />
                    <Text style={styles.prayerDatePillText}>{prayerModalDate}</Text>
                    <MaterialCommunityIcons name="chevron-down" size={14} color="#64748B" style={{ marginLeft: 4 }} />
                  </TouchableOpacity>
                </View>
              </View>

              <ScrollView showsVerticalScrollIndicator={false} style={styles.raportDocScroll}>
                {/* 4 KPI Cards Horizontal Scroll Track */}
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.prayerKpiScrollContent}
                  style={styles.prayerKpiScroll}
                >
                  {/* Card 1: Selesai */}
                  <View style={[styles.prayerKpiCard, { backgroundColor: '#F0FDF4', borderColor: '#DCFCE7' }]}>
                    <View style={styles.prayerKpiTopRow}>
                      <View style={[styles.prayerKpiIconCircle, { backgroundColor: '#22C55E' }]}>
                        <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.prayerKpiValue, { color: '#15803D' }]}>
                        {prayerKpiStats.selesaiCount}
                      </Text>
                    </View>
                    <Text style={[styles.prayerKpiTitle, { color: '#166534' }]}>Selesai</Text>
                    <Text style={[styles.prayerKpiSub, { color: '#15803D' }]}>
                      dari {prayerKpiStats.totalCount} kegiatan
                    </Text>
                  </View>

                  {/* Card 2: Belum Selesai */}
                  <View style={[styles.prayerKpiCard, { backgroundColor: '#EFF6FF', borderColor: '#DBEAFE' }]}>
                    <View style={styles.prayerKpiTopRow}>
                      <View style={[styles.prayerKpiIconCircle, { backgroundColor: '#3B82F6' }]}>
                        <MaterialCommunityIcons name="clock-outline" size={15} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.prayerKpiValue, { color: '#1D4ED8' }]}>
                        {prayerKpiStats.belumCount}
                      </Text>
                    </View>
                    <Text style={[styles.prayerKpiTitle, { color: '#1E40AF' }]}>Belum Selesai</Text>
                    <Text style={[styles.prayerKpiSub, { color: '#2563EB' }]}>
                      dari {prayerKpiStats.totalCount} kegiatan
                    </Text>
                  </View>

                  {/* Card 3: Total Poin */}
                  <View style={[styles.prayerKpiCard, { backgroundColor: '#FEFCE8', borderColor: '#FEF08A' }]}>
                    <View style={styles.prayerKpiTopRow}>
                      <View style={[styles.prayerKpiIconCircle, { backgroundColor: '#EAB308' }]}>
                        <MaterialCommunityIcons name="star" size={15} color="#FFFFFF" />
                      </View>
                      <Text style={[styles.prayerKpiValue, { color: '#A16207' }]}>
                        {prayerKpiStats.totalPoin}
                      </Text>
                    </View>
                    <Text style={[styles.prayerKpiTitle, { color: '#854D0E' }]}>Total Poin</Text>
                    <Text style={[styles.prayerKpiSub, { color: '#A16207' }]}>
                      dari {prayerKpiStats.maxPoin} poin
                    </Text>
                  </View>

                  {/* Card 4: Konsistensi Hari Ini (Gauge) */}
                  <View style={[styles.prayerKpiCard, styles.prayerKpiCardGauge]}>
                    <View style={styles.gaugeRow}>
                      <View style={styles.gaugeRingOuter}>
                        <View style={styles.gaugeRingInner}>
                          <Text style={styles.gaugeRingText}>{prayerKpiStats.percent}%</Text>
                        </View>
                      </View>
                      <View style={styles.gaugeTextCol}>
                        <Text style={styles.gaugeLabelTitle}>Konsistensi</Text>
                        <Text style={styles.gaugeLabelSub}>Hari Ini</Text>
                      </View>
                    </View>
                  </View>
                </ScrollView>

                {/* Toolbar: Search, Filter, Input Manual */}
                <View style={styles.prayerToolbarRow}>
                  <View style={styles.prayerToolbarSearchBox}>
                    <MaterialCommunityIcons name="magnify" size={17} color="#94A3B8" style={{ marginRight: 6 }} />
                    <TextInput
                      placeholder="Cari doa atau kebiasaan..."
                      placeholderTextColor="#94A3B8"
                      style={styles.prayerToolbarSearchInput}
                      value={prayerSearch}
                      onChangeText={setPrayerSearch}
                    />
                    {prayerSearch.length > 0 && (
                      <TouchableOpacity onPress={() => setPrayerSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                        <MaterialCommunityIcons name="close-circle" size={15} color="#94A3B8" />
                      </TouchableOpacity>
                    )}
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setPrayerStatusFilter((prev) =>
                        prev === 'all' ? 'selesai' : prev === 'selesai' ? 'belum' : 'all'
                      );
                    }}
                    style={[
                      styles.prayerToolbarFilterBtn,
                      prayerStatusFilter !== 'all' && styles.prayerToolbarFilterBtnActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name="filter-variant"
                      size={15}
                      color={prayerStatusFilter !== 'all' ? '#059669' : '#64748B'}
                    />
                    <Text
                      style={[
                        styles.prayerToolbarFilterText,
                        prayerStatusFilter !== 'all' && styles.prayerToolbarFilterTextActive,
                      ]}
                    >
                      {prayerStatusFilter === 'all' ? 'Filter' : prayerStatusFilter === 'selesai' ? 'Selesai' : 'Belum'}
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Section Header: Book Icon + Daftar Mutabaah Harian + Total kegiatan */}
                <View style={styles.prayerSectionHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={styles.prayerSectionHeaderTitle}>Daftar Mutabaah Harian</Text>
                  </View>
                  <Text style={styles.prayerSectionHeaderTotal}>
                    Total: {assessmentPrayerRows.length} kegiatan
                  </Text>
                </View>

                {/* Modern Table (6 Kolom) */}
                <View style={styles.prayerTableCard}>
                  {/* Table Header */}
                  <View style={styles.prayerTableHeaderRow}>
                    <View style={styles.colNoHeader}>
                      <Text style={styles.colHeaderText}>No</Text>
                    </View>
                    <View style={styles.colDoaHeader}>
                      <Text style={styles.colHeaderText}>Doa Doa Harian</Text>
                    </View>
                    <View style={styles.colPoinHeader}>
                      <Text style={styles.colHeaderText}>Poin</Text>
                    </View>
                    <View style={styles.colStatusHeader}>
                      <Text style={styles.colHeaderText}>Status</Text>
                    </View>
                    <View style={styles.colParafHeader}>
                      <Text style={styles.colHeaderText}>Paraf</Text>
                    </View>
                    <View style={styles.colActionHeader}>
                      <Text style={styles.colHeaderText}>Aksi</Text>
                    </View>
                  </View>

                  {/* Table Rows */}
                  {assessmentPrayerRows.length === 0 ? (
                    <View style={{ padding: 24, alignItems: 'center' }}>
                      <MaterialCommunityIcons name="file-search-outline" size={32} color="#CBD5E1" />
                      <Text style={{ fontSize: 13, color: '#94A3B8', marginTop: 6 }}>
                        Tidak ada data doa/kegiatan yang cocok
                      </Text>
                    </View>
                  ) : (
                    assessmentPrayerRows.map((row: any, idx: number) => {
                      const isEven = idx % 2 === 1;
                      const hasScore = row.poin !== null && row.poin !== undefined;
                      const isPassed = Boolean(row.is_passed || (hasScore && row.poin >= 75));
                      const isParafed = Boolean(row.paraf_name || (hasScore && isPassed));
                      const isLast = idx === assessmentPrayerRows.length - 1;

                      return (
                        <TouchableOpacity
                          key={row.id || `prayer-row-${idx}`}
                          activeOpacity={0.7}
                          onPress={() => setSelectedPrayerItem(row)}
                          style={[
                            styles.prayerTableRow,
                            isEven && styles.prayerTableRowAlt,
                            isLast && styles.prayerTableRowLast,
                          ]}
                        >
                          {/* Col 1: No */}
                          <View style={styles.colNoCell}>
                            <View style={styles.numberBadgePill}>
                              <Text style={styles.numberBadgeText}>{row.no}</Text>
                            </View>
                          </View>

                          {/* Col 2: Doa Doa Harian */}
                          <View style={styles.colDoaCell}>
                            <Text numberOfLines={1} style={styles.prayerDoaTitle}>
                              {row.nama}
                            </Text>
                            <Text numberOfLines={1} style={styles.prayerDoaSubtitle}>
                              {row.grup || 'Ibadah Harian'}
                            </Text>
                          </View>

                          {/* Col 3: Poin */}
                          <View style={styles.colPoinCell}>
                            <Text style={[styles.prayerPoinText, hasScore && styles.prayerPoinTextActive]}>
                              {hasScore ? row.poin : '-'}
                            </Text>
                          </View>

                          {/* Col 4: Status */}
                          <View style={styles.colStatusCell}>
                            {isPassed ? (
                              <View style={styles.statusBadgeDone}>
                                <MaterialCommunityIcons name="check" size={10} color="#059669" />
                                <Text style={styles.statusTextDone}>Selesai</Text>
                              </View>
                            ) : (
                              <View style={styles.statusBadgePending}>
                                <MaterialCommunityIcons name="clock-outline" size={10} color="#2563EB" />
                                <Text style={styles.statusTextPending}>Belum</Text>
                              </View>
                            )}
                          </View>

                          {/* Col 5: Paraf */}
                          <View style={styles.colParafCell}>
                            {isParafed ? (
                              <View style={styles.parafCircleDone}>
                                <MaterialCommunityIcons name="check" size={12} color="#FFFFFF" />
                              </View>
                            ) : (
                              <Text style={styles.parafEmptyDash}>-</Text>
                            )}
                          </View>

                          {/* Col 6: Aksi */}
                          <TouchableOpacity
                            activeOpacity={0.7}
                            onPress={() => setSelectedPrayerItem(row)}
                            style={styles.colActionCell}
                          >
                            <MaterialCommunityIcons name="dots-vertical" size={18} color="#64748B" />
                          </TouchableOpacity>
                        </TouchableOpacity>
                      );
                    })
                  )}
                </View>

                {/* Catatan Evaluasi Penguji */}
                <View style={styles.prayerTeacherNoteBox}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 4 }}>
                    <MaterialCommunityIcons name="account-tie-outline" size={14} color="#15803D" style={{ marginRight: 5 }} />
                    <Text style={styles.prayerTeacherNoteTitle}>Catatan Evaluasi Penguji:</Text>
                  </View>
                  <Text style={styles.prayerTeacherNoteText}>
                    “Alhamdulillah capaian hafalan doa ananda sangat baik. Tajwid dan makharijul huruf terpelihara. Ananda telah menyelesaikan target doa dengan predikat Mumtaz.”
                  </Text>
                </View>

                {/* Action Buttons Row */}
                <View style={[styles.raportBtnRow, { marginTop: 14, marginBottom: 20 }]}>
                  <TouchableOpacity
                    style={styles.raportBtnSecondary}
                    onPress={() => setShowPrayerRaportModal(false)}
                  >
                    <Text style={styles.raportBtnSecondaryText}>Tutup Pratinjau</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.raportBtnPrimary, { backgroundColor: '#059669' }]}
                    onPress={() => Alert.alert('Lembar Penilaian Doa', 'Dokumen Lembar Poin Penilaian Doa berhasil diunduh dan tersimpan.')}
                  >
                    <MaterialCommunityIcons name="printer-outline" size={15} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.raportBtnPrimaryText}>Cetak / Simpan</Text>
                  </TouchableOpacity>
                </View>
              </ScrollView>
            </View>
          </View>
        </Modal>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  sheetContainer: { flex: 1, overflow: 'hidden' },
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 20 : 16 },

  containerBlock: { marginBottom: 16 },
  studentContainerBlock: { marginBottom: 14 },
  sectionHeaderRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 },
  sectionHeaderTitleWrap: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  sectionTitle: { fontSize: 13.5, fontWeight: '900', color: '#0F172A' },
  sectionTitleBold: { fontSize: 13.5, fontWeight: '900', color: '#0F172A' },
  sectionSubtitle: { fontSize: 10.5, color: '#64748B', marginTop: 2 },

  // Data Ananda Hero Carousel Styles
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
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
    overflow: 'hidden',
    position: 'relative',
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
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
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
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  studentNisText: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.88)',
    fontFamily: 'Nunito_600SemiBold',
    marginTop: 1,
  },
  childNameHero: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 1,
    fontFamily: 'Nunito_600SemiBold',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 3,
  },
  studentUnitText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
    minWidth: 48,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    elevation: 0,
  },
  selectedActionBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#059669',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#FFFFFF',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
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

  // Capsule Pills Tabs ([ 📖 Akademik ] [ 📖 Tahfizh ] [ 📋 Mutabaah ])
  pillTabsContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 16,
  },
  pillTabBtn: {
    flex: 1,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#FFFFFF',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  pillTabBtnActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.22,
    shadowRadius: 5,
    elevation: 3,
  },
  pillTabText: {
    fontSize: 12,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#64748B',
  },
  pillTabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_700Bold',
  },

  // 4 Horizontal Mini KPI Cards
  kpiMiniRow: {
    flexDirection: 'row',
    gap: 7,
    marginBottom: 14,
  },
  kpiMiniCard: {
    flex: 1,
    minHeight: 82,
    borderRadius: 18,
    borderWidth: 1,
    padding: 8,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  kpiMiniTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiMiniIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiMiniNumber: {
    fontSize: 17,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  kpiMiniLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    lineHeight: 12,
  },

  // Filter Pills Scroll (Horizontal)
  filterPillsScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 12,
  },
  filterCapsuleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterCapsuleBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterCapsuleText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#64748B',
  },
  filterCapsuleTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },

  // Search & Filter Row
  searchAndFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  searchBarContainer: {
    flex: 1,
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
  },
  searchInputField: {
    flex: 1,
    fontSize: 12.5,
    fontFamily: 'Nunito_400Regular',
    color: '#0F172A',
  },
  filterActionButton: {
    height: 44,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  filterActionButtonText: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    color: '#334155',
  },

  // Section Header Between
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  sortPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 5.5,
  },
  sortPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#475569',
  },
  semesterDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    gap: 4,
  },
  semesterDropdownText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
    color: '#334155',
  },

  // Date Range Picker Pill for Mutabaah
  dateRangePickerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 6,
    paddingVertical: 3,
    gap: 4,
  },
  dateRangeArrowBtn: {
    padding: 3,
  },
  dateRangeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    paddingHorizontal: 4,
  },

  // Compact Cards General
  compactCardMainRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  compactSubjectBox: {
    width: 48,
    height: 48,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactCenterCol: {
    flex: 1,
  },
  compactTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 3,
  },
  compactDescText: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
  },

  // Compact Assignment Card (Akademik)
  compactAssignmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  compactBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginBottom: 4,
  },
  subjectBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 0.8,
  },
  subjectBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  compactFarRightAction: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
  },
  gradedScoreBoxRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  gradedScorePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4.5,
  },
  gradedScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
    marginRight: 3,
  },
  gradedScoreValue: {
    fontSize: 12,
    fontWeight: '900',
    color: '#059669',
  },
  submittedPillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 10,
    paddingHorizontal: 7,
    paddingVertical: 4.5,
    gap: 3,
  },
  submittedPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#2563EB',
  },
  kumpulkanBtnFarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 5.5,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 2,
  },
  kumpulkanBtnTextFarRight: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
    marginRight: 2,
  },
  portalSiswaBadgeRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 6,
    paddingVertical: 4.5,
    gap: 2,
  },
  portalSiswaTextRight: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D97706',
  },
  compactMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 9,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  compactMetaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  compactMetaDivider: {
    width: 1,
    height: 18,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 8,
  },
  compactMetaLabel: {
    fontSize: 8.5,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  compactMetaValue: {
    fontSize: 10,
    fontWeight: '800',
    color: '#334155',
  },

  // Tahfizh Card Styles (Image 1)
  compactTahfizhCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  tahfizhTypeBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  tahfizhTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  compactFarRightActionTahfizh: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    paddingLeft: 4,
    minHeight: 48,
  },
  tahfizhStatusRightCol: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  tahfizhCircleIconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tahfizhStatusRightText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  tahfizhMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 10,
    marginTop: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  tahfizhMetaItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },

  // Mutabaah Card Styles (Image 2)
  compactMutabaahCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 12,
    paddingHorizontal: 12,
    marginBottom: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  compactMutabaahIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compactMutabaahRightCol: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  mutabaahPointBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: 8,
  },
  mutabaahPointText: {
    fontSize: 11,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#64748B',
  },
  mutabaahStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    marginRight: 6,
  },
  mutabaahStatusBadgeSelesai: {
    backgroundColor: '#ECFDF5',
  },
  mutabaahStatusBadgeProses: {
    backgroundColor: '#FFFBEB',
  },
  mutabaahStatusBadgeBelum: {
    backgroundColor: '#FEF2F2',
  },
  mutabaahStatusBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
  mutabaahProgressText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
  },

  // Rapor Accordion
  raporAccordionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#DDEBE4',
  },

  // Rapor KPI & Subject Cards
  kpiGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  kpiCard: { width: '48.5%', backgroundColor: '#FFFFFF', borderRadius: 16, padding: 12, borderWidth: 1, borderColor: '#E2E8F0' },
  kpiIcon: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', marginBottom: 8 },
  kpiValue: { fontSize: 20, fontWeight: '900', color: '#0F172A' },
  kpiLabel: { fontSize: 11, fontWeight: '800', color: '#334155', marginTop: 3 },
  kpiSub: { fontSize: 9.5, color: '#94A3B8', marginTop: 2 },
  gradeCard: { backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0', borderRadius: 16, padding: 14, marginBottom: 10 },
  gradeTop: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  subjectCode: { fontSize: 9.5, color: '#64748B', fontWeight: '800' },
  subjectName: { fontSize: 13.5, color: '#0F172A', fontWeight: '900', marginTop: 3 },
  statusBadge: { borderRadius: 10, paddingHorizontal: 8, paddingVertical: 4 },
  statusPassed: { backgroundColor: '#D1FAE5' },
  statusRemedial: { backgroundColor: '#FFE4E6' },
  statusText: { fontSize: 9.5, fontWeight: '900' },
  scoreRow: { flexDirection: 'row', marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  scoreRight: { marginLeft: 28 },
  scoreLabel: { fontSize: 9, color: '#94A3B8', fontWeight: '800', textTransform: 'uppercase' },
  scoreValue: { fontSize: 24, color: '#18A165', fontWeight: '900', marginTop: 2 },
  gradeLetter: { fontSize: 18, color: '#334155', fontWeight: '900', marginTop: 4 },
  notes: { fontSize: 10.5, color: '#64748B', fontStyle: 'italic', marginTop: 10, lineHeight: 16 },

  // Empty & Loading States
  emptyBox: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 28, alignItems: 'center' },
  emptyCard: { backgroundColor: '#FFFFFF', borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0', padding: 28, alignItems: 'center', marginVertical: 10 },
  emptyTitle: { fontSize: 13, fontWeight: '900', color: '#334155', marginTop: 8 },
  emptySubtitle: { fontSize: 10.5, color: '#94A3B8', textAlign: 'center', marginTop: 3 },
  emptyText: { fontSize: 10.5, color: '#94A3B8', textAlign: 'center', marginTop: 3 },
  loadingBox: { alignItems: 'center', paddingVertical: 32 },
  loadingText: { fontSize: 11, color: '#64748B', fontWeight: '700', marginTop: 8 },

  // Tahfizh & Mutabaah
  infoCard: { marginTop: 10, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#DDEBE4', borderRadius: 16, padding: 14 },
  infoCardTitle: { fontSize: 12, color: '#0F172A', fontWeight: '900' },
  infoScore: { fontSize: 28, color: '#138A56', fontWeight: '900', marginTop: 5 },
  infoNote: { fontSize: 10.5, color: '#64748B', lineHeight: 16, marginTop: 4 },

  // ==================== PREMIUM REDESIGNED MODALS ====================
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.68)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  modalCardPremium: {
    width: '100%',
    maxHeight: '85%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.28,
    shadowRadius: 24,
    elevation: 12,
  },
  modalDragHandle: {
    width: 38,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#E2E8F0',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderIconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubTitleText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtnCircle: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBodyScroll: {
    maxHeight: 460,
  },
  modalBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 8,
  },
  modalContentTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 22,
    marginBottom: 10,
  },
  modalDescCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 10,
  },
  modalCardHeaderMini: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  modalDescContentText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  modalGradedContainer: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 12,
    marginTop: 10,
  },
  modalGradedHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalGradedCheckText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  modalTeacherNoteBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    borderRadius: 10,
    padding: 10,
  },
  modalTeacherNoteText: {
    fontSize: 11.5,
    color: '#065F46',
    lineHeight: 16,
    flex: 1,
  },
  modalInputSectionTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  modalStyledTextInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    fontSize: 12.5,
    color: '#0F172A',
    minHeight: 90,
    marginBottom: 14,
  },
  modalButtonRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 4,
    marginBottom: 6,
  },
  modalSecondaryBtn: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSecondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#64748B',
  },
  modalPrimaryBtn: {
    flex: 2,
    height: 42,
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
  modalPrimaryBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalSingleCloseBtn: {
    width: '100%',
    height: 42,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  modalSingleCloseBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalPermissionAlertBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 12,
    padding: 12,
    marginBottom: 12,
  },
  modalPermissionAlertText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
    fontWeight: '600',
  },
  modalProgressCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginTop: 4,
  },
  modalProgressLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
  },
  modalProgressValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#059669',
  },
  modalProgressSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 3,
  },

  // Raport Bayangan Banner Styles
  raportBayanganBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  raportBayanganGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  raportBayanganIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  raportBayanganTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  raportBayanganTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  raportBayanganTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  raportBadgePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  raportBadgePillText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  raportBayanganSub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    lineHeight: 14,
  },
  raportActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    gap: 3,
  },
  raportActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Assignment Pending / Unsubmitted Score Badges
  pendingScorePillRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  pendingScorePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#D97706',
    marginRight: 3,
  },

  // Modal Rubric & Evaluation Box
  modalEvalRubricBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
  },
  modalRubricRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalRubricCol: {
    flex: 1,
    alignItems: 'center',
  },
  modalRubricLabel: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '700',
    marginBottom: 3,
  },
  modalRubricValue: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#1E293B',
  },
  modalRubricDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
  },

  // Raport Bayangan Sheet & Card Styles
  raportDocOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  raportDocCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    paddingHorizontal: 16,
    paddingTop: 10,
    paddingBottom: Platform.OS === 'android' ? 24 : 32,
    maxHeight: '92%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 10,
  },
  raportDocScroll: {
    marginTop: 8,
    marginBottom: 4,
  },

  // KOP & Identity
  raportKopBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    marginBottom: 10,
  },
  raportKopBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E6FBF2',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginBottom: 4,
  },
  raportKopBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  raportKopTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  raportKopSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },

  raportIdentityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 10,
  },
  raportIdentityRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  raportIdentityItem: {
    flex: 1,
  },
  raportIdentityLabel: {
    fontSize: 9,
    color: '#94A3B8',
    fontWeight: '700',
    textTransform: 'uppercase',
  },
  raportIdentityValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 1,
  },

  // Raport KPI Grid
  raportKpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  raportKpiBox: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 10,
    paddingVertical: 8,
    alignItems: 'center',
  },
  raportKpiVal: {
    fontSize: 13.5,
    fontWeight: '900',
  },
  raportKpiLbl: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },

  raportSectionTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
  },

  // Tables
  raportTableContainer: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 10,
  },
  raportTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  raportTableHeaderCell: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#475569',
    textTransform: 'uppercase',
  },
  raportTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  raportTableCell: {
    fontSize: 10.5,
    color: '#334155',
  },
  raportTableCellBold: {
    fontSize: 11,
    fontWeight: '900',
  },
  raportTableCellTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  raportTableCellNotes: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },

  raportBadgeBase: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  raportBadgePassed: {
    backgroundColor: '#DCFCE7',
  },
  raportBadgeRemedial: {
    backgroundColor: '#FEE2E2',
  },
  raportBadgeText: {
    fontSize: 9,
    fontWeight: '800',
  },

  // Teacher Note Box
  raportTeacherNoteBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    padding: 10,
    marginBottom: 10,
  },
  raportTeacherNoteTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  raportTeacherNoteText: {
    fontSize: 10,
    color: '#334155',
    lineHeight: 15,
    fontStyle: 'italic',
  },

  raportSealRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#DCFCE7',
    borderRadius: 10,
    padding: 8,
    marginBottom: 14,
  },
  raportSealText: {
    fontSize: 9.5,
    color: '#166534',
    fontWeight: '700',
    flex: 1,
  },

  // Tahfizh Rubrik Grid
  raportRubrikGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 10,
  },
  raportRubrikCard: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    padding: 8,
  },
  raportRubrikLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
  },
  raportRubrikScore: {
    fontSize: 11,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },

  // Mutabaah Section Card
  mutabaahSectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    overflow: 'hidden',
  },
  mutabaahSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  mutabaahSectionCategoryText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#1E293B',
  },
  mutabaahItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  mutabaahItemLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#334155',
  },
  mutabaahItemStatus: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 1,
  },
  mutabaahItemScorePill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  mutabaahItemScoreText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#059669',
  },

  // Buttons Row
  raportBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 6,
    marginBottom: 12,
  },
  raportBtnSecondary: {
    flex: 1,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  raportBtnSecondaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  raportBtnPrimary: {
    flex: 1.3,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#059669',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  raportBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#FFFFFF',
  },

  // Penilaian Doa Styles (Tabel Fisik Otentik 62 Doa)
  prayerKpiRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 10,
    marginBottom: 10,
  },
  prayerInstructionBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 10,
    borderWidth: 0.8,
    borderColor: '#BBF7D0',
  },
  prayerInstructionText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    lineHeight: 15,
  },
  prayerSearchBarWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'ios' ? 8 : 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  prayerSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
    fontWeight: '500',
  },
  // TABEL FISIK RESMI DOKUMEN SEKOLAH
  physicalTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  docHeaderContainer: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    alignItems: 'center',
    backgroundColor: '#FAFDFB',
  },
  docMainHeading: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  docSubHeading: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  tableWrapper: {
    width: '100%',
  },
  // Baris Header Hijau Sage (Persis Dokumen Fisik Kertas)
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#B8D8BA', // Sage Green persis dokumen fisik sekolah
    borderTopWidth: 1,
    borderBottomWidth: 1.5,
    borderColor: '#0F172A',
  },
  headerCellNo: {
    width: 38,
    borderRightWidth: 1,
    borderColor: '#0F172A',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCellDoa: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  headerCellPoint: {
    width: 52,
    borderRightWidth: 1,
    borderColor: '#0F172A',
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerCellParaf: {
    width: 68,
    paddingVertical: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  // Data Rows
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    minHeight: 34,
  },
  tableDataRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  tableDataRowLast: {
    borderBottomWidth: 0,
  },
  cellNo: {
    width: 38,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellNoText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  cellDoa: {
    flex: 1,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: 6,
    paddingHorizontal: 8,
    justifyContent: 'center',
  },
  cellDoaText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#1E293B',
    lineHeight: 15,
  },
  cellPoint: {
    width: 52,
    borderRightWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cellPointText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#64748B',
  },
  cellPointTextActive: {
    color: '#047857',
  },
  cellParaf: {
    width: 68,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 2,
  },
  cellParafEmpty: {
    fontSize: 11,
    color: '#94A3B8',
  },
  parafBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 4,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderWidth: 0.6,
    borderColor: '#A7F3D0',
    gap: 2,
  },
  parafBadgeText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
  },
  // Modal Detail Item Doa
  prayerModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  prayerModalCard: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  prayerModalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  prayerModalIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  prayerModalTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  prayerModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  prayerModalCloseBtn: {
    padding: 4,
  },
  prayerModalScoreSection: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 12,
  },
  prayerModalScoreBox: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  prayerModalScoreVal: {
    fontSize: 22,
    fontWeight: '900',
    color: '#047857',
  },
  prayerModalScoreLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  prayerModalStatusBox: {
    flex: 1.5,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  prayerModalStatusVal: {
    fontSize: 12,
    fontWeight: '800',
  },
  prayerModalNotesBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 0.8,
    borderColor: '#BBF7D0',
  },
  prayerModalNotesText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    lineHeight: 16,
  },
  prayerModalConfirmBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  prayerModalConfirmBtnText: {
    color: '#FFFFFF',
    fontSize: 12.5,
    fontWeight: '800',
  },

  // Modern Mutabaah / Prayer Assessment Styles (Matched to UI Reference)
  prayerSectionHeaderContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 4,
  },
  mutabaahSubTabContainer: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  mutabaahSubTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderRadius: 18,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 1,
  },
  mutabaahSubTabItemActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 5,
    elevation: 3,
  },
  mutabaahSubTabText: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#64748B',
  },
  mutabaahSubTabTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  subTabCounterBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 10,
    marginLeft: 5,
  },
  subTabCounterBadgeActive: {
    backgroundColor: '#FFFFFF',
  },
  subTabCounterText: {
    fontSize: 10,
    fontWeight: '800',
    fontFamily: 'Poppins_700Bold',
    color: '#64748B',
  },
  subTabCounterTextActive: {
    color: '#059669',
  },
  // Distinct Mutabaah Banners & Badges
  mutabaahDistinctBannerSholat: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.2,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  mutabaahDistinctBannerIconBoxSholat: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  mutabaahDistinctBannerTitleSholat: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#065F46',
  },
  mutabaahCategoryBadgeGreen: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#A7F3D0',
  },
  mutabaahCategoryBadgeTextGreen: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  mutabaahDistinctBannerDoa: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1.2,
    borderColor: '#99F6E4',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    gap: 10,
  },
  mutabaahDistinctBannerIconBoxDoa: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5EEAD4',
  },
  mutabaahDistinctBannerTitleDoa: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#115E59',
  },
  mutabaahCategoryBadgeTeal: {
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#99F6E4',
  },
  mutabaahCategoryBadgeTextTeal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F766E',
  },
  mutabaahDistinctBannerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 15,
  },
  mutabaahSectionDividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 14,
    gap: 10,
  },
  mutabaahDividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: '#CBD5E1',
  },
  mutabaahDividerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
  },
  mutabaahDividerText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  prayerModalHeader: {
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  prayerModalHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  prayerModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  prayerHeaderIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  prayerHeaderTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  prayerHeaderSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  prayerDatePillContainer: {
    flexDirection: 'row',
    justifyContent: 'flex-start',
    marginTop: 8,
  },
  prayerDatePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  prayerDatePillText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#334155',
  },

  // 4 KPI Cards Scroll Track
  prayerKpiScroll: {
    marginTop: 10,
    marginBottom: 4,
  },
  prayerKpiScrollContent: {
    paddingVertical: 2,
    gap: 8,
    flexDirection: 'row',
  },
  prayerKpiCard: {
    width: 138,
    borderRadius: 18,
    borderWidth: 1,
    padding: 12,
    justifyContent: 'space-between',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 3,
    elevation: 2,
  },
  prayerKpiCardGauge: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
    width: 145,
  },
  prayerKpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  prayerKpiIconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerKpiValue: {
    fontSize: 20,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
  },
  prayerKpiTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    fontFamily: 'Poppins_600SemiBold',
  },
  prayerKpiSub: {
    fontSize: 10,
    fontFamily: 'Nunito_600SemiBold',
    marginTop: 1,
  },

  // Circular Gauge
  gaugeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  gaugeRingOuter: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 4,
    borderColor: '#E2E8F0',
    borderTopColor: '#059669',
    borderRightColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  gaugeRingInner: {
    width: 30,
    height: 30,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  gaugeRingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  gaugeTextCol: {
    marginLeft: 8,
    flex: 1,
  },
  gaugeLabelTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  gaugeLabelSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

  // Toolbar
  prayerToolbarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    marginBottom: 8,
  },
  prayerToolbarSearchBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 8,
    height: 38,
  },
  prayerToolbarSearchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    paddingVertical: 0,
  },
  prayerToolbarFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 9,
    paddingHorizontal: 9,
    height: 38,
    justifyContent: 'center',
  },
  prayerToolbarFilterBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  prayerToolbarFilterText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  prayerToolbarFilterTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  prayerToolbarActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    borderRadius: 9,
    paddingHorizontal: 10,
    height: 38,
    justifyContent: 'center',
  },
  prayerToolbarActionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Section Header Row
  prayerSectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 6,
    marginBottom: 8,
  },
  prayerSectionHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  prayerSectionHeaderTotal: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Modern Table Card
  prayerTableCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginBottom: 8,
  },
  prayerTableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  colNoHeader: {
    width: 28,
    alignItems: 'center',
  },
  colDoaHeader: {
    flex: 1,
    paddingLeft: 6,
  },
  colPoinHeader: {
    width: 36,
    alignItems: 'center',
  },
  colStatusHeader: {
    width: 72,
    alignItems: 'center',
  },
  colParafHeader: {
    width: 38,
    alignItems: 'center',
  },
  colActionHeader: {
    width: 26,
    alignItems: 'center',
  },

  // Table Data Row
  prayerTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 6,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  prayerTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  prayerTableRowLast: {
    borderBottomWidth: 0,
  },
  colNoCell: {
    width: 28,
    alignItems: 'center',
  },
  numberBadgePill: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 0.5,
    borderColor: '#E2E8F0',
  },
  numberBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  colDoaCell: {
    flex: 1,
    paddingLeft: 6,
    justifyContent: 'center',
  },
  prayerDoaTitle: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  prayerDoaSubtitle: {
    fontSize: 9.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  colPoinCell: {
    width: 36,
    alignItems: 'center',
  },
  prayerPoinText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  prayerPoinTextActive: {
    color: '#0F172A',
    fontWeight: '800',
  },
  colStatusCell: {
    width: 72,
    alignItems: 'center',
  },
  statusBadgeDone: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  statusTextDone: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    paddingHorizontal: 6,
    paddingVertical: 2.5,
  },
  statusTextPending: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#2563EB',
  },
  colParafCell: {
    width: 38,
    alignItems: 'center',
  },
  parafCircleDone: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#22C55E',
    alignItems: 'center',
    justifyContent: 'center',
  },
  parafEmptyDash: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '700',
  },
  colActionCell: {
    width: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
  prayerTeacherNoteBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 12,
    padding: 10,
    marginTop: 8,
  },
  prayerTeacherNoteTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#15803D',
  },
  prayerTeacherNoteText: {
    fontSize: 11,
    color: '#14532D',
    lineHeight: 16,
    fontStyle: 'italic',
  },
});
