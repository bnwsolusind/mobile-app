import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { getProfileImageUrl, resolveMediaUrl, DEFAULT_STUDENT_BOY_AVATAR, DEFAULT_PARENT_AVATAR } from '../utils/profile';
import { isPrincipalRole } from '../utils/roles';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type SubjectType = 'siswa' | 'pegawai';
type PeriodType = 'daily' | 'weekly' | 'monthly' | 'semester' | 'yearly';
type ScopeType = 'class' | 'student';
type StaffCategoryType = 'all' | 'guru' | 'wali_kelas' | 'tu_staf' | 'musyrif';

// ── Dropdown Master Options dengan Skema Warna Harmonis & Ikon TailGrids ──
export const PERIOD_OPTIONS = [
  { key: 'daily' as PeriodType, label: 'Harian', icon: 'calendar-today', color: '#059669', bg: '#ECFDF5', badge: 'Presensi Harian' },
  { key: 'weekly' as PeriodType, label: 'Mingguan', icon: 'calendar-week', color: '#0284C7', bg: '#F0F9FF', badge: '7 Hari Terakhir' },
  { key: 'monthly' as PeriodType, label: 'Bulanan', icon: 'calendar-month', color: '#7C3AED', bg: '#FAF5FF', badge: 'Kalender Bulanan' },
  { key: 'semester' as PeriodType, label: 'Semester', icon: 'book-open-page-variant', color: '#D97706', bg: '#FFFBEB', badge: 'Rapor Semester' },
  { key: 'yearly' as PeriodType, label: 'Tahunan', icon: 'calendar-range', color: '#E11D48', bg: '#FFF1F2', badge: 'TA Penuh' },
] as const;

export const STATUS_OPTIONS = [
  { key: 'all', label: 'Semua Status Kehadiran', icon: 'check-all', color: '#0D9488', bg: '#F0FDFA', desc: 'Seluruh rekapitulasi data kehadiran' },
  { key: 'present', label: 'Hadir (Tepat Waktu)', icon: 'check-circle-outline', color: '#059669', bg: '#ECFDF5', desc: 'Kehadiran tepat waktu di sekolah' },
  { key: 'dinas_luar', label: 'Dinas Luar (Tugas)', icon: 'briefcase-check-outline', color: '#0891B2', bg: '#ECFEFF', desc: 'Penugasan kedinasan resmi yayasan/sekolah' },
  { key: 'late', label: 'Terlambat (Datang Siang)', icon: 'clock-alert-outline', color: '#D97706', bg: '#FFFBEB', desc: 'Melewati batas jam masuk yang ditentukan' },
  { key: 'sick', label: 'Sakit (Dispensasi Medis)', icon: 'medical-bag', color: '#7C3AED', bg: '#FAF5FF', desc: 'Surat keterangan dokter / sakit' },
  { key: 'permit', label: 'Izin / Cuti Resmi', icon: 'file-document-edit-outline', color: '#2563EB', bg: '#EFF6FF', desc: 'Dispensasi berhalangan dengan pemberitahuan' },
  { key: 'absent', label: 'Alpa (Tanpa Keterangan)', icon: 'close-circle-outline', color: '#E11D48', bg: '#FFF1F2', desc: 'Tidak hadir tanpa kabar/surat' },
] as const;

export const STAFF_CATEGORY_OPTIONS = [
  { key: 'all' as StaffCategoryType, label: 'Semua Pegawai & Tenaga PTK', icon: 'account-group-outline', color: '#059669', bg: '#ECFDF5', desc: 'Seluruh tenaga pendidik dan kependidikan' },
  { key: 'guru' as StaffCategoryType, label: 'Guru Pengajar / Pendidik', icon: 'school-outline', color: '#0284C7', bg: '#F0F9FF', desc: 'Guru mata pelajaran dan guru kelas' },
  { key: 'wali_kelas' as StaffCategoryType, label: 'Wali Kelas', icon: 'account-tie-outline', color: '#7C3AED', bg: '#FAF5FF', desc: 'Penanggung jawab rombongan belajar' },
  { key: 'tu_staf' as StaffCategoryType, label: 'Tata Usaha & Staf Admin', icon: 'office-building-outline', color: '#D97706', bg: '#FFFBEB', desc: 'Staf administrasi, TU, operator & keuangan' },
  { key: 'musyrif' as StaffCategoryType, label: 'Musyrif / Pembina Asrama', icon: 'home-account', color: '#E11D48', bg: '#FFF1F2', desc: 'Pengasuh dan pembina asrama ponpes' },
] as const;

export const MONTH_NAMES_ID = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'
];

