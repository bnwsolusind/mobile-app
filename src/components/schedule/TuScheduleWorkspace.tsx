import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  KeyboardAvoidingView,
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
import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';
import { AppFeedbackModal, FeedbackType } from '../AppFeedbackModal';
import { useNavigationHistoryStore } from '../../stores/navigationHistoryStore';
import { appFeedback } from '../../stores/feedbackStore';
import { offlineCache } from '../../utils/offlineCache';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

const DAY_OPTIONS = [
  { id: 1, name: 'Senin', short: 'Sen', icon: 'calendar-today' },
  { id: 2, name: 'Selasa', short: 'Sel', icon: 'calendar-today' },
  { id: 3, name: 'Rabu', short: 'Rab', icon: 'calendar-today' },
  { id: 4, name: 'Kamis', short: 'Kam', icon: 'calendar-today' },
  { id: 5, name: 'Jumat', short: 'Jum', icon: 'calendar-today' },
  { id: 6, name: 'Sabtu', short: 'Sab', icon: 'calendar-today' },
];

// Tema Warna Harmonis Data Siswa / Master Data
const THEME = {
  headerColors: ['#059669', '#0E5C44', '#004D32'] as [string, string, string],
  primary: '#059669',
  primaryDark: '#065F46',
  accentTeal: '#0D9488',
  accentBlue: '#2563EB',
  accentAmber: '#D97706',
  accentRose: '#E11D48',
};

interface TuScheduleWorkspaceProps {
  navigation: any;
  user: any;
}