export default function StudentAttendanceReportScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const user = useAuthStore((state) => state.user);
  const isPrincipal = isPrincipalRole(user?.roles || []);

  // ── Strict Principal Education Unit Resolution ──
  const principalUnitId = useMemo(() => {
    return (
      user?.unit_id ||
      user?.scope?.unit_id ||
      (user?.metadata as any)?.education_unit_id ||
      (user?.metadata as any)?.education_unit?.id ||
      (user as any)?.unit?.id ||
      (user as any)?.unit_id ||
      null
    );
  }, [user]);

  // ── 1. Subject State & Route Identification (Membedakan Presensi Guru vs Siswa) ──
  const routeName = String(route?.name || '');
  const isGuruRoute =
    routeName === 'RekapPresensiGuru' ||
    routeName === 'PresensiGuru' ||
    route?.params?.defaultSubject === 'pegawai' ||
    route?.params?.lockedSubject === 'pegawai';

  const isSiswaRoute =
    routeName === 'RekapPresensiSiswa' ||
    routeName === 'PresensiSiswa' ||
    route?.params?.defaultSubject === 'siswa' ||
    route?.params?.lockedSubject === 'siswa';

  const isLockedSubject =
    route?.params?.lockedSubject === 'pegawai' ||
    route?.params?.lockedSubject === 'siswa' ||
    routeName === 'RekapPresensiGuru' ||
    routeName === 'PresensiGuru';

  const [activeSubject, setActiveSubject] = useState<SubjectType>(
    isGuruRoute ? 'pegawai' : 'siswa'
  );

  useEffect(() => {
    if (
      route?.name === 'RekapPresensiGuru' ||
      route?.name === 'PresensiGuru' ||
      route?.params?.defaultSubject === 'pegawai' ||
      route?.params?.lockedSubject === 'pegawai'
    ) {
      setActiveSubject('pegawai');
    } else if (
      route?.name === 'RekapPresensiSiswa' ||
      route?.name === 'PresensiSiswa' ||
      route?.params?.defaultSubject === 'siswa' ||
      route?.params?.lockedSubject === 'siswa'
    ) {
      setActiveSubject('siswa');
    }
  }, [route?.name, route?.params?.defaultSubject, route?.params?.lockedSubject]);

  // ── 2. Filter States ──
  const [selectedPeriod, setSelectedPeriod] = useState<PeriodType>('daily');
  const [selectedScope, setSelectedScope] = useState<ScopeType>('class');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [selectedMonth, setSelectedMonth] = useState<number>(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedSemester, setSelectedSemester] = useState<'ganjil' | 'genap'>('ganjil');

  // Unit & Class States (Terkunci Ketat ke Unit Kepala Sekolah)
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>(principalUnitId ? String(principalUnitId) : 'all');
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [showClassDropdown, setShowClassDropdown] = useState<boolean>(false);
  const [classSearchQuery, setClassSearchQuery] = useState<string>('');

  // Individual Student States
  const [studentsList, setStudentsList] = useState<any[]>([]);
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [studentSearchQuery, setStudentSearchQuery] = useState<string>('');
  const [showStudentPickerModal, setShowStudentPickerModal] = useState<boolean>(false);

  // Guru & Pegawai States
  const [employeesList, setEmployeesList] = useState<any[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);
  const [selectedStaffCategory, setSelectedStaffCategory] = useState<StaffCategoryType>('all');
  const [employeeSearchQuery, setEmployeeSearchQuery] = useState<string>('');
  const [showEmployeePickerModal, setShowEmployeePickerModal] = useState<boolean>(false);

  // Dropdown Modal Visibility States (Status, Periode, & Kategori PTK)
  const [showPeriodDropdown, setShowPeriodDropdown] = useState<boolean>(false);
  const [showStatusDropdown, setShowStatusDropdown] = useState<boolean>(false);
  const [showStaffCategoryDropdown, setShowStaffCategoryDropdown] = useState<boolean>(false);

  // Status Filter State
  const [statusFilter, setStatusFilter] = useState<string>('all');

  // Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [attendanceRecords, setAttendanceRecords] = useState<any[]>([]);
  const [attendanceStats, setAttendanceStats] = useState<any>(null);

  // Modals & Print Range States
  const [showPrintModal, setShowPrintModal] = useState<boolean>(false);
  const [printRekapRange, setPrintRekapRange] = useState<PeriodType>('daily');
  const [individualPrintTarget, setIndividualPrintTarget] = useState<{
    person: any;
    type: 'pegawai' | 'siswa';
  } | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Unit Active Name Helper (Prioritas Utama: Unit Kepala Sekolah)
  const currentUnitName = useMemo(() => {
    if (isPrincipal && principalUnitId) {
      const found = units.find((u) => String(u.id) === String(principalUnitId));
      if (found) return found.name || found.nama || 'Unit Madrasah';
    }
    if (selectedUnitId !== 'all') {
      const found = units.find((u) => String(u.id) === String(selectedUnitId));
      if (found) return found.name || found.nama || 'Unit Terpilih';
    }
    const userUnitName =
      (user?.metadata as any)?.education_unit?.name ||
      (user?.metadata as any)?.unit_name ||
      (user?.metadata as any)?.unit ||
      (user as any)?.unit?.name ||
      (user?.scope as any)?.unit_name;
    if (userUnitName) return userUnitName;
    return units.length > 0 ? units[0].name || units[0].nama : 'Unit Sekolah';
  }, [isPrincipal, principalUnitId, selectedUnitId, units, user]);
  // Branding & Kop Surat Logo Helper (Resolusi Logo Yayasan & Logo Unit Madrasah)
  const mobileConfig = useMobileConfigStore((s) => s.config);
  const branding = mobileConfig?.branding;
  const resolvedYayasanLogo = useMemo(() => {
    const raw = branding?.logo_header_url || branding?.logo_url || branding?.fallback_logo_url;
    return raw ? resolveMediaUrl(raw) : null;
  }, [branding]);

  const resolvedUnitLogo = useMemo(() => {
    const effectiveUId = isPrincipal && principalUnitId ? String(principalUnitId) : selectedUnitId;
    const matched = units.find((u) => String(u.id) === String(effectiveUId));
    const raw = matched?.logo_url || (user as any)?.unit?.logo_url || (user?.metadata as any)?.education_unit?.logo_url;
    return raw ? resolveMediaUrl(raw) : null;
  }, [isPrincipal, principalUnitId, selectedUnitId, units, user]);
  // Active Dropdown Meta Objects
  const activePeriodMeta = useMemo(() => {
    return PERIOD_OPTIONS.find((p) => p.key === selectedPeriod) || PERIOD_OPTIONS[0];
  }, [selectedPeriod]);

  const activeStatusMeta = useMemo(() => {
    const found = STATUS_OPTIONS.find((s) => s.key === statusFilter);
    if (found && activeSubject === 'siswa' && found.key === 'permit') {
      return { ...found, label: 'Izin (Ada Pemberitahuan)' };
    }
    return found || STATUS_OPTIONS[0];
  }, [statusFilter, activeSubject]);

  const activeStaffCategoryMeta = useMemo(() => {
    return STAFF_CATEGORY_OPTIONS.find((c) => c.key === selectedStaffCategory) || STAFF_CATEGORY_OPTIONS[0];
  }, [selectedStaffCategory]);

  // ── 1. Fetch Units, Classes, Students, and Employees (Terisolasi Ketat ke Unit Kepala Sekolah) ──
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        if (isPrincipal && principalUnitId) {
          setSelectedUnitId(String(principalUnitId));
        }

        const effectiveUnitId = isPrincipal && principalUnitId ? String(principalUnitId) : undefined;

        const [unitRes, classRes, studentRes, employeeRes] = await Promise.allSettled([
          mobileApiService.getEducationUnits?.() ?? Promise.resolve([]),
          effectiveUnitId
            ? (mobileApiService.getClasses?.({ unit_id: effectiveUnitId }) ?? Promise.resolve([]))
            : (mobileApiService.getTeacherClasses?.() ?? Promise.resolve([])),
          effectiveUnitId
            ? (mobileApiService.getStudents?.({ unit_id: effectiveUnitId, per_page: 200 }) ?? Promise.resolve([]))
            : (mobileApiService.getTeacherStudents?.({ per_page: 200 }) ?? Promise.resolve([])),
          mobileApiService.getEmployees?.({
            unit_id: effectiveUnitId,
            exclude_restricted_roles: true,
            per_page: 250,
          }) ?? Promise.resolve([]),
        ]);

        if (!isMounted) return;

        if (unitRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(unitRes.value) || [];
          setUnits(Array.isArray(raw) ? raw : []);
        }

        if (classRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(classRes.value) || [];
          const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
          setClasses(Array.isArray(list) ? list : []);
        }

        if (studentRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(studentRes.value) || [];
          const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
          setStudentsList(Array.isArray(list) ? list : []);
        }

        if (employeeRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(employeeRes.value) || [];
          let list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
          // Filter ketat sisi klien: HANYA pegawai & guru yang berada di unit sekolah aktif!
          // Tolak mutlak Pengurus Yayasan dan Divisi Pendidikan
          const pUnitStr = isPrincipal && principalUnitId ? String(principalUnitId) : null;
          list = list.filter((emp: any) => {
            const pos = String(emp?.position || emp?.jabatan || emp?.role || '').toLowerCase();
            const satKerja = String(emp?.satuan_kerja || emp?.level_label || '').toLowerCase();

            // Tolak Pengurus Yayasan & Divisi Pendidikan
            if (
              satKerja.includes('pengurus') ||
              satKerja.includes('yayasan') ||
              satKerja.includes('bidang pendidikan') ||
              satKerja.includes('divisi pendidikan') ||
              pos.includes('yayasan') ||
              pos.includes('pengurus') ||
              pos.includes('divisi pendidikan') ||
              pos.includes('bidang pendidikan') ||
              pos.includes('kepala bidang')
            ) {
              return false;
            }

            const uId = emp?.unit_id || emp?.education_unit_id || emp?.unit_pendidikan_id;
            if (pUnitStr) {
              return Boolean(uId) && String(uId) === pUnitStr;
            }
            return Boolean(uId);
          });
          setEmployeesList(Array.isArray(list) ? list : []);
        }
      } catch (err) {
        console.warn('[StudentAttendanceReport] Initial filter fetch error:', err);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, [isPrincipal, principalUnitId, user]);

  // ── 2. Fetch Attendance Report based on filters & activeSubject ──
  const fetchReportData = useCallback(async () => {
    setLoading(true);
    try {
      const params: Record<string, any> = {
        tipe_presensi: activeSubject === 'siswa' ? 'Siswa' : 'Pegawai',
        period: selectedPeriod,
        per_page: activeSubject === 'pegawai' ? 250 : 100,
      };

      if (selectedPeriod === 'daily') {
        params.date = selectedDate;
        params.attendance_date = selectedDate;
        params.start_date = selectedDate;
        params.end_date = selectedDate;
      } else if (selectedPeriod === 'weekly') {
        const cur = new Date(selectedDate);
        const day = cur.getDay(); // 0 is Sun
        const diff = cur.getDate() - day + (day === 0 ? -6 : 1);
        const mon = new Date(cur.setDate(diff));
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        params.start_date = mon.toISOString().slice(0, 10);
        params.end_date = sun.toISOString().slice(0, 10);
      } else if (selectedPeriod === 'monthly') {
        params.month = selectedMonth;
        params.year = selectedYear;
        const lastDay = new Date(selectedYear, selectedMonth, 0).getDate();
        const mStr = String(selectedMonth).padStart(2, '0');
        params.start_date = `${selectedYear}-${mStr}-01`;
        params.end_date = `${selectedYear}-${mStr}-${String(lastDay).padStart(2, '0')}`;
      } else if (selectedPeriod === 'semester') {
        params.semester = selectedSemester;
        if (selectedSemester === 'ganjil') {
          params.start_date = `${selectedYear}-07-01`;
          params.end_date = `${selectedYear}-12-31`;
        } else {
          params.start_date = `${selectedYear + 1}-01-01`;
          params.end_date = `${selectedYear + 1}-06-30`;
        }
      } else if (selectedPeriod === 'yearly') {
        params.year = selectedYear;
        params.start_date = `${selectedYear}-07-01`;
        params.end_date = `${selectedYear + 1}-06-30`;
      }

      const effectiveUnitId = isPrincipal && principalUnitId ? String(principalUnitId) : selectedUnitId;
      if (effectiveUnitId && effectiveUnitId !== 'all') {
        params.unit_pendidikan_id = effectiveUnitId;
        params.unit_id = effectiveUnitId;
      }

      if (activeSubject === 'siswa') {
        if (selectedScope === 'class' && selectedClassId && selectedClassId !== 'all') {
          params.class_id = selectedClassId;
          params.kelas_id = selectedClassId;
        } else if (selectedScope === 'student' && selectedStudent?.id) {
          params.student_id = selectedStudent.id;
        }
      } else {
        // Mode Pegawai / Guru
        if (selectedStaffCategory !== 'all') {
          params.staff_category = selectedStaffCategory;
          params.kategori_staf = selectedStaffCategory;
        }
        if (selectedEmployee?.id) {
          params.employee_id = selectedEmployee.id;
        }
      }

      const [reportRes, statsRes] = await Promise.allSettled([
        mobileApiService.getAttendanceReport(params),
        mobileApiService.getAttendanceStats(params),
      ]);

      if (reportRes.status === 'fulfilled') {
        const raw = reportRes.value;
        const list = Array.isArray(raw?.records)
          ? raw.records
          : Array.isArray(raw?.data)
            ? raw.data
            : Array.isArray(raw?.data?.data)
              ? raw.data.data
              : [];
        setAttendanceRecords(list);
      } else {
        setAttendanceRecords([]);
        const errorReason = (reportRes as PromiseRejectedResult).reason;
        const errMsg = getApiErrorMessage(errorReason, 'Gagal memuat rekapitulasi data presensi dari server.');
        setFeedbackModal({
          visible: true,
          type: 'error',
          title: 'Gagal Memuat Laporan Hadir',
          message: errMsg,
        });
      }

      if (statsRes.status === 'fulfilled') {
        const stats = statsRes.value?.data || statsRes.value || null;
        setAttendanceStats(stats);
      } else {
        setAttendanceStats(null);
      }
    } catch (err) {
      console.warn('[StudentAttendanceReport] fetchReportData error:', err);
      const errMsg = getApiErrorMessage(err, 'Terjadi kendala jaringan saat memuat laporan kehadiran.');
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Koneksi Terganggu',
        message: errMsg,
      });
      setAttendanceRecords([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [
    activeSubject,
    selectedPeriod,
    selectedDate,
    selectedMonth,
    selectedYear,
    selectedSemester,
    selectedUnitId,
    selectedScope,
    selectedClassId,
    selectedStudent,
    selectedEmployee,
    selectedStaffCategory,
  ]);

  useEffect(() => {
    void fetchReportData();
  }, [fetchReportData]);

  const onRefresh = () => {
    setRefreshing(true);
    void fetchReportData();
  };

  // ── 3. Pagination State (Tampilkan 10 data per halaman \u0026 bisa scroll) ──
  const [currentPage, setCurrentPage] = useState<number>(1);
  const PAGE_SIZE = 10;

  // ── 4. In-App Internal Chat Helper (Ganti WhatsApp ke Chat Internal Aplikasi) ──
  const handleOpenInAppChat = (person: any, item: any) => {
    const isSiswaMode = activeSubject === 'siswa';
    const personName =
      person?.nama_lengkap ||
      person?.full_name ||
      person?.name ||
      (isSiswaMode ? 'Santri' : 'Pegawai');

    const personId = person?.id || item?.student_id || item?.employee_id || item?.id;
    const targetUserId = person?.user_id || person?.userId || person?.user?.id || item?.user_id;
    const subLabel = isSiswaMode
      ? item?.school_class?.name || item?.schoolClass?.name || person?.kelas?.nama_kelas || item?.kelas_name || 'Rombel'
      : person?.position || person?.jabatan || item?.position || 'Tenaga Pendidik / Staf';

    const chatPayload = {
      targetUserId: targetUserId ? String(targetUserId) : undefined,
      teacherId: !isSiswaMode ? String(personId || '') : undefined,
      employeeId: !isSiswaMode ? String(personId || '') : undefined,
      studentId: isSiswaMode ? String(personId || '') : undefined,
      teacherName: !isSiswaMode ? personName : undefined,
      employeeName: !isSiswaMode ? personName : undefined,
      studentName: isSiswaMode ? personName : undefined,
      userRole: isSiswaMode ? 'Santri' : subLabel,
      title: personName,
    };

    try {
      if (navigation?.navigate) {
        navigation.navigate('Chat', chatPayload);
        return;
      }
    } catch {
      try {
        if (navigation?.navigate) {
          navigation.navigate('Chat Guru', chatPayload);
          return;
        }
      } catch {}
    }

    setFeedbackModal({
      visible: true,
      type: 'info',
      title: 'Ruang Chat Internal',
      message: `Menghubungkan ke ruang chat aplikasi SIMS dengan ${personName}.`,
    });
  };

  // WhatsApp fallback bila diperlukan untuk kontak darurat
  const handleOpenWhatsApp = (phone?: string | number, name?: string) => {
    if (!phone) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Nomor Kontak Tidak Tersedia',
        message: `Nomor kontak untuk ${name || 'pengguna ini'} belum tercatat di data sistem sekolah.`,
      });
      return;
    }
    let cleaned = String(phone).replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.slice(1);
    const url = `whatsapp://send?phone=${cleaned}`;

    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(`https://wa.me/${cleaned}`);
        }
      })
      .catch(() => {
        setFeedbackModal({
          visible: true,
          type: 'error',
          title: 'Gagal Membuka WhatsApp',
          message: 'Pastikan aplikasi WhatsApp telah terpasang pada perangkat Anda.',
        });
      });
  };

  // ── 4. Records matching Category & Search (tanpa status filter, Terisolasi Unit Kepala Sekolah) ──
  const baseCategoryRecords = useMemo(() => {
    return attendanceRecords.filter((item) => {
      // 0. Strict Principal Unit Scoping & Filter Exclude Yayasan / Divisi Pendidikan
      if (activeSubject === 'pegawai') {
        const emp = item.employee || item;
        const pos = String(emp?.position || emp?.jabatan || item.position || '').toLowerCase();
        const satKerja = String(emp?.satuan_kerja || emp?.level_label || '').toLowerCase();
        if (
          satKerja.includes('pengurus') ||
          satKerja.includes('yayasan') ||
          satKerja.includes('bidang pendidikan') ||
          satKerja.includes('divisi pendidikan') ||
          pos.includes('yayasan') ||
          pos.includes('pengurus') ||
          pos.includes('divisi pendidikan') ||
          pos.includes('bidang pendidikan') ||
          pos.includes('kepala bidang')
        ) {
          return false;
        }

        if (isPrincipal && principalUnitId) {
          const pUnitStr = String(principalUnitId);
          const itemUnit =
            item.unit_pendidikan_id ||
            item.unit_id ||
            emp?.unit_id ||
            emp?.education_unit_id ||
            emp?.unit_pendidikan_id ||
            null;
          if (!itemUnit || String(itemUnit) !== pUnitStr) {
            return false;
          }
        }

        // Filter individual employee jika dipilih
        if (selectedEmployee?.id) {
          const itemEmpId = item.employee_id || emp?.id || item.id || item.user_id;
          if (String(itemEmpId) !== String(selectedEmployee.id)) {
            return false;
          }
        }
      } else {
        // Mode Siswa
        if (selectedScope === 'student' && selectedStudent?.id) {
          const itemStudId = item.student_id || item.student?.id || item.id;
          if (String(itemStudId) !== String(selectedStudent.id)) {
            return false;
          }
        }
      }

      // 1. Text Search Filter
      if (activeSubject === 'siswa') {
        const studentName = String(item.student?.nama_lengkap || item.student_name || item.name || '').toLowerCase();
        const nis = String(item.student?.nis || item.nis || '').toLowerCase();
        const matchesSearch =
          !studentSearchQuery ||
          studentName.includes(studentSearchQuery.toLowerCase()) ||
          nis.includes(studentSearchQuery.toLowerCase());
        if (!matchesSearch) return false;
      } else {
        // Pegawai search
        const empName = String(
          item.employee?.full_name ||
          item.employee?.nama_lengkap ||
          item.employee?.name ||
          item.name ||
          ''
        ).toLowerCase();
        const nip = String(item.employee?.nip || item.employee?.nik || item.nip || '').toLowerCase();
        const position = String(
          item.employee?.position ||
          item.employee?.jabatan ||
          item.position ||
          ''
        ).toLowerCase();

        const matchesSearch =
          !employeeSearchQuery ||
          empName.includes(employeeSearchQuery.toLowerCase()) ||
          nip.includes(employeeSearchQuery.toLowerCase()) ||
          position.includes(employeeSearchQuery.toLowerCase());
        if (!matchesSearch) return false;

        // Staff Category Filter
        if (selectedStaffCategory !== 'all') {
          if (selectedStaffCategory === 'guru') {
            if (!position.includes('guru') && !position.includes('pengajar') && !position.includes('pendidik')) return false;
          } else if (selectedStaffCategory === 'wali_kelas') {
            if (!position.includes('wali')) return false;
          } else if (selectedStaffCategory === 'tu_staf') {
            if (
              !position.includes('tu') &&
              !position.includes('tata usaha') &&
              !position.includes('staf') &&
              !position.includes('admin') &&
              !position.includes('keuangan') &&
              !position.includes('operator')
            ) {
              return false;
            }
          } else if (selectedStaffCategory === 'musyrif') {
            if (!position.includes('musyrif') && !position.includes('pembimbing') && !position.includes('asrama')) return false;
          }
        }
      }

      return true;
    });
  }, [
    attendanceRecords,
    activeSubject,
    studentSearchQuery,
    employeeSearchQuery,
    selectedStaffCategory,
    isPrincipal,
    principalUnitId,
  ]);

  // ── 5. Filtered Records based on statusFilter ──
  const filteredRecords = useMemo(() => {
    return baseCategoryRecords.filter((item) => {
      if (statusFilter === 'all') return true;
      const st = String(item.status || '').toLowerCase();
      if (statusFilter === 'present') return ['h', 'hadir'].includes(st);
      if (statusFilter === 'dinas_luar') return ['dinas_luar', 'dinas luar', 'dl'].includes(st);
      if (statusFilter === 'late') return ['t', 'terlambat'].includes(st);
      if (statusFilter === 'sick') return ['s', 'sakit'].includes(st);
      if (statusFilter === 'permit') return ['i', 'izin', 'c', 'cuti'].includes(st);
      if (statusFilter === 'absent') return ['a', 'alpa', 'alpha'].includes(st);
      return true;
    });
  }, [baseCategoryRecords, statusFilter]);

  // Reset pagination ke halaman 1 saat filter atau kriteria pencarian berubah
  useEffect(() => {
    setCurrentPage(1);
  }, [
    activeSubject,
    selectedPeriod,
    selectedDate,
    selectedMonth,
    selectedYear,
    selectedUnitId,
    selectedScope,
    selectedClassId,
    selectedStudent,
    selectedEmployee,
    selectedStaffCategory,
    statusFilter,
    studentSearchQuery,
    employeeSearchQuery,
  ]);

  // Total Halaman (Tampilkan 10 data per halaman)
  const totalPages = useMemo(() => {
    return Math.ceil(filteredRecords.length / PAGE_SIZE) || 1;
  }, [filteredRecords.length]);

  // Slice 10 data aktif untuk tampilan list yang dapat discroll
  const paginatedRecords = useMemo(() => {
    const startIdx = (currentPage - 1) * PAGE_SIZE;
    return filteredRecords.slice(startIdx, startIdx + PAGE_SIZE);
  }, [filteredRecords, currentPage]);

  // ── 6. Derived KPI Stats (Sinkron 100% dengan Kategori & Pencarian) ──
  const computedStats = useMemo(() => {
    const isFiltered =
      (activeSubject === 'siswa' && Boolean(studentSearchQuery)) ||
      (activeSubject === 'pegawai' && (Boolean(employeeSearchQuery) || selectedStaffCategory !== 'all'));

    if (!isFiltered && attendanceStats) {
      const dinasLuar = Number(attendanceStats.dinas_luar ?? 0);
      const rawTotal = Number(attendanceStats.total ?? attendanceStats.total_presensi ?? attendanceRecords.length);
      const hadir = Number(attendanceStats.hadir ?? 0);
      const terlambat = Number(attendanceStats.terlambat ?? 0);
      const izin = Number(attendanceStats.izin ?? 0);
      const sakit = Number(attendanceStats.sakit ?? 0);
      const alpa = Number(attendanceStats.alpa ?? attendanceStats.alpha ?? 0);
      const total = rawTotal > 0 ? rawTotal : hadir + dinasLuar + terlambat + izin + sakit + alpa;

      return { total, hadir, dinasLuar, terlambat, izin, sakit, alpa };
    }

    const list = baseCategoryRecords;
    const total = list.length;
    const hadir = list.filter((r) => ['h', 'hadir'].includes(String(r.status || '').toLowerCase())).length;
    const dinasLuar = list.filter((r) => ['dinas_luar', 'dinas luar', 'dl'].includes(String(r.status || '').toLowerCase())).length;
    const terlambat = list.filter((r) => ['t', 'terlambat'].includes(String(r.status || '').toLowerCase())).length;
    const izin = list.filter((r) => ['i', 'izin', 'c', 'cuti'].includes(String(r.status || '').toLowerCase())).length;
    const sakit = list.filter((r) => ['s', 'sakit'].includes(String(r.status || '').toLowerCase())).length;
    const alpa = list.filter((r) => ['a', 'alpa', 'alpha'].includes(String(r.status || '').toLowerCase())).length;

    return { total, hadir, dinasLuar, terlambat, izin, sakit, alpa };
  }, [
    attendanceStats,
    attendanceRecords,
    baseCategoryRecords,
    activeSubject,
    studentSearchQuery,
    employeeSearchQuery,
    selectedStaffCategory,
  ]);

  // ── 6. Export & Download Handler ──
  const handleDownload = () => {
    const subjectLabel = activeSubject === 'siswa' ? 'Presensi Siswa' : 'Presensi Guru & Pegawai';
    const scopeLabel =
      activeSubject === 'siswa'
        ? selectedScope === 'class'
          ? 'Per Rombel/Kelas'
          : `Santri ${selectedStudent?.nama_lengkap || 'Individual'}`
        : selectedEmployee
          ? `Pegawai ${selectedEmployee?.full_name || selectedEmployee?.name}`
          : 'Seluruh Pegawai Unit';

    const periodLabel =
      selectedPeriod === 'daily'
        ? `Tanggal ${selectedDate}`
        : selectedPeriod === 'weekly'
          ? 'Mingguan'
          : selectedPeriod === 'monthly'
            ? `Bulan ${selectedMonth}/${selectedYear}`
            : selectedPeriod === 'semester'
              ? `Semester ${selectedSemester.toUpperCase()}`
              : `Tahunan ${selectedYear}/${selectedYear + 1}`;

    setFeedbackModal({
      visible: true,
      type: 'success',
      title: 'Laporan Siap Diunduh',
      message: `Rekapitulasi ${subjectLabel} (${scopeLabel} - ${periodLabel}) berisi ${filteredRecords.length} record telah siap diekspor dalam format resmi.`,
    });
  };

  // Handler Cetak Rekap Kolektif Seluruh Unit (Reset target perorangan)
  const handleOpenPrintKolektif = (range: PeriodType) => {
    setSelectedEmployee(null);
    setSelectedStudent(null);
    setPrintRekapRange(range);
    setSelectedPeriod(range);
    setShowPrintModal(true);
  };

  const handleOpenPrintRekap = (range: PeriodType) => {
    setPrintRekapRange(range);
    setSelectedPeriod(range);
    setShowPrintModal(true);
  };

  // Handler Buka Modal Cetak Rekap Individu untuk Personil Pegawai / Santri Tertentu
  const handleOpenIndividualPrintModal = (person: any, type: 'pegawai' | 'siswa') => {
    setIndividualPrintTarget({ person, type });
  };

  // Handler Konfirmasi Pilihan Periode Rekap Individu
  const handleSelectIndividualPeriod = (range: PeriodType) => {
    if (!individualPrintTarget) return;
    const { person, type } = individualPrintTarget;
    if (type === 'pegawai') {
      setSelectedEmployee(person);
      setSelectedStudent(null);
    } else {
      setSelectedStudent(person);
      setSelectedEmployee(null);
    }
    setPrintRekapRange(range);
    setSelectedPeriod(range);
    setIndividualPrintTarget(null);
    setShowPrintModal(true);
  };

  const handlePrint = () => {
    setPrintRekapRange(selectedPeriod);
    setShowPrintModal(true);
  };

  const currentPeriodText = useMemo(() => {
    if (selectedPeriod === 'daily') {
      try {
        const d = new Date(selectedDate);
        return `Harian • ${d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}`;
      } catch {
        return `Harian • ${selectedDate}`;
      }
    }
    if (selectedPeriod === 'weekly') {
      try {
        const cur = new Date(selectedDate);
        const day = cur.getDay();
        const diffToMon = day === 0 ? -6 : 1 - day;
        const mon = new Date(cur);
        mon.setDate(cur.getDate() + diffToMon);
        const sun = new Date(mon);
        sun.setDate(mon.getDate() + 6);
        return `Mingguan • ${mon.getDate()} ${MONTH_NAMES_ID[mon.getMonth()].slice(0, 3)} - ${sun.getDate()} ${MONTH_NAMES_ID[sun.getMonth()].slice(0, 3)} ${sun.getFullYear()}`;
      } catch {
        return 'Mingguan (Pekan Berjalan)';
      }
    }
    if (selectedPeriod === 'monthly') return `Bulan ${MONTH_NAMES_ID[selectedMonth - 1] || selectedMonth} ${selectedYear}`;
    if (selectedPeriod === 'semester') return `Semester ${selectedSemester === 'ganjil' ? 'Ganjil' : 'Genap'} ${selectedYear}/${selectedYear + 1}`;
    return `Tahun ${selectedYear}`;
  }, [selectedPeriod, selectedDate, selectedMonth, selectedYear, selectedSemester]);

  // Metadata Dokumen Rekap Resmi TU (Mendukung Kolektif & Individu PTK)
  const printDocMeta = useMemo(() => {
    const isSiswa = activeSubject === 'siswa';
    const isIndividu =
      activeSubject === 'pegawai'
        ? Boolean(selectedEmployee)
        : selectedScope === 'student' && Boolean(selectedStudent);

    const cleanUnitCode = (currentUnitName || 'SMAIT')
      .replace(/[^a-zA-Z0-9]/g, '')
      .slice(0, 6)
      .toUpperCase();

    const docNo = isIndividu
      ? `048/TU-REKAP-IND/${cleanUnitCode}/${selectedYear || new Date().getFullYear()}`
      : `048/TU-REKAP/${cleanUnitCode}/${selectedYear || new Date().getFullYear()}`;

    let title = isSiswa
      ? isIndividu
        ? 'LEMBAR REKAPITULASI PRESENSI INDIVIDU SANTRI'
        : 'LEMBAR REKAPITULASI PRESENSI SANTRI & SISWA'
      : isIndividu
        ? 'LEMBAR REKAPITULASI PRESENSI INDIVIDU PTK'
        : 'LEMBAR REKAPITULASI PRESENSI GURU & PEGAWAI UNIT';

    let subtitle = isIndividu && selectedEmployee
      ? `Nama PTK: ${selectedEmployee.full_name || selectedEmployee.name} • Unit: ${currentUnitName}`
      : `Periode: ${currentPeriodText} • Unit: ${currentUnitName}`;

    if (printRekapRange === 'daily') {
      title = isSiswa
        ? isIndividu ? 'LEMBAR REKAPITULASI PRESENSI HARIAN INDIVIDU SANTRI' : 'LEMBAR REKAPITULASI PRESENSI HARIAN SANTRI'
        : isIndividu ? 'LEMBAR REKAPITULASI PRESENSI HARIAN INDIVIDU PTK' : 'LEMBAR REKAPITULASI PRESENSI HARIAN GURU & PEGAWAI';
      subtitle = isIndividu && (selectedEmployee || selectedStudent)
        ? `${isSiswa ? 'Santri' : 'PTK'}: ${(selectedEmployee || selectedStudent)?.full_name || (selectedEmployee || selectedStudent)?.nama_lengkap || (selectedEmployee || selectedStudent)?.name} • ${currentPeriodText}`
        : `${currentPeriodText} • Unit: ${currentUnitName}`;
    } else if (printRekapRange === 'weekly') {
      title = isSiswa
        ? isIndividu ? 'LEMBAR REKAPITULASI PRESENSI MINGGUAN INDIVIDU SANTRI' : 'LEMBAR REKAPITULASI PRESENSI MINGGUAN SANTRI'
        : isIndividu ? 'LEMBAR REKAPITULASI PRESENSI MINGGUAN INDIVIDU PTK' : 'LEMBAR REKAPITULASI PRESENSI MINGGUAN GURU & PEGAWAI';
      subtitle = isIndividu && (selectedEmployee || selectedStudent)
        ? `${isSiswa ? 'Santri' : 'PTK'}: ${(selectedEmployee || selectedStudent)?.full_name || (selectedEmployee || selectedStudent)?.nama_lengkap || (selectedEmployee || selectedStudent)?.name} • ${currentPeriodText}`
        : `${currentPeriodText} • Unit: ${currentUnitName}`;
    } else if (printRekapRange === 'monthly') {
      title = isSiswa
        ? isIndividu ? 'LEMBAR REKAPITULASI PRESENSI BULANAN INDIVIDU SANTRI' : 'LEMBAR REKAPITULASI PRESENSI BULANAN SANTRI'
        : isIndividu ? 'LEMBAR REKAPITULASI PRESENSI BULANAN INDIVIDU PTK' : 'LEMBAR REKAPITULASI PRESENSI BULANAN GURU & PEGAWAI';
      subtitle = isIndividu && (selectedEmployee || selectedStudent)
        ? `${isSiswa ? 'Santri' : 'PTK'}: ${(selectedEmployee || selectedStudent)?.full_name || (selectedEmployee || selectedStudent)?.nama_lengkap || (selectedEmployee || selectedStudent)?.name} • ${currentPeriodText}`
        : `${currentPeriodText} • Unit: ${currentUnitName}`;
    } else if (printRekapRange === 'semester') {
      title = isSiswa
        ? isIndividu ? 'LEMBAR EVALUASI PRESENSI SEMESTER INDIVIDU SANTRI' : 'LEMBAR EVALUASI PRESENSI SEMESTER SANTRI'
        : isIndividu ? 'LEMBAR EVALUASI PRESENSI SEMESTER INDIVIDU PTK' : 'LEMBAR EVALUASI PRESENSI SEMESTER GURU & PEGAWAI';
      subtitle = isIndividu && (selectedEmployee || selectedStudent)
        ? `${isSiswa ? 'Santri' : 'PTK'}: ${(selectedEmployee || selectedStudent)?.full_name || (selectedEmployee || selectedStudent)?.nama_lengkap || (selectedEmployee || selectedStudent)?.name} • ${currentPeriodText}`
        : `${currentPeriodText} • Unit: ${currentUnitName}`;
    } else if (printRekapRange === 'yearly') {
      title = isSiswa
        ? isIndividu ? 'LEMBAR EVALUASI PRESENSI TAHUNAN INDIVIDU SANTRI' : 'LEMBAR EVALUASI PRESENSI TAHUNAN SANTRI'
        : isIndividu ? 'LEMBAR EVALUASI PRESENSI TAHUNAN INDIVIDU PTK' : 'LEMBAR EVALUASI PRESENSI TAHUNAN GURU & PEGAWAI';
      subtitle = isIndividu && (selectedEmployee || selectedStudent)
        ? `${isSiswa ? 'Santri' : 'PTK'}: ${(selectedEmployee || selectedStudent)?.full_name || (selectedEmployee || selectedStudent)?.nama_lengkap || (selectedEmployee || selectedStudent)?.name} • ${currentPeriodText}`
        : `${currentPeriodText} • Unit: ${currentUnitName}`;
    }

    return { title, subtitle, docNo, isIndividu };
  }, [
    activeSubject,
    printRekapRange,
    currentPeriodText,
    currentUnitName,
    selectedDate,
    selectedMonth,
    selectedYear,
    selectedSemester,
    selectedEmployee,
    selectedStudent,
    selectedScope,
  ]);

  // Data Records Khusus Lembar Pratinjau Cetak TU (Individu vs Kolektif)
  const targetPersonRecords = useMemo(() => {
    if (printDocMeta.isIndividu && selectedEmployee?.id) {
      const matched = attendanceRecords.filter((r: any) => {
        const eId = r.employee_id || r.employee?.id;
        return String(eId) === String(selectedEmployee.id);
      });
      return matched.length > 0 ? matched : filteredRecords;
    }
    if (printDocMeta.isIndividu && selectedStudent?.id) {
      const matched = attendanceRecords.filter((r: any) => {
        const sId = r.student_id || r.student?.id;
        return String(sId) === String(selectedStudent.id);
      });
      return matched.length > 0 ? matched : filteredRecords;
    }
    return filteredRecords;
  }, [printDocMeta.isIndividu, selectedEmployee, selectedStudent, attendanceRecords, filteredRecords]);

  // Statistik Kehadiran Khusus Lembar Cetak (Menghitung Statistik Riil untuk Target Individu)
  const individualPrintStats = useMemo(() => {
    let hadir = 0;
    let dinasLuar = 0;
    let terlambat = 0;
    let sakit = 0;
    let izin = 0;
    let alpa = 0;

    targetPersonRecords.forEach((r: any) => {
      const st = String(r.status || '').toLowerCase();
      if (['h', 'hadir'].includes(st)) hadir++;
      else if (['dinas_luar', 'dinas luar', 'dl'].includes(st)) dinasLuar++;
      else if (['t', 'terlambat'].includes(st)) terlambat++;
      else if (['s', 'sakit'].includes(st)) sakit++;
      else if (['i', 'izin', 'c', 'cuti'].includes(st)) izin++;
      else alpa++;
    });

    const total = targetPersonRecords.length || (hadir + dinasLuar + terlambat + sakit + izin + alpa);
    return { hadir, dinasLuar, terlambat, sakit, izin, alpa, total };
  }, [targetPersonRecords]);

  const activePrintStats = printDocMeta.isIndividu ? individualPrintStats : computedStats;

  // Rekapitulasi Berkala Teragregasi per Personil (untuk Mingguan, Bulanan, Semester, Tahunan)
  const collectivePeriodicSummary = useMemo(() => {
    if (printRekapRange === 'daily') return [];

    const map = new Map<string, {
      person: any;
      name: string;
      idNum: string;
      position: string;
      hadir: number;
      dinasLuar: number;
      terlambat: number;
      izin: number;
      sakit: number;
      alpa: number;
      total: number;
      pct: number;
    }>();

    // 1. Inisialisasi dari baseCategoryRecords agar personil unit terdata lengkap
    if (activeSubject === 'pegawai') {
      baseCategoryRecords.forEach((r: any) => {
        const emp = r.employee || r;
        const empId = String(emp.id || r.employee_id || r.id);
        if (!map.has(empId)) {
          map.set(empId, {
            person: emp,
            name: emp.nama_lengkap || emp.full_name || emp.name || 'Guru & Pegawai',
            idNum: emp.nip || emp.nik || '-',
            position: emp.position || emp.jabatan || 'PTK',
            hadir: 0,
            dinasLuar: 0,
            terlambat: 0,
            izin: 0,
            sakit: 0,
            alpa: 0,
            total: 0,
            pct: 0,
          });
        }
      });
    }

    // 2. Akumulasi data log kehadiran
    attendanceRecords.forEach((r: any) => {
      const person = activeSubject === 'siswa' ? r.student || r : r.employee || r;
      const pId = String(person?.id || (activeSubject === 'siswa' ? r.student_id : r.employee_id) || r.id);

      let item = map.get(pId);
      if (!item) {
        item = {
          person,
          name: person?.nama_lengkap || person?.full_name || person?.name || (activeSubject === 'siswa' ? 'Santri' : 'Pegawai'),
          idNum: person?.nip || person?.nis || person?.nik || '-',
          position: person?.position || person?.jabatan || (activeSubject === 'siswa' ? person?.kelas?.nama_kelas || 'Santri' : 'PTK'),
          hadir: 0,
          dinasLuar: 0,
          terlambat: 0,
          izin: 0,
          sakit: 0,
          alpa: 0,
          total: 0,
          pct: 0,
        };
        map.set(pId, item);
      }

      const st = String(r.status || '').toLowerCase();
      if (['h', 'hadir', 'present'].includes(st)) {
        item.hadir++;
      } else if (['dinas_luar', 'dinas luar', 'dl'].includes(st)) {
        item.dinasLuar++;
      } else if (['t', 'terlambat', 'late'].includes(st)) {
        item.terlambat++;
      } else if (['s', 'sakit', 'sick'].includes(st)) {
        item.sakit++;
      } else if (['i', 'izin', 'c', 'cuti', 'permit'].includes(st)) {
        item.izin++;
      } else {
        item.alpa++;
      }
      item.total++;
    });

    const list = Array.from(map.values()).map((it) => {
      const pct = it.total > 0 ? Math.round(((it.hadir + it.dinasLuar) / it.total) * 100) : 0;
      return { ...it, pct };
    });

    return list.sort((a, b) => a.name.localeCompare(b.name));
  }, [printRekapRange, activeSubject, baseCategoryRecords, attendanceRecords]);

  return (
    <View style={s.container}>
      {/* ── HEADER HALAMAN DATA MASTER PRESENSI TERPADU ── */}
      <LinearGradient
        colors={['#065F46', '#059669', '#10B981']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[s.headerContainer, { paddingTop: topInset + 6 }]}
      >
        <View style={s.headerTopRow}>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => navigation?.goBack?.() || navigation?.navigate('Beranda')}
            style={s.backButton}
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={s.headerTitleWrap}>
            <View style={s.headerBadge}>
              <MaterialCommunityIcons
                name={activeSubject === 'siswa' ? 'school-outline' : 'account-tie-outline'}
                size={12}
                color="#D1FAE5"
              />
              <Text style={s.headerBadgeText}>
                {activeSubject === 'siswa'
                  ? 'PUSAT DATA PRESENSI SANTRI & SISWA'
                  : 'PUSAT PRESENSI GURU & TENAGA KEPENDIDIKAN'}
              </Text>
            </View>
            <Text style={s.headerMainTitle} numberOfLines={1}>
              {activeSubject === 'siswa' ? 'Data Presensi Siswa' : 'Data Presensi Guru & Pegawai'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handleDownload}
              style={s.refreshButton}
            >
              <MaterialCommunityIcons name="download-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={handlePrint}
              style={s.refreshButton}
            >
              <MaterialCommunityIcons name="printer-outline" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={onRefresh}
              style={s.refreshButton}
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar langsung di Header Gradient (Gaya Data Master) */}
        <View style={s.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
          <TextInput
            style={s.searchInput}
            placeholder={activeSubject === 'siswa' ? 'Cari nama santri, NIS, rombel...' : 'Cari nama pegawai, NIP, NIY...'}
            placeholderTextColor="#94A3B8"
            value={activeSubject === 'siswa' ? studentSearchQuery : employeeSearchQuery}
            onChangeText={activeSubject === 'siswa' ? setStudentSearchQuery : setEmployeeSearchQuery}
            returnKeyType="search"
          />
          {(activeSubject === 'siswa' ? studentSearchQuery : employeeSearchQuery).length > 0 && (
            <TouchableOpacity
              onPress={() => (activeSubject === 'siswa' ? setStudentSearchQuery('') : setEmployeeSearchQuery(''))}
            >
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* 3 KPI Cards Row (Harmonisasi Data Master & TAILGRIDS_ALUMNI_MUTASI_CARDS) */}
        <View style={s.kpiCardsRow}>
          {/* Card 1: Total Santri & Tingkat Kehadiran */}
          <View style={[s.kpiBox, { borderColor: 'rgba(5, 150, 105, 0.22)' }]}>
            <LinearGradient colors={['#FFFFFF', '#ECFDF5']} style={s.kpiBoxGradient}>
              <View style={s.kpiHeaderRow}>
                <View style={[s.kpiIconSquare, { backgroundColor: '#059669' }]}>
                  <MaterialCommunityIcons name="account-check" size={14} color="#FFFFFF" />
                </View>
                <Text style={[s.kpiVal, { color: '#059669' }]}>
                  {computedStats.hadir}/{computedStats.total}
                </Text>
              </View>
              <Text style={[s.kpiLbl, { color: '#059669' }]} numberOfLines={1}>Tingkat Hadir</Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                {computedStats.total > 0 ? `${Math.round((computedStats.hadir / computedStats.total) * 100)}% Kehadiran` : '0%'}
              </Text>
            </LinearGradient>
          </View>

          {/* Card 2: Izin & Sakit */}
          <View style={[s.kpiBox, { borderColor: 'rgba(37, 99, 235, 0.18)' }]}>
            <LinearGradient colors={['#FFFFFF', '#EFF6FF']} style={s.kpiBoxGradient}>
              <View style={s.kpiHeaderRow}>
                <View style={[s.kpiIconSquare, { backgroundColor: '#2563EB' }]}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={14} color="#FFFFFF" />
                </View>
                <Text style={[s.kpiVal, { color: '#2563EB' }]}>
                  {computedStats.izin + computedStats.sakit}
                </Text>
              </View>
              <Text style={[s.kpiLbl, { color: '#2563EB' }]} numberOfLines={1}>Izin & Sakit</Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                {computedStats.izin} Izin · {computedStats.sakit} Sakit
              </Text>
            </LinearGradient>
          </View>

          {/* Card 3: Telat & Alpa */}
          <View style={[s.kpiBox, { borderColor: 'rgba(225, 29, 72, 0.18)' }]}>
            <LinearGradient colors={['#FFFFFF', '#FFF1F2']} style={s.kpiBoxGradient}>
              <View style={s.kpiHeaderRow}>
                <View style={[s.kpiIconSquare, { backgroundColor: '#E11D48' }]}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={14} color="#FFFFFF" />
                </View>
                <Text style={[s.kpiVal, { color: '#E11D48' }]}>
                  {computedStats.terlambat + computedStats.alpa}
                </Text>
              </View>
              <Text style={[s.kpiLbl, { color: '#E11D48' }]} numberOfLines={1}>Telat & Alpa</Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                {computedStats.terlambat} Telat · {computedStats.alpa} Alpa
              </Text>
            </LinearGradient>
          </View>
        </View>
      </LinearGradient>

      {/* ── SEGMENTED SUB-TABS (Tepat di Bawah Header, Gaya Data Master) ── */}
      <View style={s.segmentContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.segmentScroll}>
          {isLockedSubject && activeSubject === 'pegawai' ? (
            <>
              {STAFF_CATEGORY_OPTIONS.map((cat) => {
                const isActive = selectedStaffCategory === cat.key;
                return (
                  <TouchableOpacity
                    key={cat.key}
                    activeOpacity={0.8}
                    onPress={() => setSelectedStaffCategory(cat.key)}
                    style={[
                      s.segmentBtn,
                      isActive && s.segmentBtnActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={cat.icon as any}
                      size={16}
                      color={isActive ? '#FFFFFF' : '#64748B'}
                    />
                    <Text
                      style={[
                        s.segmentBtnText,
                        isActive && s.segmentBtnTextActive,
                      ]}
                    >
                      {cat.key === 'all' ? 'Semua PTK' : cat.label.split(' / ')[0]}
                    </Text>
                  </TouchableOpacity>
                );
              })}
              {/* Tombol Akses Cepat Presensi Mandiri */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate?.('PresensiMandiriStaff')}
                style={[s.segmentBtn, { backgroundColor: '#ECFDF5', borderColor: '#34D399', borderWidth: 1 }]}
              >
                <MaterialCommunityIcons name="map-marker-check" size={16} color="#059669" />
                <Text style={[s.segmentBtnText, { color: '#059669', fontWeight: '800' }]}>
                  Presensi Mandiri ➜
                </Text>
              </TouchableOpacity>
            </>
          ) : isLockedSubject && activeSubject === 'siswa' ? (
            <>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedScope('class')}
                style={[
                  s.segmentBtn,
                  selectedScope === 'class' && s.segmentBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="google-classroom"
                  size={16}
                  color={selectedScope === 'class' ? '#FFFFFF' : '#64748B'}
                />
                <Text
                  style={[
                    s.segmentBtnText,
                    selectedScope === 'class' && s.segmentBtnTextActive,
                  ]}
                >
                  Per Rombel / Kelas
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedScope('student')}
                style={[
                  s.segmentBtn,
                  selectedScope === 'student' && s.segmentBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="account-search"
                  size={16}
                  color={selectedScope === 'student' ? '#FFFFFF' : '#64748B'}
                />
                <Text
                  style={[
                    s.segmentBtnText,
                    selectedScope === 'student' && s.segmentBtnTextActive,
                  ]}
                >
                  Individual Santri / Siswa
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate?.('AbsensiGerbangTerminal')}
                style={[s.segmentBtn, { backgroundColor: '#F0F9FF', borderColor: '#38BDF8', borderWidth: 1 }]}
              >
                <MaterialCommunityIcons name="boom-gate-outline" size={16} color="#0284C7" />
                <Text style={[s.segmentBtnText, { color: '#0284C7', fontWeight: '800' }]}>
                  Presensi Gerbang Scanner ➜
                </Text>
              </TouchableOpacity>
            </>
          ) : (
            <>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveSubject('siswa')}
                style={[
                  s.segmentBtn,
                  activeSubject === 'siswa' && s.segmentBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="account-group"
                  size={16}
                  color={activeSubject === 'siswa' ? '#FFFFFF' : '#64748B'}
                />
                <Text
                  style={[
                    s.segmentBtnText,
                    activeSubject === 'siswa' && s.segmentBtnTextActive,
                  ]}
                >
                  Presensi Siswa
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveSubject('pegawai')}
                style={[
                  s.segmentBtn,
                  activeSubject === 'pegawai' && s.segmentBtnActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="account-tie"
                  size={16}
                  color={activeSubject === 'pegawai' ? '#FFFFFF' : '#64748B'}
                />
                <Text
                  style={[
                    s.segmentBtnText,
                    activeSubject === 'pegawai' && s.segmentBtnTextActive,
                  ]}
                >
                  Presensi Guru & Pegawai
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate?.('PresensiMandiriStaff')}
                style={[s.segmentBtn, { backgroundColor: '#ECFDF5', borderColor: '#34D399', borderWidth: 1 }]}
              >
                <MaterialCommunityIcons name="map-marker-check" size={16} color="#059669" />
                <Text style={[s.segmentBtnText, { color: '#059669', fontWeight: '800' }]}>
                  Presensi Mandiri Pegawai ➜
                </Text>
              </TouchableOpacity>
            </>
          )}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 30 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
      >
        {/* ── FILTER CARD: FILTER DATA PRESENSI (GAYA DATA MASTER TERPADU) ── */}
        <View style={s.filterCard}>
          <View style={s.filterCardHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="filter-variant" size={17} color="#059669" />
              <Text style={s.filterCardTitle}>
                {activeSubject === 'siswa' ? 'Filter Presensi Siswa' : 'Filter Presensi Guru & Pegawai'}
              </Text>
            </View>
            {(statusFilter !== 'all' || (activeSubject === 'siswa' && (selectedClassId !== 'all' || selectedStudent !== null || studentSearchQuery.length > 0)) || (activeSubject === 'pegawai' && (selectedStaffCategory !== 'all' || selectedEmployee !== null || employeeSearchQuery.length > 0)) || selectedPeriod !== 'daily') ? (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setStatusFilter('all');
                  setSelectedClassId('all');
                  setSelectedStudent(null);
                  setSelectedStaffCategory('all');
                  setSelectedEmployee(null);
                  setSelectedPeriod('daily');
                  setStudentSearchQuery('');
                  setEmployeeSearchQuery('');
                }}
              >
                <Text style={s.filterResetBtn}>Reset Filter</Text>
              </TouchableOpacity>
            ) : null}
          </View>

          {/* ── FILTER PERIODE WAKTU: DROPDOWN ELEGAN & INTEGRATIF ── */}
          <View style={{ marginTop: 14 }}>
            <Text style={s.filterLabel}>Periode Waktu Laporan</Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setShowPeriodDropdown(true)}
              style={[
                s.dropdownTriggerCard,
                { borderColor: activePeriodMeta.color + '55', backgroundColor: activePeriodMeta.bg },
              ]}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                <View style={[s.dropdownIconSquare, { backgroundColor: activePeriodMeta.color }]}>
                  <MaterialCommunityIcons name={activePeriodMeta.icon as any} size={16} color="#FFFFFF" />
                </View>
                <View style={{ marginLeft: 10, flex: 1 }}>
                  <Text style={s.dropdownSelectedTitle} numberOfLines={1}>
                    {activePeriodMeta.label}
                  </Text>
                  <Text style={[s.dropdownSelectedSub, { color: activePeriodMeta.color }]} numberOfLines={1}>
                    {currentPeriodText}
                  </Text>
                </View>
              </View>
              <View style={[s.dropdownChevronBox, { backgroundColor: activePeriodMeta.color + '20' }]}>
                <MaterialCommunityIcons name="chevron-down" size={18} color={activePeriodMeta.color} />
              </View>
            </TouchableOpacity>
          </View>

          {/* Sub-Kontrol Navigasi Periode Aktif Sesuai Pilihan */}
          {selectedPeriod === 'daily' && (
            <View style={s.dateControlRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 1);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={s.dateCenterBox}>
                <MaterialCommunityIcons name="calendar-clock" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.dateCenterText}>
                  {new Date(selectedDate).toLocaleDateString('id-ID', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 1);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
              </TouchableOpacity>
            </View>
          )}

          {selectedPeriod === 'weekly' && (
            <View style={s.dateControlRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() - 7);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={s.dateCenterBox}>
                <MaterialCommunityIcons name="calendar-week" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.dateCenterText}>{currentPeriodText}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const d = new Date(selectedDate);
                  d.setDate(d.getDate() + 7);
                  setSelectedDate(d.toISOString().slice(0, 10));
                }}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
              </TouchableOpacity>
            </View>
          )}

          {selectedPeriod === 'monthly' && (
            <View style={s.dateControlRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (selectedMonth === 1) {
                    setSelectedMonth(12);
                    setSelectedYear((y) => y - 1);
                  } else {
                    setSelectedMonth((m) => m - 1);
                  }
                }}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={s.dateCenterBox}>
                <MaterialCommunityIcons name="calendar-month" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.dateCenterText}>
                  {MONTH_NAMES_ID[selectedMonth - 1]} {selectedYear}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  if (selectedMonth === 12) {
                    setSelectedMonth(1);
                    setSelectedYear((y) => y + 1);
                  } else {
                    setSelectedMonth((m) => m + 1);
                  }
                }}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
              </TouchableOpacity>
            </View>
          )}

          {selectedPeriod === 'semester' && (
            <View style={s.dateControlRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedSemester((sem) => (sem === 'ganjil' ? 'genap' : 'ganjil'))}
                style={[s.dateCenterBox, { paddingHorizontal: 12 }]}
              >
                <MaterialCommunityIcons name="calendar-sync" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.dateCenterText}>
                  Semester {selectedSemester === 'ganjil' ? 'Ganjil' : 'Genap'} • TA {selectedYear}/{selectedYear + 1}
                </Text>
                <MaterialCommunityIcons name="swap-horizontal" size={15} color="#059669" style={{ marginLeft: 6 }} />
              </TouchableOpacity>
            </View>
          )}

          {selectedPeriod === 'yearly' && (
            <View style={s.dateControlRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedYear((y) => y - 1)}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-left" size={20} color="#059669" />
              </TouchableOpacity>
              <View style={s.dateCenterBox}>
                <MaterialCommunityIcons name="calendar-star" size={16} color="#059669" style={{ marginRight: 6 }} />
                <Text style={s.dateCenterText}>Tahun Kalender {selectedYear}</Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedYear((y) => y + 1)}
                style={s.dateNavBtn}
              >
                <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
              </TouchableOpacity>
            </View>
          )}

          {activeSubject === 'siswa' ? (
            /* Mode 1: Siswa Filter */
            <>
              <View style={[s.scopeToggleRow, { marginTop: 12 }]}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedScope('class')}
                  style={[s.scopeBtn, selectedScope === 'class' && s.scopeBtnActive]}
                >
                  <MaterialCommunityIcons
                    name="google-classroom"
                    size={15}
                    color={selectedScope === 'class' ? '#059669' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[s.scopeBtnText, selectedScope === 'class' && s.scopeBtnTextActive]}>
                    Per Rombel / Kelas
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedScope('student')}
                  style={[s.scopeBtn, selectedScope === 'student' && s.scopeBtnActive]}
                >
                  <MaterialCommunityIcons
                    name="account-search-outline"
                    size={15}
                    color={selectedScope === 'student' ? '#059669' : '#64748B'}
                    style={{ marginRight: 6 }}
                  />
                  <Text style={[s.scopeBtnText, selectedScope === 'student' && s.scopeBtnTextActive]}>
                    Individual Siswa
                  </Text>
                </TouchableOpacity>
              </View>

              {selectedScope === 'class' ? (
                <View style={s.filterRowWrap}>
                  {/* Class Selector Trigger */}
                  <View style={s.filterItemCol}>
                    <Text style={s.filterLabel}>Pilih Rombel / Kelas</Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowClassDropdown(true)}
                      style={s.classDropdownTrigger}
                    >
                      <View style={s.classDropdownTriggerLeft}>
                        <View style={s.classDropdownIconBox}>
                          <MaterialCommunityIcons name="google-classroom" size={17} color="#059669" />
                        </View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.classDropdownTriggerText} numberOfLines={1}>
                            {selectedClassId === 'all'
                              ? 'Semua Kelas & Rombel'
                              : classes.find((c: any) => String(c.id) === selectedClassId)?.name ||
                                classes.find((c: any) => String(c.id) === selectedClassId)?.nama_kelas ||
                                'Kelas Terpilih'}
                          </Text>
                          <Text style={s.classDropdownTriggerSub} numberOfLines={1}>
                            {selectedClassId === 'all'
                              ? `Total ${classes.length} rombel terdaftar pada unit ini`
                              : classes.find((c: any) => String(c.id) === selectedClassId)?.unit_pendidikan?.name ||
                                classes.find((c: any) => String(c.id) === selectedClassId)?.unit_name ||
                                'Rombel Terpilih'}
                          </Text>
                        </View>
                      </View>
                      <View style={s.classDropdownChevronBox}>
                        <MaterialCommunityIcons name="chevron-down" size={18} color="#059669" />
                      </View>
                    </TouchableOpacity>
                  </View>
                </View>
              ) : (
                /* Individual Student Picker */
                <View style={{ marginTop: 10 }}>
                  <Text style={s.filterLabel}>Target Santri / Siswa</Text>
                  {selectedStudent ? (
                    <View style={s.selectedStudentCard}>
                      <Image
                        source={selectedStudent.avatar ? { uri: selectedStudent.avatar } : DEFAULT_STUDENT_BOY_AVATAR}
                        style={s.selectedStudentAvatar}
                      />
                      <View style={{ flex: 1 }}>
                        <Text style={s.selectedStudentName} numberOfLines={1}>
                          {selectedStudent.nama_lengkap || selectedStudent.name}
                        </Text>
                        <Text style={s.selectedStudentSub}>
                          NIS: {selectedStudent.nis || '-'} • {selectedStudent.kelas?.nama_kelas || selectedStudent.kelas_name || 'Rombel'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedStudent(null)}
                        style={s.clearStudentBtn}
                      >
                        <MaterialCommunityIcons name="close" size={16} color="#E11D48" />
                      </TouchableOpacity>
                    </View>
                  ) : (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowStudentPickerModal(true)}
                      style={s.pickStudentBtn}
                    >
                      <MaterialCommunityIcons name="account-search" size={18} color="#059669" />
                      <Text style={s.pickStudentBtnText}>Pilih Santri / Siswa...</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </>
          ) : (
            /* Mode 2: Guru & Pegawai Filter (Dropdown Kategori PTK & Picker Pegawai) */
            <View style={{ marginTop: 12 }}>
              <Text style={s.filterLabel}>Kategori Tenaga Pendidik & Kependidikan (PTK)</Text>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowStaffCategoryDropdown(true)}
                style={[
                  s.dropdownTriggerCard,
                  { borderColor: activeStaffCategoryMeta.color + '55', backgroundColor: activeStaffCategoryMeta.bg },
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1 }}>
                  <View style={[s.dropdownIconSquare, { backgroundColor: activeStaffCategoryMeta.color }]}>
                    <MaterialCommunityIcons name={activeStaffCategoryMeta.icon as any} size={16} color="#FFFFFF" />
                  </View>
                  <View style={{ marginLeft: 10, flex: 1 }}>
                    <Text style={s.dropdownSelectedTitle} numberOfLines={1}>
                      {activeStaffCategoryMeta.label}
                    </Text>
                    <Text style={[s.dropdownSelectedSub, { color: activeStaffCategoryMeta.color }]} numberOfLines={1}>
                      {activeStaffCategoryMeta.desc}
                    </Text>
                  </View>
                </View>
                <View style={[s.dropdownChevronBox, { backgroundColor: activeStaffCategoryMeta.color + '20' }]}>
                  <MaterialCommunityIcons name="chevron-down" size={18} color={activeStaffCategoryMeta.color} />
                </View>
              </TouchableOpacity>

              {/* Selected Single Employee Focus (Optional) */}
              <View style={{ marginTop: 10 }}>
                {selectedEmployee ? (
                  <View style={s.selectedStudentCard}>
                    <Image
                      source={
                        selectedEmployee.avatar || selectedEmployee.foto_url
                          ? { uri: getProfileImageUrl(selectedEmployee) }
                          : DEFAULT_PARENT_AVATAR
                      }
                      style={s.selectedStudentAvatar}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={s.selectedStudentName} numberOfLines={1}>
                        {selectedEmployee.full_name || selectedEmployee.nama_lengkap || selectedEmployee.name}
                      </Text>
                      <Text style={s.selectedStudentSub}>
                        NIP: {selectedEmployee.nip || selectedEmployee.nik || '-'} • {selectedEmployee.position || selectedEmployee.jabatan || 'Staf'}
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setSelectedEmployee(null)}
                      style={s.clearStudentBtn}
                    >
                      <MaterialCommunityIcons name="close" size={16} color="#E11D48" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => setShowEmployeePickerModal(true)}
                    style={s.pickStudentBtn}
                  >
                    <MaterialCommunityIcons name="account-search-outline" size={18} color="#059669" />
                    <Text style={s.pickStudentBtnText}>Pilih Guru / Pegawai Tertentu (Opsional)...</Text>
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Status Filter Horizontal Pills (Gaya Data Master) */}
          <Text style={[s.filterLabel, { marginTop: 12 }]}>STATUS KEHADIRAN</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 4 }}>
            {STATUS_OPTIONS.map((st) => {
              const isActive = statusFilter === st.key;
              return (
                <TouchableOpacity
                  key={st.key}
                  activeOpacity={0.8}
                  onPress={() => setStatusFilter(st.key)}
                  style={[s.filterPill, isActive && s.filterPillActive]}
                >
                  <MaterialCommunityIcons
                    name={st.icon as any}
                    size={14}
                    color={isActive ? '#FFFFFF' : '#64748B'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[s.filterPillText, isActive && s.filterPillTextActive]}>
                    {st.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* ── SUB-ACTION BAR: UNDUH LAPORAN & CETAK PRESENSI (GAYA DATA MASTER TERPADU) ── */}
        <View style={s.subActionBar}>
          <View style={s.primaryActionRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handleDownload}
              style={s.addPillBtn}
            >
              <LinearGradient
                colors={['#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.addPillBtnGradient}
              >
                <MaterialCommunityIcons name="file-download-outline" size={18} color="#FFFFFF" />
                <Text style={s.addPillBtnText}>Unduh Laporan</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={handlePrint}
              style={s.rekapPillBtn}
            >
              <View style={s.rekapPillIconBox}>
                <MaterialCommunityIcons name="printer-outline" size={16} color="#059669" />
              </View>
              <Text style={s.rekapPillText}>Cetak Presensi</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── DAFTAR RINCIAN DATA PRESENSI (GAYA DATA MASTER TERPADU) ── */}
        <View style={s.listCard}>
          {/* Header Card Bersih Mandiri */}
          <View style={s.listHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1 }}>
              <MaterialCommunityIcons
                name={activeSubject === 'siswa' ? 'clipboard-text-outline' : 'briefcase-check-outline'}
                size={18}
                color="#059669"
              />
              <Text style={s.listHeaderTitle}>
                {activeSubject === 'siswa' ? 'Daftar Presensi Santri' : 'Daftar Presensi Guru & Pegawai'}
              </Text>
              <View style={s.listCountBadge}>
                <Text style={s.listCountBadgeText}>{filteredRecords.length} Data</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handlePrint}
              style={s.printTriggerBtn}
            >
              <MaterialCommunityIcons name="printer-eye" size={15} color="#059669" />
              <Text style={s.printTriggerBtnText}>Cetak</Text>
            </TouchableOpacity>
          </View>

          {loading ? (
            <View style={s.emptyBox}>
              <ActivityIndicator size="small" color="#059669" />
              <Text style={s.emptyText}>
                {activeSubject === 'siswa'
                  ? 'Memuat rekap data presensi siswa...'
                  : 'Memuat rekap data presensi guru & pegawai...'}
              </Text>
            </View>
          ) : filteredRecords.length === 0 ? (
            <View style={s.emptyBox}>
              <MaterialCommunityIcons name="account-search-outline" size={48} color="#CBD5E1" />
              <Text style={s.emptyTitle}>Tidak Ada Data Presensi</Text>
              <Text style={s.emptyText}>
                {activeSubject === 'siswa'
                  ? 'Tidak ditemukan catatan presensi santri untuk filter ini.'
                  : 'Tidak ditemukan catatan presensi guru/pegawai untuk filter ini.'}
              </Text>
            </View>
          ) : (
            <>
              {/* Direct Render: Each record is rendered as an independent mutationCard directly on the #F8FAFC canvas */}
              {paginatedRecords.map((item: any, idx: number) => {
                const isSiswaMode = activeSubject === 'siswa';

                // Entity attributes
                const person = isSiswaMode ? item.student || item : item.employee || item;
                const personName =
                  person?.nama_lengkap ||
                  person?.full_name ||
                  person?.name ||
                  (isSiswaMode ? 'Santri' : 'Pegawai');

                const identifier = isSiswaMode
                  ? `NIS: ${person?.nis || item?.nis || '-'}`
                  : `NIP: ${person?.nip || person?.nik || item?.nip || '-'}`;

                const subLabel = isSiswaMode
                  ? item?.school_class?.name || item?.schoolClass?.name || person?.kelas?.nama_kelas || item?.kelas_name || 'Rombel'
                  : person?.position || person?.jabatan || item?.position || 'Tenaga Pendidik / Staf';

                // Status styles
                const rawStatus = String(item.status || 'Hadir').toLowerCase();
                const isHadir = ['h', 'hadir'].includes(rawStatus);
                const isDinasLuar = ['dinas_luar', 'dinas luar', 'dl'].includes(rawStatus);
                const isLate = ['t', 'terlambat'].includes(rawStatus);
                const isSick = ['s', 'sakit'].includes(rawStatus);
                const isPermit = ['i', 'izin', 'c', 'cuti'].includes(rawStatus);

                const statusColor = isHadir
                  ? '#059669'
                  : isDinasLuar
                    ? '#0891B2'
                    : isLate
                      ? '#D97706'
                      : isSick
                        ? '#7C3AED'
                        : isPermit
                          ? '#2563EB'
                          : '#E11D48';

                const statusBg = isHadir
                  ? '#ECFDF5'
                  : isDinasLuar
                    ? '#ECFEFF'
                    : isLate
                      ? '#FFFBEB'
                      : isSick
                        ? '#FAF5FF'
                        : isPermit
                          ? '#EFF6FF'
                          : '#FFF1F2';

                const statusLabel = isHadir
                  ? 'Hadir'
                  : isDinasLuar
                    ? 'Dinas Luar'
                    : isLate
                      ? 'Terlambat'
                      : isSick
                        ? 'Sakit'
                        : isPermit
                          ? 'Izin / Cuti'
                          : 'Alpa';

                const checkInTime = item.check_in_time ? String(item.check_in_time).slice(0, 5) : '--:--';
                const checkOutTime = item.check_out_time ? String(item.check_out_time).slice(0, 5) : '--:--';

                const avatarUri = person?.avatar || person?.photo_url || person?.foto_url
                  ? getProfileImageUrl(person)
                  : null;

                const defaultAvatar = isSiswaMode ? DEFAULT_STUDENT_BOY_AVATAR : DEFAULT_PARENT_AVATAR;

                return (
                  <View key={item.id || idx} style={s.mutationCard}>
                    {/* Top Row: Squircle Avatar + Identitas + Status Tag */}
                    <View style={s.cardTopRow}>
                      <View style={[s.avatarCircle, { backgroundColor: isSiswaMode ? '#ECFDF5' : '#EFF6FF' }]}>
                        {avatarUri ? (
                          <Image source={{ uri: avatarUri }} style={s.avatarImg} />
                        ) : (
                          <Image source={defaultAvatar} style={s.avatarImg} />
                        )}
                      </View>

                      <View style={s.cardMainInfo}>
                        <View style={s.nameRow}>
                          <Text style={s.studentName} numberOfLines={1}>
                            {personName}
                          </Text>
                          <View style={[s.tagBadge, { backgroundColor: statusBg, borderWidth: 1, borderColor: statusColor + '40' }]}>
                            <Text style={[s.tagBadgeText, { color: statusColor }]}>{statusLabel}</Text>
                          </View>
                        </View>
                        <Text style={s.nisText} numberOfLines={1}>
                          {identifier} • {subLabel}
                        </Text>
                      </View>
                    </View>

                    {/* Detail Box (Harmonisasi Gaya Data Master) */}
                    <View style={s.detailBox}>
                      <View style={s.detailItemRow}>
                        <Text style={s.detailItemLabel}>Waktu:</Text>
                        <Text style={s.detailItemVal} numberOfLines={1}>
                          Masuk: {checkInTime}  •  Pulang: {checkOutTime}
                        </Text>
                      </View>

                      <View style={s.detailItemRow}>
                        <Text style={s.detailItemLabel}>Metode:</Text>
                        <Text style={s.detailItemVal} numberOfLines={1}>
                          {item.method ? String(item.method).toUpperCase() : 'PRESENSI'} • {item.date || selectedDate}
                        </Text>
                      </View>

                      {(item.notes || item.keterangan) ? (
                        <View style={[s.detailItemRow, isLate ? { backgroundColor: '#FEF3C7', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 } : null]}>
                          <Text style={[s.detailItemLabel, isLate ? { color: '#B45309', fontWeight: 'bold' } : null]}>
                            {isLate ? 'Alasan Terlambat:' : 'Catatan:'}
                          </Text>
                          <Text style={[s.detailItemVal, { fontStyle: 'italic', color: isLate ? '#92400E' : '#475569', fontWeight: isLate ? '600' : 'normal' }]} numberOfLines={2}>
                            "{item.notes || item.keterangan}"
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* Card Actions Container (Harmonisasi 2-Tier Gaya Data Master) */}
                    <View style={s.cardActionsContainer}>
                      {/* Tier 1: Chat Internal Pegawai / Hubungi Wali Santri */}
                      <View style={s.actionTier1Row}>
                        <TouchableOpacity
                          activeOpacity={0.82}
                          style={s.internalChatPillBtn}
                          onPress={() => handleOpenInAppChat(person, item)}
                        >
                          <MaterialCommunityIcons
                            name={isSiswaMode ? 'chat-processing-outline' : 'message-text-outline'}
                            size={15}
                            color="#FFFFFF"
                          />
                          <Text style={s.internalChatPillBtnText} numberOfLines={1}>
                            {isSiswaMode ? 'Chat Internal Ortu / Siswa' : 'Chat Internal Pegawai'}
                          </Text>
                        </TouchableOpacity>
                      </View>

                      {/* Tier 2: Aksi Sekunder (Cetak Rekap & Rincian Log) */}
                      <View style={s.actionTier2Row}>
                        <TouchableOpacity
                          activeOpacity={0.82}
                          style={s.actionTierBtnPrint}
                          onPress={() => handleOpenIndividualPrintModal(person, isSiswaMode ? 'siswa' : 'pegawai')}
                        >
                          <MaterialCommunityIcons name="printer-outline" size={13} color="#0F766E" />
                          <Text style={s.actionTierBtnTextPrint} numberOfLines={1}>Cetak Rekap</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.82}
                          style={s.actionTierBtnDetail}
                          onPress={() => {
                            setFeedbackModal({
                              visible: true,
                              type: 'info',
                              title: `Rincian Presensi: ${personName}`,
                              message: `Identitas: ${identifier}\nStatus: ${statusLabel}\nJam Masuk: ${checkInTime}\nJam Pulang: ${checkOutTime}\nMetode: ${item.method ? String(item.method).toUpperCase() : 'PRESENSI'}\nTanggal: ${item.date || selectedDate}${item.notes ? `\nCatatan: ${item.notes}` : ''}`,
                            });
                          }}
                        >
                          <MaterialCommunityIcons name="eye-outline" size={13} color="#047857" />
                          <Text style={s.actionTierBtnTextDetail} numberOfLines={1}>Rincian Log</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}

              {/* ── PAGINATION CONTROLS (GAYA DATA MASTER) ── */}
              {totalPages > 1 && (
                <View style={s.paginationContainer}>
                  <View style={s.paginationInfoBadge}>
                    <Text style={s.paginationInfoText}>
                      Menampilkan <Text style={s.paginationInfoHighlight}>{Math.min((currentPage - 1) * PAGE_SIZE + 1, filteredRecords.length)} - {Math.min(currentPage * PAGE_SIZE, filteredRecords.length)}</Text> dari <Text style={s.paginationInfoHighlight}>{filteredRecords.length}</Text> data
                    </Text>
                  </View>
                  <View style={s.paginationButtonsRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={currentPage <= 1}
                      onPress={() => setCurrentPage((p) => Math.max(1, p - 1))}
                      style={[s.paginationNavBtn, currentPage <= 1 && s.paginationNavBtnDisabled]}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={18} color={currentPage <= 1 ? '#94A3B8' : '#047857'} />
                      <Text style={[s.paginationNavBtnText, currentPage <= 1 && s.paginationNavBtnTextDisabled]}>Sebelumnya</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      disabled={currentPage >= totalPages}
                      onPress={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                      style={[s.paginationNavBtn, currentPage >= totalPages && s.paginationNavBtnDisabled]}
                    >
                      <Text style={[s.paginationNavBtnText, currentPage >= totalPages && s.paginationNavBtnTextDisabled]}>Berikutnya</Text>
                      <MaterialCommunityIcons name="chevron-right" size={18} color={currentPage >= totalPages ? '#94A3B8' : '#047857'} />
                    </TouchableOpacity>
                  </View>
                </View>
              )}
            </>
          )}
        </View>
      </ScrollView>

      {/* ── MODAL PILIHAN PERIODE CETAK REKAP INDIVIDU PTK / SANTRI ── */}
      <Modal
        visible={Boolean(individualPrintTarget)}
        transparent={true}
        animationType="fade"
        onRequestClose={() => setIndividualPrintTarget(null)}
      >
        <View style={s.individualModalBackdrop}>
          <View style={s.individualModalCard}>
            {/* Header Modal */}
            <View style={s.individualModalHeader}>
              <View style={s.individualModalIconBadge}>
                <MaterialCommunityIcons name="printer-pos" size={20} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.individualModalTitle}>
                  {individualPrintTarget?.type === 'siswa'
                    ? 'Cetak Rekap Presensi Santri'
                    : 'Cetak Rekap Presensi Pegawai'}
                </Text>
                <Text style={s.individualModalSubtitle}>
                  Pilih rentang waktu untuk mencetak lembar resmi TU
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIndividualPrintTarget(null)}
                style={s.individualModalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Target Person Identity Card */}
            {individualPrintTarget?.person && (
              <View style={s.individualTargetCard}>
                <Image
                  source={
                    individualPrintTarget.person.avatar ||
                    individualPrintTarget.person.photo_url ||
                    individualPrintTarget.person.foto_url
                      ? { uri: getProfileImageUrl(individualPrintTarget.person) }
                      : individualPrintTarget.type === 'siswa'
                        ? DEFAULT_STUDENT_BOY_AVATAR
                        : DEFAULT_PARENT_AVATAR
                  }
                  style={s.individualTargetAvatar}
                />
                <View style={{ flex: 1, marginLeft: 10 }}>
                  <Text style={s.individualTargetName} numberOfLines={1}>
                    {individualPrintTarget.person.nama_lengkap ||
                      individualPrintTarget.person.full_name ||
                      individualPrintTarget.person.name ||
                      'Personil'}
                  </Text>
                  <Text style={s.individualTargetSub} numberOfLines={1}>
                    {individualPrintTarget.type === 'siswa'
                      ? `NIS: ${individualPrintTarget.person.nis || '-'} • ${individualPrintTarget.person.kelas?.nama_kelas || individualPrintTarget.person.kelas_name || 'Santri'}`
                      : `NIP: ${individualPrintTarget.person.nip || individualPrintTarget.person.nik || '-'} • ${individualPrintTarget.person.position || individualPrintTarget.person.jabatan || 'Guru & Pegawai'}`}
                  </Text>
                  <View style={s.individualTargetUnitBadge}>
                    <MaterialCommunityIcons name="school-outline" size={12} color="#059669" style={{ marginRight: 4 }} />
                    <Text style={s.individualTargetUnitText} numberOfLines={1}>
                      {currentUnitName}
                    </Text>
                  </View>
                </View>
              </View>
            )}

            <Text style={s.individualSectionLabel}>PILIH RENTANG WAKTU REKAPITULASI (STANDAR TU):</Text>

            {/* List 5 Periode Cetak */}
            <View style={s.individualPeriodList}>
              {[
                {
                  id: 'daily' as PeriodType,
                  title: 'Rekap Presensi Harian',
                  desc: `Log presensi tanggal terpilih (${selectedDate})`,
                  icon: 'calendar-today',
                  badgeColor: '#059669',
                  bgColor: '#F0FDF4',
                  borderColor: '#86EFAC',
                },
                {
                  id: 'weekly' as PeriodType,
                  title: 'Rekap Presensi Mingguan',
                  desc: 'Rekapitulasi log absensi sepekan kalender berjalan',
                  icon: 'calendar-week',
                  badgeColor: '#0284C7',
                  bgColor: '#F0F9FF',
                  borderColor: '#BAE6FD',
                },
                {
                  id: 'monthly' as PeriodType,
                  title: 'Rekap Presensi Bulanan',
                  desc: `Rekap akumulatif bulan ${selectedMonth}/${selectedYear}`,
                  icon: 'calendar-month',
                  badgeColor: '#7C3AED',
                  bgColor: '#FAF5FF',
                  borderColor: '#DDD6FE',
                },
                {
                  id: 'semester' as PeriodType,
                  title: 'Rekap Presensi Semester',
                  desc: `Rekap semester ${selectedSemester.toUpperCase()} TA ${selectedYear}/${selectedYear + 1}`,
                  icon: 'book-open-page-variant',
                  badgeColor: '#D97706',
                  bgColor: '#FFFBEB',
                  borderColor: '#FDE68A',
                },
                {
                  id: 'yearly' as PeriodType,
                  title: 'Rekap Presensi Tahunan',
                  desc: `Rekapitulasi 1 tahun ajaran penuh (${selectedYear}/${selectedYear + 1})`,
                  icon: 'calendar-range',
                  badgeColor: '#E11D48',
                  bgColor: '#FFF1F2',
                  borderColor: '#FECDD3',
                },
              ].map((p) => (
                <TouchableOpacity
                  key={p.id}
                  activeOpacity={0.75}
                  onPress={() => handleSelectIndividualPeriod(p.id)}
                  style={[s.individualPeriodItem, { backgroundColor: p.bgColor, borderColor: p.borderColor }]}
                >
                  <View style={[s.individualPeriodIconBox, { backgroundColor: p.badgeColor }]}>
                    <MaterialCommunityIcons name={p.icon as any} size={17} color="#FFFFFF" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={[s.individualPeriodTitle, { color: p.badgeColor }]}>{p.title}</Text>
                    <Text style={s.individualPeriodDesc} numberOfLines={1}>{p.desc}</Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color={p.badgeColor} />
                </TouchableOpacity>
              ))}
            </View>

            {/* Tombol Tutup / Batal */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIndividualPrintTarget(null)}
              style={s.individualCancelBtn}
            >
              <Text style={s.individualCancelText}>Batal</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── MODAL: PRATINJAU CETAK & DOWNLOAD DOKUMEN RESMI STANDAR TU ── */}
      <Modal
        visible={showPrintModal}
        animationType="slide"
        transparent={false}
        onRequestClose={() => {
          setShowPrintModal(false);
          setSelectedEmployee(null);
          setSelectedStudent(null);
        }}
      >
        <View style={[s.printModalRoot, { paddingTop: topInset + 6, paddingBottom: bottomInset + 16 }]}>
          {/* Header Action Bar Modal */}
          <View style={s.printModalHeader}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setShowPrintModal(false);
                setSelectedEmployee(null);
                setSelectedStudent(null);
              }}
              style={s.printBackBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.printModalTitle}>Lembar Rekap Presensi</Text>
              <Text style={s.printModalSubtitle}>
                {activeSubject === 'siswa' ? 'Format Resmi Rekap Presensi Santri' : 'Format Resmi Rekap Presensi Guru & Pegawai'}
              </Text>
            </View>

            {/* Tombol Unduh PDF Cepat */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setShowPrintModal(false);
                setSelectedEmployee(null);
                setSelectedStudent(null);
                setFeedbackModal({
                  visible: true,
                  type: 'success',
                  title: 'Dokumen Berhasil Diunduh',
                  message: `Lembar ${printDocMeta.title} (${currentUnitName}) telah siap dan disimpan sebagai dokumen resmi TU.`,
                });
              }}
              style={[s.printActionBtn, { backgroundColor: '#0284C7', marginRight: 6 }]}
            >
              <MaterialCommunityIcons name="download" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={s.printActionText}>Unduh</Text>
            </TouchableOpacity>

            {/* Tombol Cetak / Print */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setShowPrintModal(false);
                setSelectedEmployee(null);
                setSelectedStudent(null);
                setFeedbackModal({
                  visible: true,
                  type: 'success',
                  title: 'Perintah Cetak Dikirim',
                  message: `Dokumen resmi ${printDocMeta.title} (${currentUnitName}) telah dikirimkan ke antrean cetak printer.`,
                });
              }}
              style={s.printActionBtn}
            >
              <MaterialCommunityIcons name="printer" size={15} color="#FFFFFF" style={{ marginRight: 4 }} />
              <Text style={s.printActionText}>Cetak</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={s.paperContainer} showsVerticalScrollIndicator={false}>
            {/* Range Switcher Tabs di Atas Lembar Kertas */}
            <View style={s.printRangeSwitchWrap}>
              {(['daily', 'weekly', 'monthly', 'semester', 'yearly'] as PeriodType[]).map((rng) => {
                const isActive = printRekapRange === rng;
                const label =
                  rng === 'daily'
                    ? 'Harian'
                    : rng === 'weekly'
                      ? 'Mingguan'
                      : rng === 'monthly'
                        ? 'Bulanan'
                        : rng === 'semester'
                          ? 'Semester'
                          : 'Tahunan';
                return (
                  <TouchableOpacity
                    key={rng}
                    activeOpacity={0.8}
                    onPress={() => {
                      setPrintRekapRange(rng);
                      setSelectedPeriod(rng);
                    }}
                    style={[s.printRangeSwitchBtn, isActive && s.printRangeSwitchBtnActive]}
                  >
                    <Text style={[s.printRangeSwitchText, isActive && s.printRangeSwitchTextActive]}>
                      {label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* ── TOOLBAR NAVIGASI WAKTU INTERAKTIF DI DALAM LEMBAR REKAP PRESENSI ── */}
            <View style={s.printTimeNavigatorCard}>
              {/* Mode Harian */}
              {printRekapRange === 'daily' && (
                <View style={s.printNavRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() - 1);
                      setSelectedDate(d.toISOString().slice(0, 10));
                    }}
                    style={s.printNavArrowBtn}
                  >
                    <MaterialCommunityIcons name="chevron-left" size={20} color="#059669" />
                  </TouchableOpacity>

                  <View style={s.printNavCenterInfo}>
                    <MaterialCommunityIcons name="calendar-clock" size={15} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={s.printNavDateText}>
                      {new Date(selectedDate).toLocaleDateString('id-ID', {
                        weekday: 'short',
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() + 1);
                      setSelectedDate(d.toISOString().slice(0, 10));
                    }}
                    style={s.printNavArrowBtn}
                  >
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                    style={s.printNavTodayBtn}
                  >
                    <Text style={s.printNavTodayText}>Hari Ini</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Mode Mingguan */}
              {printRekapRange === 'weekly' && (
                <View style={s.printNavRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() - 7);
                      setSelectedDate(d.toISOString().slice(0, 10));
                    }}
                    style={[s.printNavArrowBtn, { borderColor: '#BAE6FD' }]}
                  >
                    <MaterialCommunityIcons name="chevron-left" size={20} color="#0284C7" />
                  </TouchableOpacity>

                  <View style={s.printNavCenterInfo}>
                    <MaterialCommunityIcons name="calendar-week" size={15} color="#0284C7" style={{ marginRight: 6 }} />
                    <Text style={[s.printNavDateText, { color: '#0369A1' }]}>{currentPeriodText}</Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => {
                      const d = new Date(selectedDate);
                      d.setDate(d.getDate() + 7);
                      setSelectedDate(d.toISOString().slice(0, 10));
                    }}
                    style={[s.printNavArrowBtn, { borderColor: '#BAE6FD' }]}
                  >
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#0284C7" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedDate(new Date().toISOString().slice(0, 10))}
                    style={[s.printNavTodayBtn, { backgroundColor: '#E0F2FE', borderColor: '#BAE6FD' }]}
                  >
                    <Text style={[s.printNavTodayText, { color: '#0369A1' }]}>Pekan Ini</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Mode Bulanan */}
              {printRekapRange === 'monthly' && (
                <View style={{ gap: 8 }}>
                  <View style={s.printNavRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        if (selectedMonth === 1) {
                          setSelectedMonth(12);
                          setSelectedYear((y) => y - 1);
                        } else {
                          setSelectedMonth((m) => m - 1);
                        }
                      }}
                      style={[s.printNavArrowBtn, { borderColor: '#DDD6FE' }]}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={20} color="#7C3AED" />
                    </TouchableOpacity>

                    <View style={s.printNavCenterInfo}>
                      <MaterialCommunityIcons name="calendar-month" size={15} color="#7C3AED" style={{ marginRight: 6 }} />
                      <Text style={[s.printNavDateText, { color: '#6D28D9' }]}>
                        {MONTH_NAMES_ID[selectedMonth - 1]} {selectedYear}
                      </Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        if (selectedMonth === 12) {
                          setSelectedMonth(1);
                          setSelectedYear((y) => y + 1);
                        } else {
                          setSelectedMonth((m) => m + 1);
                        }
                      }}
                      style={[s.printNavArrowBtn, { borderColor: '#DDD6FE' }]}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#7C3AED" />
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        setSelectedMonth(new Date().getMonth() + 1);
                        setSelectedYear(new Date().getFullYear());
                      }}
                      style={[s.printNavTodayBtn, { backgroundColor: '#F3E8FF', borderColor: '#DDD6FE' }]}
                    >
                      <Text style={[s.printNavTodayText, { color: '#6D28D9' }]}>Bulan Ini</Text>
                    </TouchableOpacity>
                  </View>

                  {/* Horizontal Chips 12 Bulan */}
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.printMonthChipsWrap}>
                    {MONTH_NAMES_ID.map((mName, idx) => {
                      const mNum = idx + 1;
                      const isCurMonth = selectedMonth === mNum;
                      return (
                        <TouchableOpacity
                          key={mNum}
                          activeOpacity={0.8}
                          onPress={() => setSelectedMonth(mNum)}
                          style={[
                            s.printMonthChip,
                            isCurMonth && s.printMonthChipActive,
                          ]}
                        >
                          <Text style={[s.printMonthChipText, isCurMonth && s.printMonthChipTextActive]}>
                            {mName.slice(0, 3)}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                </View>
              )}

              {/* Mode Semester */}
              {printRekapRange === 'semester' && (
                <View style={{ gap: 8 }}>
                  <View style={s.printSemesterToggleRow}>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setSelectedSemester('ganjil')}
                      style={[
                        s.printSemesterToggleBtn,
                        selectedSemester === 'ganjil' && s.printSemesterToggleBtnActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="book-open-page-variant"
                        size={14}
                        color={selectedSemester === 'ganjil' ? '#FFFFFF' : '#D97706'}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[
                          s.printSemesterToggleText,
                          selectedSemester === 'ganjil' && s.printSemesterToggleTextActive,
                        ]}
                      >
                        Semester 1 (Ganjil)
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setSelectedSemester('genap')}
                      style={[
                        s.printSemesterToggleBtn,
                        selectedSemester === 'genap' && s.printSemesterToggleBtnActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name="book-open-outline"
                        size={14}
                        color={selectedSemester === 'genap' ? '#FFFFFF' : '#D97706'}
                        style={{ marginRight: 5 }}
                      />
                      <Text
                        style={[
                          s.printSemesterToggleText,
                          selectedSemester === 'genap' && s.printSemesterToggleTextActive,
                        ]}
                      >
                        Semester 2 (Genap)
                      </Text>
                    </TouchableOpacity>
                  </View>

                  {/* Navigasi Tahun Ajaran */}
                  <View style={s.printNavRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setSelectedYear((y) => y - 1)}
                      style={[s.printNavArrowBtn, { borderColor: '#FDE68A' }]}
                    >
                      <MaterialCommunityIcons name="chevron-left" size={20} color="#D97706" />
                    </TouchableOpacity>

                    <View style={s.printNavCenterInfo}>
                      <MaterialCommunityIcons name="calendar-sync" size={15} color="#D97706" style={{ marginRight: 6 }} />
                      <Text style={[s.printNavDateText, { color: '#B45309' }]}>
                        Tahun Ajaran {selectedYear}/{selectedYear + 1}
                      </Text>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setSelectedYear((y) => y + 1)}
                      style={[s.printNavArrowBtn, { borderColor: '#FDE68A' }]}
                    >
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#D97706" />
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* Mode Tahunan */}
              {printRekapRange === 'yearly' && (
                <View style={s.printNavRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedYear((y) => y - 1)}
                    style={[s.printNavArrowBtn, { borderColor: '#FECDD3' }]}
                  >
                    <MaterialCommunityIcons name="chevron-left" size={20} color="#E11D48" />
                  </TouchableOpacity>

                  <View style={s.printNavCenterInfo}>
                    <MaterialCommunityIcons name="calendar-range" size={15} color="#E11D48" style={{ marginRight: 6 }} />
                    <Text style={[s.printNavDateText, { color: '#BE123C' }]}>
                      Tahun Kalender {selectedYear}
                    </Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedYear((y) => y + 1)}
                    style={[s.printNavArrowBtn, { borderColor: '#FECDD3' }]}
                  >
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#E11D48" />
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedYear(new Date().getFullYear())}
                    style={[s.printNavTodayBtn, { backgroundColor: '#FFE4E6', borderColor: '#FECDD3' }]}
                  >
                    <Text style={[s.printNavTodayText, { color: '#BE123C' }]}>Tahun Ini</Text>
                  </TouchableOpacity>
                </View>
              )}
            </View>

            {/* Paper Sheet Design (Standar Format Kop Resmi Tata Usaha) */}
            <View style={s.paperSheet}>
              {/* 1. KOP RESMI LEMBAGA 3-KOLOM (LOGO YAYASAN KIRI, TEKS RESMI TENGAH, LOGO UNIT KANAN) */}
              <View style={s.paperKopRow}>
                {/* Logo Kiri: Yayasan */}
                <View style={s.paperKopLogoBox}>
                  {resolvedYayasanLogo ? (
                    <Image
                      source={{ uri: resolvedYayasanLogo }}
                      style={s.paperKopLogoImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <Image
                      source={require('../../assets/logo.png')}
                      style={s.paperKopLogoImg}
                      resizeMode="contain"
                    />
                  )}
                </View>

                {/* Kolom Tengah: Teks Lembaga & Alamat Lengkap Sesuai Standar TU */}
                <View style={{ flex: 1, alignItems: 'center', paddingHorizontal: 6 }}>
                  <Text style={s.paperKopYayasan}>YAYASAN PENDIDIKAN ISLAM TERPADU DAR EL-IMAN</Text>
                  <Text style={s.paperKopUnit}>{currentUnitName.toUpperCase()}</Text>
                  <Text style={s.paperKopMotto}>
                    "Pusat Pendidikan Islam Terpadu Berkarakter Qur'ani & As-Sunnah"
                  </Text>
                  <Text style={s.paperKopAddress}>
                    Jl. Gurun Laweh No. 2, Nanggalo, Kota Padang, Sumatera Barat • Kode Pos: 25143
                  </Text>
                  <Text style={s.paperKopContact}>
                    NPSN: 69989012 • Akreditasi A • Telp: (0751) 705888 • Email: tu@dareliman.sch.id
                  </Text>
                </View>

                {/* Logo Kanan: Unit Pendidikan */}
                <View style={s.paperKopLogoBox}>
                  {resolvedUnitLogo ? (
                    <Image
                      source={{ uri: resolvedUnitLogo }}
                      style={s.paperKopLogoImg}
                      resizeMode="contain"
                    />
                  ) : (
                    <View style={s.paperKopFallbackUnitBox}>
                      <MaterialCommunityIcons name="school" size={26} color="#059669" />
                    </View>
                  )}
                </View>
              </View>

              {/* Garis Kop Ganda Pembatas Resmi Tata Usaha */}
              <View style={s.paperKopDividerThick} />
              <View style={s.paperKopDividerThin} />

              {/* 2. JUDUL DOKUMEN & NOMOR RESMI SURAT KELUAR TU */}
              <View style={s.paperDocHeader}>
                <Text style={s.paperDocTitle}>{printDocMeta.title}</Text>
                <Text style={s.paperDocNumber}>{printDocMeta.docNo}</Text>
                <Text style={s.paperDocSub}>{printDocMeta.subtitle}</Text>
                <Text style={s.paperDocPrintMeta}>
                  Dicetak pada:{' '}
                  {new Date().toLocaleDateString('id-ID', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric',
                  })}{' '}
                  • Format Resmi Rekapitulasi Tata Usaha
                </Text>
              </View>

              {/* 3. KOTAK INFORMASI IDENTITAS DOKUMEN STANDAR TU */}
              <View style={s.paperInfoBox}>
                {printDocMeta.isIndividu && selectedEmployee ? (
                  <>
                    <View style={s.paperInfoRow}>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Nama PTK</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal} numberOfLines={1}>
                          {selectedEmployee.full_name || selectedEmployee.nama_lengkap || selectedEmployee.name}
                        </Text>
                      </View>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>NIP / NIY</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal}>{selectedEmployee.nip || selectedEmployee.nik || '-'}</Text>
                      </View>
                    </View>
                    <View style={s.paperInfoRow}>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Jabatan</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal} numberOfLines={1}>
                          {selectedEmployee.position || selectedEmployee.jabatan || 'Tenaga Pendidik'}
                        </Text>
                      </View>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Unit Madrasah</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal} numberOfLines={1}>{currentUnitName}</Text>
                      </View>
                    </View>
                    <View style={s.paperInfoRow}>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Tingkat Hadir</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={[s.paperInfoVal, { color: '#047857' }]}>
                          {activePrintStats.total > 0
                            ? `${Math.round((activePrintStats.hadir / activePrintStats.total) * 100)}% (${activePrintStats.hadir} Hadir dari ${activePrintStats.total} Hari)`
                            : '0%'}
                        </Text>
                      </View>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Tahun Ajaran</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal}>{selectedYear}/{selectedYear + 1}</Text>
                      </View>
                    </View>
                  </>
                ) : (
                  <>
                    <View style={s.paperInfoRow}>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Satuan Unit</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal} numberOfLines={1}>
                          {currentUnitName}
                        </Text>
                      </View>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Tahun Ajaran</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal}>{selectedYear}/{selectedYear + 1}</Text>
                      </View>
                    </View>
                    <View style={s.paperInfoRow}>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Pimpinan Unit</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={s.paperInfoVal} numberOfLines={1}>
                          {user?.name || 'Kepala Sekolah'}
                        </Text>
                      </View>
                      <View style={s.paperInfoCol}>
                        <Text style={s.paperInfoLabel}>Tingkat Hadir</Text>
                        <Text style={s.paperInfoColon}>:</Text>
                        <Text style={[s.paperInfoVal, { color: '#047857' }]}>
                          {activePrintStats.total > 0
                            ? `${Math.round((activePrintStats.hadir / activePrintStats.total) * 100)}% (${activePrintStats.hadir}/${activePrintStats.total} ${activeSubject === 'siswa' ? 'Santri' : 'Pegawai'})`
                            : '0%'}
                        </Text>
                      </View>
                    </View>
                  </>
                )}
              </View>

              {/* 4. TABEL REKAPITULASI KPI KEHADIRAN RESMI */}
              <View style={s.printTable}>
                <View style={[s.printTableRow, s.printTableHeader]}>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '800', color: '#047857' }]}>Total</Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '800', color: '#059669' }]}>Hadir</Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '800', color: '#0891B2' }]}>Dinas Luar</Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '800', color: '#D97706' }]}>Telat</Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '800', color: '#2563EB' }]}>Izin/Sakit</Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '800', color: '#E11D48' }]}>Alpa</Text>
                </View>
                <View style={s.printTableRow}>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '700' }]}>{activePrintStats.total}</Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '700', color: '#059669' }]}>
                    {activePrintStats.hadir}
                  </Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '700', color: '#0891B2' }]}>
                    {activePrintStats.dinasLuar}
                  </Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '700', color: '#D97706' }]}>
                    {activePrintStats.terlambat}
                  </Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '700', color: '#2563EB' }]}>
                    {activePrintStats.izin + activePrintStats.sakit}
                  </Text>
                  <Text style={[s.printTableCol, { flex: 1, fontWeight: '700', color: '#E11D48' }]}>
                    {activePrintStats.alpa}
                  </Text>
                </View>
              </View>

              {/* 5. TABEL RINCIAN PRESENSI (ADAPTIF KOLEKTIF VS INDIVIDU) */}
              <View style={[s.printTable, { marginTop: 12 }]}>
                {printDocMeta.isIndividu && (selectedEmployee || selectedStudent) ? (
                  // Tabel Rincian Kehadiran Per Hari untuk Individu Pegawai
                  <>
                    <View style={[s.printTableRow, s.printTableHeader]}>
                      <Text style={[s.printTableCol, { width: 28, fontWeight: '800' }]}>No</Text>
                      <Text style={[s.printTableCol, { flex: 1.5, fontWeight: '800', textAlign: 'left', paddingLeft: 6 }]}>
                        Tanggal / Hari
                      </Text>
                      <Text style={[s.printTableCol, { width: 56, fontWeight: '800' }]}>Masuk</Text>
                      <Text style={[s.printTableCol, { width: 56, fontWeight: '800' }]}>Pulang</Text>
                      <Text style={[s.printTableCol, { flex: 1, fontWeight: '800' }]}>Status</Text>
                      <Text style={[s.printTableCol, { flex: 1.5, fontWeight: '800', textAlign: 'left', paddingLeft: 6 }]}>
                        Keterangan
                      </Text>
                    </View>
                    {targetPersonRecords.length > 0 ? (
                      targetPersonRecords.slice(0, 31).map((r: any, idx: number) => {
                        const rawStUpper = String(r.status || 'Hadir').toUpperCase();
                        const displaySt = ['DINAS_LUAR', 'DINAS LUAR', 'DL'].includes(rawStUpper)
                          ? 'DINAS'
                          : rawStUpper;
                        const isHadirSt = ['HADIR', 'H'].includes(rawStUpper);
                        const isDLSt = ['DINAS', 'DINAS_LUAR', 'DL'].includes(displaySt);
                        const isLateSt = ['TERLAMBAT', 'TELAT', 'T'].includes(rawStUpper);
                        const dateStr = r.attendance_date || r.date || selectedDate;

                        return (
                          <View key={idx} style={s.printTableRow}>
                            <Text style={[s.printTableCol, { width: 28 }]}>{idx + 1}</Text>
                            <Text
                              style={[s.printTableCol, { flex: 1.5, textAlign: 'left', paddingLeft: 6, fontWeight: '600' }]}
                              numberOfLines={1}
                            >
                              {dateStr}
                            </Text>
                            <Text style={[s.printTableCol, { width: 56 }]}>
                              {r.check_in_time ? String(r.check_in_time).slice(0, 5) : '--:--'}
                            </Text>
                            <Text style={[s.printTableCol, { width: 56 }]}>
                              {r.check_out_time ? String(r.check_out_time).slice(0, 5) : '--:--'}
                            </Text>
                            <Text
                              style={[
                                s.printTableCol,
                                {
                                  flex: 1,
                                  fontWeight: '800',
                                  color: isHadirSt
                                    ? '#059669'
                                    : isDLSt
                                      ? '#0891B2'
                                      : isLateSt
                                        ? '#D97706'
                                        : '#E11D48',
                                },
                              ]}
                            >
                              {displaySt}
                            </Text>
                            <Text
                              style={[s.printTableCol, { flex: 1.5, textAlign: 'left', paddingLeft: 6, fontSize: 8.5 }]}
                              numberOfLines={1}
                            >
                              {r.notes || r.keterangan || '-'}
                            </Text>
                          </View>
                        );
                      })
                    ) : (
                      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>
                          Tidak ada catatan presensi pada rentang waktu ini.
                        </Text>
                      </View>
                    )}
                  </>
                ) : printRekapRange !== 'daily' ? (
                  // Tabel Rekap Matriks Akumulatif (Mingguan, Bulanan, Semester, Tahunan) Kolektif
                  <>
                    <View style={[s.printTableRow, s.printTableHeader]}>
                      <Text style={[s.printTableCol, { width: 24, fontWeight: '800' }]}>No</Text>
                      <Text style={[s.printTableCol, { flex: 2, fontWeight: '800', textAlign: 'left', paddingLeft: 4 }]}>
                        {activeSubject === 'siswa' ? 'Nama Santri' : 'Nama Guru & Pegawai'}
                      </Text>
                      <Text style={[s.printTableCol, { width: 26, fontWeight: '800', color: '#059669' }]}>H</Text>
                      <Text style={[s.printTableCol, { width: 26, fontWeight: '800', color: '#0891B2' }]}>DL</Text>
                      <Text style={[s.printTableCol, { width: 26, fontWeight: '800', color: '#D97706' }]}>T</Text>
                      <Text style={[s.printTableCol, { width: 26, fontWeight: '800', color: '#2563EB' }]}>I</Text>
                      <Text style={[s.printTableCol, { width: 26, fontWeight: '800', color: '#DC2626' }]}>S</Text>
                      <Text style={[s.printTableCol, { width: 26, fontWeight: '800', color: '#475569' }]}>A</Text>
                      <Text style={[s.printTableCol, { width: 44, fontWeight: '800', color: '#047857' }]}>%</Text>
                    </View>
                    {collectivePeriodicSummary.length > 0 ? (
                      collectivePeriodicSummary.slice(0, 35).map((row, idx) => (
                        <View key={idx} style={s.printTableRow}>
                          <Text style={[s.printTableCol, { width: 24 }]}>{idx + 1}</Text>
                          <View style={{ flex: 2, paddingLeft: 4, justifyContent: 'center' }}>
                            <Text style={{ fontSize: 9.5, fontWeight: '700', color: '#0F172A' }} numberOfLines={1}>
                              {row.name}
                            </Text>
                            <Text style={{ fontSize: 8, color: '#64748B' }} numberOfLines={1}>
                              {row.idNum} • {row.position}
                            </Text>
                          </View>
                          <Text style={[s.printTableCol, { width: 26, fontWeight: '700', color: '#059669' }]}>{row.hadir}</Text>
                          <Text style={[s.printTableCol, { width: 26, fontWeight: '600', color: '#0891B2' }]}>{row.dinasLuar}</Text>
                          <Text style={[s.printTableCol, { width: 26, fontWeight: '600', color: '#D97706' }]}>{row.terlambat}</Text>
                          <Text style={[s.printTableCol, { width: 26, fontWeight: '600', color: '#2563EB' }]}>{row.izin}</Text>
                          <Text style={[s.printTableCol, { width: 26, fontWeight: '600', color: '#DC2626' }]}>{row.sakit}</Text>
                          <Text style={[s.printTableCol, { width: 26, fontWeight: '600', color: '#475569' }]}>{row.alpa}</Text>
                          <Text
                            style={[
                              s.printTableCol,
                              {
                                width: 44,
                                fontWeight: '800',
                                color: row.pct >= 90 ? '#059669' : row.pct >= 75 ? '#D97706' : '#DC2626',
                              },
                            ]}
                          >
                            {row.pct}%
                          </Text>
                        </View>
                      ))
                    ) : (
                      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>
                          Tidak ada catatan presensi pada rentang {activePeriodMeta.label.toLowerCase()} ini.
                        </Text>
                      </View>
                    )}
                  </>
                ) : (
                  // Tabel Rincian Harian Kolektif Seluruh Guru & Pegawai Unit
                  <>
                    <View style={[s.printTableRow, s.printTableHeader]}>
                      <Text style={[s.printTableCol, { width: 28, fontWeight: '800' }]}>No</Text>
                      <Text style={[s.printTableCol, { flex: 2, fontWeight: '800', textAlign: 'left', paddingLeft: 6 }]}>
                        {activeSubject === 'siswa' ? 'Nama Santri' : 'Nama Pegawai'}
                      </Text>
                      <Text style={[s.printTableCol, { flex: 1, fontWeight: '800' }]}>
                        {activeSubject === 'siswa' ? 'NIS' : 'NIP'}
                      </Text>
                      <Text style={[s.printTableCol, { flex: 1, fontWeight: '800' }]}>Status</Text>
                      <Text style={[s.printTableCol, { width: 56, fontWeight: '800' }]}>Masuk</Text>
                      <Text style={[s.printTableCol, { width: 56, fontWeight: '800' }]}>Pulang</Text>
                    </View>
                    {filteredRecords.length > 0 ? (
                      filteredRecords.slice(0, 25).map((r: any, idx: number) => {
                        const person = activeSubject === 'siswa' ? r.student || r : r.employee || r;
                        const name = person.nama_lengkap || person.full_name || person.name || 'Data PTK';
                        const idNum = person.nis || person.nip || person.nik || r.nis || r.nip || '-';
                        const rawStUpper = String(r.status || 'Hadir').toUpperCase();
                        const displaySt = ['DINAS_LUAR', 'DINAS LUAR', 'DL'].includes(rawStUpper)
                          ? 'DINAS'
                          : rawStUpper;
                        const isHadirSt = ['HADIR', 'H'].includes(rawStUpper);
                        const isDLSt = ['DINAS', 'DINAS_LUAR', 'DL'].includes(displaySt);
                        const isLateSt = ['TERLAMBAT', 'TELAT', 'T'].includes(rawStUpper);

                        return (
                          <View key={idx} style={s.printTableRow}>
                            <Text style={[s.printTableCol, { width: 28 }]}>{idx + 1}</Text>
                            <Text
                              style={[s.printTableCol, { flex: 2, textAlign: 'left', paddingLeft: 6, fontWeight: '700' }]}
                              numberOfLines={1}
                            >
                              {name}
                            </Text>
                            <Text style={[s.printTableCol, { flex: 1 }]}>{idNum}</Text>
                            <Text
                              style={[
                                s.printTableCol,
                                {
                                  flex: 1,
                                  fontWeight: '800',
                                  color: isHadirSt
                                    ? '#059669'
                                    : isDLSt
                                      ? '#0891B2'
                                      : isLateSt
                                        ? '#D97706'
                                        : '#E11D48',
                                },
                              ]}
                            >
                              {displaySt}
                            </Text>
                            <Text style={[s.printTableCol, { width: 56 }]}>
                              {r.check_in_time ? String(r.check_in_time).slice(0, 5) : '--:--'}
                            </Text>
                            <Text style={[s.printTableCol, { width: 56 }]}>
                              {r.check_out_time ? String(r.check_out_time).slice(0, 5) : '--:--'}
                            </Text>
                          </View>
                        );
                      })
                    ) : (
                      <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                        <Text style={{ fontSize: 11, color: '#64748B', fontStyle: 'italic' }}>
                          Tidak ada catatan presensi pada tanggal {selectedDate}.
                        </Text>
                      </View>
                    )}
                  </>
                )}
              </View>

              {/* 6. PENGESAHAN TANDA TANGAN RESMI GANDA KEDINASAN TU */}
              <View style={s.paperFooterSign}>
                {/* Kolom Kiri: Kepala Urusan Tata Usaha */}
                <View style={s.signCol}>
                  <Text style={s.signDate}>
                    Padang,{' '}
                    {new Date().toLocaleDateString('id-ID', {
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={s.signRole}>Kepala Urusan Tata Usaha</Text>
                  <View style={s.signSpace} />
                  <Text style={s.signName}>
                    {(() => {
                      const effUnit = (isPrincipal && principalUnitId
                        ? units.find((u) => String(u.id) === String(principalUnitId))
                        : (selectedUnitId !== 'all' ? units.find((u) => String(u.id) === String(selectedUnitId)) : units[0])) || null;
                      return (effUnit as any)?.tu_officer_name || (effUnit as any)?.tu_name || (effUnit as any)?.kepala_tu || '( .................................................. )';
                    })()}
                  </Text>
                  <Text style={s.signNip}>
                    {(() => {
                      const effUnit = (isPrincipal && principalUnitId
                        ? units.find((u) => String(u.id) === String(principalUnitId))
                        : (selectedUnitId !== 'all' ? units.find((u) => String(u.id) === String(selectedUnitId)) : units[0])) || null;
                      const nipVal = (effUnit as any)?.tu_officer_nip || (effUnit as any)?.tu_nip;
                      return nipVal ? `NIP. ${nipVal}` : 'NIP. —';
                    })()}
                  </Text>
                </View>

                {/* Kolom Kanan: Mengetahui Kepala Sekolah / Mudir */}
                <View style={s.signCol}>
                  <Text style={s.signDate}>Mengetahui,</Text>
                  <Text style={s.signRole}>Kepala Sekolah / Mudir Unit</Text>
                  <View style={s.signSpace} />
                  <Text style={s.signName}>
                    {(() => {
                      const effUnit = (isPrincipal && principalUnitId
                        ? units.find((u) => String(u.id) === String(principalUnitId))
                        : (selectedUnitId !== 'all' ? units.find((u) => String(u.id) === String(selectedUnitId)) : units[0])) || null;
                      return (effUnit as any)?.principal_name || (effUnit as any)?.kepala_sekolah || (isPrincipal ? user?.name : '( .................................................. )');
                    })()}
                  </Text>
                  <Text style={s.signNip}>
                    {(() => {
                      const effUnit = (isPrincipal && principalUnitId
                        ? units.find((u) => String(u.id) === String(principalUnitId))
                        : (selectedUnitId !== 'all' ? units.find((u) => String(u.id) === String(selectedUnitId)) : units[0])) || null;
                      const pNip = (effUnit as any)?.principal_nip || (isPrincipal ? ((user as any)?.nip || (user as any)?.nik) : null);
                      return pNip ? `NIP. ${pNip}` : 'NIP. —';
                    })()}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── MODAL DROPDOWN: PILIH ROMBEL & KELAS (REKAP SISWA) ── */}
      <Modal
        visible={showClassDropdown}
        transparent
        animationType="fade"
        onRequestClose={() => setShowClassDropdown(false)}
        statusBarTranslucent
      >
        <TouchableOpacity activeOpacity={1} style={s.classDropdownBackdrop} onPress={() => setShowClassDropdown(false)}>
          <View style={s.classDropdownModalCard} onStartShouldSetResponder={() => true}>
            <View style={s.classDropdownModalHeader}>
              <View style={s.classDropdownHeaderLeft}>
                <View style={s.classDropdownHeaderIconWrap}>
                  <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
                </View>
                <View>
                  <Text style={s.classDropdownModalTitle}>Pilih Rombel / Kelas</Text>
                  <Text style={s.classDropdownModalSubtitle}>Filter data rekapitulasi per rombel</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setShowClassDropdown(false)}
                style={s.classDropdownCloseBtn}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Live Search */}
            <View style={s.classDropdownSearchWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={s.classDropdownSearchInput}
                placeholder="Cari nama rombel / kelas..."
                placeholderTextColor="#94A3B8"
                value={classSearchQuery}
                onChangeText={setClassSearchQuery}
                autoCorrect={false}
              />
              {Boolean(classSearchQuery) && (
                <TouchableOpacity onPress={() => setClassSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* List Rombel */}
            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.45 }} nestedScrollEnabled>
              {(!classSearchQuery || 'semua kelas'.includes(classSearchQuery.toLowerCase())) && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedClassId('all');
                    setShowClassDropdown(false);
                  }}
                  style={[s.classDropdownItem, selectedClassId === 'all' && s.classDropdownItemActive]}
                >
                  <View style={[s.classDropdownItemIcon, selectedClassId === 'all' && s.classDropdownItemIconActive]}>
                    <MaterialCommunityIcons
                      name="account-group"
                      size={18}
                      color={selectedClassId === 'all' ? '#059669' : '#64748B'}
                    />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={[s.classDropdownItemTitle, selectedClassId === 'all' && s.classDropdownItemTitleActive]}>
                      Semua Kelas & Rombel
                    </Text>
                    <Text style={s.classDropdownItemSub}>
                      Rekap gabungan seluruh rombel aktif ({classes.length} kelas)
                    </Text>
                  </View>
                  {selectedClassId === 'all' ? (
                    <View style={s.classDropdownCheckBadge}>
                      <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                    </View>
                  ) : (
                    <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
                  )}
                </TouchableOpacity>
              )}

              {classes
                .filter((c: any) => {
                  const q = classSearchQuery.toLowerCase().trim();
                  if (!q) return true;
                  const name = String(c.name || c.nama_kelas || '').toLowerCase();
                  const unit = String(c.unit_pendidikan?.name || c.unit_name || '').toLowerCase();
                  return name.includes(q) || unit.includes(q);
                })
                .map((c: any) => {
                  const isSel = selectedClassId === String(c.id);
                  const cName = c.name || c.nama_kelas || `Kelas ${c.id}`;
                  const cUnit = c.unit_pendidikan?.name || c.unit_name || '';
                  const cCount = c.students_count ? `${c.students_count} Siswa` : null;

                  return (
                    <TouchableOpacity
                      key={c.id}
                      activeOpacity={0.8}
                      onPress={() => {
                        setSelectedClassId(String(c.id));
                        setShowClassDropdown(false);
                      }}
                      style={[s.classDropdownItem, isSel && s.classDropdownItemActive]}
                    >
                      <View style={[s.classDropdownItemIcon, isSel && s.classDropdownItemIconActive]}>
                        <MaterialCommunityIcons name="google-classroom" size={18} color={isSel ? '#059669' : '#64748B'} />
                      </View>
                      <View style={{ flex: 1, marginRight: 8 }}>
                        <Text style={[s.classDropdownItemTitle, isSel && s.classDropdownItemTitleActive]} numberOfLines={1}>
                          {cName}
                        </Text>
                        <Text style={s.classDropdownItemSub} numberOfLines={1}>
                          {cUnit}
                          {cCount ? ` · ${cCount}` : ''}
                        </Text>
                      </View>
                      {isSel ? (
                        <View style={s.classDropdownCheckBadge}>
                          <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                        </View>
                      ) : (
                        <MaterialCommunityIcons name="chevron-right" size={18} color="#CBD5E1" />
                      )}
                    </TouchableOpacity>
                  );
                })}
            </ScrollView>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── MODAL: SEARCH & PICK INDIVIDUAL STUDENT ── */}
      <Modal visible={showStudentPickerModal} animationType="slide" transparent={false} onRequestClose={() => setShowStudentPickerModal(false)}>
        <View style={[s.printModalRoot, { paddingTop: topInset + 6, paddingBottom: bottomInset + 16 }]}>
          <View style={s.printModalHeader}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowStudentPickerModal(false)} style={s.printBackBtn}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.printModalTitle}>Pilih Santri / Siswa</Text>
              <Text style={s.printModalSubtitle}>Pencarian data individual santri</Text>
            </View>
          </View>

          <View style={{ padding: 14 }}>
            <View style={s.searchInputWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                placeholder="Ketik nama atau NIS santri..."
                placeholderTextColor="#94A3B8"
                value={studentSearchQuery}
                onChangeText={setStudentSearchQuery}
                style={s.searchInput}
                autoFocus
              />
            </View>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 14 }} showsVerticalScrollIndicator={false}>
            {studentsList
              .filter((st) => {
                const q = studentSearchQuery.toLowerCase();
                return (
                  !q ||
                  String(st.nama_lengkap || st.name || '').toLowerCase().includes(q) ||
                  String(st.nis || '').includes(q)
                );
              })
              .map((st) => (
                <TouchableOpacity
                  key={st.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedStudent(st);
                    setShowStudentPickerModal(false);
                  }}
                  style={s.pickerStudentItem}
                >
                  <Image
                    source={st.avatar ? { uri: getProfileImageUrl(st) } : DEFAULT_STUDENT_BOY_AVATAR}
                    style={s.pickerAvatar}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.pickerName}>{st.nama_lengkap || st.name}</Text>
                    <Text style={s.pickerSub}>
                      NIS: {st.nis || '-'} • {st.kelas?.nama_kelas || st.kelas_name || 'Rombel'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── MODAL: SEARCH & PICK INDIVIDUAL EMPLOYEE / GURU ── */}
      <Modal visible={showEmployeePickerModal} animationType="slide" transparent={false} onRequestClose={() => setShowEmployeePickerModal(false)}>
        <View style={[s.printModalRoot, { paddingTop: topInset + 6, paddingBottom: bottomInset + 16 }]}>
          <View style={s.printModalHeader}>
            <TouchableOpacity activeOpacity={0.8} onPress={() => setShowEmployeePickerModal(false)} style={s.printBackBtn}>
              <MaterialCommunityIcons name="arrow-left" size={20} color="#059669" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.printModalTitle}>Pilih Guru / Pegawai</Text>
              <Text style={s.printModalSubtitle}>Pencarian tenaga pendidik & kependidikan unit</Text>
            </View>
          </View>

          <View style={{ padding: 14 }}>
            <View style={s.searchInputWrap}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" style={{ marginRight: 6 }} />
              <TextInput
                placeholder="Ketik nama, NIP, atau mata pelajaran..."
                placeholderTextColor="#94A3B8"
                value={employeeSearchQuery}
                onChangeText={setEmployeeSearchQuery}
                style={s.searchInput}
                autoFocus
              />
            </View>
          </View>

          <ScrollView style={{ flex: 1, paddingHorizontal: 14 }} showsVerticalScrollIndicator={false}>
            {employeesList
              .filter((emp) => {
                const pos = String(emp.position || emp.jabatan || emp.role || '').toLowerCase();
                const satKerja = String(emp.satuan_kerja || emp.level_label || '').toLowerCase();
                // Tolak Pengurus Yayasan dan Divisi Pendidikan
                if (
                  satKerja.includes('pengurus') ||
                  satKerja.includes('yayasan') ||
                  satKerja.includes('bidang pendidikan') ||
                  satKerja.includes('divisi pendidikan') ||
                  pos.includes('yayasan') ||
                  pos.includes('pengurus') ||
                  pos.includes('divisi pendidikan') ||
                  pos.includes('bidang pendidikan') ||
                  pos.includes('kepala bidang')
                ) {
                  return false;
                }
                const q = employeeSearchQuery.toLowerCase();
                if (!q) return true;
                const name = String(emp.full_name || emp.nama_lengkap || emp.name || '').toLowerCase();
                const nip = String(emp.nip || emp.nik || '').toLowerCase();
                return name.includes(q) || nip.includes(q) || pos.includes(q);
              })
              .map((emp) => (
                <TouchableOpacity
                  key={emp.id}
                  activeOpacity={0.8}
                  onPress={() => {
                    setSelectedEmployee(emp);
                    setShowEmployeePickerModal(false);
                  }}
                  style={s.pickerStudentItem}
                >
                  <Image
                    source={
                      emp.avatar || emp.photo_url || emp.foto_url
                        ? { uri: getProfileImageUrl(emp) }
                        : DEFAULT_PARENT_AVATAR
                    }
                    style={s.pickerAvatar}
                  />
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={s.pickerName}>{emp.full_name || emp.nama_lengkap || emp.name}</Text>
                    <Text style={s.pickerSub}>
                      NIP: {emp.nip || emp.nik || '-'} • {emp.position || emp.jabatan || 'Tenaga Pendidik'}
                    </Text>
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                </TouchableOpacity>
              ))}
          </ScrollView>
        </View>
      </Modal>

      {/* ── MODAL DROPDOWN: PILIH PERIODE WAKTU ── */}
      <Modal
        visible={showPeriodDropdown}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowPeriodDropdown(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowPeriodDropdown(false)}
          style={s.modalBackdropOverlay}
        >
          <View style={s.modalBottomSheetCard}>
            <View style={s.modalSheetHeader}>
              <View style={[s.modalSheetIconBadge, { backgroundColor: '#ECFDF5' }]}>
                <MaterialCommunityIcons name="calendar-clock" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.modalSheetTitle}>Pilih Periode Waktu</Text>
                <Text style={s.modalSheetSub}>Pilih rentang waktu rekapitulasi presensi</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowPeriodDropdown(false)}
                style={s.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={s.modalSheetOptionsList}>
              {PERIOD_OPTIONS.map((item) => {
                const isSelected = selectedPeriod === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedPeriod(item.key);
                      setShowPeriodDropdown(false);
                    }}
                    style={[
                      s.modalOptionItem,
                      isSelected && { backgroundColor: item.bg, borderColor: item.color },
                    ]}
                  >
                    <View style={[s.modalOptionIconBox, { backgroundColor: item.bg }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[s.modalOptionTitle, isSelected && { color: item.color, fontWeight: '800' }]}>
                        {item.label}
                      </Text>
                      <Text style={s.modalOptionSub}>{item.badge}</Text>
                    </View>
                    {isSelected ? (
                      <View style={[s.modalOptionCheckBadge, { backgroundColor: item.color }]}>
                        <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={s.modalOptionUncheckedCircle} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── MODAL DROPDOWN: PILIH STATUS PRESENSI ── */}
      <Modal
        visible={showStatusDropdown}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowStatusDropdown(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowStatusDropdown(false)}
          style={s.modalBackdropOverlay}
        >
          <View style={s.modalBottomSheetCard}>
            <View style={s.modalSheetHeader}>
              <View style={[s.modalSheetIconBadge, { backgroundColor: '#F0FDFA' }]}>
                <MaterialCommunityIcons name="filter-check-outline" size={20} color="#0D9488" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.modalSheetTitle}>Pilih Status Presensi</Text>
                <Text style={s.modalSheetSub}>Tampilkan data menurut klasifikasi kehadiran</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowStatusDropdown(false)}
                style={s.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={s.modalSheetOptionsList}>
              {STATUS_OPTIONS.map((item) => {
                const isSelected = statusFilter === item.key;
                const labelText = activeSubject === 'siswa' && item.key === 'permit' ? 'Izin (Ada Pemberitahuan)' : item.label;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.8}
                    onPress={() => {
                      setStatusFilter(item.key);
                      setShowStatusDropdown(false);
                    }}
                    style={[
                      s.modalOptionItem,
                      isSelected && { backgroundColor: item.bg, borderColor: item.color },
                    ]}
                  >
                    <View style={[s.modalOptionIconBox, { backgroundColor: item.bg }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[s.modalOptionTitle, isSelected && { color: item.color, fontWeight: '800' }]}>
                        {labelText}
                      </Text>
                      <Text style={s.modalOptionSub}>{item.desc}</Text>
                    </View>
                    {isSelected ? (
                      <View style={[s.modalOptionCheckBadge, { backgroundColor: item.color }]}>
                        <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={s.modalOptionUncheckedCircle} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* ── MODAL DROPDOWN: PILIH KATEGORI PTK ── */}
      <Modal
        visible={showStaffCategoryDropdown}
        animationType="fade"
        transparent={true}
        onRequestClose={() => setShowStaffCategoryDropdown(false)}
      >
        <TouchableOpacity
          activeOpacity={1}
          onPress={() => setShowStaffCategoryDropdown(false)}
          style={s.modalBackdropOverlay}
        >
          <View style={s.modalBottomSheetCard}>
            <View style={s.modalSheetHeader}>
              <View style={[s.modalSheetIconBadge, { backgroundColor: '#ECFDF5' }]}>
                <MaterialCommunityIcons name="account-group" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.modalSheetTitle}>Kategori Tenaga PTK</Text>
                <Text style={s.modalSheetSub}>Unit: {currentUnitName}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowStaffCategoryDropdown(false)}
                style={s.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={s.modalSheetOptionsList}>
              {STAFF_CATEGORY_OPTIONS.map((item) => {
                const isSelected = selectedStaffCategory === item.key;
                return (
                  <TouchableOpacity
                    key={item.key}
                    activeOpacity={0.8}
                    onPress={() => {
                      setSelectedStaffCategory(item.key);
                      setShowStaffCategoryDropdown(false);
                    }}
                    style={[
                      s.modalOptionItem,
                      isSelected && { backgroundColor: item.bg, borderColor: item.color },
                    ]}
                  >
                    <View style={[s.modalOptionIconBox, { backgroundColor: item.bg }]}>
                      <MaterialCommunityIcons name={item.icon as any} size={18} color={item.color} />
                    </View>
                    <View style={{ flex: 1, marginLeft: 10 }}>
                      <Text style={[s.modalOptionTitle, isSelected && { color: item.color, fontWeight: '800' }]}>
                        {item.label}
                      </Text>
                      <Text style={s.modalOptionSub}>{item.desc}</Text>
                    </View>
                    {isSelected ? (
                      <View style={[s.modalOptionCheckBadge, { backgroundColor: item.color }]}>
                        <MaterialCommunityIcons name="check" size={14} color="#FFFFFF" />
                      </View>
                    ) : (
                      <View style={s.modalOptionUncheckedCircle} />
                    )}
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </TouchableOpacity>
      </Modal>
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  /* ── Header Halaman Data Master (Matching DataManagementScreen) ── */
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: 'rgba(255, 255, 255, 0.85)',
    letterSpacing: 0.6,
  },
  headerMainTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginTop: 12,
    gap: 8,
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
    borderWidth: 1,
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
    fontSize: 15,
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
  segmentBtnActive: {
    backgroundColor: '#059669',
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

  topHeader: {
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    overflow: 'hidden',
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  headerSquircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  authorityBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  authorityBadgeText: { fontSize: 11, fontWeight: '800', color: '#FFFFFF' },
  headerTitleSection: {
    marginTop: 4,
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#FFFFFF', letterSpacing: -0.2 },
  headerSubtitle: { fontSize: 12.5, color: '#D1FAE5', fontWeight: '600' },
  headerUnitTagRow: { flexDirection: 'row', alignItems: 'center', marginTop: 3 },
  headerActionRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },

  scrollContent: { padding: 14 },

  /* ── Filter Card (Harmonized with Data Master) ── */
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
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
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  filterResetBtn: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
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
  dropdownTriggerSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },

  // Dropdown Triggers
  dropdownTriggerCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.3,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  dropdownIconSquare: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dropdownSelectedTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  dropdownSelectedSub: { fontSize: 11, fontWeight: '600', marginTop: 1 },
  dropdownChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },

  scopeToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
  },
  scopeBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    minHeight: 40,
    borderRadius: 10,
  },
  scopeBtnActive: { backgroundColor: '#FFFFFF', elevation: 1 },
  scopeBtnText: { fontSize: 12.5, fontWeight: '700', color: '#64748B' },
  scopeBtnTextActive: { color: '#059669' },

  filterRowWrap: { marginTop: 10 },
  filterItemCol: { marginBottom: 4 },
  filterLabel: { fontSize: 11.5, fontWeight: '800', color: '#334155', marginBottom: 4 },

  // Date Control
  dateControlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  dateNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  dateCenterBox: { flexDirection: 'row', alignItems: 'center' },
  dateCenterText: { fontSize: 13.5, fontWeight: '800', color: '#0F172A' },

  // Selected Student Card
  selectedStudentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  selectedStudentAvatar: { width: 42, height: 42, borderRadius: 21, marginRight: 10 },
  selectedStudentName: { fontSize: 14, fontWeight: '800', color: '#064E3B' },
  selectedStudentSub: { fontSize: 12, color: '#047857', fontWeight: '600', marginTop: 1 },
  clearStudentBtn: { padding: 6 },
  pickStudentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderStyle: 'dashed',
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 13,
  },
  pickStudentBtnText: { flex: 1, fontSize: 13, fontWeight: '600', color: '#64748B', marginLeft: 8 },

  // KPI Grid (2 Baris Simetris 3 Kolom x 2 Baris)
  kpiGridContainer: { marginBottom: 14 },
  kpiGridRow: { flexDirection: 'row', gap: 8 },
  kpiCardItem: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.4,
    paddingVertical: 9,
    paddingHorizontal: 8,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiCardHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  kpiDot: { width: 7, height: 7, borderRadius: 3.5, marginRight: 4 },
  kpiNum: { fontSize: 17, fontWeight: '900', marginTop: 1 },
  kpiTitle: { fontSize: 11, fontWeight: '800', color: '#334155' },

  // Search & Filter
  searchFilterBox: { marginBottom: 14 },
  searchInputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingHorizontal: 14,
    height: 46,
    marginBottom: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },

  // Modal Bottom Sheet & Dropdown Pickers
  modalBackdropOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalBottomSheetCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    maxHeight: SCREEN_HEIGHT * 0.75,
  },
  modalSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalSheetIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSheetTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  modalSheetSub: { fontSize: 11.5, color: '#64748B', fontWeight: '500' },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalSheetOptionsList: { gap: 8 },
  modalOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 11,
    borderRadius: 14,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  modalOptionIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionTitle: { fontSize: 13, fontWeight: '700', color: '#1E293B' },
  modalOptionSub: { fontSize: 11, color: '#64748B', marginTop: 1 },
  modalOptionCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalOptionUncheckedCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
  },

  /* ── Sub-Action Bar: Unduh Laporan & Cetak Presensi (Gaya Data Master) ── */
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

  /* ── Rincian Data List Container (Gaya Data Master Rekap Siswa) ── */
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

  emptyBox: { paddingVertical: 36, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: { fontSize: 15, fontWeight: '800', color: '#334155', marginTop: 10 },
  emptyText: { fontSize: 12.5, color: '#64748B', textAlign: 'center', marginTop: 4, lineHeight: 18 },

  /* ── Mutation Card & Detail Box (Matching Data Master) ── */
  mutationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
    shadowColor: '#000000',
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
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  avatarImg: {
    width: 42,
    height: 42,
    borderRadius: 12,
  },
  avatarInitialsText: {
    fontSize: 15,
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
  studentName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  tagBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    flexShrink: 0,
  },
  tagBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  nisText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  detailBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 9,
    marginTop: 8,
    gap: 4,
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  detailItemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    width: 65,
  },
  detailItemVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },

  /* ── Action Buttons Container & Tiers (Matching Data Master) ── */
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
  actionTier2Row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionTierBtnDetail: {
    flex: 1,
    minWidth: 0,
    height: 32,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 9,
    paddingHorizontal: 6,
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
    gap: 4,
    backgroundColor: '#F0FDFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    borderRadius: 9,
    paddingHorizontal: 6,
  },
  actionTierBtnTextPrint: {
    color: '#0F766E',
    fontSize: 10.5,
    fontWeight: '700',
    flexShrink: 1,
  },

  // Pagination Controls (2-Tier Layout: Info di Atas, Tombol 50/50 di Bawah)
  paginationContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  paginationInfoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingVertical: 7,
    paddingHorizontal: 12,
    marginBottom: 10,
  },
  paginationInfoText: {
    fontSize: 12,
    color: '#475569',
    fontWeight: '600',
  },
  paginationInfoHighlight: {
    fontWeight: '900',
    color: '#047857',
  },
  paginationButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  paginationNavBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingVertical: 10,
    minHeight: 44,
    borderRadius: 12,
  },
  paginationNavBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  paginationNavBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#047857',
  },
  paginationNavBtnTextDisabled: {
    color: '#94A3B8',
  },

  // Modal Pilihan Periode Rekap Individu PTK / Santri
  individualModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 16,
  },
  individualModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 18,
    elevation: 10,
  },
  individualModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  individualModalIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 11,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  individualModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  individualModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  individualModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  individualTargetCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  individualTargetAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#E2E8F0',
  },
  individualTargetName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  individualTargetSub: {
    fontSize: 11,
    color: '#475569',
    marginTop: 1,
  },
  individualTargetUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  individualTargetUnitText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '700',
  },
  individualSectionLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  individualPeriodList: {
    gap: 8,
    marginBottom: 14,
  },
  individualPeriodItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 12,
    borderWidth: 1.2,
  },
  individualPeriodIconBox: {
    width: 32,
    height: 32,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
  },
  individualPeriodTitle: {
    fontSize: 12.5,
    fontWeight: '800',
  },
  individualPeriodDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  individualCancelBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  individualCancelText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },

  // Print Modal
  printModalRoot: { flex: 1, backgroundColor: '#F1F5F9' },
  printModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  printBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printModalTitle: { fontSize: 15, fontWeight: '800', color: '#0F172A' },
  printModalSubtitle: { fontSize: 11, color: '#64748B' },
  printActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
  },
  printActionText: { fontSize: 12, fontWeight: '800', color: '#FFFFFF' },

  paperContainer: { padding: 12 },
  paperSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 16,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  // Kop Surat Resmi TU 3-Kolom
  paperKopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 4,
  },
  paperKopLogoBox: {
    width: 52,
    height: 52,
    flexShrink: 0,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperKopLogoImg: {
    width: 48,
    height: 48,
  },
  paperKopFallbackUnitBox: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperKopYayasan: {
    fontSize: 11,
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
    fontSize: 8,
    color: '#334155',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 11,
  },
  paperKopContact: {
    fontSize: 7.8,
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
    marginBottom: 10,
  },

  // Document Title & Metadata
  paperDocHeader: {
    alignItems: 'center',
    marginBottom: 10,
  },
  paperDocTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  paperDocNumber: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    marginTop: 2,
  },
  paperDocSub: {
    fontSize: 9,
    color: '#475569',
    marginTop: 2,
    textAlign: 'center',
  },
  paperDocPrintMeta: {
    fontSize: 8,
    color: '#64748B',
    marginTop: 1,
    textAlign: 'center',
  },

  // Info Box Identitas Dokumen
  paperInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 8,
    marginBottom: 10,
    gap: 4,
  },
  paperInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
  },
  paperInfoCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  paperInfoLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#475569',
    width: 65,
  },
  paperInfoColon: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#475569',
    marginRight: 4,
  },
  paperInfoVal: {
    flex: 1,
    fontSize: 8.5,
    fontWeight: '800',
    color: '#0F172A',
  },

  // Print Table
  printTable: { borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 4, overflow: 'hidden' },
  printTableRow: { flexDirection: 'row', borderBottomWidth: 1, borderBottomColor: '#E2E8F0', paddingVertical: 5 },
  printTableHeader: { backgroundColor: '#ECFDF5' },
  printTableCol: { fontSize: 9, textAlign: 'center', color: '#334155' },

  // Signatures TU & Kepala Sekolah
  paperFooterSign: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 20,
    paddingHorizontal: 8,
  },
  signCol: {
    width: 145,
    alignItems: 'center',
  },
  signDate: { fontSize: 8.5, color: '#475569', marginBottom: 2 },
  signRole: { fontSize: 9.5, fontWeight: '800', color: '#0F172A' },
  signSpace: { height: 42 },
  signName: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#0F172A',
    paddingTop: 2,
    textAlign: 'center',
  },
  signNip: {
    fontSize: 8,
    color: '#475569',
    marginTop: 1,
    textAlign: 'center',
  },

  // Print Range Switcher inside Modal
  printRangeSwitchWrap: {
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    flexDirection: 'row',
    marginBottom: 10,
    gap: 4,
  },
  printRangeSwitchBtn: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  printRangeSwitchBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  printRangeSwitchText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  printRangeSwitchTextActive: {
    color: '#059669',
    fontWeight: '800',
  },

  // Interactive Time Navigator in Print Modal
  printTimeNavigatorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 10,
    marginBottom: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 2,
  },
  printNavRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  printNavArrowBtn: {
    width: 34,
    height: 34,
    borderRadius: 9,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  printNavCenterInfo: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  printNavDateText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  printNavTodayBtn: {
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  printNavTodayText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  printMonthChipsWrap: {
    flexDirection: 'row',
    gap: 6,
    paddingTop: 4,
    paddingBottom: 2,
  },
  printMonthChip: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printMonthChipActive: {
    backgroundColor: '#7C3AED',
    borderColor: '#6D28D9',
    elevation: 2,
  },
  printMonthChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  printMonthChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  printSemesterToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 3,
    gap: 4,
  },
  printSemesterToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    borderRadius: 8,
  },
  printSemesterToggleBtnActive: {
    backgroundColor: '#D97706',
    elevation: 1,
  },
  printSemesterToggleText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D97706',
  },
  printSemesterToggleTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Picker Student Item
  pickerStudentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  pickerAvatar: { width: 36, height: 36, borderRadius: 18 },
  pickerName: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  pickerSub: { fontSize: 11, color: '#64748B', marginTop: 1 },

  // ── CLASS DROPDOWN TRIGGER & MODAL STYLES ──
  classDropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 4,
  },
  classDropdownTriggerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  classDropdownIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  classDropdownTriggerText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  classDropdownTriggerSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  classDropdownChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },

  classDropdownBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 18,
  },
  classDropdownModalCard: {
    width: '100%',
    maxWidth: 480,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 12 },
    shadowOpacity: 0.25,
    shadowRadius: 24,
    elevation: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  classDropdownModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  classDropdownHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  classDropdownHeaderIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  classDropdownModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  classDropdownModalSubtitle: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 2,
  },
  classDropdownCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  classDropdownSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 12,
  },
  classDropdownSearchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  classDropdownItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 14,
    marginBottom: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  classDropdownItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  classDropdownItemIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  classDropdownItemIconActive: {
    backgroundColor: '#DCFCE7',
  },
  classDropdownItemTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#0F172A',
  },
  classDropdownItemTitleActive: {
    color: '#059669',
    fontWeight: '800',
  },
  classDropdownItemSub: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  classDropdownCheckBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