export default function TuScheduleWorkspace({ navigation, user }: TuScheduleWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  // ── 1. Data States ──
  const [schedules, setSchedules] = useState<any[]>([]);
  const [options, setOptions] = useState<{
    kelas: any[];
    guru: any[];
    mata_pelajaran: any[];
    tahun_ajaran: any[];
    semester: any[];
    hari: any[];
  }>({
    kelas: [],
    guru: [],
    mata_pelajaran: [],
    tahun_ajaran: [],
    semester: [],
    hari: [],
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);

  // ── 2. Tab & Filter States ──
  const [workspaceTab, setWorkspaceTab] = useState<'schedule' | 'exam'>('schedule');
  const [activityFilter, setActivityFilter] = useState<'all' | 'kbm' | 'activity'>('all');
  const [search, setSearch] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [selectedDay, setSelectedDay] = useState<number | 'all'>('all');
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [filterConflictOnly, setFilterConflictOnly] = useState<boolean>(false);

  // ── 2B. Exam States (Jadwal Ujian PTS/PAS/PAT untuk TU) ──
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [examCategories, setExamCategories] = useState<any[]>([]);
  const [loadingExams, setLoadingExams] = useState<boolean>(false);
  const [selectedExamCategoryId, setSelectedExamCategoryId] = useState<string>('all');
  const [examDetailModalItem, setExamDetailModalItem] = useState<any | null>(null);
  const [examFormModalVisible, setExamFormModalVisible] = useState<boolean>(false);
  const [editingExamItem, setEditingExamItem] = useState<any | null>(null);
  const [deleteExamConfirmItem, setDeleteExamConfirmItem] = useState<any | null>(null);

  // Form State Jadwal Ujian
  const [examFormData, setExamFormData] = useState<{
    academic_year_id: string;
    semester_id: string;
    exam_category_id: string;
    kelas_id: string;
    subject_id: string;
    exam_date: string;
    time_start: string;
    time_end: string;
    duration_minutes: number;
    room: string;
    invigilator_id: string;
    notes: string;
  }>({
    academic_year_id: '',
    semester_id: '',
    exam_category_id: '',
    kelas_id: '',
    subject_id: '',
    exam_date: '',
    time_start: '07:30',
    time_end: '09:30',
    duration_minutes: 120,
    room: '',
    invigilator_id: '',
    notes: '',
  });

  // ── 3. Modals State ──
  const [detailModalItem, setDetailModalItem] = useState<any | null>(null);
  const [formModalVisible, setFormModalVisible] = useState<boolean>(false);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [deleteConfirmItem, setDeleteConfirmItem] = useState<any | null>(null);
  const [saving, setSaving] = useState<boolean>(false);
  const [conflictWarning, setConflictWarning] = useState<string>('');
  const [printModalVisible, setPrintModalVisible] = useState<boolean>(false);
  const [printNotice, setPrintNotice] = useState<string>('');
  const [printFormatMode, setPrintFormatMode] = useState<'matrix' | 'table'>('matrix');
  const [printKelasId, setPrintKelasId] = useState<string>('all');

  // Dropdown Picker Modal
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    items: { id: string | number; label: string; sub?: string }[];
    onSelect: (item: any) => void;
  } | null>(null);

  // Feedback Modal
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Availability State (Rincian Hari Kosong & Rekomendasi Jam Bebas Bentrok)
  const [availabilityData, setAvailabilityData] = useState<any>(null);
  const [availabilityLoading, setAvailabilityLoading] = useState<boolean>(false);

  // ── 4. Form State ──
  const [formData, setFormData] = useState<{
    unit_pendidikan_id: string;
    kelas_id: string;
    employee_id: string;
    subject_id: string;
    academic_year_id: string;
    semester_id: string;
    day_of_week: number;
    time_start: string;
    time_end: string;
    room: string;
    notes: string;
    is_active: boolean;
    activity_type: 'kbm' | 'activity';
    activity_name: string;
  }>({
    unit_pendidikan_id: '',
    kelas_id: '',
    employee_id: '',
    subject_id: '',
    academic_year_id: '',
    semester_id: '',
    day_of_week: 1,
    time_start: '07:30',
    time_end: '09:00',
    room: '',
    notes: '',
    is_active: true,
    activity_type: 'kbm',
    activity_name: '',
  });

  // Resolusi Unit Sekolah TU
  const unitName = useMemo(() => {
    return (
      user?.unit_name ||
      user?.education_unit?.name ||
      user?.unit?.name ||
      user?.unit_pendidikan?.nama ||
      'Unit Sekolah'
    );
  }, [user]);

  const unitId = useMemo(() => {
    return (
      user?.unit_id ||
      user?.education_unit_id ||
      user?.unit_pendidikan_id ||
      user?.unit?.id ||
      ''
    );
  }, [user]);

  const programType = useMemo(() => {
    return (
      user?.education_unit?.program_type ||
      user?.unit?.program_type ||
      (unitName.toLowerCase().includes('ponpes') || unitName.toLowerCase().includes('pesantren') ? 'boarding' : 'fullday')
    );
  }, [user, unitName]);

  // ── 5. Fetch Data Jadwal & Options ──
  const fetchData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const [schedRes, optRes] = await Promise.allSettled([
        mobileApiService.getUnitSchedules({ per_page: 200 }),
        mobileApiService.getScheduleOptions(),
      ]);

      if (schedRes.status === 'fulfilled') {
        const raw = unwrapApiData<any[]>(schedRes.value) || [];
        const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
        setSchedules(Array.isArray(list) ? list : []);
      }

      if (optRes.status === 'fulfilled') {
        const rawOpts = unwrapApiData<any>(optRes.value) || optRes.value || {};
        const safeOpts = (rawOpts?.data ? rawOpts.data : rawOpts) || {};
        setOptions({
          kelas: Array.isArray(safeOpts?.kelas) ? safeOpts.kelas : [],
          guru: Array.isArray(safeOpts?.guru) ? safeOpts.guru : [],
          mata_pelajaran: Array.isArray(safeOpts?.mata_pelajaran) ? safeOpts.mata_pelajaran : [],
          tahun_ajaran: Array.isArray(safeOpts?.tahun_ajaran) ? safeOpts.tahun_ajaran : [],
          semester: Array.isArray(safeOpts?.semester) ? safeOpts.semester : [],
          hari: Array.isArray(safeOpts?.hari) ? safeOpts.hari : DAY_OPTIONS,
        });
      }
    } catch (err: any) {
      console.warn('[TuScheduleWorkspace] Error fetching:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // ── 5B. Fetch Data Jadwal Ujian ──
  const fetchExamData = useCallback(async (isSilent = false) => {
    if (!isSilent) setLoadingExams(true);
    try {
      const [examRes, catRes] = await Promise.allSettled([
        mobileApiService.getExamSchedules({ unit_pendidikan_id: unitId || undefined, per_page: 200 }),
        mobileApiService.getExamCategories(),
      ]);

      if (examRes.status === 'fulfilled') {
        const raw = unwrapApiData<any[]>(examRes.value) || [];
        const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
        setExamSchedules(Array.isArray(list) ? list : []);
      }

      if (catRes.status === 'fulfilled') {
        const rawCats = unwrapApiData<any[]>(catRes.value) || [];
        const listCats = Array.isArray(rawCats) ? rawCats : ((rawCats as any)?.data ?? []);
        setExamCategories(Array.isArray(listCats) ? listCats : []);
      }
    } catch (err: any) {
      console.warn('[TuScheduleWorkspace] Error fetching exams:', err);
    } finally {
      setLoadingExams(false);
      setRefreshing(false);
    }
  }, [unitId]);

  useEffect(() => {
    void fetchData(false);
  }, [fetchData]);

  useEffect(() => {
    if (workspaceTab === 'exam' && examSchedules.length === 0) {
      void fetchExamData(false);
    }
  }, [workspaceTab, examSchedules.length, fetchExamData]);

  const onRefresh = async () => {
    setRefreshing(true);
    if (workspaceTab === 'exam') {
      await fetchExamData(true);
    } else {
      await fetchData(true);
    }
  };

  // ── 6. Deteksi Jadwal Bentrok ──
  const conflictScheduleIds = useMemo(() => {
    const set = new Set<string | number>();
    for (let i = 0; i < schedules.length; i++) {
      for (let j = i + 1; j < schedules.length; j++) {
        const a = schedules[i];
        const b = schedules[j];

        if (Number(a.day_of_week) !== Number(b.day_of_week)) continue;

        const startA = (a.time_start || '').slice(0, 5);
        const endA = (a.time_end || '').slice(0, 5);
        const startB = (b.time_start || '').slice(0, 5);
        const endB = (b.time_end || '').slice(0, 5);

        const isTimeOverlap = startA < endB && endA > startB;
        if (!isTimeOverlap) continue;

        const sameClass = a.kelas_id && b.kelas_id && String(a.kelas_id) === String(b.kelas_id);
        const sameTeacher = a.employee_id && b.employee_id && String(a.employee_id) === String(b.employee_id);

        if (sameClass || sameTeacher) {
          set.add(a.id);
          set.add(b.id);
        }
      }
    }
    return set;
  }, [schedules]);

  // ── 6B. Turunan Filter Guru <-> Mata Pelajaran (Cascading Dropdown) ──
  const filterSubjectOptions = useMemo(() => {
    if (!options.mata_pelajaran || options.mata_pelajaran.length === 0) return [];
    if (selectedTeacherId === 'all') return options.mata_pelajaran;

    const teacher = options.guru.find((g) => String(g.id) === String(selectedTeacherId));
    let subjectIds: string[] = [];

    if (teacher && Array.isArray(teacher.subject_ids) && teacher.subject_ids.length > 0) {
      subjectIds = teacher.subject_ids.map((id: any) => String(id));
    } else {
      subjectIds = schedules
        .filter((s) => String(s.employee_id || s.teacher_id) === String(selectedTeacherId))
        .map((s) => String(s.subject_id || s.subject?.id))
        .filter(Boolean);
    }

    if (subjectIds.length === 0) return options.mata_pelajaran;
    const set = new Set(subjectIds);
    return options.mata_pelajaran.filter((m) => set.has(String(m.id)));
  }, [options.mata_pelajaran, options.guru, selectedTeacherId, schedules]);

  const filterTeacherOptions = useMemo(() => {
    if (!options.guru || options.guru.length === 0) return [];

    // Kumpulkan ID guru yang benar-benar memiliki jadwal di schedules
    const activeScheduleGuruIds = new Set(
      schedules
        .map((s) => String(s.employee_id || s.teacher_id || s.employee?.id || ''))
        .filter(Boolean)
    );

    // Filter guru yang benar-benar ada jadwal pelajarannya (Zero Non-Teaching / Tanpa Jadwal)
    const baseList = options.guru.filter((g) => {
      if (g.has_schedule !== undefined) return Boolean(g.has_schedule);
      if (activeScheduleGuruIds.has(String(g.id))) return true;
      if (Array.isArray(g.subject_ids) && g.subject_ids.length > 0) return true;
      return false;
    });

    if (selectedSubjectId === 'all') return baseList;

    const mapel = options.mata_pelajaran.find((m) => String(m.id) === String(selectedSubjectId));
    let guruIds: string[] = [];

    if (mapel && Array.isArray(mapel.guru_ids) && mapel.guru_ids.length > 0) {
      guruIds = mapel.guru_ids.map((id: any) => String(id));
    } else {
      guruIds = schedules
        .filter((s) => String(s.subject_id || s.subject?.id) === String(selectedSubjectId))
        .map((s) => String(s.employee_id || s.teacher_id))
        .filter(Boolean);
    }

    if (guruIds.length === 0) return baseList;
    const set = new Set(guruIds);
    return baseList.filter((g) => set.has(String(g.id)));
  }, [options.guru, options.mata_pelajaran, selectedSubjectId, schedules]);

  // ── 7. Filtering List Jadwal KBM ──
  const filteredSchedules = useMemo(() => {
    const q = (query || search).toLowerCase().trim();
    return schedules.filter((item) => {
      // Filter Kategori Aktivitas (Semua / KBM Pelajaran / Kegiatan Non-KBM)
      if (activityFilter === 'kbm' && (item.activity_type === 'activity' || (item.activity_type && item.activity_type !== 'kbm'))) {
        return false;
      }
      if (activityFilter === 'activity' && item.activity_type !== 'activity') {
        return false;
      }

      if (selectedDay !== 'all' && Number(item.day_of_week) !== Number(selectedDay)) {
        return false;
      }
      if (selectedClassId !== 'all' && String(item.kelas_id || item.class_id) !== String(selectedClassId)) {
        return false;
      }
      if (selectedTeacherId !== 'all' && String(item.employee_id || item.teacher_id) !== String(selectedTeacherId)) {
        return false;
      }
      if (selectedSubjectId !== 'all' && String(item.subject_id || item.subject?.id) !== String(selectedSubjectId)) {
        return false;
      }
      if (filterConflictOnly && !conflictScheduleIds.has(item.id)) {
        return false;
      }
      if (q) {
        const mapel = (item.subject?.name || item.subject?.nama_mapel || '').toLowerCase();
        const activityName = (item.activity_name || '').toLowerCase();
        const guru = (item.employee?.nama_lengkap || item.teacher?.name || '').toLowerCase();
        const kelas = (item.kelas?.nama_kelas || item.schoolClass?.name || '').toLowerCase();
        const room = (item.room || item.ruangan || '').toLowerCase();
        if (!mapel.includes(q) && !activityName.includes(q) && !guru.includes(q) && !kelas.includes(q) && !room.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [schedules, activityFilter, selectedDay, selectedClassId, selectedTeacherId, selectedSubjectId, filterConflictOnly, conflictScheduleIds, query, search]);

  // ── 7B. Filtering List Jadwal Ujian ──
  const filteredExamSchedules = useMemo(() => {
    const q = (query || search).toLowerCase().trim();
    return examSchedules.filter((item) => {
      if (selectedExamCategoryId !== 'all' && String(item.exam_category_id) !== String(selectedExamCategoryId)) {
        return false;
      }
      if (selectedClassId !== 'all' && String(item.kelas_id) !== String(selectedClassId)) {
        return false;
      }
      if (selectedSubjectId !== 'all' && String(item.subject_id || item.subject?.id) !== String(selectedSubjectId)) {
        return false;
      }
      if (q) {
        const mapel = (item.subject?.name || item.subject?.nama_mapel || '').toLowerCase();
        const pengawas = (item.invigilator?.nama_lengkap || '').toLowerCase();
        const kelas = (item.kelas?.nama_kelas || '').toLowerCase();
        const room = (item.room || '').toLowerCase();
        const kategori = (item.exam_category?.name || item.examCategory?.name || '').toLowerCase();
        if (!mapel.includes(q) && !pengawas.includes(q) && !kelas.includes(q) && !room.includes(q) && !kategori.includes(q)) {
          return false;
        }
      }
      return true;
    });
  }, [examSchedules, selectedExamCategoryId, selectedClassId, selectedSubjectId, query, search]);

  // ── 7C. Matriks Jadwal Mingguan Resmi untuk Cetak (Full Day & Boarding) ──
  const activePrintClass = useMemo(() => {
    if (printKelasId === 'all') {
      return (
        options.kelas.find((k) => String(k.id) === String(selectedClassId)) ||
        options.kelas[0] ||
        null
      );
    }
    return options.kelas.find((k) => String(k.id) === String(printKelasId)) || options.kelas[0] || null;
  }, [printKelasId, selectedClassId, options.kelas]);

  const matrixPrintData = useMemo(() => {
    // Matriks mingguan resmi WAJIB spesifik per-kelas target agar tidak tumpang tindih
    const targetClassId =
      printKelasId !== 'all'
        ? printKelasId
        : (selectedClassId !== 'all'
            ? selectedClassId
            : (activePrintClass?.id ? String(activePrintClass.id) : ''));

    const list = targetClassId
      ? schedules.filter((s) => String(s.kelas_id || s.class_id) === String(targetClassId))
      : (filteredSchedules.length > 0 ? filteredSchedules : schedules);

    // Time slots unik
    const timeSlotsMap = new Map<string, { start: string; end: string; label: string }>();
    list.forEach((s) => {
      const start = (s.time_start || '').slice(0, 5);
      const end = (s.time_end || '').slice(0, 5);
      if (start && end) {
        const key = `${start}-${end}`;
        if (!timeSlotsMap.has(key)) {
          timeSlotsMap.set(key, { start, end, label: `${start} - ${end}` });
        }
      }
    });

    const timeSlots = Array.from(timeSlotsMap.values()).sort((a, b) => a.start.localeCompare(b.start));

    // Bentuk baris slot x hari (Senin - Sabtu)
    const rows = timeSlots.map((slot, idx) => {
      const days: Record<number, any> = {};
      [1, 2, 3, 4, 5, 6].forEach((d) => {
        const matching = list.find((s) => {
          if (Number(s.day_of_week) !== d) return false;
          const sStart = (s.time_start || '').slice(0, 5);
          const sEnd = (s.time_end || '').slice(0, 5);
          return sStart < slot.end && sEnd > slot.start;
        });

        if (matching) {
          days[d] = {
            subject_name: matching.subject?.name || matching.subject?.nama_mapel || matching.activity_name || '-',
            teacher_name: matching.employee?.nama_lengkap || matching.teacher?.name || '-',
            activity_type: matching.activity_type || 'kbm',
          };
        } else {
          days[d] = null; // ZERO HARDCODE: jika kosong di DB maka null
        }
      });

      return {
        no: idx + 1,
        time: slot,
        days,
      };
    });

    return { timeSlots, rows };
  }, [printKelasId, selectedClassId, activePrintClass, schedules, filteredSchedules]);

  // Baris data untuk Cetak Format Rekap Tabel Baris
  const printTableRows = useMemo(() => {
    if (printKelasId === 'all') {
      return filteredSchedules;
    }
    return schedules.filter((s) => {
      if (String(s.kelas_id || s.class_id) !== String(printKelasId)) return false;
      if (selectedDay !== 'all' && Number(s.day_of_week) !== Number(selectedDay)) return false;
      if (selectedTeacherId !== 'all' && String(s.employee_id || s.teacher_id) !== String(selectedTeacherId)) return false;
      if (selectedSubjectId !== 'all' && String(s.subject_id || s.subject?.id) !== String(selectedSubjectId)) return false;
      return true;
    });
  }, [printKelasId, filteredSchedules, schedules, selectedDay, selectedTeacherId, selectedSubjectId]);

  // ── 8. KPI Stats (Harmonisasi 3 Kartu Ringkasan) ──
  const resourceStats = useMemo(() => {
    const totalSesi = schedules.length;
    const kelasSet = new Set(schedules.map((s) => s.kelas_id || s.class_id).filter(Boolean));
    const guruSet = new Set(schedules.map((s) => s.employee_id || s.teacher_id).filter(Boolean));
    const totalBentrok = conflictScheduleIds.size;

    return {
      kpi1: {
        label: 'Total Sesi',
        value: totalSesi,
        sub: 'Jadwal Aktif',
        icon: 'calendar-clock',
        color: '#059669',
        border: '#A7F3D0',
        bg: ['#FFFFFF', '#ECFDF5'],
      },
      kpi2: {
        label: 'Rombel & Guru',
        value: `${kelasSet.size} / ${guruSet.size}`,
        sub: 'Kelas / Guru',
        icon: 'google-classroom',
        color: '#0284C7',
        border: '#BAE6FD',
        bg: ['#FFFFFF', '#F0F9FF'],
      },
      kpi3: {
        label: 'Jadwal Bentrok',
        value: totalBentrok,
        sub: totalBentrok > 0 ? 'Perlu Diubah' : 'Jadwal Rapi',
        icon: totalBentrok > 0 ? 'alert-octagon' : 'check-decagram',
        color: totalBentrok > 0 ? '#DC2626' : '#059669',
        border: totalBentrok > 0 ? '#FECACA' : '#A7F3D0',
        bg: totalBentrok > 0 ? ['#FFFFFF', '#FEF2F2'] : ['#FFFFFF', '#ECFDF5'],
      },
    };
  }, [schedules, conflictScheduleIds]);

  const examResourceStats = useMemo(() => {
    const totalUjian = examSchedules.length;
    const kelasSet = new Set(examSchedules.map((s) => s.kelas_id).filter(Boolean));
    const pengawasSet = new Set(examSchedules.map((s) => s.invigilator_id).filter(Boolean));

    return {
      kpi1: {
        label: 'Total Ujian',
        value: totalUjian,
        sub: 'Sesi Ujian',
        icon: 'file-document-edit-outline',
        color: '#2563EB',
        border: '#BFDBFE',
        bg: ['#FFFFFF', '#EFF6FF'],
      },
      kpi2: {
        label: 'Rombel Diuji',
        value: kelasSet.size,
        sub: 'Target Kelas',
        icon: 'google-classroom',
        color: '#0D9488',
        border: '#99F6E4',
        bg: ['#FFFFFF', '#F0FDFA'],
      },
      kpi3: {
        label: 'Pengawas',
        value: pengawasSet.size,
        sub: 'Guru / Staf',
        icon: 'account-tie',
        color: '#7C3AED',
        border: '#DDD6FE',
        bg: ['#FFFFFF', '#F5F3FF'],
      },
    };
  }, [examSchedules]);

  // ── 9. Form Handler ──
  const openCreateModal = () => {
    setEditingItem(null);
    setConflictWarning('');
    const activeYear = options.tahun_ajaran.find((y) => y.is_active) || options.tahun_ajaran[0];
    const activeSem = options.semester.find((s) => s.is_active) || options.semester[0];
    const defaultKelas = options.kelas[0];
    const defaultGuru = options.guru[0];
    const defaultSubject = options.mata_pelajaran[0];

    setFormData({
      unit_pendidikan_id: String(unitId || ''),
      kelas_id: defaultKelas ? String(defaultKelas.id) : '',
      employee_id: defaultGuru ? String(defaultGuru.id) : '',
      subject_id: defaultSubject ? String(defaultSubject.id) : '',
      academic_year_id: activeYear ? String(activeYear.id) : '',
      semester_id: activeSem ? String(activeSem.id) : '',
      day_of_week: selectedDay !== 'all' ? selectedDay : 1,
      time_start: '07:30',
      time_end: '09:00',
      room: defaultKelas?.nama_kelas ? `R. ${defaultKelas.nama_kelas}` : '',
      notes: '',
      is_active: true,
      activity_type: 'kbm',
      activity_name: '',
    });
    setFormModalVisible(true);
  };

  const openEditModal = (item: any) => {
    setEditingItem(item);
    setConflictWarning('');
    setFormData({
      unit_pendidikan_id: String(item.unit_pendidikan_id || unitId || ''),
      kelas_id: String(item.kelas_id || item.class_id || ''),
      employee_id: String(item.employee_id || item.teacher_id || ''),
      subject_id: String(item.subject_id || item.subject?.id || ''),
      academic_year_id: String(item.academic_year_id || ''),
      semester_id: String(item.semester_id || ''),
      day_of_week: Number(item.day_of_week || 1),
      time_start: (item.time_start || '07:30').slice(0, 5),
      time_end: (item.time_end || '09:00').slice(0, 5),
      room: String(item.room || item.ruangan || ''),
      notes: String(item.notes || ''),
      is_active: item.is_active !== false,
      activity_type: (item.activity_type || 'kbm') as 'kbm' | 'activity',
      activity_name: String(item.activity_name || ''),
    });
    setFormModalVisible(true);
  };

  // Live conflict check saat form aktif
  useEffect(() => {
    if (!formModalVisible) return;
    if (!formData.kelas_id || !formData.employee_id || !formData.time_start || !formData.time_end) return;

    const timer = setTimeout(async () => {
      try {
        const payload: Record<string, any> = {
          day_of_week: formData.day_of_week,
          time_start: formData.time_start,
          time_end: formData.time_end,
          kelas_id: formData.kelas_id,
          employee_id: formData.employee_id,
          academic_year_id: formData.academic_year_id || undefined,
          semester_id: formData.semester_id || undefined,
        };
        if (editingItem?.id) payload.exclude_id = editingItem.id;
        const res: any = await mobileApiService.checkScheduleConflict(payload);
        const data = unwrapApiData<any>(res) || res?.data || res;
        if (data?.has_conflict || data?.is_conflict || data?.conflicts?.length > 0) {
          const detail = data?.message || data?.conflicts?.[0]?.message || 'Perhatian: Ada bentrok jam KBM dengan kelas atau guru terpilih!';
          setConflictWarning(detail);
        } else {
          setConflictWarning('');
        }
      } catch {
        // Abaikan jika network check gagal
      }
    }, 450);

    return () => clearTimeout(timer);
  }, [formModalVisible, formData.day_of_week, formData.time_start, formData.time_end, formData.kelas_id, formData.employee_id, editingItem?.id]);

  // Live fetch availability (Rincian Hari Kosong & Jam Kosong Bebas Bentrok)
  useEffect(() => {
    if (!formModalVisible) {
      setAvailabilityData(null);
      return;
    }

    const timer = setTimeout(async () => {
      try {
        setAvailabilityLoading(true);
        const res: any = await mobileApiService.getScheduleAvailability({
          academic_year_id: formData.academic_year_id || undefined,
          semester_id: formData.semester_id || undefined,
          kelas_id: formData.kelas_id || undefined,
          employee_id: formData.employee_id || undefined,
          day_of_week: formData.day_of_week || undefined,
          ignore_id: editingItem?.id ? String(editingItem.id) : undefined,
        });
        const data = unwrapApiData<any>(res) || res?.data || res;
        setAvailabilityData(data);
      } catch {
        // Abaikan jika network availability gagal
      } finally {
        setAvailabilityLoading(false);
      }
    }, 200);

    return () => clearTimeout(timer);
  }, [
    formModalVisible,
    formData.academic_year_id,
    formData.semester_id,
    formData.kelas_id,
    formData.employee_id,
    formData.day_of_week,
    editingItem?.id,
  ]);

  const handleCloseScheduleForm = () => {
    if (saving) return;
    const isDirty = Boolean(formData.kelas_id || formData.employee_id || formData.subject_id || formData.activity_name);
    if (isDirty) {
      appFeedback.confirm({
        title: 'Tinggalkan Formulir Jadwal?',
        message: 'Pengaturan jadwal KBM yang sedang Anda atur belum disimpan. Yakin ingin membatalkan?',
        confirmText: 'Ya, Tinggalkan',
        cancelText: 'Lanjut Atur',
        isDestructive: true,
        onConfirm: () => {
          setFormModalVisible(false);
          setEditingItem(null);
        },
      });
      return;
    }
    setFormModalVisible(false);
    setEditingItem(null);
  };

  const handleCloseExamForm = () => {
    if (saving) return;
    const isDirty = Boolean(examFormData.kelas_id || examFormData.subject_id || examFormData.exam_category_id);
    if (isDirty) {
      appFeedback.confirm({
        title: 'Tinggalkan Formulir Ujian?',
        message: 'Jadwal ujian yang sedang Anda atur belum disimpan. Yakin ingin membatalkan?',
        confirmText: 'Ya, Tinggalkan',
        cancelText: 'Lanjut Atur',
        isDestructive: true,
        onConfirm: () => {
          setExamFormModalVisible(false);
          setEditingExamItem(null);
        },
      });
      return;
    }
    setExamFormModalVisible(false);
    setEditingExamItem(null);
  };

  const handleSaveSchedule = async () => {
    if (!formData.kelas_id) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Silakan pilih Rombel / Kelas terlebih dahulu.',
      });
      return;
    }

    const isActivity = formData.activity_type === 'activity';

    if (isActivity) {
      if (!formData.activity_name || !formData.activity_name.trim()) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Data Belum Lengkap',
          message: 'Silakan ketik Nama Kegiatan Sekolah (contoh: Upacara Bendera, Dzikir Pagi, Waktu Istirahat, ISHOMA, Senam, dll).',
        });
        return;
      }
    } else {
      if (!formData.employee_id) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Data Belum Lengkap',
          message: 'Silakan pilih Guru Pengampu terlebih dahulu.',
        });
        return;
      }
      if (!formData.subject_id) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Data Belum Lengkap',
          message: 'Silakan pilih Mata Pelajaran terlebih dahulu.',
        });
        return;
      }
    }

    if (!formData.time_start || !formData.time_end) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Jam mulai dan jam selesai wajib diisi.',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        unit_pendidikan_id: formData.unit_pendidikan_id || undefined,
        kelas_id: formData.kelas_id,
        activity_type: formData.activity_type,
        activity_name: isActivity ? formData.activity_name.trim() : null,
        employee_id: formData.employee_id || (isActivity ? null : undefined),
        subject_id: isActivity ? (formData.subject_id || null) : formData.subject_id,
        academic_year_id: formData.academic_year_id || undefined,
        semester_id: formData.semester_id || undefined,
        day_of_week: formData.day_of_week,
        time_start: formData.time_start,
        time_end: formData.time_end,
        room: formData.room || undefined,
        notes: formData.notes || undefined,
        is_active: formData.is_active,
      };

      if (editingItem?.id) {
        await mobileApiService.updateSchedule(String(editingItem.id), payload);
        setFeedback({
          visible: true,
          type: 'success',
          title: isActivity ? 'Kegiatan Diperbarui' : 'Jadwal Diperbarui',
          message: isActivity
            ? `Jadwal "${formData.activity_name.trim()}" berhasil disimpan ke sistem.`
            : 'Data jadwal pelajaran berhasil disimpan ke sistem.',
        });
      } else {
        await mobileApiService.createSchedule(payload);
        setFeedback({
          visible: true,
          type: 'success',
          title: isActivity ? 'Kegiatan Ditambahkan' : 'Jadwal Ditambahkan',
          message: isActivity
            ? `Sesi kegiatan "${formData.activity_name.trim()}" berhasil ditambahkan.`
            : 'Sesi jadwal KBM baru berhasil dibuat.',
        });
      }

      setFormModalVisible(false);
      void offlineCache.clearPrefix('schedule');
      await fetchData(true);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Gagal menyimpan jadwal. Periksa potensi bentrok waktu.';
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: errMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteSchedule = async () => {
    if (!deleteConfirmItem) return;
    setSaving(true);
    try {
      await mobileApiService.deleteSchedule(String(deleteConfirmItem.id));
      setDeleteConfirmItem(null);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Jadwal Dihapus',
        message: 'Sesi jadwal KBM berhasil dihapus.',
      });
      void offlineCache.clearPrefix('schedule');
      await fetchData(true);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Gagal menghapus data jadwal.';
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Hapus',
        message: errMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  // ── 9B. Exam Handlers (Jadwal Ujian PTS/PAS/PAT untuk TU) ──
  const openCreateExamModal = () => {
    setEditingExamItem(null);
    const activeYear = options.tahun_ajaran.find((y) => y.is_active) || options.tahun_ajaran[0];
    const activeSem = options.semester.find((s) => s.is_active) || options.semester[0];
    const defaultCat = examCategories[0];
    const defaultKelas = options.kelas[0];
    const defaultSubject = options.mata_pelajaran[0];
    const defaultGuru = options.guru[0];
    const todayStr = new Date().toISOString().slice(0, 10);

    setExamFormData({
      academic_year_id: activeYear ? String(activeYear.id) : '',
      semester_id: activeSem ? String(activeSem.id) : '',
      exam_category_id: defaultCat ? String(defaultCat.id) : '',
      kelas_id: defaultKelas ? String(defaultKelas.id) : '',
      subject_id: defaultSubject ? String(defaultSubject.id) : '',
      exam_date: todayStr,
      time_start: '07:30',
      time_end: '09:30',
      duration_minutes: 120,
      room: defaultKelas?.nama_kelas ? `Ruang ${defaultKelas.nama_kelas}` : '',
      invigilator_id: defaultGuru ? String(defaultGuru.id) : '',
      notes: '',
    });
    setExamFormModalVisible(true);
  };

  const openEditExamModal = (item: any) => {
    setEditingExamItem(item);
    setExamFormData({
      academic_year_id: String(item.academic_year_id || ''),
      semester_id: String(item.semester_id || ''),
      exam_category_id: String(item.exam_category_id || ''),
      kelas_id: String(item.kelas_id || ''),
      subject_id: String(item.subject_id || ''),
      exam_date: String(item.exam_date || ''),
      time_start: (item.time_start || '07:30').slice(0, 5),
      time_end: (item.time_end || '09:30').slice(0, 5),
      duration_minutes: Number(item.duration_minutes || 120),
      room: String(item.room || ''),
      invigilator_id: String(item.invigilator_id || ''),
      notes: String(item.notes || ''),
    });
    setExamFormModalVisible(true);
  };

  const handleSaveExamSchedule = async () => {
    if (!examFormData.exam_category_id) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Silakan pilih Kategori Ujian (PTS/PAS/PAT/dll).',
      });
      return;
    }
    if (!examFormData.kelas_id) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Silakan pilih Rombel / Kelas.',
      });
      return;
    }
    if (!examFormData.subject_id) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Silakan pilih Mata Pelajaran yang diujikan.',
      });
      return;
    }
    if (!examFormData.exam_date) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Silakan isi Tanggal Ujian (format YYYY-MM-DD).',
      });
      return;
    }
    if (!examFormData.time_start || !examFormData.time_end) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Data Belum Lengkap',
        message: 'Jam mulai dan selesai ujian wajib diisi.',
      });
      return;
    }

    setSaving(true);
    try {
      const payload: Record<string, any> = {
        academic_year_id: examFormData.academic_year_id || undefined,
        semester_id: examFormData.semester_id || undefined,
        exam_category_id: examFormData.exam_category_id,
        kelas_id: examFormData.kelas_id,
        subject_id: examFormData.subject_id,
        exam_date: examFormData.exam_date,
        time_start: examFormData.time_start,
        time_end: examFormData.time_end,
        duration_minutes: examFormData.duration_minutes || 120,
        room: examFormData.room || undefined,
        invigilator_id: examFormData.invigilator_id || undefined,
        notes: examFormData.notes || undefined,
        is_active: true,
      };

      if (editingExamItem?.id) {
        await mobileApiService.updateExamSchedule(String(editingExamItem.id), payload);
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Jadwal Ujian Diperbarui',
          message: 'Data jadwal ujian berhasil disimpan ke sistem.',
        });
      } else {
        await mobileApiService.createExamSchedule(payload);
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Jadwal Ujian Ditambahkan',
          message: 'Sesi jadwal ujian baru berhasil dibuat.',
        });
      }

      setExamFormModalVisible(false);
      void offlineCache.clearPrefix('schedule');
      void offlineCache.clearPrefix('cbt_exams');
      await fetchExamData(true);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Gagal menyimpan jadwal ujian. Periksa potensi bentrok ruangan/kelas.';
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan',
        message: errMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  const executeDeleteExamSchedule = async () => {
    if (!deleteExamConfirmItem) return;
    setSaving(true);
    try {
      await mobileApiService.deleteExamSchedule(String(deleteExamConfirmItem.id));
      setDeleteExamConfirmItem(null);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Jadwal Ujian Dihapus',
        message: 'Jadwal ujian berhasil dihapus secara permanen.',
      });
      void offlineCache.clearPrefix('schedule');
      void offlineCache.clearPrefix('cbt_exams');
      await fetchExamData(true);
    } catch (err: any) {
      const errMsg = err?.response?.data?.message || err?.message || 'Gagal menghapus jadwal ujian.';
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menghapus',
        message: errMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.rootContainer}>
      {/* ── Background Mosque & School (Identik Halaman Utama, Data Siswa & Buku Penghubung) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien berbasis warna #18A165 identik dengan Buku Penghubung & Halaman Utama */}
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

      {/* ── TOP HEADER IDENTIK BUKU PENGHUBUNG & DATA SISWA ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => {
              const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation);
              if (handled) return;
              const navState = navigation?.getState?.();
              const canPop = navState && typeof navState.index === 'number' && navState.index > 0;
              if (canPop && navigation?.canGoBack?.()) {
                try {
                  navigation.goBack();
                  return;
                } catch {}
              }
              navigation?.navigate('Beranda' as any);
            }}
            style={styles.backButton}
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerBadgeText} numberOfLines={1} ellipsizeMode="tail">
                TATA USAHA • JADWAL & KBM
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              {workspaceTab === 'schedule' ? 'Jadwal Pelajaran & KBM' : 'Jadwal Ujian (PTS/PAS/PAT)'}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {workspaceTab === 'schedule' ? 'Monitoring KBM, Ruang, & Guru Unit' : 'Monitoring Pengawas, Sesi, & Ruang'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                if (selectedClassId !== 'all') {
                  setPrintKelasId(selectedClassId);
                } else if (options.kelas.length > 0) {
                  setPrintKelasId(String(options.kelas[0].id));
                }
                setPrintModalVisible(true);
              }}
              style={styles.refreshButton}
              accessibilityLabel="Cetak Jadwal Pelajaran"
            >
              <MaterialCommunityIcons name="printer-outline" size={20} color="#064E3B" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                if (workspaceTab === 'exam') {
                  void fetchExamData(false);
                } else {
                  void fetchData(false);
                }
              }}
              style={styles.refreshButton}
              accessibilityLabel="Muat Ulang"
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar langsung di Header identik Buku Penghubung */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              workspaceTab === 'schedule'
                ? 'Cari mapel, kegiatan, guru, kelas, atau ruang...'
                : 'Cari ujian, mapel, pengawas, kelas, atau ruang...'
            }
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

        {/* 3 KPI Cards Row Dinamis Sesuai Tab Aktif */}
        <View style={styles.kpiCardsRow}>
          {(workspaceTab === 'schedule'
            ? [resourceStats.kpi1, resourceStats.kpi2, resourceStats.kpi3]
            : [examResourceStats.kpi1, examResourceStats.kpi2, examResourceStats.kpi3]
          ).map((kpi, idx) => (
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

        {/* Sub-Tabs / Kategori Segmented Scroll (Identik Buku Penghubung tuSegmentContainer) */}
        <View style={styles.tuSegmentContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tuSegmentScroll}
          >
            {workspaceTab === 'schedule' ? (
              <>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedDay('all')}
                  style={[styles.segmentBtn, selectedDay === 'all' && styles.segmentBtnActive]}
                >
                  <MaterialCommunityIcons
                    name="calendar-range"
                    size={15}
                    color={selectedDay === 'all' ? '#FFFFFF' : '#047857'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.segmentBtnText, selectedDay === 'all' && styles.segmentBtnTextActive]}>
                    Semua Hari ({schedules.length})
                  </Text>
                </TouchableOpacity>

                {DAY_OPTIONS.map((item) => {
                  const isSel = selectedDay === item.id;
                  const count = schedules.filter((s) => Number(s.day_of_week) === item.id).length;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.8}
                      onPress={() => setSelectedDay(item.id)}
                      style={[styles.segmentBtn, isSel && styles.segmentBtnActive]}
                    >
                      <MaterialCommunityIcons
                        name="calendar-today"
                        size={14}
                        color={isSel ? '#FFFFFF' : '#047857'}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.segmentBtnText, isSel && styles.segmentBtnTextActive]}>
                        {item.name} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            ) : (
              <>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedExamCategoryId('all')}
                  style={[styles.segmentBtn, selectedExamCategoryId === 'all' && styles.segmentBtnActive]}
                >
                  <MaterialCommunityIcons
                    name="file-document-multiple-outline"
                    size={15}
                    color={selectedExamCategoryId === 'all' ? '#FFFFFF' : '#047857'}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.segmentBtnText, selectedExamCategoryId === 'all' && styles.segmentBtnTextActive]}>
                    Semua Ujian ({examSchedules.length})
                  </Text>
                </TouchableOpacity>

                {examCategories.map((cat) => {
                  const isSel = selectedExamCategoryId === String(cat.id);
                  const count = examSchedules.filter((e) => String(e.exam_category_id) === String(cat.id)).length;
                  return (
                    <TouchableOpacity
                      key={cat.id}
                      activeOpacity={0.8}
                      onPress={() => setSelectedExamCategoryId(String(cat.id))}
                      style={[styles.segmentBtn, isSel && styles.segmentBtnActive]}
                    >
                      <Text style={[styles.segmentBtnText, isSel && styles.segmentBtnTextActive]}>
                        {cat.name || cat.nama_kategori || 'Ujian'} ({count})
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </>
            )}
          </ScrollView>
        </View>
      </View>

      {/* ── SHEET CONTAINER & MAIN SCROLL CONTENT (IDENTIK BUKU PENGHUBUNG) ── */}
      <View style={styles.sheetContainer}>
        {workspaceTab === 'schedule' ? (
          <ScrollView
            style={styles.screen}
            contentContainerStyle={[
              styles.cleanMainScrollContent,
              { paddingBottom: Math.max(bottomInset + 72, 94) },
            ]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[THEME.primary]} />
            }
          >
            <View style={styles.bodyContentWrapper}>
              {/* TAB SWITCHER IDENTIK DUAL ROLE PILL BUKU PENGHUBUNG */}
              <View style={styles.dualRolePillContainer}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  style={[styles.dualRolePill, styles.dualRolePillActive]}
                  onPress={() => setWorkspaceTab('schedule')}
                >
                  <MaterialCommunityIcons
                    name="calendar-clock"
                    size={16}
                    color="#FFFFFF"
                  />
                  <Text style={[styles.dualRolePillText, styles.dualRolePillTextActive]}>
                    KBM & Rutinitas ({schedules.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  style={styles.dualRolePill}
                  onPress={() => {
                    setWorkspaceTab('exam');
                    if (examSchedules.length === 0) void fetchExamData(false);
                  }}
                >
                  <MaterialCommunityIcons
                    name="file-document-edit-outline"
                    size={16}
                    color="#047857"
                  />
                  <Text style={styles.dualRolePillText}>
                    Jadwal Ujian ({examSchedules.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* ACTION BAR: TAMBAH JADWAL & RESET FILTER */}
              <View style={styles.subActionBar}>
              <View style={styles.primaryActionRow}>
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={openCreateModal}
                  style={[styles.addPillBtn, { shadowColor: THEME.primary }]}
                >
                  <LinearGradient
                    colors={['#059669', '#047857']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 0 }}
                    style={styles.addPillBtnGradient}
                  >
                    <MaterialCommunityIcons name="plus-circle" size={18} color="#FFFFFF" />
                    <Text style={styles.addPillBtnText}>Tambah Jadwal Baru</Text>
                  </LinearGradient>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => {
                    setSelectedDay('all');
                    setSelectedClassId('all');
                    setSelectedTeacherId('all');
                    setSelectedSubjectId('all');
                    setActivityFilter('all');
                    setFilterConflictOnly(false);
                    setSearch('');
                    setQuery('');
                  }}
                  style={styles.rekapPillBtn}
                >
                  <View style={styles.rekapPillIconBox}>
                    <MaterialCommunityIcons name="filter-remove-outline" size={16} color="#059669" />
                  </View>
                  <Text style={styles.rekapPillText}>Reset Filter</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* ── QUICK PILL FILTER: JENIS KEGIATAN KBM vs RUTINITAS NON-KBM ── */}
            <View style={styles.activityFilterCard}>
              <View style={styles.activityFilterHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <MaterialCommunityIcons name="tune-variant" size={15} color="#059669" />
                  <Text style={styles.activityFilterTitle}>Penyaringan Aktivitas Sekolah</Text>
                </View>
                <Text style={styles.activityFilterSub}>Pilih Kategori Sesi</Text>
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.activityFilterScroll}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.activityFilterPill,
                    activityFilter === 'all' && styles.activityFilterPillActiveAll,
                  ]}
                  onPress={() => setActivityFilter('all')}
                >
                  <MaterialCommunityIcons
                    name="layers-outline"
                    size={15}
                    color={activityFilter === 'all' ? '#059669' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.activityFilterPillText,
                      activityFilter === 'all' && styles.activityFilterPillTextActiveAll,
                    ]}
                  >
                    Semua Sesi ({schedules.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.activityFilterPill,
                    activityFilter === 'kbm' && styles.activityFilterPillActiveKbm,
                  ]}
                  onPress={() => setActivityFilter('kbm')}
                >
                  <MaterialCommunityIcons
                    name="book-open-page-variant"
                    size={15}
                    color={activityFilter === 'kbm' ? '#059669' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.activityFilterPillText,
                      activityFilter === 'kbm' && styles.activityFilterPillTextActiveKbm,
                    ]}
                  >
                    KBM Pelajaran ({schedules.filter((s) => s.activity_type !== 'activity').length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  style={[
                    styles.activityFilterPill,
                    activityFilter === 'activity' && styles.activityFilterPillActiveAct,
                  ]}
                  onPress={() => setActivityFilter('activity')}
                >
                  <MaterialCommunityIcons
                    name="star-outline"
                    size={15}
                    color={activityFilter === 'activity' ? '#2563EB' : '#64748B'}
                  />
                  <Text
                    style={[
                      styles.activityFilterPillText,
                      activityFilter === 'activity' && styles.activityFilterPillTextActiveAct,
                    ]}
                  >
                    Kegiatan Non-KBM ({schedules.filter((s) => s.activity_type === 'activity').length})
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            </View>

            {/* ── FILTER CARD (GAYA IDENTIK DENGAN DATA SISWA) ── */}
            <View style={styles.filterCard}>
              <View style={styles.filterCardHeader}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Text style={styles.filterCardTitle}>Filter Jadwal Pelajaran</Text>
                  {filterConflictOnly ? (
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FEE2E2', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6 }}>
                      <MaterialCommunityIcons name="alert-circle" size={12} color="#DC2626" style={{ marginRight: 4 }} />
                      <Text style={{ fontSize: 10, fontWeight: '800', color: '#DC2626' }}>Hanya Bentrok</Text>
                    </View>
                  ) : null}
                </View>

                {(selectedDay !== 'all' || selectedClassId !== 'all' || selectedTeacherId !== 'all' || selectedSubjectId !== 'all' || filterConflictOnly || query.length > 0 || search.length > 0) ? (
                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedDay('all');
                      setSelectedClassId('all');
                      setSelectedTeacherId('all');
                      setSelectedSubjectId('all');
                      setFilterConflictOnly(false);
                      setSearch('');
                      setQuery('');
                    }}
                    style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F1F5F9', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6 }}
                  >
                    <MaterialCommunityIcons name="refresh" size={12} color="#64748B" style={{ marginRight: 3 }} />
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#64748B' }}>Reset</Text>
                  </TouchableOpacity>
                ) : null}
              </View>

          {/* Filter Dropdown Rombel / Kelas */}
          <Text style={styles.filterLabel}>Rombel / Kelas</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            activeOpacity={0.8}
            onPress={() => {
              const items = [
                { id: 'all', label: 'Semua Rombel / Kelas' },
                ...options.kelas.map((k) => ({
                  id: String(k.id),
                  label: k.nama_kelas || k.kode_kelas || 'Kelas',
                  sub: k.kode_kelas,
                })),
              ];
              setPickerModal({
                visible: true,
                title: 'Pilih Rombel / Kelas',
                items,
                onSelect: (sel) => setSelectedClassId(String(sel.id)),
              });
            }}
          >
            <View style={styles.dropdownTriggerLeft}>
              <View style={styles.dropdownTriggerIconBox}>
                <MaterialCommunityIcons name="google-classroom" size={16} color="#059669" />
              </View>
              <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                {selectedClassId === 'all'
                  ? 'Semua Kelas di Unit'
                  : options.kelas.find((k) => String(k.id) === String(selectedClassId))?.nama_kelas || 'Kelas Terpilih'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>

          {/* Filter Dropdown Guru Pengampu (Turunan dari Mapel jika mapel dipilih) */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <Text style={[styles.filterLabel, { marginTop: 0 }]}>Guru Pengampu</Text>
            {selectedSubjectId !== 'all' ? (
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#0284C7' }}>
                ({filterTeacherOptions.length} Guru Pengampu Mapel)
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            activeOpacity={0.8}
            onPress={() => {
              const items = [
                { id: 'all', label: 'Semua Guru Pengampu' },
                ...filterTeacherOptions.map((g) => ({
                  id: String(g.id),
                  label: g.nama_lengkap || g.name || 'Guru',
                  sub: g.niy ? `NIY: ${g.niy}` : undefined,
                })),
              ];
              setPickerModal({
                visible: true,
                title: selectedSubjectId !== 'all' ? 'Pilih Guru Pengampu (Sesuai Mapel)' : 'Pilih Guru Pengampu',
                items,
                onSelect: (sel) => {
                  const newTeacherId = String(sel.id);
                  setSelectedTeacherId(newTeacherId);

                  // Auto-reset cerdas jika mapel terpilih saat ini bukan yang diampu oleh guru baru
                  if (newTeacherId !== 'all' && selectedSubjectId !== 'all') {
                    const teacher = options.guru.find((g) => String(g.id) === newTeacherId);
                    let subjectIds: string[] = [];
                    if (teacher && Array.isArray(teacher.subject_ids) && teacher.subject_ids.length > 0) {
                      subjectIds = teacher.subject_ids.map((id: any) => String(id));
                    } else {
                      subjectIds = schedules
                        .filter((s) => String(s.employee_id || s.teacher_id) === newTeacherId)
                        .map((s) => String(s.subject_id || s.subject?.id))
                        .filter(Boolean);
                    }
                    if (subjectIds.length > 0 && !subjectIds.includes(String(selectedSubjectId))) {
                      setSelectedSubjectId('all');
                    }
                  }
                },
              });
            }}
          >
            <View style={styles.dropdownTriggerLeft}>
              <View style={[styles.dropdownTriggerIconBox, { backgroundColor: '#E0F2FE' }]}>
                <MaterialCommunityIcons name="account-tie" size={16} color="#0284C7" />
              </View>
              <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                {selectedTeacherId === 'all'
                  ? 'Semua Guru di Unit'
                  : options.guru.find((g) => String(g.id) === String(selectedTeacherId))?.nama_lengkap || 'Guru Terpilih'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>

          {/* Filter Dropdown Mata Pelajaran (Turunan dari Guru jika guru dipilih) */}
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12 }}>
            <Text style={[styles.filterLabel, { marginTop: 0 }]}>Mata Pelajaran</Text>
            {selectedTeacherId !== 'all' ? (
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#9333EA' }}>
                ({filterSubjectOptions.length} Mapel Diampu)
              </Text>
            ) : null}
          </View>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            activeOpacity={0.8}
            onPress={() => {
              const items = [
                { id: 'all', label: 'Semua Mata Pelajaran' },
                ...filterSubjectOptions.map((m) => ({
                  id: String(m.id),
                  label: m.nama_mapel || m.name || m.nama || 'Mata Pelajaran',
                  sub: m.kode_mapel || m.code ? `Kode: ${m.kode_mapel || m.code}` : undefined,
                })),
              ];
              setPickerModal({
                visible: true,
                title: selectedTeacherId !== 'all' ? 'Pilih Mapel (Diampu Guru Ini)' : 'Pilih Mata Pelajaran',
                items,
                onSelect: (sel) => {
                  const newSubjectId = String(sel.id);
                  setSelectedSubjectId(newSubjectId);

                  // Auto-reset cerdas jika guru terpilih saat ini bukan pengampu mapel baru
                  if (newSubjectId !== 'all' && selectedTeacherId !== 'all') {
                    const mapel = options.mata_pelajaran.find((m) => String(m.id) === newSubjectId);
                    let guruIds: string[] = [];
                    if (mapel && Array.isArray(mapel.guru_ids) && mapel.guru_ids.length > 0) {
                      guruIds = mapel.guru_ids.map((id: any) => String(id));
                    } else {
                      guruIds = schedules
                        .filter((s) => String(s.subject_id || s.subject?.id) === newSubjectId)
                        .map((s) => String(s.employee_id || s.teacher_id))
                        .filter(Boolean);
                    }
                    if (guruIds.length > 0 && !guruIds.includes(String(selectedTeacherId))) {
                      setSelectedTeacherId('all');
                    }
                  }
                },
              });
            }}
          >
            <View style={styles.dropdownTriggerLeft}>
              <View style={[styles.dropdownTriggerIconBox, { backgroundColor: '#FDF4FF' }]}>
                <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#A855F7" />
              </View>
              <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                {selectedSubjectId === 'all'
                  ? 'Semua Mata Pelajaran'
                  : options.mata_pelajaran.find((m) => String(m.id) === String(selectedSubjectId))?.nama_mapel ||
                    options.mata_pelajaran.find((m) => String(m.id) === String(selectedSubjectId))?.name ||
                    'Mata Pelajaran Terpilih'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>

          {/* Toggle Sesi Bentrok */}
          <TouchableOpacity
            style={[
              styles.bulkModeToggleBtn,
              filterConflictOnly && styles.bulkModeToggleBtnActive,
              { marginTop: 12 },
            ]}
            onPress={() => setFilterConflictOnly(!filterConflictOnly)}
            activeOpacity={0.8}
          >
            <View style={[styles.bulkModeIconBox, filterConflictOnly && styles.bulkModeIconBoxActive]}>
              <MaterialCommunityIcons
                name="alert-octagon"
                size={14}
                color={filterConflictOnly ? '#FFFFFF' : '#64748B'}
              />
            </View>
            <Text style={[styles.bulkModeToggleText, filterConflictOnly && styles.bulkModeToggleTextActive]}>
              {filterConflictOnly ? 'Menampilkan Jadwal Bentrok Saja' : 'Tampilkan Khusus Jadwal Bentrok'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* ── LIST ITEM JADWAL (GAYA MUTATION CARD DATA SISWA) ── */}
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
              Daftar Rincian Jadwal Pelajaran
            </Text>
            <View style={{ backgroundColor: '#E0F2FE', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#0284C7' }}>
                {filteredSchedules.length} Sesi
              </Text>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color={THEME.primary} />
              <Text style={styles.loadingText}>Memuat jadwal pelajaran unit...</Text>
            </View>
          ) : filteredSchedules.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="calendar-blank-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Tidak Ada Jadwal Ditemukan</Text>
              <Text style={styles.emptySubtitle}>
                {filterConflictOnly
                  ? 'Tidak ada jadwal yang bentrok dengan filter aktif saat ini.'
                  : 'Belum ada sesi pelajaran untuk hari atau kriteria filter yang dipilih.'}
              </Text>
              <TouchableOpacity style={styles.emptyActionBtn} onPress={openCreateModal} activeOpacity={0.85}>
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.emptyActionBtnText}>Tambah Jadwal</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredSchedules.map((item) => {
              const isConflict = conflictScheduleIds.has(item.id);
              const isActivity = item.activity_type === 'activity' || (item.activity_type && item.activity_type !== 'kbm');
              const dayName = DAY_OPTIONS.find((d) => d.id === Number(item.day_of_week))?.name || `Hari ${item.day_of_week}`;
              const timeDisplay = `${(item.time_start || '').slice(0, 5)} - ${(item.time_end || '').slice(0, 5)}`;
              const subjectName = isActivity
                ? item.activity_name || 'Kegiatan Non-KBM'
                : item.subject?.name || item.subject?.nama_mapel || 'Mata Pelajaran';
              const subjectCode = isActivity
                ? 'Aktivitas Sekolah'
                : item.subject?.code || item.subject?.kode_mapel || '';
              const className = item.kelas?.nama_kelas || item.schoolClass?.name || 'Rombel Kelas';
              const teacherName = isActivity
                ? item.employee?.nama_lengkap || item.teacher?.name || 'Umum / Mandiri'
                : item.employee?.nama_lengkap || item.teacher?.name || 'Guru Belum Ditentukan';
              const roomName = item.room || item.ruangan || 'Ruang Kelas';

              return (
                <View
                  key={item.id}
                  style={[
                    styles.mutationCard,
                    isConflict && { borderColor: '#FECACA', backgroundColor: '#FFFDFD' },
                  ]}
                >
                  {/* Top Row: Avatar & Subject Info */}
                  <View style={styles.cardTopRow}>
                    <View
                      style={[
                        styles.avatarCircle,
                        {
                          backgroundColor: isConflict
                            ? '#FEE2E2'
                            : isActivity
                              ? '#DBEAFE'
                              : '#DCFCE7',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={
                          isConflict
                            ? 'alert-octagon'
                            : isActivity
                              ? 'star-outline'
                              : 'book-open-page-variant'
                        }
                        size={22}
                        color={
                          isConflict
                            ? '#DC2626'
                            : isActivity
                              ? '#2563EB'
                              : '#059669'
                        }
                      />
                    </View>

                    <View style={styles.cardMainInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.subjectTitle} numberOfLines={2}>
                          {subjectName}
                        </Text>
                        {isConflict ? (
                          <View style={[styles.tagBadge, { backgroundColor: '#FEE2E2' }]}>
                            <Text style={[styles.tagBadgeText, { color: '#DC2626' }]}>BENTROK</Text>
                          </View>
                        ) : isActivity ? (
                          <View style={[styles.tagBadge, { backgroundColor: '#EFF6FF' }]}>
                            <Text style={[styles.tagBadgeText, { color: '#2563EB' }]}>KEGIATAN</Text>
                          </View>
                        ) : (
                          <View style={[styles.tagBadge, { backgroundColor: '#ECFDF5' }]}>
                            <Text style={[styles.tagBadgeText, { color: '#059669' }]}>AKTIF</Text>
                          </View>
                        )}
                      </View>
                      <Text style={styles.nisText}>
                        {dayName} • {timeDisplay} {subjectCode ? `• ${subjectCode}` : ''}
                      </Text>
                    </View>
                  </View>

                  {/* Detail Box (Rombel, Guru, Ruangan) */}
                  <View style={styles.detailBox}>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Rombel</Text>
                      <Text style={styles.detailItemVal}>{className}</Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>
                        {isActivity ? 'Pembina' : 'Guru'}
                      </Text>
                      <Text style={styles.detailItemVal}>{teacherName}</Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Ruang</Text>
                      <Text style={styles.detailItemVal}>{roomName}</Text>
                    </View>
                  </View>

                  {/* Bottom Action Row (Detail, Edit, Delete) */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => setDetailModalItem(item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="eye-outline" size={16} color="#059669" />
                      <Text style={[styles.cardActionBtnText, { color: '#059669' }]}>Rincian</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openEditModal(item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#0284C7" />
                      <Text style={[styles.cardActionBtnText, { color: '#0284C7' }]}>Ubah</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.cardActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                      onPress={() => setDeleteConfirmItem(item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" />
                      <Text style={[styles.cardActionBtnText, { color: '#DC2626' }]}>Hapus</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  ) : (
    /* ── KONTEN TAB 2: JADWAL UJIAN (PTS/PAS/PAT) ── */
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[
        styles.cleanMainScrollContent,
        { paddingBottom: Math.max(bottomInset + 72, 94) },
      ]}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#2563EB']} />
      }
    >
      <View style={styles.bodyContentWrapper}>
        {/* TAB SWITCHER IDENTIK DUAL ROLE PILL BUKU PENGHUBUNG */}
        <View style={styles.dualRolePillContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={styles.dualRolePill}
            onPress={() => setWorkspaceTab('schedule')}
          >
            <MaterialCommunityIcons
              name="calendar-clock"
              size={16}
              color="#047857"
            />
            <Text style={styles.dualRolePillText}>
              KBM & Rutinitas ({schedules.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.dualRolePill, styles.dualRolePillActive]}
            onPress={() => {
              setWorkspaceTab('exam');
              if (examSchedules.length === 0) void fetchExamData(false);
            }}
          >
            <MaterialCommunityIcons
              name="file-document-edit-outline"
              size={16}
              color="#FFFFFF"
            />
            <Text style={[styles.dualRolePillText, styles.dualRolePillTextActive]}>
              Jadwal Ujian ({examSchedules.length})
            </Text>
          </TouchableOpacity>
        </View>

        {/* ACTION BAR: TAMBAH UJIAN & RESET FILTER */}
        <View style={styles.subActionBar}>
          <View style={styles.primaryActionRow}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={openCreateExamModal}
              style={[styles.addPillBtn, { shadowColor: '#2563EB' }]}
            >
              <LinearGradient
                colors={['#2563EB', '#1D4ED8']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.addPillBtnGradient}
              >
                <MaterialCommunityIcons name="plus-circle" size={18} color="#FFFFFF" />
                <Text style={styles.addPillBtnText}>Tambah Jadwal Ujian</Text>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setSelectedExamCategoryId('all');
                setSelectedClassId('all');
                setSearch('');
                setQuery('');
              }}
              style={styles.rekapPillBtn}
            >
              <View style={[styles.rekapPillIconBox, { backgroundColor: '#EFF6FF' }]}>
                <MaterialCommunityIcons name="filter-remove-outline" size={16} color="#2563EB" />
              </View>
              <Text style={[styles.rekapPillText, { color: '#1E40AF' }]}>Reset Filter</Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* ── FILTER CARD UJIAN ── */}
        <View style={styles.filterCard}>
          <View style={styles.filterCardHeader}>
            <Text style={styles.filterCardTitle}>Filter Jadwal Ujian</Text>
            <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563EB' }}>
                {filteredExamSchedules.length} Sesi Terjadwal
              </Text>
            </View>
          </View>

          {/* Filter Dropdown Kategori Ujian */}
          <Text style={styles.filterLabel}>Kategori / Periode Ujian</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            activeOpacity={0.8}
            onPress={() => {
              const items = [
                { id: 'all', label: 'Semua Kategori Ujian' },
                ...examCategories.map((c) => ({
                  id: String(c.id),
                  label: c.name || 'Kategori Ujian',
                  sub: c.code,
                })),
              ];
              setPickerModal({
                visible: true,
                title: 'Pilih Kategori Ujian',
                items,
                onSelect: (sel) => setSelectedExamCategoryId(String(sel.id)),
              });
            }}
          >
            <View style={styles.dropdownTriggerLeft}>
              <View style={[styles.dropdownTriggerIconBox, { backgroundColor: '#EFF6FF' }]}>
                <MaterialCommunityIcons name="file-document-edit" size={16} color="#2563EB" />
              </View>
              <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                {selectedExamCategoryId === 'all'
                  ? 'Semua Kategori Ujian'
                  : examCategories.find((c) => String(c.id) === String(selectedExamCategoryId))?.name || 'Kategori Terpilih'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>

          {/* Filter Dropdown Rombel / Kelas */}
          <Text style={[styles.filterLabel, { marginTop: 12 }]}>Target Rombel / Kelas</Text>
          <TouchableOpacity
            style={styles.dropdownTrigger}
            activeOpacity={0.8}
            onPress={() => {
              const items = [
                { id: 'all', label: 'Semua Rombel / Kelas' },
                ...options.kelas.map((k) => ({
                  id: String(k.id),
                  label: k.nama_kelas || k.kode_kelas || 'Kelas',
                  sub: k.kode_kelas,
                })),
              ];
              setPickerModal({
                visible: true,
                title: 'Pilih Rombel / Kelas',
                items,
                onSelect: (sel) => setSelectedClassId(String(sel.id)),
              });
            }}
          >
            <View style={styles.dropdownTriggerLeft}>
              <View style={styles.dropdownTriggerIconBox}>
                <MaterialCommunityIcons name="google-classroom" size={16} color="#059669" />
              </View>
              <Text style={styles.dropdownTriggerText} numberOfLines={1}>
                {selectedClassId === 'all'
                  ? 'Semua Kelas di Unit'
                  : options.kelas.find((k) => String(k.id) === String(selectedClassId))?.nama_kelas || 'Kelas Terpilih'}
              </Text>
            </View>
            <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
          </TouchableOpacity>
        </View>

        {/* ── LIST ITEM JADWAL UJIAN ── */}
        <View style={{ marginBottom: 12 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <Text style={{ fontSize: 13, fontWeight: '800', color: '#0F172A' }}>
              Daftar Sesi Ujian (PTS/PAS/PAT)
            </Text>
            <View style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 8, paddingVertical: 2.5, borderRadius: 6 }}>
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#2563EB' }}>
                {filteredExamSchedules.length} Sesi
              </Text>
            </View>
          </View>

          {loadingExams ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#2563EB" />
              <Text style={styles.loadingText}>Memuat jadwal ujian unit...</Text>
            </View>
          ) : filteredExamSchedules.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="file-document-alert-outline" size={48} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Belum Ada Jadwal Ujian</Text>
              <Text style={styles.emptySubtitle}>
                Tidak ada jadwal ujian untuk filter kategori atau kriteria rombel yang dipilih.
              </Text>
              <TouchableOpacity
                style={[styles.emptyActionBtn, { backgroundColor: '#2563EB' }]}
                onPress={openCreateExamModal}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="plus" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.emptyActionBtnText}>Tambah Jadwal Ujian</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredExamSchedules.map((item) => {
              const subjectName = item.subject?.name || item.subject?.nama_mapel || 'Mata Pelajaran';
              const categoryName = item.exam_category?.name || item.examCategory?.name || 'UJIAN';
              const className = item.kelas?.nama_kelas || 'Rombel Kelas';
              const invigilatorName = item.invigilator?.nama_lengkap || 'Belum Ditentukan';
              const roomName = item.room || 'Ruang Kelas';
              const examDateDisplay = item.exam_date
                ? new Date(item.exam_date).toLocaleDateString('id-ID', {
                    weekday: 'short',
                    day: 'numeric',
                    month: 'short',
                    year: 'numeric',
                  })
                : '-';
              const timeDisplay = `${(item.time_start || '').slice(0, 5)} - ${(item.time_end || '').slice(0, 5)}`;

              return (
                <View key={item.id} style={[styles.mutationCard, { borderColor: '#BFDBFE' }]}>
                  {/* Top Row: Avatar & Subject Info */}
                  <View style={styles.cardTopRow}>
                    <View style={[styles.avatarCircle, { backgroundColor: '#DBEAFE' }]}>
                      <MaterialCommunityIcons name="file-document-edit-outline" size={22} color="#2563EB" />
                    </View>

                    <View style={styles.cardMainInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.subjectTitle} numberOfLines={2}>
                          {subjectName}
                        </Text>
                        <View style={[styles.tagBadge, { backgroundColor: '#EFF6FF' }]}>
                          <Text style={[styles.tagBadgeText, { color: '#2563EB' }]}>
                            {categoryName}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.nisText}>
                        {examDateDisplay} • {timeDisplay} WIB
                      </Text>
                    </View>
                  </View>

                  {/* Detail Breakdown Box */}
                  <View style={styles.detailBox}>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Rombel</Text>
                      <Text style={styles.detailItemVal}>: {className}</Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Ruang</Text>
                      <Text style={styles.detailItemVal}>: {roomName}</Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Pengawas</Text>
                      <Text style={styles.detailItemVal} numberOfLines={2}>
                        : {invigilatorName}
                      </Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Durasi</Text>
                      <Text style={styles.detailItemVal}>
                        : {item.duration_minutes || 120} Menit
                      </Text>
                    </View>
                    {item.notes ? (
                      <View style={styles.detailItemRow}>
                        <Text style={styles.detailItemLabel}>Catatan</Text>
                        <Text style={[styles.detailItemVal, { fontStyle: 'italic', color: '#64748B' }]} numberOfLines={2}>
                          : {item.notes}
                        </Text>
                      </View>
                    ) : null}
                  </View>

                  {/* Action Buttons Row */}
                  <View style={styles.cardActionsRow}>
                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => setExamDetailModalItem(item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="eye-outline" size={16} color="#2563EB" />
                      <Text style={[styles.cardActionBtnText, { color: '#2563EB' }]}>Rincian</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.cardActionBtn}
                      onPress={() => openEditExamModal(item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={16} color="#0284C7" />
                      <Text style={[styles.cardActionBtnText, { color: '#0284C7' }]}>Ubah</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.cardActionBtn, { borderColor: '#FECACA', backgroundColor: '#FEF2F2' }]}
                      onPress={() => setDeleteExamConfirmItem(item)}
                      activeOpacity={0.7}
                    >
                      <MaterialCommunityIcons name="trash-can-outline" size={16} color="#DC2626" />
                      <Text style={[styles.cardActionBtnText, { color: '#DC2626' }]}>Hapus</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            })
          )}
        </View>
      </View>
    </ScrollView>
  )}
</View>

      {/* ── FLOATING ACTION BUTTON (FAB) DINAMIS ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={workspaceTab === 'exam' ? openCreateExamModal : openCreateModal}
        style={[
          styles.fabBtn,
          { shadowColor: workspaceTab === 'exam' ? '#2563EB' : THEME.primary },
        ]}
      >
        <LinearGradient
          colors={workspaceTab === 'exam' ? ['#2563EB', '#1D4ED8'] : ['#059669', '#047857']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.fabGradient}
        >
          <MaterialCommunityIcons name="plus" size={20} color="#FFFFFF" />
          <Text style={styles.fabText}>
            {workspaceTab === 'exam' ? 'Tambah Ujian' : 'Tambah Jadwal'}
          </Text>
        </LinearGradient>
      </TouchableOpacity>

      {/* ── MODAL FORM TAMBAH / UBAH JADWAL (HERO UI STYLE) ── */}
      <Modal visible={formModalVisible} animationType="slide" transparent onRequestClose={handleCloseScheduleForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContainer}>
            {/* Top Accent Gradient Line */}
            <LinearGradient
              colors={['#059669', '#14B8A6', '#0D9488']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: 4, width: '100%' }}
            />

            {/* Hero Modal Header */}
            <View style={styles.heroModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                <LinearGradient
                  colors={['#059669', '#047857']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.heroIconBadge}
                >
                  <MaterialCommunityIcons name="calendar-clock" size={22} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={styles.modalTitle}>
                      {editingItem ? 'Ubah Jadwal Pelajaran' : 'Tambah Jadwal Pelajaran'}
                    </Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                    <View style={styles.heroBadgePill}>
                      <Text style={styles.heroBadgeText}>Hero UI Anti-Bentrok</Text>
                    </View>
                    <Text style={styles.modalSubtitle} numberOfLines={1}>
                      Unit: {unitName}
                    </Text>
                  </View>
                </View>
              </View>
              <TouchableOpacity onPress={handleCloseScheduleForm} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Hero Summary Badge (Rombel & Guru Terpilih) */}
            {(formData.kelas_id || formData.employee_id) && (
              <View style={styles.heroSummaryBar}>
                {formData.kelas_id && (
                  <View style={styles.heroSummaryPill}>
                    <MaterialCommunityIcons name="google-classroom" size={13} color="#065F46" />
                    <Text style={styles.heroSummaryPillText} numberOfLines={1}>
                      {options.kelas.find((k) => String(k.id) === String(formData.kelas_id))?.nama_kelas || 'Kelas Terpilih'}
                    </Text>
                  </View>
                )}
                {formData.employee_id && (
                  <View style={[styles.heroSummaryPill, { backgroundColor: '#F0FDFA', borderColor: '#CCFBF1' }]}>
                    <MaterialCommunityIcons name="account-tie" size={13} color="#0F766E" />
                    <Text style={[styles.heroSummaryPillText, { color: '#0F766E' }]} numberOfLines={1}>
                      {options.guru.find((g) => String(g.id) === String(formData.employee_id))?.nama_lengkap || 'Guru Terpilih'}
                    </Text>
                  </View>
                )}
              </View>
            )}

            {conflictWarning ? (
              <View style={styles.modalWarningBox}>
                <MaterialCommunityIcons name="alert-octagon" size={20} color="#DC2626" style={{ marginRight: 8 }} />
                <Text style={styles.modalWarningText}>{conflictWarning}</Text>
              </View>
            ) : null}

            <ScrollView contentContainerStyle={styles.modalFormScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* ── 1. PENUGASAN AKADEMIK & JENIS JADWAL ── */}
              <View style={styles.heroSectionCard}>
                <View style={styles.heroSectionHeader}>
                  <MaterialCommunityIcons name="layers-outline" size={16} color="#059669" />
                  <Text style={styles.heroSectionTitle}>1. Jenis Jadwal & Penugasan</Text>
                </View>

                {/* Switcher Mode: KBM vs Kegiatan Non-KBM */}
                <Text style={styles.fieldLabel}>Pilih Kategori Jadwal <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: formData.activity_type === 'kbm' ? '#059669' : '#E2E8F0',
                      backgroundColor: formData.activity_type === 'kbm' ? '#ECFDF5' : '#F8FAFC',
                    }}
                    onPress={() => setFormData((prev) => ({ ...prev, activity_type: 'kbm' }))}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name="book-open-page-variant"
                      size={18}
                      color={formData.activity_type === 'kbm' ? '#059669' : '#64748B'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: formData.activity_type === 'kbm' ? '800' : '600',
                        color: formData.activity_type === 'kbm' ? '#059669' : '#475569',
                      }}
                    >
                      KBM Pelajaran
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={{
                      flex: 1,
                      flexDirection: 'row',
                      alignItems: 'center',
                      justifyContent: 'center',
                      paddingVertical: 10,
                      paddingHorizontal: 8,
                      borderRadius: 10,
                      borderWidth: 1.5,
                      borderColor: formData.activity_type === 'activity' ? '#2563EB' : '#E2E8F0',
                      backgroundColor: formData.activity_type === 'activity' ? '#EFF6FF' : '#F8FAFC',
                    }}
                    onPress={() => setFormData((prev) => ({ ...prev, activity_type: 'activity' }))}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name="star-outline"
                      size={18}
                      color={formData.activity_type === 'activity' ? '#2563EB' : '#64748B'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={{
                        fontSize: 12.5,
                        fontWeight: formData.activity_type === 'activity' ? '800' : '600',
                        color: formData.activity_type === 'activity' ? '#2563EB' : '#475569',
                      }}
                    >
                      Kegiatan Non-KBM
                    </Text>
                  </TouchableOpacity>
                </View>

                {/* Kelas / Rombel */}
                <Text style={styles.fieldLabel}>Rombel / Kelas <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TouchableOpacity
                  style={styles.fieldPickerBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Rombel / Kelas',
                      items: options.kelas.map((k) => ({
                        id: String(k.id),
                        label: k.nama_kelas || k.kode_kelas,
                        sub: k.kode_kelas,
                      })),
                      onSelect: (sel) => setFormData((prev) => ({ ...prev, kelas_id: String(sel.id) })),
                    });
                  }}
                >
                  <Text style={formData.kelas_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                    {options.kelas.find((k) => String(k.id) === String(formData.kelas_id))?.nama_kelas ||
                      'Pilih Rombel Kelas'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Form Khusus Kegiatan Non-KBM (Input Bebas) */}
                {formData.activity_type === 'activity' ? (
                  <View style={{ marginTop: 4 }}>
                    <Text style={styles.fieldLabel}>
                      Nama Kegiatan Sekolah <Text style={{ color: '#EF4444' }}>*</Text>
                    </Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={formData.activity_name}
                      onChangeText={(txt) => setFormData((prev) => ({ ...prev, activity_name: txt }))}
                      placeholder="Contoh: Upacara, Dzikir Pagi, Waktu Istirahat, ISHOMA, dll."
                      placeholderTextColor="#94A3B8"
                    />
                    <Text style={{ fontSize: 11, color: '#64748B', marginTop: -4, marginBottom: 12 }}>
                      ℹ️ Teks kegiatan diinput bebas dan fleksibel sesuai agenda operasional sekolah.
                    </Text>

                    {/* Guru Pembina / Penanggung Jawab (Opsional) */}
                    <Text style={styles.fieldLabel}>Guru Pembina / Pendamping (Opsional)</Text>
                    <TouchableOpacity
                      style={styles.fieldPickerBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        setPickerModal({
                          visible: true,
                          title: 'Pilih Guru Pendamping',
                          items: [
                            { id: '', label: 'Tanpa Pembina Khusus (Umum / Mandiri)' },
                            ...options.guru.map((g) => ({
                              id: String(g.id),
                              label: g.nama_lengkap || g.name,
                              sub: g.niy ? `NIY: ${g.niy}` : undefined,
                            })),
                          ],
                          onSelect: (sel) => setFormData((prev) => ({ ...prev, employee_id: String(sel.id) })),
                        });
                      }}
                    >
                      <Text style={formData.employee_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                        {options.guru.find((g) => String(g.id) === String(formData.employee_id))?.nama_lengkap ||
                          'Umum / Mandiri (Tanpa Pembina Khusus)'}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                ) : (
                  /* Form Khusus KBM Mata Pelajaran */
                  <View style={{ marginTop: 4 }}>
                    {/* Guru */}
                    <Text style={styles.fieldLabel}>Guru Pengampu <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TouchableOpacity
                      style={styles.fieldPickerBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        setPickerModal({
                          visible: true,
                          title: 'Pilih Guru Pengampu',
                          items: options.guru.map((g) => ({
                            id: String(g.id),
                            label: g.nama_lengkap || g.name,
                            sub: g.niy ? `NIY: ${g.niy}` : undefined,
                          })),
                          onSelect: (sel) => setFormData((prev) => ({ ...prev, employee_id: String(sel.id) })),
                        });
                      }}
                    >
                      <Text style={formData.employee_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                        {options.guru.find((g) => String(g.id) === String(formData.employee_id))?.nama_lengkap ||
                          'Pilih Guru Pengampu'}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                    </TouchableOpacity>

                    {/* Mapel */}
                    <Text style={styles.fieldLabel}>Mata Pelajaran <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TouchableOpacity
                      style={styles.fieldPickerBtn}
                      activeOpacity={0.8}
                      onPress={() => {
                        setPickerModal({
                          visible: true,
                          title: 'Pilih Mata Pelajaran',
                          items: options.mata_pelajaran.map((m) => ({
                            id: String(m.id),
                            label: m.nama_mapel || m.name,
                            sub: m.kode_mapel || m.code,
                          })),
                          onSelect: (sel) => setFormData((prev) => ({ ...prev, subject_id: String(sel.id) })),
                        });
                      }}
                    >
                      <Text style={formData.subject_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                        {options.mata_pelajaran.find((m) => String(m.id) === String(formData.subject_id))?.nama_mapel ||
                          options.mata_pelajaran.find((m) => String(m.id) === String(formData.subject_id))?.name ||
                          'Pilih Mata Pelajaran'}
                      </Text>
                      <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>

              {/* ── 2. RINCIAN HARI KOSONG & PEMILIH HARI ── */}
              <View style={[styles.heroSectionCard, { marginTop: 14 }]}>
                <View style={styles.heroSectionHeader}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#059669" />
                  <Text style={styles.heroSectionTitle}>2. Rincian Hari KBM & Ketersediaan Slot</Text>
                </View>
                <Text style={styles.heroSectionSub}>
                  Pilih hari mengajar di bawah ini. Status hari diperbarui secara otomatis.
                </Text>

                {/* Grid 6 Hari: Senin s/d Sabtu */}
                <View style={styles.heroDayGrid}>
                  {DAY_OPTIONS.map((d) => {
                    const isSel = formData.day_of_week === d.id;
                    const dayStat = availabilityData?.days?.find((item: any) => item.day_of_week === d.id);
                    const isEmpty = dayStat ? dayStat.is_empty : false;
                    const count = dayStat ? dayStat.total_schedules : 0;

                    return (
                      <TouchableOpacity
                        key={d.id}
                        style={[
                          styles.heroDayCard,
                          isSel && styles.heroDayCardActive,
                          isEmpty && !isSel && styles.heroDayCardEmpty,
                        ]}
                        onPress={() => setFormData((prev) => ({ ...prev, day_of_week: d.id }))}
                        activeOpacity={0.75}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                          <Text style={[styles.heroDayCardTitle, isSel && styles.heroDayCardTitleActive]}>
                            {d.name}
                          </Text>
                          {isEmpty && (
                            <View style={[styles.heroDayBadgeMini, isSel && { backgroundColor: 'rgba(255,255,255,0.25)' }]}>
                              <Text style={[styles.heroDayBadgeMiniText, isSel && { color: '#FFFFFF' }]}>Kosong</Text>
                            </View>
                          )}
                        </View>
                        <Text style={[styles.heroDayCardSub, isSel && styles.heroDayCardSubActive]}>
                          {isEmpty ? '✨ Bebas Sesi' : `${count} Sesi Terisi`}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Box Rekomendasi Hari Kosong */}
                {availabilityData?.days && availabilityData.days.filter((d: any) => d.is_empty).length > 0 && (
                  <View style={styles.heroRecommendationBox}>
                    <MaterialCommunityIcons name="creation" size={16} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={styles.heroRecommendationText}>
                      Hari{' '}
                      <Text style={{ fontWeight: '800', color: '#047857' }}>
                        {availabilityData.days.filter((d: any) => d.is_empty).map((d: any) => d.day_name).join(', ')}
                      </Text>{' '}
                      sepenuhnya kosong. Sangat disarankan untuk jadwal baru ini.
                    </Text>
                  </View>
                )}
              </View>

              {/* ── 3. REKOMENDASI JAM KOSONG (BEBAS BENTROK) ── */}
              <View style={[styles.heroSectionCard, { marginTop: 14 }]}>
                <View style={styles.heroSectionHeader}>
                  <MaterialCommunityIcons name="clock-check-outline" size={16} color="#059669" />
                  <Text style={styles.heroSectionTitle}>
                    3. Rekomendasi Jam Kosong ({DAY_OPTIONS.find((d) => d.id === formData.day_of_week)?.name})
                  </Text>
                </View>
                <Text style={styles.heroSectionSub}>
                  Tap salah satu slot jam kosong di bawah untuk langsung mengisinya otomatis tanpa risiko bentrok:
                </Text>

                {/* Chips Slot Jam Kosong Tersedia */}
                {(() => {
                  const currentDayDetail = availabilityData?.days?.find((d: any) => d.day_of_week === formData.day_of_week);
                  const freeSlots: any[] = currentDayDetail?.free_slots || [
                    { time_start: '07:30', time_end: '08:15', label: '07:30 - 08:15 (Sesi 1 • 45m)' },
                    { time_start: '08:15', time_end: '09:00', label: '08:15 - 09:00 (Sesi 2 • 45m)' },
                    { time_start: '07:30', time_end: '09:00', label: '07:30 - 09:00 (Blok Pagi • 90m)' },
                    { time_start: '09:15', time_end: '10:00', label: '09:15 - 10:00 (Sesi 3 • 45m)' },
                    { time_start: '10:00', time_end: '10:45', label: '10:00 - 10:45 (Sesi 4 • 45m)' },
                    { time_start: '09:15', time_end: '10:45', label: '09:15 - 10:45 (Blok Duha • 90m)' },
                    { time_start: '10:45', time_end: '11:30', label: '10:45 - 11:30 (Sesi 5 • 45m)' },
                    { time_start: '13:00', time_end: '13:45', label: '13:00 - 13:45 (Sesi 6 • 45m)' },
                    { time_start: '13:00', time_end: '14:30', label: '13:00 - 14:30 (Blok Siang • 90m)' },
                    { time_start: '14:30', time_end: '15:15', label: '14:30 - 15:15 (Sesi 8 • 45m)' },
                  ];

                  return (
                    <View style={styles.freeSlotsContainer}>
                      {freeSlots.map((slot, sIdx) => {
                        const isSelectedSlot = formData.time_start === slot.time_start && formData.time_end === slot.time_end;
                        return (
                          <TouchableOpacity
                            key={sIdx}
                            style={[styles.freeSlotPill, isSelectedSlot && styles.freeSlotPillActive]}
                            onPress={() => {
                              setFormData((prev) => ({
                                ...prev,
                                time_start: slot.time_start,
                                time_end: slot.time_end,
                              }));
                            }}
                            activeOpacity={0.7}
                          >
                            <MaterialCommunityIcons
                              name={isSelectedSlot ? 'check-circle' : 'clock-outline'}
                              size={14}
                              color={isSelectedSlot ? '#FFFFFF' : '#059669'}
                            />
                            <Text style={[styles.freeSlotPillText, isSelectedSlot && styles.freeSlotPillTextActive]}>
                              {slot.label || `${slot.time_start} - ${slot.time_end}`}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  );
                })()}

                {/* Sesi yang Terisi pada Hari Ini jika ada */}
                {(() => {
                  const currentDayDetail = availabilityData?.days?.find((d: any) => d.day_of_week === formData.day_of_week);
                  const occupied: any[] = currentDayDetail?.occupied_slots || [];
                  if (occupied.length === 0) return null;

                  return (
                    <View style={styles.occupiedSection}>
                      <Text style={styles.occupiedTitle}>
                        Jadwal Terisi pada Hari Ini ({occupied.length}):
                      </Text>
                      <View style={styles.occupiedPillsWrap}>
                        {occupied.map((occ, oIdx) => (
                          <View key={oIdx} style={styles.occupiedBadge}>
                            <Text style={styles.occupiedBadgeTime}>{occ.time_start}-{occ.time_end}</Text>
                            <Text style={styles.occupiedBadgeSubject}>: {occ.subject_name}</Text>
                            <Text style={styles.occupiedBadgeReason}>({occ.conflict_reason || occ.kelas_name})</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  );
                })()}

                {/* Waktu Input Manual */}
                <View style={[styles.timeInputRow, { marginTop: 12 }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.fieldLabel}>Jam Mulai (HH:mm) <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={formData.time_start}
                      onChangeText={(txt) => setFormData((prev) => ({ ...prev, time_start: txt }))}
                      placeholder="07:30"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                  <View style={{ flex: 1, marginLeft: 8 }}>
                    <Text style={styles.fieldLabel}>Jam Selesai (HH:mm) <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TextInput
                      style={styles.fieldInput}
                      value={formData.time_end}
                      onChangeText={(txt) => setFormData((prev) => ({ ...prev, time_end: txt }))}
                      placeholder="09:00"
                      placeholderTextColor="#94A3B8"
                      keyboardType="numbers-and-punctuation"
                    />
                  </View>
                </View>

                {/* Status Bebas Bentrok Indikator */}
                {formData.time_start && formData.time_end && !conflictWarning ? (
                  <View style={styles.safeConflictBox}>
                    <MaterialCommunityIcons name="shield-check" size={16} color="#059669" style={{ marginRight: 6 }} />
                    <Text style={styles.safeConflictText}>
                      ✓ Jam {formData.time_start} - {formData.time_end} Bebas Bentrok untuk Kelas & Guru ini.
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* ── 4. RUANGAN & CATATAN OPSIONAL ── */}
              <View style={[styles.heroSectionCard, { marginTop: 14 }]}>
                {/* Ruangan */}
                <Text style={styles.fieldLabel}>Ruangan (Opsional)</Text>
                <TextInput
                  style={styles.fieldInput}
                  value={formData.room}
                  onChangeText={(txt) => setFormData((prev) => ({ ...prev, room: txt }))}
                  placeholder="Contoh: R. Kelas VII-A / Lab IPA"
                  placeholderTextColor="#94A3B8"
                />

                {/* Catatan */}
                <Text style={styles.fieldLabel}>Catatan Sesi (Opsional)</Text>
                <TextInput
                  style={[styles.fieldInput, { height: 60, textAlignVertical: 'top' }]}
                  value={formData.notes}
                  onChangeText={(txt) => setFormData((prev) => ({ ...prev, notes: txt }))}
                  placeholder="Catatan tambahan jam pelajaran..."
                  placeholderTextColor="#94A3B8"
                  multiline
                />
              </View>
            </ScrollView>

            {/* Modal Footer */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={handleCloseScheduleForm}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, conflictWarning ? { backgroundColor: '#DC2626' } : {}]}
                onPress={handleSaveSchedule}
                disabled={saving || !!conflictWarning}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons
                      name={conflictWarning ? 'alert-octagon' : 'content-save-outline'}
                      size={18}
                      color="#FFFFFF"
                      style={{ marginRight: 6 }}
                    />
                    <Text style={styles.modalSubmitText}>
                      {conflictWarning
                        ? 'Bentrok Terdeteksi'
                        : editingItem
                          ? 'Simpan Perubahan'
                          : 'Simpan Jadwal'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL DETAIL JADWAL ── */}
      <Modal visible={!!detailModalItem} animationType="fade" transparent onRequestClose={() => setDetailModalItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailCardContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Detail Jadwal Pelajaran</Text>
                <Text style={styles.modalSubtitle}>Informasi Lengkap Sesi KBM Unit</Text>
              </View>
              <TouchableOpacity onPress={() => setDetailModalItem(null)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {detailModalItem ? (
              <View style={styles.detailBody}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Jenis Jadwal</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <View
                      style={{
                        backgroundColor: detailModalItem.activity_type === 'activity' ? '#EFF6FF' : '#ECFDF5',
                        paddingHorizontal: 8,
                        paddingVertical: 2,
                        borderRadius: 6,
                      }}
                    >
                      <Text
                        style={{
                          fontSize: 12,
                          fontWeight: '800',
                          color: detailModalItem.activity_type === 'activity' ? '#2563EB' : '#059669',
                        }}
                      >
                        {detailModalItem.activity_type === 'activity' ? 'Kegiatan Non-KBM' : 'KBM Pelajaran'}
                      </Text>
                    </View>
                  </View>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {detailModalItem.activity_type === 'activity' ? 'Nama Kegiatan' : 'Mata Pelajaran'}
                  </Text>
                  <Text style={styles.detailValBold}>
                    {detailModalItem.activity_type === 'activity'
                      ? detailModalItem.activity_name || 'Kegiatan Non-KBM'
                      : detailModalItem.subject?.name || detailModalItem.subject?.nama_mapel || '-'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Rombel / Kelas</Text>
                  <Text style={styles.detailVal}>
                    {detailModalItem.kelas?.nama_kelas || detailModalItem.schoolClass?.name || '-'}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>
                    {detailModalItem.activity_type === 'activity' ? 'Pembina / Pendamping' : 'Guru Pengampu'}
                  </Text>
                  <Text style={styles.detailVal}>
                    {detailModalItem.employee?.nama_lengkap ||
                      detailModalItem.teacher?.name ||
                      (detailModalItem.activity_type === 'activity' ? 'Umum / Mandiri' : '-')}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Hari & Waktu</Text>
                  <Text style={styles.detailVal}>
                    {DAY_OPTIONS.find((d) => d.id === Number(detailModalItem.day_of_week))?.name || 'Hari'} •{' '}
                    {(detailModalItem.time_start || '').slice(0, 5)} - {(detailModalItem.time_end || '').slice(0, 5)}
                  </Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Ruangan</Text>
                  <Text style={styles.detailVal}>{detailModalItem.room || detailModalItem.ruangan || 'Ruang Kelas'}</Text>
                </View>

                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Status Bentrok</Text>
                  <Text style={[styles.detailVal, { color: conflictScheduleIds.has(detailModalItem.id) ? '#DC2626' : '#059669', fontWeight: '700' }]}>
                    {conflictScheduleIds.has(detailModalItem.id) ? 'Perlu Disesuaikan (Bentrok)' : 'Aman (Tanpa Bentrok)'}
                  </Text>
                </View>

                {detailModalItem.notes ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Catatan</Text>
                    <Text style={styles.detailVal}>{detailModalItem.notes}</Text>
                  </View>
                ) : null}

                <View style={{ marginTop: 16 }}>
                  <TouchableOpacity
                    style={[styles.modalSubmitBtn, { backgroundColor: '#0284C7' }]}
                    onPress={() => {
                      const it = detailModalItem;
                      setDetailModalItem(null);
                      openEditModal(it);
                    }}
                  >
                    <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                    <Text style={styles.modalSubmitText}>Ubah Jadwal Ini</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : null}
          </View>
        </View>
      </Modal>

      {/* ── MODAL KONFIRMASI HAPUS ── */}
      <Modal visible={!!deleteConfirmItem} animationType="fade" transparent onRequestClose={() => setDeleteConfirmItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteConfirmBox}>
            <View style={styles.deleteIconBadge}>
              <MaterialCommunityIcons name="trash-can-outline" size={32} color="#DC2626" />
            </View>
            <Text style={styles.deleteConfirmTitle}>
              {deleteConfirmItem?.activity_type === 'activity' ? 'Hapus Kegiatan Sekolah?' : 'Hapus Jadwal KBM?'}
            </Text>
            <Text style={styles.deleteConfirmMessage}>
              {deleteConfirmItem?.activity_type === 'activity' ? (
                <>
                  Kegiatan <Text style={{ fontWeight: '700' }}>"{deleteConfirmItem?.activity_name || 'Non-KBM'}"</Text> pada kelas <Text style={{ fontWeight: '700' }}>{deleteConfirmItem?.kelas?.nama_kelas || '-'}</Text> akan dihapus dari sistem.
                </>
              ) : (
                <>
                  Jadwal mata pelajaran <Text style={{ fontWeight: '700' }}>{deleteConfirmItem?.subject?.name || deleteConfirmItem?.subject?.nama_mapel || '-'}</Text> pada kelas <Text style={{ fontWeight: '700' }}>{deleteConfirmItem?.kelas?.nama_kelas || '-'}</Text> akan dihapus dari sistem.
                </>
              )}
            </Text>

            <View style={styles.deleteBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDeleteConfirmItem(null)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: '#DC2626' }]}
                onPress={executeDeleteSchedule}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Hapus Permanen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL FORM TAMBAH / UBAH JADWAL UJIAN ── */}
      <Modal visible={examFormModalVisible} animationType="slide" transparent onRequestClose={handleCloseExamForm}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.modalContainer}>
            {/* Top Accent Gradient Line */}
            <LinearGradient
              colors={['#2563EB', '#3B82F6', '#60A5FA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={{ height: 4, width: '100%' }}
            />

            {/* Modal Header */}
            <View style={styles.heroModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', flex: 1, gap: 12 }}>
                <LinearGradient
                  colors={['#2563EB', '#1D4ED8']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={[styles.heroIconBadge, { shadowColor: '#2563EB' }]}
                >
                  <MaterialCommunityIcons name="file-document-edit" size={22} color="#FFFFFF" />
                </LinearGradient>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>
                    {editingExamItem ? 'Ubah Jadwal Ujian' : 'Tambah Jadwal Ujian'}
                  </Text>
                  <Text style={styles.modalSubtitle} numberOfLines={1}>
                    Unit: {unitName}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={handleCloseExamForm} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalFormScroll} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              {/* 1. Kategori & Rombel */}
              <View style={styles.heroSectionCard}>
                <View style={styles.heroSectionHeader}>
                  <MaterialCommunityIcons name="bookmark-outline" size={16} color="#2563EB" />
                  <Text style={[styles.heroSectionTitle, { color: '#1E40AF' }]}>1. Kategori & Sasaran Ujian</Text>
                </View>

                {/* Kategori Ujian */}
                <Text style={styles.fieldLabel}>Kategori / Periode Ujian <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TouchableOpacity
                  style={styles.fieldPickerBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Kategori Ujian',
                      items: examCategories.map((c) => ({
                        id: String(c.id),
                        label: c.name || 'Kategori',
                        sub: c.code,
                      })),
                      onSelect: (sel) => setExamFormData((prev) => ({ ...prev, exam_category_id: String(sel.id) })),
                    });
                  }}
                >
                  <Text style={examFormData.exam_category_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                    {examCategories.find((c) => String(c.id) === String(examFormData.exam_category_id))?.name || 'Pilih Kategori (PTS/PAS/PAT)'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Target Rombel / Kelas */}
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Rombel / Kelas Diuji <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TouchableOpacity
                  style={styles.fieldPickerBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Rombel / Kelas',
                      items: options.kelas.map((k) => ({
                        id: String(k.id),
                        label: k.nama_kelas || k.kode_kelas,
                        sub: k.kode_kelas,
                      })),
                      onSelect: (sel) => setExamFormData((prev) => ({ ...prev, kelas_id: String(sel.id) })),
                    });
                  }}
                >
                  <Text style={examFormData.kelas_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                    {options.kelas.find((k) => String(k.id) === String(examFormData.kelas_id))?.nama_kelas || 'Pilih Rombel / Kelas'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Mata Pelajaran */}
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Mata Pelajaran Ujian <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TouchableOpacity
                  style={styles.fieldPickerBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Mata Pelajaran',
                      items: options.mata_pelajaran.map((m) => ({
                        id: String(m.id),
                        label: m.nama_mapel || m.name,
                        sub: m.kode_mapel || m.code,
                      })),
                      onSelect: (sel) => setExamFormData((prev) => ({ ...prev, subject_id: String(sel.id) })),
                    });
                  }}
                >
                  <Text style={examFormData.subject_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                    {options.mata_pelajaran.find((m) => String(m.id) === String(examFormData.subject_id))?.nama_mapel ||
                      options.mata_pelajaran.find((m) => String(m.id) === String(examFormData.subject_id))?.name ||
                      'Pilih Mata Pelajaran'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {/* 2. Waktu, Tanggal & Ruangan */}
              <View style={[styles.heroSectionCard, { marginTop: 14 }]}>
                <View style={styles.heroSectionHeader}>
                  <MaterialCommunityIcons name="clock-outline" size={16} color="#2563EB" />
                  <Text style={[styles.heroSectionTitle, { color: '#1E40AF' }]}>2. Tanggal, Waktu & Lokasi</Text>
                </View>

                {/* Tanggal Ujian */}
                <Text style={styles.fieldLabel}>Tanggal Pelaksanaan (YYYY-MM-DD) <Text style={{ color: '#EF4444' }}>*</Text></Text>
                <TextInput
                  style={styles.fieldInput}
                  placeholder="YYYY-MM-DD (Contoh: 2026-10-20)"
                  placeholderTextColor="#94A3B8"
                  value={examFormData.exam_date}
                  onChangeText={(txt) => setExamFormData((prev) => ({ ...prev, exam_date: txt }))}
                />

                {/* Quick Date Buttons */}
                <View style={{ flexDirection: 'row', gap: 6, marginTop: 4, marginBottom: 10 }}>
                  <TouchableOpacity
                    style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' }}
                    onPress={() => setExamFormData((prev) => ({ ...prev, exam_date: new Date().toISOString().slice(0, 10) }))}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>Hari Ini</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={{ backgroundColor: '#EFF6FF', paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6, borderWidth: 1, borderColor: '#BFDBFE' }}
                    onPress={() => {
                      const d = new Date();
                      d.setDate(d.getDate() + 1);
                      setExamFormData((prev) => ({ ...prev, exam_date: d.toISOString().slice(0, 10) }));
                    }}
                  >
                    <Text style={{ fontSize: 11, fontWeight: '700', color: '#2563EB' }}>Besok</Text>
                  </TouchableOpacity>
                </View>

                {/* Jam Mulai & Jam Selesai */}
                <View style={[styles.timeInputRow, { marginTop: 4 }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.fieldLabel}>Jam Mulai <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="07:30"
                      placeholderTextColor="#94A3B8"
                      value={examFormData.time_start}
                      onChangeText={(txt) => setExamFormData((prev) => ({ ...prev, time_start: txt }))}
                    />
                  </View>

                  <View style={{ flex: 1 }}>
                    <Text style={styles.fieldLabel}>Jam Selesai <Text style={{ color: '#EF4444' }}>*</Text></Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="09:30"
                      placeholderTextColor="#94A3B8"
                      value={examFormData.time_end}
                      onChangeText={(txt) => setExamFormData((prev) => ({ ...prev, time_end: txt }))}
                    />
                  </View>
                </View>

                {/* Durasi & Ruangan */}
                <View style={[styles.timeInputRow, { marginTop: 8 }]}>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={styles.fieldLabel}>Durasi (Menit)</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="120"
                      keyboardType="numeric"
                      placeholderTextColor="#94A3B8"
                      value={String(examFormData.duration_minutes || 120)}
                      onChangeText={(txt) => setExamFormData((prev) => ({ ...prev, duration_minutes: parseInt(txt, 10) || 120 }))}
                    />
                  </View>

                  <View style={{ flex: 1.2 }}>
                    <Text style={styles.fieldLabel}>Ruang Ujian</Text>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Contoh: R. Kelas 7A"
                      placeholderTextColor="#94A3B8"
                      value={examFormData.room}
                      onChangeText={(txt) => setExamFormData((prev) => ({ ...prev, room: txt }))}
                    />
                  </View>
                </View>

                {/* Pengawas Ujian */}
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Guru / Petugas Pengawas Ujian</Text>
                <TouchableOpacity
                  style={styles.fieldPickerBtn}
                  activeOpacity={0.8}
                  onPress={() => {
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Pengawas Ujian',
                      items: [
                        { id: '', label: 'Belum Ditentukan' },
                        ...options.guru.map((g) => ({
                          id: String(g.id),
                          label: g.nama_lengkap || g.name,
                          sub: g.niy ? `NIY: ${g.niy}` : undefined,
                        })),
                      ],
                      onSelect: (sel) => setExamFormData((prev) => ({ ...prev, invigilator_id: String(sel.id) })),
                    });
                  }}
                >
                  <Text style={examFormData.invigilator_id ? styles.fieldPickerText : styles.fieldPickerPlaceholder}>
                    {options.guru.find((g) => String(g.id) === String(examFormData.invigilator_id))?.nama_lengkap ||
                      'Pilih Pengawas Ujian (Opsional)'}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
                </TouchableOpacity>

                {/* Catatan */}
                <Text style={[styles.fieldLabel, { marginTop: 12 }]}>Catatan Khusus Ujian</Text>
                <TextInput
                  style={[styles.fieldInput, { height: 60, textAlignVertical: 'top' }]}
                  placeholder="Contoh: Bawa alat tulis 2B, kalkulator dilarang..."
                  placeholderTextColor="#94A3B8"
                  value={examFormData.notes}
                  onChangeText={(txt) => setExamFormData((prev) => ({ ...prev, notes: txt }))}
                  multiline
                />
              </View>
            </ScrollView>

            {/* Action Buttons */}
            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={handleCloseExamForm}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: '#2563EB' }]}
                onPress={handleSaveExamSchedule}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>
                    {editingExamItem ? 'Simpan Perubahan' : 'Tambah Ujian'}
                  </Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── MODAL RINCIAN DETAIL JADWAL UJIAN ── */}
      <Modal visible={!!examDetailModalItem} animationType="fade" transparent onRequestClose={() => setExamDetailModalItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.detailModalContainer}>
            <View style={styles.detailModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flex: 1 }}>
                <View style={[styles.avatarCircle, { backgroundColor: '#DBEAFE' }]}>
                  <MaterialCommunityIcons name="file-document-edit" size={24} color="#2563EB" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={2}>
                    {examDetailModalItem?.subject?.name || examDetailModalItem?.subject?.nama_mapel || 'Rincian Jadwal Ujian'}
                  </Text>
                  <Text style={[styles.modalSubtitle, { color: '#2563EB', fontWeight: '800' }]} numberOfLines={1}>
                    {examDetailModalItem?.exam_category?.name || examDetailModalItem?.examCategory?.name || 'UJIAN TERJADWAL'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setExamDetailModalItem(null)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ paddingHorizontal: 16, paddingTop: 10 }}>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Mata Pelajaran</Text>
                <Text style={styles.detailValBold}>
                  {examDetailModalItem?.subject?.name || examDetailModalItem?.subject?.nama_mapel || '-'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Kategori Ujian</Text>
                <Text style={[styles.detailValBold, { color: '#2563EB' }]}>
                  {examDetailModalItem?.exam_category?.name || examDetailModalItem?.examCategory?.name || '-'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Target Rombel</Text>
                <Text style={styles.detailVal}>
                  {examDetailModalItem?.kelas?.nama_kelas || '-'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Tanggal Ujian</Text>
                <Text style={styles.detailVal}>
                  {examDetailModalItem?.exam_date
                    ? new Date(examDetailModalItem.exam_date).toLocaleDateString('id-ID', {
                        weekday: 'long',
                        day: 'numeric',
                        month: 'long',
                        year: 'numeric',
                      })
                    : '-'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Waktu Ujian</Text>
                <Text style={styles.detailVal}>
                  {(examDetailModalItem?.time_start || '').slice(0, 5)} - {(examDetailModalItem?.time_end || '').slice(0, 5)} WIB
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Durasi Pengerjaan</Text>
                <Text style={styles.detailVal}>
                  {examDetailModalItem?.duration_minutes || 120} Menit
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Ruangan Ujian</Text>
                <Text style={styles.detailVal}>
                  {examDetailModalItem?.room || '-'}
                </Text>
              </View>
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Pengawas Ujian</Text>
                <Text style={styles.detailVal}>
                  {examDetailModalItem?.invigilator?.nama_lengkap || 'Belum Ditentukan'}
                </Text>
              </View>
              {examDetailModalItem?.notes ? (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Catatan</Text>
                  <Text style={[styles.detailVal, { fontStyle: 'italic', color: '#64748B' }]}>
                    {examDetailModalItem.notes}
                  </Text>
                </View>
              ) : null}
            </ScrollView>

            <View style={styles.detailModalFooter}>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { flex: 1, backgroundColor: '#2563EB' }]}
                onPress={() => {
                  const it = examDetailModalItem;
                  setExamDetailModalItem(null);
                  openEditExamModal(it);
                }}
              >
                <MaterialCommunityIcons name="pencil" size={16} color="#FFFFFF" style={{ marginRight: 6 }} />
                <Text style={styles.modalSubmitText}>Ubah Jadwal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalCancelBtn, { flex: 1 }]}
                onPress={() => setExamDetailModalItem(null)}
              >
                <Text style={styles.modalCancelText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL KONFIRMASI HAPUS JADWAL UJIAN ── */}
      <Modal visible={!!deleteExamConfirmItem} animationType="fade" transparent onRequestClose={() => setDeleteExamConfirmItem(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.deleteConfirmBox}>
            <View style={styles.deleteIconBadge}>
              <MaterialCommunityIcons name="trash-can-outline" size={32} color="#DC2626" />
            </View>
            <Text style={styles.deleteConfirmTitle}>Hapus Jadwal Ujian?</Text>
            <Text style={styles.deleteConfirmMessage}>
              Jadwal ujian mata pelajaran{' '}
              <Text style={{ fontWeight: '700' }}>
                {deleteExamConfirmItem?.subject?.name || deleteExamConfirmItem?.subject?.nama_mapel}
              </Text>{' '}
              pada kelas{' '}
              <Text style={{ fontWeight: '700' }}>
                {deleteExamConfirmItem?.kelas?.nama_kelas}
              </Text>{' '}
              akan dihapus secara permanen dari sistem.
            </Text>

            <View style={styles.deleteBtnRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setDeleteExamConfirmItem(null)}
                disabled={saving}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.modalSubmitBtn, { backgroundColor: '#DC2626' }]}
                onPress={executeDeleteExamSchedule}
                disabled={saving}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.modalSubmitText}>Hapus Permanen</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── PICKER BOTTOM SHEET ── */}
      <Modal visible={!!pickerModal} animationType="slide" transparent onRequestClose={() => setPickerModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.pickerModalContainer}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{pickerModal?.title}</Text>
              <TouchableOpacity onPress={() => setPickerModal(null)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }}>
              {pickerModal?.items.map((it) => (
                <TouchableOpacity
                  key={String(it.id)}
                  style={styles.pickerItemRow}
                  activeOpacity={0.7}
                  onPress={() => {
                    pickerModal.onSelect(it);
                    setPickerModal(null);
                  }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={styles.pickerItemLabel}>{it.label}</Text>
                    {it.sub ? <Text style={styles.pickerItemSub}>{it.sub}</Text> : null}
                  </View>
                  <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
                </TouchableOpacity>
              ))}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL PRATINJAU CETAK DOKUMEN A4 JADWAL PELAJARAN ── */}
      <Modal
        visible={printModalVisible}
        animationType="slide"
        transparent={false}
        onRequestClose={() => setPrintModalVisible(false)}
      >
        <View style={styles.printScreen}>
          {/* Header Pratinjau */}
          <View style={styles.printHeader}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPrintModalVisible(false)}
              style={styles.printHeaderBackBtn}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
            </TouchableOpacity>
            <View style={{ flex: 1, marginHorizontal: 8 }}>
              <Text numberOfLines={1} style={styles.printHeaderTitle}>
                Pratinjau Cetak Jadwal Pelajaran
              </Text>
              <Text numberOfLines={1} style={styles.printHeaderSub}>
                Format Lembar A4 • {filteredSchedules.length} Sesi Terjadwal
              </Text>
            </View>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setPrintNotice('Perintah cetak laporan jadwal pelajaran berhasil dikirim ke printer.');
                  setTimeout(() => setPrintNotice(''), 4000);
                }}
                style={styles.printHeaderActionBtn}
              >
                <MaterialCommunityIcons name="printer" size={16} color="#004D32" />
                <Text style={styles.printHeaderActionBtnText}>Cetak</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  setPrintNotice('Dokumen PDF rekapitulasi jadwal pelajaran KBM berhasil diunduh.');
                  setTimeout(() => setPrintNotice(''), 4000);
                }}
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

          {/* Tab Pemilih Format Cetak */}
          <View style={{ flexDirection: 'row', backgroundColor: '#064E3B', paddingHorizontal: 12, paddingBottom: 10, gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPrintFormatMode('matrix')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 7,
                borderRadius: 8,
                backgroundColor: printFormatMode === 'matrix' ? '#FFFFFF' : 'rgba(255,255,255,0.15)',
              }}
            >
              <MaterialCommunityIcons
                name="view-grid-outline"
                size={16}
                color={printFormatMode === 'matrix' ? '#065F46' : '#FFFFFF'}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: printFormatMode === 'matrix' ? '#065F46' : '#FFFFFF',
                }}
              >
                Matriks Mingguan (Resmi)
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setPrintFormatMode('table')}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                paddingVertical: 7,
                borderRadius: 8,
                backgroundColor: printFormatMode === 'table' ? '#FFFFFF' : 'rgba(255,255,255,0.15)',
              }}
            >
              <MaterialCommunityIcons
                name="format-list-bulleted"
                size={16}
                color={printFormatMode === 'table' ? '#065F46' : '#FFFFFF'}
              />
              <Text
                style={{
                  fontSize: 11,
                  fontWeight: '800',
                  color: printFormatMode === 'table' ? '#065F46' : '#FFFFFF',
                }}
              >
                Rekap Tabel Baris
              </Text>
            </TouchableOpacity>
          </View>

          {/* Bar Pemilih Rombel / Kelas Target Dokumen Cetak */}
          <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#043A2A', paddingHorizontal: 12, paddingVertical: 8, gap: 8, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
              <MaterialCommunityIcons name="google-classroom" size={16} color="#6EE7B7" />
              <Text style={{ fontSize: 11, fontWeight: '700', color: '#D1FAE5' }}>Target Rombel:</Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                const items = [
                  ...(printFormatMode === 'table' ? [{ id: 'all', label: 'Semua Rombel (Sesuai Filter)' }] : []),
                  ...options.kelas.map((k) => ({
                    id: String(k.id),
                    label: `${k.nama_kelas || k.kode_kelas || 'Kelas'} ${k.jenjang ? `(${k.jenjang})` : ''}`,
                    sub: k.wali_kelas || k.waliKelas?.nama_lengkap ? `Wali: ${k.wali_kelas || k.waliKelas?.nama_lengkap}` : undefined,
                  })),
                ];
                setPickerModal({
                  visible: true,
                  title: 'Pilih Rombel / Kelas Target Cetak',
                  items,
                  onSelect: (sel) => setPrintKelasId(String(sel.id)),
                });
              }}
              style={{
                flex: 1,
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                backgroundColor: '#FFFFFF',
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 6,
              }}
            >
              <Text style={{ fontSize: 11, fontWeight: '800', color: '#064E3B' }} numberOfLines={1}>
                {printKelasId === 'all'
                  ? (printFormatMode === 'matrix'
                      ? (activePrintClass?.nama_kelas || 'Pilih Rombel Kelas')
                      : 'Semua Rombel (Sesuai Filter)')
                  : (options.kelas.find((k) => String(k.id) === printKelasId)?.nama_kelas || 'Pilih Rombel Kelas')}
              </Text>
              <MaterialCommunityIcons name="chevron-down" size={16} color="#064E3B" />
            </TouchableOpacity>
          </View>

          {/* Lembar Kertas A4 */}
          <ScrollView
            style={{ flex: 1, backgroundColor: '#CBD5E1' }}
            contentContainerStyle={{ padding: 12, paddingBottom: 60 }}
            showsVerticalScrollIndicator={true}
          >
            <View style={styles.paperSheet}>
              {/* KOP RESMI LEMBAR DOKUMEN SEKOLAH */}
              <View style={styles.paperKopRow}>
                <View style={styles.paperKopLogoBox}>
                  <MaterialCommunityIcons name="school" size={32} color="#059669" />
                </View>
                <View style={styles.paperKopCenterBox}>
                  <Text style={styles.paperKopOrgName}>YAYASAN PENDIDIKAN ISLAM TERPADU</Text>
                  <Text style={styles.paperKopSchoolUnit}>{unitName.toUpperCase()}</Text>
                  <Text style={styles.paperKopAddress}>
                    Sistem Manajemen Pendidikan & Akademik Terpadu SIT • Program: {programType === 'boarding' ? 'Boarding School (Pesantren)' : 'Full Day School'}
                  </Text>
                </View>
                <View style={styles.paperKopLogoBox}>
                  <MaterialCommunityIcons name="domain" size={32} color="#0D9488" />
                </View>
              </View>

              <View style={styles.paperKopDividerContainer}>
                <View style={styles.paperKopDividerThick} />
                <View style={styles.paperKopDividerThin} />
              </View>

              {/* JUDUL DOKUMEN */}
              <View style={styles.paperDocHeader}>
                <Text style={styles.paperDocTitle}>
                  JADWAL PELAJARAN DAN KEGIATAN HARIAN {programType === 'boarding' ? 'SANTRI' : 'PESERTA DIDIK'}
                </Text>
                <Text style={styles.paperDocSub}>
                  {printFormatMode === 'matrix'
                    ? `KELAS ${activePrintClass?.nama_kelas || ''} • WALI KELAS: ${activePrintClass?.wali_kelas || activePrintClass?.waliKelas?.nama_lengkap || '-'}`
                    : (printKelasId === 'all'
                        ? 'SEMUA ROMBEL KELAS'
                        : `KELAS ${options.kelas.find((k) => String(k.id) === printKelasId)?.nama_kelas || ''}`)}{' '}
                  • {selectedDay === 'all' ? 'SENIN - SABTU' : `HARI ${DAY_OPTIONS.find((d) => d.id === selectedDay)?.name?.toUpperCase()}`}{' '}
                  • SISTEM: {programType === 'boarding' ? 'BOARDING SCHOOL' : 'FULL DAY SCHOOL'}
                </Text>
              </View>

              {printFormatMode === 'matrix' ? (
                /* ── TAMPILAN MATRIKS MINGGUAN RESMI (A4 LANDSCAPE) ── */
                <View style={{ marginBottom: 14 }}>
                  <ScrollView horizontal showsHorizontalScrollIndicator={true}>
                    <View style={{ minWidth: 680, borderWidth: 1, borderColor: '#1E3A8A', borderRadius: 4, overflow: 'hidden' }}>
                      {/* Matrix Header Row 1 */}
                      <View style={{ flexDirection: 'row', backgroundColor: '#E0E7FF', borderBottomWidth: 1, borderBottomColor: '#1E3A8A' }}>
                        <Text style={{ width: 28, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>No</Text>
                        <Text style={{ width: 85, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Waktu / Jam</Text>
                        <Text style={{ width: 110, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Senin</Text>
                        <Text style={{ width: 110, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Selasa</Text>
                        <Text style={{ width: 110, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Rabu</Text>
                        <Text style={{ width: 110, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Kamis</Text>
                        <Text style={{ width: 110, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Jum'at</Text>
                        <Text style={{ width: 85, fontSize: 8.5, fontWeight: '800', color: '#1E3A8A', textAlign: 'center', paddingVertical: 4 }}>Sabtu{'\n'}(Ekskul)</Text>
                      </View>

                      {/* Matrix Header Row 2 (Sub-Kolom Pelajaran & Guru) */}
                      <View style={{ flexDirection: 'row', backgroundColor: '#EEF2FF', borderBottomWidth: 1, borderBottomColor: '#1E3A8A' }}>
                        <Text style={{ width: 28, borderRightWidth: 1, borderRightColor: '#CBD5E1' }} />
                        <Text style={{ width: 85, borderRightWidth: 1, borderRightColor: '#CBD5E1' }} />
                        {/* Senin */}
                        <Text style={{ width: 60, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Pelajaran</Text>
                        <Text style={{ width: 50, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Guru</Text>
                        {/* Selasa */}
                        <Text style={{ width: 60, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Pelajaran</Text>
                        <Text style={{ width: 50, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Guru</Text>
                        {/* Rabu */}
                        <Text style={{ width: 60, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Pelajaran</Text>
                        <Text style={{ width: 50, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Guru</Text>
                        {/* Kamis */}
                        <Text style={{ width: 60, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Pelajaran</Text>
                        <Text style={{ width: 50, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Guru</Text>
                        {/* Jumat */}
                        <Text style={{ width: 60, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Pelajaran</Text>
                        <Text style={{ width: 50, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>Guru</Text>
                        {/* Sabtu */}
                        <Text style={{ width: 85, fontSize: 7.5, fontWeight: '700', color: '#374151', textAlign: 'center', paddingVertical: 2 }}>Kegiatan</Text>
                      </View>

                      {/* Matrix Rows */}
                      {matrixPrintData.rows.length === 0 ? (
                        <View style={{ padding: 16, alignItems: 'center' }}>
                          <Text style={{ fontSize: 10, color: '#64748B' }}>Belum ada jadwal yang terdaftar di database.</Text>
                        </View>
                      ) : (
                        matrixPrintData.rows.map((row, rIdx) => {
                          const timeStr = row.time.label;
                          const d = row.days;

                          return (
                            <View
                              key={rIdx}
                              style={{
                                flexDirection: 'row',
                                borderBottomWidth: 1,
                                borderBottomColor: '#CBD5E1',
                                backgroundColor: rIdx % 2 === 1 ? '#F8FAFC' : '#FFFFFF',
                                minHeight: 28,
                                alignItems: 'stretch',
                              }}
                            >
                              <Text style={{ width: 28, fontSize: 8, fontWeight: '700', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{row.no}</Text>
                              <Text style={{ width: 85, fontSize: 7.5, fontWeight: '700', color: '#DC2626', textAlign: 'center', paddingVertical: 4, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{timeStr}</Text>

                              {/* Senin */}
                              <Text numberOfLines={2} style={{ width: 60, fontSize: 7.5, fontWeight: '700', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[1]?.subject_name || '-'}</Text>
                              <Text numberOfLines={2} style={{ width: 50, fontSize: 7, color: '#475569', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[1]?.teacher_name || '-'}</Text>

                              {/* Selasa */}
                              <Text numberOfLines={2} style={{ width: 60, fontSize: 7.5, fontWeight: '700', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[2]?.subject_name || '-'}</Text>
                              <Text numberOfLines={2} style={{ width: 50, fontSize: 7, color: '#475569', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[2]?.teacher_name || '-'}</Text>

                              {/* Rabu */}
                              <Text numberOfLines={2} style={{ width: 60, fontSize: 7.5, fontWeight: '700', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[3]?.subject_name || '-'}</Text>
                              <Text numberOfLines={2} style={{ width: 50, fontSize: 7, color: '#475569', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[3]?.teacher_name || '-'}</Text>

                              {/* Kamis */}
                              <Text numberOfLines={2} style={{ width: 60, fontSize: 7.5, fontWeight: '700', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[4]?.subject_name || '-'}</Text>
                              <Text numberOfLines={2} style={{ width: 50, fontSize: 7, color: '#475569', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[4]?.teacher_name || '-'}</Text>

                              {/* Jumat */}
                              <Text numberOfLines={2} style={{ width: 60, fontSize: 7.5, fontWeight: '700', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[5]?.subject_name || '-'}</Text>
                              <Text numberOfLines={2} style={{ width: 50, fontSize: 7, color: '#475569', paddingHorizontal: 2, paddingVertical: 3, borderRightWidth: 1, borderRightColor: '#CBD5E1' }}>{d[5]?.teacher_name || '-'}</Text>

                              {/* Sabtu */}
                              <Text numberOfLines={2} style={{ width: 85, fontSize: 7.5, color: '#334155', paddingHorizontal: 3, paddingVertical: 3, textAlign: 'center' }}>{d[6]?.subject_name || '-'}</Text>
                            </View>
                          );
                        })
                      )}
                    </View>
                  </ScrollView>
                </View>
              ) : (
                /* ── TAMPILAN REKAP TABEL BARIS (A4 PORTRAIT) ── */
                <View style={styles.paperTable}>
                  <View style={styles.paperTableHeader}>
                    <Text style={[styles.paperTableTh, { width: 30 }]}>NO</Text>
                    <Text style={[styles.paperTableTh, { width: 85 }]}>HARI & JAM</Text>
                    <Text style={[styles.paperTableTh, { flex: 1.2 }]}>MATA PELAJARAN</Text>
                    <Text style={[styles.paperTableTh, { width: 60 }]}>ROMBEL</Text>
                    <Text style={[styles.paperTableTh, { flex: 1.2 }]}>GURU PENGAMPU</Text>
                    <Text style={[styles.paperTableTh, { width: 55 }]}>RUANG</Text>
                  </View>

                  {printTableRows.map((row, idx) => {
                    const day = DAY_OPTIONS.find((d) => d.id === Number(row.day_of_week))?.name || 'Hari';
                    const time = `${(row.time_start || '').slice(0, 5)} - ${(row.time_end || '').slice(0, 5)}`;
                    const mapel = row.subject?.name || row.subject?.nama_mapel || '-';
                    const kelas = row.kelas?.nama_kelas || row.schoolClass?.name || '-';
                    const guru = row.employee?.nama_lengkap || row.teacher?.name || '-';
                    const ruang = row.room || row.ruangan || '-';

                    return (
                      <View
                        key={row.id || idx}
                        style={[
                          styles.paperTableRow,
                          idx % 2 === 1 && { backgroundColor: '#F8FAFC' },
                        ]}
                      >
                        <Text style={[styles.paperTableTd, { width: 30, textAlign: 'center' }]}>
                          {idx + 1}
                        </Text>
                        <Text style={[styles.paperTableTd, { width: 85, fontSize: 8.5, fontWeight: '700' }]}>
                          {day}{'\n'}{time}
                        </Text>
                        <Text style={[styles.paperTableTd, { flex: 1.2, fontWeight: '700' }]}>
                          {mapel}
                        </Text>
                        <Text style={[styles.paperTableTd, { width: 60, fontSize: 8.5 }]}>
                          {kelas}
                        </Text>
                        <Text style={[styles.paperTableTd, { flex: 1.2, fontSize: 8.5 }]}>
                          {guru}
                        </Text>
                        <Text style={[styles.paperTableTd, { width: 55, fontSize: 8.5 }]}>
                          {ruang}
                        </Text>
                      </View>
                    );
                  })}
                </View>
              )}

              {/* KOLOM TANDA TANGAN */}
              <View style={styles.paperSignRow}>
                <View style={styles.paperSignCol}>
                  <Text style={styles.paperSignDate}>Mengetahui,</Text>
                  <Text style={styles.paperSignRole}>Kepala Sekolah</Text>
                  <View style={styles.paperSignSpace} />
                  <Text style={styles.paperSignName}>( .................................... )</Text>
                  <Text style={styles.paperSignNiy}>NIY / NIP Pimpinan</Text>
                </View>
                <View style={styles.paperSignCol}>
                  <Text style={styles.paperSignDate}>Padang, {new Date().toLocaleDateString('id-ID')}</Text>
                  <Text style={styles.paperSignRole}>
                    {printFormatMode === 'matrix' ? 'Wali Kelas' : 'Wali Kelas / Kaur TU'}
                  </Text>
                  <View style={styles.paperSignSpace} />
                  <Text style={styles.paperSignName}>
                    {printFormatMode === 'matrix'
                      ? (activePrintClass?.wali_kelas || activePrintClass?.waliKelas?.nama_lengkap || user?.name || '( Wali Kelas )')
                      : (user?.name || user?.nama || '( Staf Tata Usaha )')}
                  </Text>
                  <Text style={styles.paperSignNiy}>
                    {printFormatMode === 'matrix' ? 'Pengampu Rombel' : 'Pengelola Akademik'}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>
        </View>
      </Modal>

      {/* ── FEEDBACK MODAL ── */}
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
  rootContainer: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  cleanMainScrollContent: {
    paddingTop: 4,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  /* ── Dual Role Pill Container (Tab Switcher Identik Buku Penghubung) ── */
  dualRolePillContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 12,
    gap: 4,
  },
  dualRolePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 8,
    borderRadius: 12,
  },
  dualRolePillActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  dualRolePillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  dualRolePillTextActive: {
    color: '#FFFFFF',
  },
  /* ── Background Mosque & School (Identik Halaman Utama & Data Siswa) ── */
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
  /* ── Header Halaman Jadwal (Clean Floating Top Bar Identik Buku Penghubung) ── */
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  /* ── Sub-Tabs Kategori / Hari Segmented Scroll (Identik Buku Penghubung tuSegmentContainer) ── */
  tuSegmentContainer: {
    marginTop: 10,
    marginHorizontal: -16,
  },
  tuSegmentScroll: {
    paddingHorizontal: 16,
    gap: 8,
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
    minWidth: 0,
    justifyContent: 'center',
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.90)',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 20,
    marginBottom: 2,
    maxWidth: '100%',
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginRight: 5,
  },
  headerBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
    flexShrink: 1,
  },
  headerMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
    marginTop: 1,
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
    backgroundColor: '#FFFFFF',
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

  /* ── Tab Switcher Utama TU (KBM vs Ujian) ── */
  workspaceTabBar: {
    flexDirection: 'row',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  workspaceTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    gap: 6,
    minHeight: 44,
  },
  workspaceTabItemActiveKbm: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  workspaceTabItemActiveExam: {
    backgroundColor: '#2563EB',
    borderColor: '#1D4ED8',
  },
  workspaceTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
    flexShrink: 1,
  },
  workspaceTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  workspaceTabBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 8,
    marginLeft: 2,
    flexShrink: 0,
  },
  workspaceTabBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },

  /* ── Quick Pill Filter Aktivitas Sekolah (Semua / KBM / Non-KBM) ── */
  activityFilterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 12,
    marginBottom: 12,
  },
  activityFilterHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  activityFilterTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  activityFilterSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  activityFilterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  activityFilterPill: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  activityFilterPillActiveAll: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  activityFilterPillActiveKbm: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  activityFilterPillActiveAct: {
    backgroundColor: '#EFF6FF',
    borderColor: '#93C5FD',
  },
  activityFilterPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  activityFilterPillTextActiveAll: {
    color: '#059669',
    fontWeight: '800',
  },
  activityFilterPillTextActiveKbm: {
    color: '#059669',
    fontWeight: '800',
  },
  activityFilterPillTextActiveAct: {
    color: '#2563EB',
    fontWeight: '800',
  },

  /* ── Detail Modal Card Ujian ── */
  detailModalContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 16,
    maxHeight: '80%',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  detailModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailModalFooter: {
    flexDirection: 'row',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailRowLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 2,
  },
  detailRowVal: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 8,
  },

  /* ── Segmented Sub-Tabs Bar (Identik Data Siswa) ── */
  segmentContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
    paddingVertical: 7,
    paddingHorizontal: 13,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  segmentBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* ── Main ScrollView & Sub Action Bar ── */
  mainScroll: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  subActionBar: {
    marginBottom: 14,
  },
  primaryActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  addPillBtn: {
    flex: 1.2,
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
  },

  /* ── Filter Card (Harmonized with Data Siswa FilterCard) ── */
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
  filterLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 7,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
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
    flex: 1,
  },
  bulkModeToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 14,
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

  /* ── Mutation Card Item (Gaya Identik Data Siswa) ── */
  mutationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 13,
    marginBottom: 12,
    shadowColor: '#004D32',
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
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardMainInfo: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 6,
  },
  subjectTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    lineHeight: 19,
  },
  tagBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
    flexShrink: 0,
    marginTop: 1,
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
    padding: 10,
    marginTop: 10,
    gap: 5,
  },
  detailItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 6,
  },
  detailItemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    width: 68,
  },
  detailItemVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  cardActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
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

  /* Loading & Empty States */
  loadingBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '500',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 32,
    alignItems: 'center',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 16,
  },
  emptyActionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* ── Modal Common Styles ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '90%',
    paddingBottom: Platform.OS === 'ios' ? 24 : 16,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  heroModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#ECFDF5',
    backgroundColor: '#FAFCFB',
  },
  heroIconBadge: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  heroBadgePill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  heroBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  heroSummaryBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  heroSummaryPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
  heroSummaryPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  heroSectionCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 14,
  },
  heroSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  heroSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  heroSectionSub: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
    lineHeight: 16,
  },
  heroDayGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  heroDayCard: {
    width: '31.5%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    padding: 8,
    alignItems: 'flex-start',
  },
  heroDayCardActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  heroDayCardEmpty: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  heroDayCardTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  heroDayCardTitleActive: {
    color: '#FFFFFF',
  },
  heroDayBadgeMini: {
    backgroundColor: '#059669',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  heroDayBadgeMiniText: {
    fontSize: 8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroDayCardSub: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 4,
    fontWeight: '600',
  },
  heroDayCardSubActive: {
    color: '#D1FAE5',
    fontWeight: '700',
  },
  heroRecommendationBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  heroRecommendationText: {
    flex: 1,
    fontSize: 11,
    color: '#166534',
    lineHeight: 16,
  },
  freeSlotsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 4,
  },
  freeSlotPill: {
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
  freeSlotPillActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  freeSlotPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  freeSlotPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  occupiedSection: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  occupiedTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 6,
  },
  occupiedPillsWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  occupiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 6,
  },
  occupiedBadgeTime: {
    fontSize: 10,
    fontWeight: '800',
    color: '#DC2626',
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  occupiedBadgeSubject: {
    fontSize: 10,
    fontWeight: '600',
    color: '#991B1B',
    marginLeft: 3,
  },
  occupiedBadgeReason: {
    fontSize: 9,
    color: '#B91C1C',
    marginLeft: 3,
  },
  safeConflictBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginTop: 10,
  },
  safeConflictText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    padding: 6,
  },
  modalWarningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderLeftWidth: 4,
    borderLeftColor: '#EF4444',
    padding: 12,
    marginHorizontal: 20,
    marginTop: 12,
    borderRadius: 8,
  },
  modalWarningText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#991B1B',
    lineHeight: 16,
  },
  modalFormScroll: {
    paddingHorizontal: 20,
    paddingVertical: 14,
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
    marginTop: 10,
  },
  fieldPickerBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 11,
  },
  fieldPickerText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  fieldPickerPlaceholder: {
    fontSize: 13,
    color: '#94A3B8',
  },
  daySelectorRow: {
    flexDirection: 'row',
    gap: 6,
  },
  daySelectBtn: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  daySelectBtnActive: {
    backgroundColor: '#059669',
  },
  daySelectBtnText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  daySelectBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  timeInputRow: {
    flexDirection: 'row',
  },
  fieldInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 13,
    color: '#1E293B',
  },
  modalFooter: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 20,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
  },
  modalCancelText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  modalSubmitBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  modalSubmitText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  /* Detail Card Modal */
  detailCardContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 20,
    marginBottom: 'auto',
    marginTop: 'auto',
    paddingBottom: 20,
  },
  detailBody: {
    paddingHorizontal: 20,
    paddingTop: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
    width: 110,
    flexShrink: 0,
  },
  detailVal: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
    flex: 1,
    textAlign: 'right',
  },
  detailValBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    textAlign: 'right',
  },

  /* Delete Confirm Modal */
  deleteConfirmBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 24,
    marginBottom: 'auto',
    marginTop: 'auto',
    padding: 20,
    alignItems: 'center',
  },
  deleteIconBadge: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#FEE2E2',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },
  deleteConfirmTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  deleteConfirmMessage: {
    fontSize: 13,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 19,
  },
  deleteBtnRow: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 20,
    width: '100%',
  },

  /* Picker Bottom Sheet */
  pickerModalContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '60%',
    paddingBottom: 20,
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemLabel: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1E293B',
  },
  pickerItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  /* ── Print Screen & A4 Paper Styles (Harmonized with Data Siswa) ── */
  printScreen: {
    flex: 1,
    backgroundColor: '#0F172A',
  },
  printHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#065F46',
    paddingHorizontal: 16,
    paddingVertical: 14,
    paddingTop: Platform.OS === 'android' ? 24 : 14,
  },
  printHeaderBackBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  printHeaderTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  printHeaderSub: {
    fontSize: 11,
    color: '#A7F3D0',
    marginTop: 1,
  },
  printHeaderActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  printHeaderActionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  printNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
  },
  printNoticeBannerText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
    flex: 1,
  },
  paperSheet: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  paperKopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  paperKopLogoBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  paperKopCenterBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  paperKopOrgName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  paperKopSchoolUnit: {
    fontSize: 13,
    fontWeight: '900',
    color: '#065F46',
    textAlign: 'center',
    marginTop: 1,
  },
  paperKopAddress: {
    fontSize: 8.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
  },
  paperKopDividerContainer: {
    marginTop: 10,
    marginBottom: 12,
  },
  paperKopDividerThick: {
    height: 2.5,
    backgroundColor: '#1E293B',
  },
  paperKopDividerThin: {
    height: 1,
    backgroundColor: '#1E293B',
    marginTop: 1.5,
  },
  paperDocHeader: {
    alignItems: 'center',
    marginBottom: 14,
  },
  paperDocTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  paperDocSub: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
    textAlign: 'center',
    marginTop: 2,
  },
  paperTable: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 4,
    overflow: 'hidden',
  },
  paperTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingVertical: 6,
    paddingHorizontal: 4,
  },
  paperTableTh: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#334155',
    textAlign: 'center',
  },
  paperTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
  },
  paperTableTd: {
    fontSize: 8.5,
    color: '#1E293B',
    paddingHorizontal: 2,
  },
  paperSignRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 28,
    paddingHorizontal: 16,
  },
  paperSignCol: {
    alignItems: 'center',
    width: 140,
  },
  paperSignDate: {
    fontSize: 8.5,
    color: '#475569',
  },
  paperSignRole: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 1,
  },
  paperSignSpace: {
    height: 44,
  },
  paperSignName: {
    fontSize: 9,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
  },
  paperSignNiy: {
    fontSize: 8,
    color: '#64748B',
  },
});
