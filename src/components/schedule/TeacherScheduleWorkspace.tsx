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
import { mobileApiService, unwrapApiData, unwrapCollection } from '../../services/mobileApiService';
import { getProfileImageUrl } from '../../utils/profile';
import { getDynamicAcademicYear } from '../../utils/academicYear';
import { resolveUnitName } from '../../utils/employeeUtils';
import { offlineCache } from '../../utils/offlineCache';
import { AppFeedbackModal, FeedbackType } from '../AppFeedbackModal';
import { useNavigationHistoryStore } from '../../stores/navigationHistoryStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

const DAY_OPTIONS = [
  { id: 'all', name: 'Semua Hari', short: 'Semua', icon: 'calendar-sync' },
  { id: 1, name: 'Senin', short: 'Sen', icon: 'calendar-today' },
  { id: 2, name: 'Selasa', short: 'Sel', icon: 'calendar-today' },
  { id: 3, name: 'Rabu', short: 'Rab', icon: 'calendar-today' },
  { id: 4, name: 'Kamis', short: 'Kam', icon: 'calendar-today' },
  { id: 5, name: 'Jumat', short: 'Jum', icon: 'calendar-today' },
  { id: 6, name: 'Sabtu', short: 'Sab', icon: 'calendar-today' },
];

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const padZero = (num: number): string => (num < 10 ? '0' + num : String(num));

const formatIndonesianDate = (d: Date): string => {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const dayName = days[d.getDay()];
  const dayNum = d.getDate();
  const monthName = MONTH_NAMES[d.getMonth()];
  const year = d.getFullYear();
  return `${dayName}, ${dayNum} ${monthName} ${year}`;
};

// Radar pulse indicator untuk sesi yang sedang berlangsung
function RadarPulseDot({ color = '#10B981', size = 8 }: { color?: string; size?: number }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;
  const opacityAnim = useRef(new Animated.Value(0.7)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(pulseAnim, {
            toValue: 2.2,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(pulseAnim, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
        Animated.sequence([
          Animated.timing(opacityAnim, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: true,
          }),
          Animated.timing(opacityAnim, {
            toValue: 0.7,
            duration: 1000,
            useNativeDriver: true,
          }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [pulseAnim, opacityAnim]);

  return (
    <View style={{ width: size * 2.2, height: size * 2.2, alignItems: 'center', justifyContent: 'center' }}>
      <Animated.View
        style={{
          position: 'absolute',
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
          transform: [{ scale: pulseAnim }],
          opacity: opacityAnim,
        }}
      />
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: color,
        }}
      />
    </View>
  );
}

// Helper: Deteksi status waktu sesi jadwal (past / current / upcoming)
const getSessionTimelineStatus = (
  timeStartStr?: string,
  timeEndStr?: string,
  dayOfWeek?: number
): 'past' | 'current' | 'upcoming' => {
  const now = new Date();
  const currentDay = now.getDay(); // 0=Min, 1=Sen, ..., 6=Sab

  // Jika jadwal bukan hari ini
  if (dayOfWeek !== undefined && dayOfWeek !== currentDay) {
    if (dayOfWeek < currentDay) return 'past';
    return 'upcoming';
  }

  if (!timeStartStr || !timeEndStr) return 'upcoming';

  const parseToMinutes = (t: string) => {
    const clean = t.replace(/\./g, ':').trim();
    const parts = clean.split(':');
    const h = parseInt(parts[0] || '0', 10);
    const m = parseInt(parts[1] || '0', 10);
    return h * 60 + m;
  };

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const startMinutes = parseToMinutes(timeStartStr);
  const endMinutes = parseToMinutes(timeEndStr);

  if (currentMinutes < startMinutes) return 'upcoming';
  if (currentMinutes >= startMinutes && currentMinutes <= endMinutes) return 'current';
  return 'past';
};

const getSubjectStyle = (name: string = '', index: number) => {
  const n = name.toLowerCase();
  if (n.includes('tahfizh') || n.includes('quran') || n.includes('tajwid') || n.includes('hadits')) {
    return { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', icon: 'book-open-page-variant' };
  }
  if (n.includes('matematika') || n.includes('hitung') || n.includes('aljabar') || n.includes('fisika')) {
    return { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', icon: 'calculator-variant-outline' };
  }
  if (n.includes('bahasa') || n.includes('indonesia') || n.includes('inggris') || n.includes('arab') || n.includes('literasi')) {
    return { bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3', icon: 'book-open-variant' };
  }
  if (n.includes('ipa') || n.includes('sains') || n.includes('biologi') || n.includes('kimia')) {
    return { bg: '#F0FDFA', color: '#0D9488', border: '#99F6E4', icon: 'flask-outline' };
  }
  if (n.includes('agama') || n.includes('islam') || n.includes('pai') || n.includes('fiqih') || n.includes('akidah')) {
    return { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE', icon: 'mosque' };
  }
  if (n.includes('ips') || n.includes('sejarah') || n.includes('pkn') || n.includes('sosial')) {
    return { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', icon: 'earth' };
  }
  if (n.includes('seni') || n.includes('budaya') || n.includes('prakarya')) {
    return { bg: '#FAF5FF', color: '#9333EA', border: '#E9D5FF', icon: 'palette-outline' };
  }
  if (n.includes('pjok') || n.includes('olahraga') || n.includes('senam')) {
    return { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', icon: 'run-fast' };
  }
  const palettes = [
    { bg: '#ECFDF5', color: '#059669', border: '#A7F3D0', icon: 'book-outline' },
    { bg: '#EFF6FF', color: '#2563EB', border: '#BFDBFE', icon: 'school-outline' },
    { bg: '#FFF1F2', color: '#E11D48', border: '#FECDD3', icon: 'notebook-outline' },
    { bg: '#F0FDFA', color: '#0D9488', border: '#99F6E4', icon: 'lead-pencil' },
    { bg: '#F5F3FF', color: '#7C3AED', border: '#DDD6FE', icon: 'library' },
    { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', icon: 'certificate-outline' },
  ];
  return palettes[index % palettes.length];
};

interface TeacherScheduleWorkspaceProps {
  navigation: any;
  user: any;
  route?: any;
}

export default function TeacherScheduleWorkspace({ navigation, user, route }: TeacherScheduleWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16);

  // ── 1. States Data ──
  const [schedules, setSchedules] = useState<any[]>([]);
  const [examSchedules, setExamSchedules] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [currentTimeStr, setCurrentTimeStr] = useState<string>('');

  // ── 2. Filter & Tab States ──
  const [activeTab, setActiveTab] = useState<'kbm' | 'exam'>('kbm');
  const todayDayNum = useMemo(() => {
    const d = new Date().getDay();
    return d === 0 ? 1 : d; // default Senin jika hari Ahad
  }, []);
  const [selectedDay, setSelectedDay] = useState<number | 'all'>(todayDayNum);
  const [selectedClassId, setSelectedClassId] = useState<string>('all');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedExamCategory, setSelectedExamCategory] = useState<string>('all');

  // ── 3. Detail Modal State ──
  const [selectedScheduleDetail, setSelectedScheduleDetail] = useState<any | null>(null);
  const [selectedExamDetail, setSelectedExamDetail] = useState<any | null>(null);
  const [detailStudents, setDetailStudents] = useState<any[]>([]);
  const [detailStudentsLoading, setDetailStudentsLoading] = useState<boolean>(false);
  const [detailStudentSearch, setDetailStudentSearch] = useState<string>('');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type: FeedbackType;
    title: string;
    message: string;
  }>({
    visible: false,
    type: 'success',
    title: '',
    message: '',
  });

  // ── 3b. Discipline & Pelanggaran Modal State (Zero Hardcode - Dynamic Master) ──
  const [disciplineModalVisible, setDisciplineModalVisible] = useState<boolean>(false);
  const [disciplineTargetStudent, setDisciplineTargetStudent] = useState<any | null>(null);
  const [disciplineSchedule, setDisciplineSchedule] = useState<any | null>(null);
  const [disciplineCategories, setDisciplineCategories] = useState<any[]>([]);
  const [disciplineLoadingCategories, setDisciplineLoadingCategories] = useState<boolean>(false);
  const [selectedDisciplineCategoryId, setSelectedDisciplineCategoryId] = useState<string>('');
  const [disciplinePoints, setDisciplinePoints] = useState<string>('0');
  const [disciplineDescription, setDisciplineDescription] = useState<string>('');
  const [disciplineFollowUp, setDisciplineFollowUp] = useState<string>('');
  const [disciplineReferBk, setDisciplineReferBk] = useState<boolean>(false);
  const [submittingDiscipline, setSubmittingDiscipline] = useState<boolean>(false);

  // KPI Kehadiran Siswa pada Modal Detail
  const detailAttendanceStats = useMemo(() => {
    let hadir = 0;
    let terlambat = 0;
    let tidakHadir = 0;
    let belumDicatat = 0;

    detailStudents.forEach((st) => {
      const raw = String(st.status || st.status_hadir || st.recommended_status || '').toLowerCase();
      if (raw.includes('hadir') || raw === 'present') hadir++;
      else if (raw.includes('terlambat') || raw === 'late') terlambat++;
      else if (raw.includes('izin') || raw.includes('sakit') || raw.includes('alpha') || raw.includes('alpa') || raw.includes('sick') || raw.includes('permission') || raw.includes('absent')) tidakHadir++;
      else belumDicatat++;
    });

    return {
      total: detailStudents.length,
      hadir,
      terlambat,
      tidakHadir,
      belumDicatat,
    };
  }, [detailStudents]);

  // Filter Siswa pada Modal Detail
  const filteredDetailStudents = useMemo(() => {
    if (!detailStudentSearch.trim()) return detailStudents;
    const q = detailStudentSearch.toLowerCase();
    return detailStudents.filter((st) => {
      const name = String(st.full_name || st.nama_lengkap || st.name || '').toLowerCase();
      const nis = String(st.nis || st.nisn || '').toLowerCase();
      return name.includes(q) || nis.includes(q);
    });
  }, [detailStudents, detailStudentSearch]);

  // Dynamic user data
  const teacherName = useMemo(() => {
    return String(user?.name || user?.full_name || user?.nama_lengkap || 'Ustadz / Guru Pengampu');
  }, [user]);

  const teacherNip = useMemo(() => {
    return String(
      user?.nip || user?.nomor_induk || user?.niy || user?.employee_code || user?.nik || 'Pendidik Resmi'
    );
  }, [user]);

  const teacherUnit = useMemo(() => {
    return resolveUnitName(user) || (user as any)?.unit_name || (user as any)?.education_unit?.name || 'Unit Pendidikan Terpadu';
  }, [user]);

  const avatarUri = useMemo(() => getProfileImageUrl(user), [user]);
  const academicYear = useMemo(() => getDynamicAcademicYear(), []);

  // Jam digital live
  useEffect(() => {
    const updateTime = () => {
      const now = new Date();
      const hh = padZero(now.getHours());
      const mm = padZero(now.getMinutes());
      const ss = padZero(now.getSeconds());
      setCurrentTimeStr(`${hh}:${mm}:${ss} WIB`);
    };
    updateTime();
    const interval = setInterval(updateTime, 1000);
    return () => clearInterval(interval);
  }, []);

  // ── 4. Fetch Data ──
  const loadData = useCallback(async (showSpinner = true) => {
    if (showSpinner) setLoading(true);
    const cacheKey = offlineCache.buildKey('teacher_workspace_schedules', user?.id);

    try {
      const cached = await offlineCache.get<any[]>(cacheKey);
      if (cached && cached.length > 0) {
        setSchedules(cached);
        if (showSpinner) setLoading(false);
      }

      const [schedRes, examRes] = await Promise.allSettled([
        mobileApiService.getTeacherSchedules(),
        mobileApiService.getExamSchedules(),
      ]);

      if (schedRes.status === 'fulfilled') {
        const rawList = schedRes.value?.data || (Array.isArray(schedRes.value) ? schedRes.value : []);
        const mapped = (Array.isArray(rawList) ? rawList : []).map((s: any, idx: number) => {
          const isActivity = (s.activity_type ?? 'kbm') !== 'kbm';
          const actName = s.activity_name ?? '';
          const subjName = isActivity && actName
            ? actName
            : (s.subject?.name || s.subject?.nama_mapel || s.subject_name || 'Mata Pelajaran');
          const subjCode = isActivity
            ? 'Kegiatan'
            : (s.subject?.code || s.subject?.kode_mapel || '');
          const className = s.kelas?.nama_kelas || s.kelas?.kode_kelas || s.kelas?.name || s.class_name || 'Kelas Belajar';
          const roomName = s.room || s.ruangan || s.kelas?.ruangan || s.metadata?.room || 'Ruang Kelas';
          const rawStart = s.time_start || s.start_time || '07:30';
          const rawEnd = s.time_end || s.end_time || '09:00';
          const timeStart = String(rawStart).slice(0, 5);
          const timeEnd = String(rawEnd).slice(0, 5);

          return {
            id: s.id || `sched-${idx}`,
            day_of_week: Number(s.day_of_week ?? 1),
            time_start: timeStart,
            time_end: timeEnd,
            time_display: `${timeStart} - ${timeEnd}`,
            activity_type: s.activity_type || 'kbm',
            activity_name: actName,
            subject: {
              id: s.subject_id || s.subject?.id || subjName,
              name: subjName,
              code: subjCode,
            },
            kelas: s.kelas,
            kelas_id: s.kelas_id || s.class_id || s.kelas?.id,
            class_name: className,
            room: roomName,
            teacher_name: s.teacher?.name || s.employee?.nama_lengkap || teacherName,
            notes: s.notes || s.catatan || '',
          };
        });

        setSchedules(mapped);
        void offlineCache.set(cacheKey, mapped);
      }

      if (examRes.status === 'fulfilled') {
        const rawExams = unwrapCollection(examRes.value);
        setExamSchedules(Array.isArray(rawExams) ? rawExams : []);
      }
    } catch {
      // Offline fallback
    } finally {
      setLoading(false);
    }
  }, [teacherName, user?.id]);

  useEffect(() => {
    void loadData(true);
  }, [loadData]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadData(false);
    setRefreshing(false);
  };

  // ── 5. Filtering Lists ──
  // Unique classes for filter
  const uniqueClasses = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    schedules.forEach((sc) => {
      const cid = String(sc.kelas_id || sc.class_name);
      if (cid && !seen.has(cid)) {
        seen.add(cid);
        list.push({ id: cid, name: sc.class_name });
      }
    });
    return list;
  }, [schedules]);

  // Unique subjects for filter
  const uniqueSubjects = useMemo(() => {
    const list: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    schedules.forEach((sc) => {
      const sid = String(sc.subject?.id || sc.subject?.name);
      const sname = sc.subject?.name;
      if (sname && !seen.has(sname)) {
        seen.add(sname);
        list.push({ id: sid, name: sname });
      }
    });
    return list;
  }, [schedules]);

  // Filtered KBM schedules
  const filteredSchedules = useMemo(() => {
    return schedules.filter((sc) => {
      // Filter Day
      if (selectedDay !== 'all' && sc.day_of_week !== selectedDay) {
        return false;
      }
      // Filter Class
      if (selectedClassId !== 'all') {
        const cid = String(sc.kelas_id || sc.class_name);
        if (cid !== selectedClassId) return false;
      }
      // Filter Subject
      if (selectedSubjectId !== 'all') {
        const sname = sc.subject?.name;
        const sid = String(sc.subject?.id || sname);
        if (sname !== selectedSubjectId && sid !== selectedSubjectId) return false;
      }
      // Search Query
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchSubj = (sc.subject?.name || '').toLowerCase().includes(q);
        const matchClass = (sc.class_name || '').toLowerCase().includes(q);
        const matchRoom = (sc.room || '').toLowerCase().includes(q);
        if (!matchSubj && !matchClass && !matchRoom) return false;
      }
      return true;
    });
  }, [schedules, selectedDay, selectedClassId, selectedSubjectId, searchQuery]);

  // Exam categories for filter
  const examCategories = useMemo(() => {
    const cats: { id: string; name: string }[] = [];
    const seen = new Set<string>();
    examSchedules.forEach((ex) => {
      const cat = ex.exam_category || ex.examCategory;
      if (cat && cat.id && !seen.has(String(cat.id))) {
        seen.add(String(cat.id));
        cats.push({ id: String(cat.id), name: cat.name || cat.code || 'Ujian' });
      }
    });
    return cats;
  }, [examSchedules]);

  // Filtered Exam Schedules
  const filteredExamSchedules = useMemo(() => {
    return examSchedules.filter((ex) => {
      if (selectedExamCategory !== 'all') {
        const catId = ex.exam_category_id || ex.exam_category?.id || ex.examCategory?.id;
        if (String(catId) !== String(selectedExamCategory)) return false;
      }
      if (searchQuery.trim().length > 0) {
        const q = searchQuery.toLowerCase();
        const matchSubj = (ex.subject?.name || ex.subject?.nama_mapel || '').toLowerCase().includes(q);
        const matchRoom = (ex.room || '').toLowerCase().includes(q);
        const matchInv = (ex.invigilator?.name || ex.invigilator?.nama_lengkap || '').toLowerCase().includes(q);
        if (!matchSubj && !matchRoom && !matchInv) return false;
      }
      return true;
    });
  }, [examSchedules, selectedExamCategory, searchQuery]);

  // ── 6. KPI Statistics (100% Dinamis dari Data) ──
  const kpiStats = useMemo(() => {
    const todayNum = new Date().getDay();
    const todaySchedules = schedules.filter((s) => s.day_of_week === todayNum);
    const activeSession = todaySchedules.find((s) => {
      const st = getSessionTimelineStatus(s.time_start, s.time_end, s.day_of_week);
      return st === 'current';
    });

    return {
      todayCount: todaySchedules.length,
      weeklyCount: schedules.length,
      totalClasses: uniqueClasses.length,
      activeSessionTitle: activeSession ? `${activeSession.subject?.name} (${activeSession.class_name})` : 'Tidak Ada Sesi Aktif',
      activeSessionRoom: activeSession?.room || 'Istirahat / Persiapan',
      isSessionRunning: !!activeSession,
    };
  }, [schedules, uniqueClasses]);

  // Sesi count per hari untuk badge di Day Selector
  const sessionCountByDay = useMemo(() => {
    const map: Record<number, number> = {};
    schedules.forEach((sc) => {
      map[sc.day_of_week] = (map[sc.day_of_week] || 0) + 1;
    });
    return map;
  }, [schedules]);

  // Handler: Buka Presensi Siswa langsung untuk kelas tersebut (mendukung mode koreksi)
  const handleOpenAttendanceForClass = (item: any, isCorrection = false) => {
    navigation?.navigate('QR Code', {
      schedule_id: item.id,
      kelas_id: item.kelas_id,
      class_name: item.class_name,
      subject_name: item.subject?.name,
      mode: 'manual',
      is_correction: isCorrection,
    });
  };

  // Handler: Buka Detail Jadwal Mengajar & Ambil Roster Santri
  // Master Kategori Pelanggaran Kedisiplinan secara Dinamis dari Server (Zero Hardcode)
  const loadDisciplineCategories = useCallback(async () => {
    try {
      setDisciplineLoadingCategories(true);
      const res = await mobileApiService.getDisciplineCategories({ type: 'violation' });
      const list = unwrapCollection(res) || res?.data || [];
      setDisciplineCategories(Array.isArray(list) ? list : []);
    } catch (err) {
      console.warn('Gagal memuat master kategori pelanggaran kedisiplinan', err);
    } finally {
      setDisciplineLoadingCategories(false);
    }
  }, []);

  const handleOpenDisciplineForStudent = (student: any, schedule: any) => {
    setDisciplineTargetStudent(student);
    setDisciplineSchedule(schedule);
    setSelectedDisciplineCategoryId('');
    setDisciplinePoints('0');
    setDisciplineDescription('');
    setDisciplineFollowUp('');
    setDisciplineReferBk(false);
    setDisciplineModalVisible(true);
    if (disciplineCategories.length === 0) {
      void loadDisciplineCategories();
    }
  };

  const handleSelectDisciplineCategory = (cat: any) => {
    setSelectedDisciplineCategoryId(String(cat.id));
    const pts = cat.point_weight !== undefined ? Number(cat.point_weight) : (cat.default_points !== undefined ? Number(cat.default_points) : 0);
    setDisciplinePoints(String(pts));
  };

  const handleSubmitDisciplineViolation = async () => {
    if (!disciplineTargetStudent || !selectedDisciplineCategoryId) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Kategori Wajib Dipilih',
        message: 'Silakan tentukan jenis kategori pelanggaran santri.',
      });
      return;
    }
    if (!disciplineDescription.trim() || disciplineDescription.trim().length < 5) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Kronologi Wajib Diisi',
        message: 'Mohon tuliskan penjelasan kronologi pelanggaran minimal 5 karakter.',
      });
      return;
    }

    try {
      setSubmittingDiscipline(true);
      const sId = String(disciplineTargetStudent.id || disciplineTargetStudent.student_id);
      const todayIso = new Date().toISOString().slice(0, 10);
      await mobileApiService.storeDisciplineViolation({
        student_id: sId,
        category_id: selectedDisciplineCategoryId,
        points: Number(disciplinePoints),
        transaction_date: todayIso,
        description: disciplineDescription.trim(),
        status: disciplineReferBk ? 'dirujuk_bk' : 'tercatat',
        follow_up: disciplineFollowUp.trim() || undefined,
      });

      setDisciplineModalVisible(false);
      const studentName = disciplineTargetStudent.full_name || disciplineTargetStudent.nama_lengkap || disciplineTargetStudent.name || 'Santri';
      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Pelanggaran Berhasil Dicatat',
        message: `Pelanggaran untuk ${studentName} (${disciplinePoints} Poin) berhasil disimpan, otomatis tersinkron ke buku penghubung orang tua${disciplineReferBk ? ' serta dirujuk ke Guru BK' : ''}.`,
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Pelanggaran',
        message: err?.response?.data?.message || 'Terjadi kesalahan sistem saat menyimpan pelanggaran santri.',
      });
    } finally {
      setSubmittingDiscipline(false);
    }
  };

  const handleOpenScheduleDetail = async (item: any) => {
    setSelectedScheduleDetail(item);
    setDetailStudentSearch('');
    setDetailStudentsLoading(true);

    try {
      let stList: any[] = [];
      const isVirtualSched = typeof item.id === 'string' && item.id.startsWith('sched-');

      if (item.id && !isVirtualSched) {
        const res = await mobileApiService.getLessonScheduleStudents(item.id).catch(() => null);
        const raw = unwrapApiData<any[]>(res) || res?.data || [];
        if (Array.isArray(raw) && raw.length > 0) stList = raw;
      }

      if (stList.length === 0 && item.kelas_id) {
        const classRes = await mobileApiService.getTeacherStudents({
          class_id: item.kelas_id,
          per_page: 100,
        }).catch(() => null);
        const rawC = unwrapApiData<any[]>(classRes) || classRes?.data || [];
        const listC = Array.isArray(rawC) ? rawC : Array.isArray((rawC as any)?.data) ? (rawC as any).data : [];
        if (listC.length > 0) {
          stList = listC;
        } else {
          const classStudentsRes = await mobileApiService.getClassStudents(item.kelas_id).catch(() => null);
          const cData = unwrapApiData<any>(classStudentsRes) || classStudentsRes?.data;
          const cList = Array.isArray(cData?.siswa) ? cData.siswa : Array.isArray(cData) ? cData : [];
          if (cList.length > 0) stList = cList;
        }
      }

      setDetailStudents(stList);
    } catch {
      setDetailStudents([]);
    } finally {
      setDetailStudentsLoading(false);
    }
  };

  // Handler: Buka LMS / Bahan Ajar
  const handleOpenMaterials = () => {
    navigation?.navigate('Materi');
  };

  return (
    <View style={styles.rootContainer}>
      {/* ── Background Mosque & School (Identik Halaman Utama & Tata Usaha) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
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

      {/* ── TOP HEADER IDENTIK BUKU PENGHUBUNG, DATA SISWA & TATA USAHA ── */}
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
              <MaterialCommunityIcons name="calendar-check" size={12} color="#059669" />
              <Text style={styles.headerBadgeText} numberOfLines={1}>
                GURU & AKADEMIK • JADWAL MENGAJAR
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              {activeTab === 'kbm' ? 'Jadwal Mengajar & KBM' : 'Jadwal Pengawas Ujian'}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {teacherUnit} • T.A. {academicYear}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                setRefreshing(true);
                void loadData(false);
              }}
              style={styles.refreshButton}
              accessibilityLabel="Muat Ulang"
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search Bar langsung di Header identik Tata Usaha & Buku Penghubung */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === 'kbm'
                ? 'Cari mata pelajaran, kelas, atau ruang...'
                : 'Cari ujian, mata pelajaran, atau pengawas...'
            }
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
      </View>

      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 140 }]}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} tintColor="#059669" />
        }
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. RINGKASAN KPI JADWAL MENGAJAR (CARD MANDIRI RAPI) ── */}
        <View style={styles.kpiCardsRow}>
          <View style={styles.kpiTileToday}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#D1FAE5' }]}>
              <MaterialCommunityIcons name="calendar-clock" size={16} color="#059669" />
            </View>
            <View style={styles.kpiTextWrap}>
              <Text style={[styles.kpiValueText, { color: '#064E3B' }]}>{kpiStats.todayCount}</Text>
              <Text style={[styles.kpiLabelText, { color: '#047857' }]}>Sesi Hari Ini</Text>
            </View>
          </View>

          <View style={styles.kpiTileWeek}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#DBEAFE' }]}>
              <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#2563EB" />
            </View>
            <View style={styles.kpiTextWrap}>
              <Text style={[styles.kpiValueText, { color: '#1E3A8A' }]}>{kpiStats.weeklyCount}</Text>
              <Text style={[styles.kpiLabelText, { color: '#1D4ED8' }]}>Total Pekanan</Text>
            </View>
          </View>

          <View style={styles.kpiTileClasses}>
            <View style={[styles.kpiIconWrap, { backgroundColor: '#FEF3C7' }]}>
              <MaterialCommunityIcons name="google-classroom" size={16} color="#D97706" />
            </View>
            <View style={styles.kpiTextWrap}>
              <Text style={[styles.kpiValueText, { color: '#78350F' }]}>{kpiStats.totalClasses}</Text>
              <Text style={[styles.kpiLabelText, { color: '#92400E' }]}>Rombel Diampu</Text>
            </View>
          </View>

          <View style={[styles.kpiTileStatus, { backgroundColor: kpiStats.isSessionRunning ? '#ECFDF5' : '#FFFFFF', borderColor: kpiStats.isSessionRunning ? '#A7F3D0' : '#E2E8F0' }]}>
            <View style={[styles.kpiIconWrap, { backgroundColor: kpiStats.isSessionRunning ? '#D1FAE5' : '#F1F5F9' }]}>
              <MaterialCommunityIcons
                name={kpiStats.isSessionRunning ? 'play-circle-outline' : 'pause-circle-outline'}
                size={16}
                color={kpiStats.isSessionRunning ? '#059669' : '#64748B'}
              />
            </View>
            <View style={styles.kpiTextWrap}>
              <Text numberOfLines={1} style={[styles.kpiValueText, { fontSize: 13, color: kpiStats.isSessionRunning ? '#059669' : '#475569' }]}>
                {kpiStats.isSessionRunning ? 'LIVE' : 'Standby'}
              </Text>
              <Text style={[styles.kpiLabelText, { color: '#64748B' }]}>Status KBM</Text>
            </View>
          </View>
        </View>

        {/* ── 2. WORKSPACE TAB SWITCHER (KBM & RUTINITAS vs JADWAL UJIAN) ── */}
        <View style={styles.workspaceTabBar}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('kbm')}
            style={[styles.workspaceTabItem, activeTab === 'kbm' && styles.workspaceTabItemActiveKbm]}
          >
            <View style={[styles.tabIconSquircle, activeTab === 'kbm' ? styles.tabIconSquircleActiveKbm : styles.tabIconSquircleInactiveKbm]}>
              <MaterialCommunityIcons
                name="calendar-clock"
                size={16}
                color={activeTab === 'kbm' ? '#FFFFFF' : '#059669'}
              />
            </View>
            <Text
              style={[
                styles.workspaceTabText,
                activeTab === 'kbm' && styles.workspaceTabTextActive,
              ]}
              numberOfLines={1}
            >
              KBM & Rutinitas
            </Text>
            <View
              style={[
                styles.workspaceTabBadge,
                activeTab === 'kbm'
                  ? styles.workspaceTabBadgeActiveKbm
                  : styles.workspaceTabBadgeInactiveKbm,
              ]}
            >
              <Text
                style={[
                  styles.workspaceTabBadgeText,
                  activeTab === 'kbm' ? { color: '#FFFFFF' } : { color: '#047857' },
                ]}
              >
                {schedules.length}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('exam')}
            style={[styles.workspaceTabItem, activeTab === 'exam' && styles.workspaceTabItemActiveExam]}
          >
            <View style={[styles.tabIconSquircle, activeTab === 'exam' ? styles.tabIconSquircleActiveExam : styles.tabIconSquircleInactiveExam]}>
              <MaterialCommunityIcons
                name="file-document-edit-outline"
                size={16}
                color={activeTab === 'exam' ? '#FFFFFF' : '#2563EB'}
              />
            </View>
            <Text
              style={[
                styles.workspaceTabText,
                activeTab === 'exam' && styles.workspaceTabTextActive,
              ]}
              numberOfLines={1}
            >
              Jadwal Ujian
            </Text>
            <View
              style={[
                styles.workspaceTabBadge,
                activeTab === 'exam'
                  ? styles.workspaceTabBadgeActiveExam
                  : styles.workspaceTabBadgeInactiveExam,
              ]}
            >
              <Text
                style={[
                  styles.workspaceTabBadgeText,
                  activeTab === 'exam' ? { color: '#FFFFFF' } : { color: '#1D4ED8' },
                ]}
              >
                {examSchedules.length}
              </Text>
            </View>
          </TouchableOpacity>
        </View>


        {activeTab === 'kbm' ? (
          <>
            {/* ── 4. DAY SELECTOR (ANTI-BERHIMPITAN: HORIZONTAL SCROLLVIEW LEGA) ── */}
            <View style={styles.daySelectorWrapper}>
              <View style={styles.daySelectorHeaderRow}>
                <View style={styles.daySelectorTitleWrap}>
                  <MaterialCommunityIcons name="calendar-week" size={16} color="#059669" />
                  <Text style={styles.daySelectorTitle}>Pilih Hari Jadwal</Text>
                </View>
                {selectedDay !== 'all' && (
                  <TouchableOpacity
                    onPress={() => setSelectedDay('all')}
                    style={styles.dayResetBtn}
                    activeOpacity={0.7}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={13} color="#059669" />
                    <Text style={styles.dayResetBtnText}>Lihat Semua Hari</Text>
                  </TouchableOpacity>
                )}
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.dayStripScroll}
              >
                {DAY_OPTIONS.map((day) => {
                  const isSel = selectedDay === day.id;
                  const count = day.id === 'all' ? schedules.length : (sessionCountByDay[Number(day.id)] || 0);

                  return (
                    <TouchableOpacity
                      key={String(day.id)}
                      activeOpacity={0.8}
                      onPress={() => setSelectedDay(day.id as any)}
                      style={[styles.dayCardBtn, isSel && styles.dayCardBtnActive]}
                    >
                      {isSel && (
                        <LinearGradient
                          colors={['#059669', '#10B981']}
                          start={{ x: 0, y: 0 }}
                          end={{ x: 1, y: 1 }}
                          style={StyleSheet.absoluteFill}
                        />
                      )}
                      <Text style={[styles.dayCardName, isSel && styles.dayCardNameActive]}>
                        {day.name}
                      </Text>
                      <View style={[styles.dayCountBadge, isSel && styles.dayCountBadgeActive]}>
                        <Text style={[styles.dayCountText, isSel && styles.dayCountTextActive]}>
                          {count} Sesi
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* ── 5. FILTER HORIZONTAL (ROMBEL & MAPEL) ── */}
            {(uniqueClasses.length > 1 || uniqueSubjects.length > 1) && (
              <View style={styles.filtersBlock}>
                {/* Filter Rombel */}
                {uniqueClasses.length > 1 && (
                  <View style={styles.filterSection}>
                    <Text style={styles.filterSectionLabel}>Filter Rombel / Kelas:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedClassId('all')}
                        style={[styles.filterChip, selectedClassId === 'all' && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, selectedClassId === 'all' && styles.filterChipTextActive]}>
                          Semua Kelas ({uniqueClasses.length})
                        </Text>
                      </TouchableOpacity>
                      {uniqueClasses.map((cls) => {
                        const isSel = selectedClassId === cls.id;
                        return (
                          <TouchableOpacity
                            key={cls.id}
                            activeOpacity={0.8}
                            onPress={() => setSelectedClassId(cls.id)}
                            style={[styles.filterChip, isSel && styles.filterChipActive]}
                          >
                            <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                              {cls.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}

                {/* Filter Mapel */}
                {uniqueSubjects.length > 1 && (
                  <View style={[styles.filterSection, { marginTop: 8 }]}>
                    <Text style={styles.filterSectionLabel}>Filter Mata Pelajaran:</Text>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedSubjectId('all')}
                        style={[styles.filterChip, selectedSubjectId === 'all' && styles.filterChipActiveBlue]}
                      >
                        <Text style={[styles.filterChipText, selectedSubjectId === 'all' && styles.filterChipTextActive]}>
                          Semua Mapel ({uniqueSubjects.length})
                        </Text>
                      </TouchableOpacity>
                      {uniqueSubjects.map((sub) => {
                        const isSel = selectedSubjectId === sub.name || selectedSubjectId === sub.id;
                        return (
                          <TouchableOpacity
                            key={sub.id}
                            activeOpacity={0.8}
                            onPress={() => setSelectedSubjectId(sub.name)}
                            style={[styles.filterChip, isSel && styles.filterChipActiveBlue]}
                          >
                            <Text style={[styles.filterChipText, isSel && styles.filterChipTextActive]}>
                              {sub.name}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </ScrollView>
                  </View>
                )}
              </View>
            )}

            {/* ── 6. LIST SESI JADWAL KBM (SPACIOUS, NO OVERLAP, ACTION READY) ── */}
            <View style={styles.listSectionHeader}>
              <View style={styles.listSectionLeft}>
                <View style={styles.listHeaderIconWrap}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={17} color="#059669" />
                </View>
                <View style={styles.listHeaderTitleCol}>
                  <Text style={styles.listSectionTitle}>
                    {selectedDay === 'all'
                      ? 'Jadwal Mengajar Pekanan'
                      : `Jadwal Mengajar Hari ${DAY_OPTIONS.find((d) => d.id === selectedDay)?.name || ''}`}
                  </Text>
                  <Text style={styles.listSectionSubtitle}>
                    {selectedDay === 'all'
                      ? 'Daftar seluruh alokasi jam KBM aktif'
                      : `Sesi jam KBM aktif hari ${DAY_OPTIONS.find((d) => d.id === selectedDay)?.name || ''}`}
                  </Text>
                </View>
              </View>
              <View style={styles.sessionCountPill}>
                <View style={styles.sessionCountDot} />
                <Text style={styles.sessionCountPillText}>{filteredSchedules.length} Sesi</Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={styles.loadingText}>Memuat jadwal mengajar guru...</Text>
              </View>
            ) : filteredSchedules.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={styles.emptyIconCircle}>
                  <MaterialCommunityIcons name="calendar-blank-outline" size={38} color="#94A3B8" />
                </View>
                <Text style={styles.emptyTitle}>Tidak Ada Sesi Terjadwal</Text>
                <Text style={styles.emptySubtitle}>
                  {searchQuery || selectedClassId !== 'all' || selectedSubjectId !== 'all'
                    ? 'Tidak ada jadwal yang cocok dengan filter atau kata kunci pencarian Anda.'
                    : 'Tidak ada sesi KBM untuk hari yang dipilih. Silakan pilih hari lain atau lihat semua hari.'}
                </Text>
                {(selectedDay !== 'all' || selectedClassId !== 'all' || selectedSubjectId !== 'all' || searchQuery) && (
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedDay('all');
                      setSelectedClassId('all');
                      setSelectedSubjectId('all');
                      setSearchQuery('');
                    }}
                    style={styles.emptyResetBtn}
                  >
                    <Text style={styles.emptyResetBtnText}>Reset Semua Filter</Text>
                  </TouchableOpacity>
                )}
              </View>
            ) : (
              <View style={styles.scheduleCardsCol}>
                {filteredSchedules.map((item, idx) => {
                  const styleMeta = getSubjectStyle(item.subject?.name, idx);
                  const status = getSessionTimelineStatus(item.time_start, item.time_end, item.day_of_week);
                  const isCurrent = status === 'current';
                  const isPast = status === 'past';
                  const isUpcoming = status === 'upcoming';
                  const dayName = DAY_OPTIONS.find((d) => d.id === item.day_of_week)?.name || 'Hari Belajar';

                  return (
                    <View
                      key={item.id || idx}
                      style={[
                        styles.scheduleCard,
                        isCurrent && styles.scheduleCardCurrent,
                        isPast && styles.scheduleCardPast,
                      ]}
                    >
                      {/* Baris 1: Waktu, Status Keaktifan, & Hari */}
                      <View style={styles.cardHeaderRow}>
                        <View style={[styles.timeRangeBadge, isCurrent && styles.timeRangeBadgeCurrent]}>
                          <MaterialCommunityIcons
                            name="clock-time-four-outline"
                            size={14}
                            color={isCurrent ? '#059669' : '#475569'}
                          />
                          <Text style={[styles.timeRangeText, isCurrent && styles.timeRangeTextCurrent]}>
                            {item.time_display} WIB
                          </Text>
                        </View>

                        <View style={styles.cardHeaderRightRow}>
                          {isCurrent ? (
                            <View style={styles.liveStatusBadge}>
                              <RadarPulseDot color="#10B981" size={6} />
                              <Text style={styles.liveStatusText}>BERLANGSUNG</Text>
                            </View>
                          ) : isPast ? (
                            <View style={styles.pastStatusBadge}>
                              <MaterialCommunityIcons name="check" size={12} color="#64748B" />
                              <Text style={styles.pastStatusText}>Selesai</Text>
                            </View>
                          ) : (
                            <View style={styles.upcomingStatusBadge}>
                              <MaterialCommunityIcons name="clock-outline" size={12} color="#D97706" />
                              <Text style={styles.upcomingStatusText}>Akan Datang</Text>
                            </View>
                          )}

                          {selectedDay === 'all' && (
                            <View style={styles.dayTagBadge}>
                              <Text style={styles.dayTagText}>{dayName}</Text>
                            </View>
                          )}
                        </View>
                      </View>

                      {/* Baris 2: Subjek, Icon, & Metadata Kelas */}
                      <View style={styles.cardBodyRow}>
                        <View style={[styles.subjectIconBox, { backgroundColor: styleMeta.bg, borderColor: styleMeta.border }]}>
                          <MaterialCommunityIcons name={styleMeta.icon as any} size={26} color={styleMeta.color} />
                        </View>

                        <View style={styles.subjectInfoCol}>
                          <Text style={styles.subjectTitleText}>
                            {item.subject?.name || 'Mata Pelajaran'}
                          </Text>

                          {/* Pill Badges: Kelas & Ruangan */}
                          <View style={styles.cardBadgesRow}>
                            <View style={styles.classPill}>
                              <MaterialCommunityIcons name="google-classroom" size={13} color="#059669" />
                              <Text numberOfLines={1} style={styles.classPillText}>
                                {item.class_name}
                              </Text>
                            </View>

                            <View style={styles.roomPill}>
                              <MaterialCommunityIcons name="door-open" size={13} color="#64748B" />
                              <Text numberOfLines={1} style={styles.roomPillText}>
                                {item.room}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Baris 3: Tombol Aksi Nyata Guru (Presensi Siswa / Koreksi Presensi / Menunggu Jam) */}
                      {/* Baris 3: Tombol Aksi Nyata Guru (Rapi, Tidak Berhimpitan) */}
                      <View style={styles.cardActionsContainer}>
                        {isCurrent ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => handleOpenAttendanceForClass(item, false)}
                            style={[styles.actionBtnMain, styles.actionBtnPrimary]}
                          >
                            <MaterialCommunityIcons name="clipboard-check-outline" size={16} color="#FFFFFF" />
                            <Text style={styles.actionBtnPrimaryText}>Presensi Siswa Sekarang</Text>
                          </TouchableOpacity>
                        ) : isPast ? (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => handleOpenAttendanceForClass(item, true)}
                            style={[styles.actionBtnMain, styles.actionBtnCorrection]}
                          >
                            <MaterialCommunityIcons name="clipboard-edit-outline" size={16} color="#B45309" />
                            <Text style={styles.actionBtnCorrectionText}>Koreksi / Riwayat Presensi</Text>
                          </TouchableOpacity>
                        ) : (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              setFeedbackModal({
                                visible: true,
                                type: 'warning',
                                title: 'Sesi Belum Dimulai',
                                message: `Jam KBM (${item.time_display} WIB) belum dimulai. Presensi santri dapat diambil saat jam pelajaran sedang berlangsung.`,
                              });
                            }}
                            style={[styles.actionBtnMain, styles.actionBtnDisabled]}
                          >
                            <MaterialCommunityIcons name="clock-outline" size={16} color="#94A3B8" />
                            <Text style={styles.actionBtnDisabledText}>
                              Menunggu Jam Mengajar ({item.time_start ? item.time_start.slice(0, 5) : ''})
                            </Text>
                          </TouchableOpacity>
                        )}

                        <View style={styles.cardActionsSecondaryRow}>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={handleOpenMaterials}
                            style={[styles.actionBtnSecondarySmall, styles.actionBtnSecondary]}
                          >
                            <MaterialCommunityIcons name="book-multiple" size={15} color="#059669" />
                            <Text style={styles.actionBtnSecondaryText}>Bahan Ajar</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => navigation?.navigate('Mutabaah', { kelas_id: item.kelas_id, class_name: item.class_name })}
                            style={[styles.actionBtnSecondarySmall, styles.actionBtnMutabaah]}
                          >
                            <MaterialCommunityIcons name="clipboard-check" size={15} color="#0D9488" />
                            <Text style={styles.actionBtnMutabaahText}>Mutaba'ah</Text>
                          </TouchableOpacity>

                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => void handleOpenScheduleDetail(item)}
                            style={[styles.actionBtnSecondarySmall, styles.actionBtnDetail]}
                          >
                            <MaterialCommunityIcons name="account-group" size={15} color="#475569" />
                            <Text style={styles.actionBtnDetailText}>Santri</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </>
        ) : (
          /* ── 7. VIEW TAB JADWAL UJIAN (PTS/PAS/PAT) ── */
          <View style={styles.examContainer}>
            {/* Filter Kategori Ujian jika ada */}
            {examCategories.length > 0 && (
              <View style={styles.examCategoryFilterRow}>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterChipScroll}>
                  <TouchableOpacity
                    style={[styles.filterChip, selectedExamCategory === 'all' && styles.filterChipActiveBlue]}
                    onPress={() => setSelectedExamCategory('all')}
                    activeOpacity={0.8}
                  >
                    <Text style={[styles.filterChipText, selectedExamCategory === 'all' && styles.filterChipTextActive]}>
                      Semua Kategori Ujian
                    </Text>
                  </TouchableOpacity>
                  {examCategories.map((c) => (
                    <TouchableOpacity
                      key={c.id}
                      style={[styles.filterChip, selectedExamCategory === c.id && styles.filterChipActiveBlue]}
                      onPress={() => setSelectedExamCategory(c.id)}
                      activeOpacity={0.8}
                    >
                      <Text style={[styles.filterChipText, selectedExamCategory === c.id && styles.filterChipTextActive]}>
                        {c.name}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            <View style={styles.listSectionHeader}>
              <View style={styles.listSectionLeft}>
                <View style={[styles.listHeaderIconWrap, { backgroundColor: '#DBEAFE', borderColor: '#BFDBFE' }]}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={17} color="#2563EB" />
                </View>
                <View style={styles.listHeaderTitleCol}>
                  <Text style={[styles.listSectionTitle, { color: '#1E40AF' }]}>
                    Daftar Jadwal Ujian Semester
                  </Text>
                  <Text style={[styles.listSectionSubtitle, { color: '#2563EB' }]}>
                    Alokasi tugas pengawas evaluasi PTS / PAS / PAT
                  </Text>
                </View>
              </View>
              <View style={[styles.sessionCountPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <View style={[styles.sessionCountDot, { backgroundColor: '#2563EB' }]} />
                <Text style={[styles.sessionCountPillText, { color: '#2563EB' }]}>
                  {filteredExamSchedules.length} Ujian
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color="#2563EB" />
                <Text style={styles.loadingText}>Memuat jadwal ujian semester...</Text>
              </View>
            ) : filteredExamSchedules.length === 0 ? (
              <View style={styles.emptyCard}>
                <View style={[styles.emptyIconCircle, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="file-certificate-outline" size={38} color="#2563EB" />
                </View>
                <Text style={styles.emptyTitle}>Belum Ada Jadwal Ujian Aktif</Text>
                <Text style={styles.emptySubtitle}>
                  Jadwal ujian semester (PTS / PAS / PAT) belum dialokasikan untuk mata pelajaran Anda. Silakan hubungi bagian kurikulum atau tata usaha.
                </Text>
              </View>
            ) : (
              <View style={styles.scheduleCardsCol}>
                {filteredExamSchedules.map((exItem: any, exIdx: number) => {
                  const catName = exItem.exam_category?.name || exItem.examCategory?.name || 'Ujian Semester';
                  const subjectName = exItem.subject?.name || exItem.subject?.nama_mapel || 'Mata Pelajaran';
                  const examDate = exItem.exam_date || exItem.date || 'Tanggal Belum Diatur';
                  const timeRange = `${(exItem.time_start || '').slice(0, 5)} - ${(exItem.time_end || '').slice(0, 5)} WIB`;
                  const invigilatorName = exItem.invigilator?.nama_lengkap || exItem.invigilator?.name || teacherName;
                  const room = exItem.room || 'Ruang Ujian';
                  const className = exItem.kelas?.nama_kelas || exItem.kelas?.name || 'Semua Kelas';

                  return (
                    <TouchableOpacity
                      key={exItem.id || exIdx}
                      activeOpacity={0.88}
                      onPress={() => setSelectedExamDetail(exItem)}
                      style={[styles.scheduleCard, { borderColor: '#BFDBFE' }]}
                    >
                      <View style={styles.cardHeaderRow}>
                        <View style={[styles.timeRangeBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                          <MaterialCommunityIcons name="calendar-clock" size={14} color="#2563EB" />
                          <Text style={[styles.timeRangeText, { color: '#2563EB' }]}>{examDate}</Text>
                        </View>

                        <View style={[styles.dayTagBadge, { backgroundColor: '#DBEAFE' }]}>
                          <Text style={[styles.dayTagText, { color: '#1E40AF' }]}>{catName}</Text>
                        </View>
                      </View>

                      <View style={styles.cardBodyRow}>
                        <View style={[styles.subjectIconBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                          <MaterialCommunityIcons name="file-document-edit" size={26} color="#2563EB" />
                        </View>

                        <View style={styles.subjectInfoCol}>
                          <Text style={styles.subjectTitleText}>{subjectName}</Text>

                          <View style={styles.cardBadgesRow}>
                            <View style={[styles.classPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                              <MaterialCommunityIcons name="google-classroom" size={13} color="#2563EB" />
                              <Text numberOfLines={1} style={[styles.classPillText, { color: '#1E40AF' }]}>
                                {className}
                              </Text>
                            </View>

                            <View style={styles.roomPill}>
                              <MaterialCommunityIcons name="door-open" size={13} color="#64748B" />
                              <Text numberOfLines={1} style={styles.roomPillText}>
                                {room}
                              </Text>
                            </View>
                          </View>
                        </View>
                      </View>

                      {/* Detail Footer Ujian */}
                      <View style={styles.examFooterRow}>
                        <View style={styles.examFooterItem}>
                          <MaterialCommunityIcons name="clock-outline" size={13} color="#64748B" />
                          <Text style={styles.examFooterText}>{timeRange}</Text>
                        </View>
                        <View style={styles.examFooterItem}>
                          <MaterialCommunityIcons name="account-tie-outline" size={13} color="#64748B" />
                          <Text numberOfLines={1} style={styles.examFooterText}>Pengawas: {invigilatorName}</Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        )}
      </ScrollView>

      {/* ── DETAIL MODAL KBM & DAFTAR ROSTER SISWA (TAILGRIDS STYLE) ── */}
      <Modal
        visible={!!selectedScheduleDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedScheduleDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedScheduleDetail(null)}
          />
          <View style={styles.modalCard}>
            {selectedScheduleDetail && (() => {
              const detailStatus = getSessionTimelineStatus(
                selectedScheduleDetail.time_start,
                selectedScheduleDetail.time_end,
                selectedScheduleDetail.day_of_week
              );
              const isDetailCurrent = detailStatus === 'current';
              const isDetailPast = detailStatus === 'past';

              return (
                <>
                  <View style={styles.modalHeaderRow}>
                    <View style={[styles.modalIconBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                      <MaterialCommunityIcons name="book-open-page-variant" size={26} color="#059669" />
                    </View>
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text style={styles.modalSubjectTitle}>
                        {selectedScheduleDetail.subject?.name || 'Mata Pelajaran'}
                      </Text>
                      <Text style={styles.modalSubjectCode}>
                        {selectedScheduleDetail.class_name} • {selectedScheduleDetail.time_display} WIB
                      </Text>
                    </View>
                    <TouchableOpacity
                      onPress={() => setSelectedScheduleDetail(null)}
                      style={styles.modalCloseBtn}
                    >
                      <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                    </TouchableOpacity>
                  </View>

                  <View style={styles.modalDivider} />

                  <ScrollView
                    style={{ maxHeight: 380 }}
                    showsVerticalScrollIndicator={false}
                    contentContainerStyle={{ paddingBottom: 8 }}
                  >
                    {/* Ringkasan Metadata Jadwal */}
                    <View style={styles.modalMetaPillsRow}>
                      <View style={styles.modalMetaPill}>
                        <MaterialCommunityIcons name="calendar" size={13} color="#059669" />
                        <Text style={styles.modalMetaPillText}>
                          {DAY_OPTIONS.find((d) => d.id === selectedScheduleDetail.day_of_week)?.name || 'Hari Mengajar'}
                        </Text>
                      </View>
                      <View style={styles.modalMetaPill}>
                        <MaterialCommunityIcons name="door-open" size={13} color="#64748B" />
                        <Text style={styles.modalMetaPillText}>{selectedScheduleDetail.room}</Text>
                      </View>
                      <View style={styles.modalMetaPill}>
                        <MaterialCommunityIcons name="account-tie" size={13} color="#0284C7" />
                        <Text numberOfLines={1} style={styles.modalMetaPillText}>{teacherName}</Text>
                      </View>
                    </View>

                    {/* Master KPI Stats Grid */}
                    <View style={styles.modalKpiGrid}>
                      <View style={[styles.modalKpiCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                        <Text style={[styles.modalKpiNumber, { color: '#059669' }]}>{detailAttendanceStats.hadir}</Text>
                        <Text style={[styles.modalKpiLabel, { color: '#047857' }]}>Hadir</Text>
                      </View>
                      <View style={[styles.modalKpiCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                        <Text style={[styles.modalKpiNumber, { color: '#D97706' }]}>{detailAttendanceStats.terlambat}</Text>
                        <Text style={[styles.modalKpiLabel, { color: '#B45309' }]}>Terlambat</Text>
                      </View>
                      <View style={[styles.modalKpiCard, { backgroundColor: '#FEF2F2', borderColor: '#FECACA' }]}>
                        <Text style={[styles.modalKpiNumber, { color: '#DC2626' }]}>{detailAttendanceStats.tidakHadir}</Text>
                        <Text style={[styles.modalKpiLabel, { color: '#B91C1C' }]}>Tidak Hadir</Text>
                      </View>
                      <View style={[styles.modalKpiCard, { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' }]}>
                        <Text style={[styles.modalKpiNumber, { color: '#64748B' }]}>{detailAttendanceStats.belumDicatat}</Text>
                        <Text style={[styles.modalKpiLabel, { color: '#475569' }]}>Belum Dicatat</Text>
                      </View>
                    </View>

                    {/* Pencarian Santri */}
                    <View style={styles.modalSearchRow}>
                      <MaterialCommunityIcons name="magnify" size={16} color="#94A3B8" />
                      <TextInput
                        style={styles.modalSearchInput}
                        placeholder="Cari nama santri atau NIS..."
                        placeholderTextColor="#94A3B8"
                        value={detailStudentSearch}
                        onChangeText={setDetailStudentSearch}
                      />
                      {Boolean(detailStudentSearch) && (
                        <TouchableOpacity onPress={() => setDetailStudentSearch('')}>
                          <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                        </TouchableOpacity>
                      )}
                    </View>

                    {/* Section Header Roster */}
                    <View style={styles.modalRosterSectionHeader}>
                      <Text style={styles.modalRosterTitle}>Daftar Santri Kelas Ini</Text>
                      <View style={styles.modalRosterBadge}>
                        <Text style={styles.modalRosterBadgeText}>
                          {filteredDetailStudents.length} Santri
                        </Text>
                      </View>
                    </View>

                    {/* List Roster Santri */}
                    {detailStudentsLoading ? (
                      <View style={{ paddingVertical: 20, alignItems: 'center' }}>
                        <ActivityIndicator size="small" color="#059669" />
                        <Text style={{ fontSize: 11.5, color: '#64748B', marginTop: 6, fontWeight: '600' }}>
                          Memuat data santri...
                        </Text>
                      </View>
                    ) : filteredDetailStudents.length === 0 ? (
                      <View style={{ paddingVertical: 18, alignItems: 'center' }}>
                        <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>
                          Tidak ada santri yang sesuai kriteria pencarian.
                        </Text>
                      </View>
                    ) : (
                      <View style={styles.modalStudentList}>
                        {filteredDetailStudents.map((st: any, sIdx: number) => {
                          const sName = st.full_name || st.nama_lengkap || st.name || 'Santri';
                          const sNis = st.nis || st.nisn || '-';
                          const rawStatus = String(st.status || st.status_hadir || st.recommended_status || '').toLowerCase();
                          let statusLabel = 'Belum Dicatat';
                          let badgeBg = '#F1F5F9';
                          let badgeColor = '#64748B';

                          if (rawStatus.includes('hadir') || rawStatus === 'present') {
                            statusLabel = 'Hadir';
                            badgeBg = '#ECFDF5';
                            badgeColor = '#059669';
                          } else if (rawStatus.includes('terlambat') || rawStatus === 'late') {
                            statusLabel = 'Terlambat';
                            badgeBg = '#FFFBEB';
                            badgeColor = '#D97706';
                          } else if (rawStatus.includes('sakit') || rawStatus === 'sick') {
                            statusLabel = 'Sakit';
                            badgeBg = '#FAF5FF';
                            badgeColor = '#7C3AED';
                          } else if (rawStatus.includes('izin') || rawStatus.includes('permission') || rawStatus.includes('permit')) {
                            statusLabel = 'Izin';
                            badgeBg = '#EFF6FF';
                            badgeColor = '#2563EB';
                          } else if (rawStatus.includes('alpha') || rawStatus.includes('alpa') || rawStatus === 'absent') {
                            statusLabel = 'Alpha';
                            badgeBg = '#FEF2F2';
                            badgeColor = '#DC2626';
                          }

                          return (
                            <View key={st.id || sIdx} style={styles.modalStudentRow}>
                              <View style={styles.modalStudentAvatar}>
                                <Text style={styles.modalStudentAvatarText}>
                                  {sName.charAt(0).toUpperCase()}
                                </Text>
                              </View>
                              <View style={styles.modalStudentInfo}>
                                <Text numberOfLines={1} style={styles.modalStudentName}>{sName}</Text>
                                <Text style={styles.modalStudentNis}>NIS: {sNis}</Text>
                                {(st.notes || st.alasan_terlambat) ? (
                                  <Text numberOfLines={2} style={{ fontSize: 10, color: '#D97706', fontStyle: 'italic', marginTop: 2 }}>
                                    Alasan: "{st.notes || st.alasan_terlambat}"
                                  </Text>
                                ) : null}
                              </View>
                              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                <View style={[styles.modalStatusBadge, { backgroundColor: badgeBg }]}>
                                  <Text style={[styles.modalStatusBadgeText, { color: badgeColor }]}>
                                    {statusLabel}
                                  </Text>
                                </View>
                                <TouchableOpacity
                                  activeOpacity={0.75}
                                  onPress={() => handleOpenDisciplineForStudent(st, selectedScheduleDetail)}
                                  style={styles.modalStudentDisciplineBtn}
                                  hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                                >
                                  <MaterialCommunityIcons name="shield-alert-outline" size={14} color="#E11D48" />
                                </TouchableOpacity>
                              </View>
                            </View>
                          );
                        })}
                      </View>
                    )}
                  </ScrollView>

                  <View style={styles.modalDivider} />

                  {/* Modal Actions */}
                  <View style={styles.modalActionsCol}>
                    {isDetailCurrent ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          const item = selectedScheduleDetail;
                          setSelectedScheduleDetail(null);
                          handleOpenAttendanceForClass(item, false);
                        }}
                        style={styles.modalActionPrimaryBtn}
                      >
                        <MaterialCommunityIcons name="clipboard-check" size={18} color="#FFFFFF" />
                        <Text style={styles.modalActionPrimaryBtnText}>Buka Presensi Sesi KBM</Text>
                      </TouchableOpacity>
                    ) : isDetailPast ? (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          const item = selectedScheduleDetail;
                          setSelectedScheduleDetail(null);
                          handleOpenAttendanceForClass(item, true);
                        }}
                        style={styles.modalActionCorrectionBtn}
                      >
                        <MaterialCommunityIcons name="clipboard-edit" size={18} color="#FFFFFF" />
                        <Text style={styles.modalActionCorrectionBtnText}>Koreksi Presensi Sesi Ini</Text>
                      </TouchableOpacity>
                    ) : (
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setFeedbackModal({
                            visible: true,
                            type: 'warning',
                            title: 'Sesi Belum Dimulai',
                            message: `Jam KBM (${selectedScheduleDetail.time_display} WIB) belum dimulai. Presensi santri dapat diambil saat jam pelajaran sedang berlangsung.`,
                          });
                        }}
                        style={styles.modalActionDisabledBtn}
                      >
                        <MaterialCommunityIcons name="clock-outline" size={18} color="#94A3B8" />
                        <Text style={styles.modalActionDisabledBtnText}>Sesi Belum Dimulai (Menunggu Jam)</Text>
                      </TouchableOpacity>
                    )}

                    {/* Tombol Akses Cepat Bahan Ajar & Mutaba'ah Rombel */}
                    <View style={styles.modalSecondaryButtonsRow}>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          setSelectedScheduleDetail(null);
                          handleOpenMaterials();
                        }}
                        style={styles.modalActionMaterialsBtn}
                      >
                        <MaterialCommunityIcons name="book-multiple" size={17} color="#059669" />
                        <Text style={styles.modalActionMaterialsBtnText}>Bahan Ajar</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={() => {
                          const item = selectedScheduleDetail;
                          setSelectedScheduleDetail(null);
                          navigation?.navigate('Mutabaah', {
                            kelas_id: item.kelas_id,
                            class_name: item.class_name,
                          });
                        }}
                        style={styles.modalActionMutabaahBtn}
                      >
                        <MaterialCommunityIcons name="clipboard-check" size={17} color="#0D9488" />
                        <Text style={styles.modalActionMutabaahBtnText}>Mutaba'ah</Text>
                      </TouchableOpacity>
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setSelectedScheduleDetail(null)}
                      style={styles.modalActionSecondaryBtn}
                    >
                      <Text style={styles.modalActionSecondaryBtnText}>Tutup Rincian</Text>
                    </TouchableOpacity>
                  </View>
                </>
              );
            })()}
          </View>
        </View>
      </Modal>

      {/* ── DETAIL MODAL UJIAN ── */}
      <Modal
        visible={!!selectedExamDetail}
        transparent
        animationType="fade"
        onRequestClose={() => setSelectedExamDetail(null)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setSelectedExamDetail(null)}
          />
          <View style={styles.modalCard}>
            {selectedExamDetail && (
              <>
                <View style={styles.modalHeaderRow}>
                  <View style={[styles.modalIconBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <MaterialCommunityIcons name="file-certificate-outline" size={26} color="#2563EB" />
                  </View>
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.modalSubjectTitle}>
                      {selectedExamDetail.subject?.name || selectedExamDetail.subject?.nama_mapel || 'Ujian'}
                    </Text>
                    <Text style={[styles.modalSubjectCode, { color: '#2563EB' }]}>
                      {selectedExamDetail.exam_category?.name || 'Ujian Semester'}
                    </Text>
                  </View>
                  <TouchableOpacity
                    onPress={() => setSelectedExamDetail(null)}
                    style={styles.modalCloseBtn}
                  >
                    <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                  </TouchableOpacity>
                </View>

                <View style={styles.modalDivider} />

                <View style={styles.modalBodyRows}>
                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="calendar" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Tanggal:</Text>
                    <Text style={styles.modalDetailValue}>
                      {selectedExamDetail.exam_date || selectedExamDetail.date || '-'}
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="clock-outline" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Waktu:</Text>
                    <Text style={styles.modalDetailValue}>
                      {(selectedExamDetail.time_start || '').slice(0, 5)} - {(selectedExamDetail.time_end || '').slice(0, 5)} WIB
                    </Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="door-open" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Ruangan:</Text>
                    <Text style={styles.modalDetailValue}>{selectedExamDetail.room || 'Ruang Ujian'}</Text>
                  </View>

                  <View style={styles.modalDetailRow}>
                    <MaterialCommunityIcons name="account-tie-outline" size={18} color="#2563EB" />
                    <Text style={styles.modalDetailLabel}>Pengawas:</Text>
                    <Text style={styles.modalDetailValue}>
                      {selectedExamDetail.invigilator?.nama_lengkap || selectedExamDetail.invigilator?.name || teacherName}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={() => setSelectedExamDetail(null)}
                  style={[styles.modalActionPrimaryBtn, { backgroundColor: '#2563EB' }]}
                >
                  <Text style={styles.modalActionPrimaryBtnText}>Tutup</Text>
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      </Modal>

      {/* ── MODAL CATAT PELANGGARAN KEDISIPLINAN (ZERO HARDCODE) ── */}
      <Modal
        visible={disciplineModalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => !submittingDiscipline && setDisciplineModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => !submittingDiscipline && setDisciplineModalVisible(false)}
          />
          <View style={[styles.modalCard, { maxHeight: '88%' }]}>
            <View style={styles.modalHeaderRow}>
              <View style={[styles.modalIconBox, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
                <MaterialCommunityIcons name="shield-alert-outline" size={24} color="#E11D48" />
              </View>
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={styles.modalSubjectTitle}>Catat Pelanggaran Kedisiplinan</Text>
                <Text style={[styles.modalSubjectCode, { color: '#E11D48' }]}>
                  {disciplineTargetStudent?.full_name || disciplineTargetStudent?.nama_lengkap || disciplineTargetStudent?.name || 'Santri'}
                  {disciplineTargetStudent?.nis ? ` · NIS: ${disciplineTargetStudent.nis}` : ''}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => !submittingDiscipline && setDisciplineModalVisible(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.modalDivider} />

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 16 }}>
              {/* Info Rombel / Kelas */}
              <View style={{ backgroundColor: '#F8FAFC', borderRadius: 12, padding: 10, marginBottom: 14, borderWidth: 1, borderColor: '#E2E8F0' }}>
                <Text style={{ fontSize: 11, color: '#64748B' }}>Rombel / Kelas: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{disciplineSchedule?.class_name || disciplineTargetStudent?.kelas?.nama_kelas || '-'}</Text></Text>
                <Text style={{ fontSize: 11, color: '#64748B', marginTop: 2 }}>Mata Pelajaran: <Text style={{ fontWeight: '700', color: '#0F172A' }}>{disciplineSchedule?.subject?.name || disciplineSchedule?.subject?.nama_mapel || 'KBM Kelas'}</Text></Text>
              </View>

              {/* Master Kategori Pelanggaran (Dinamis dari Server - Zero Hardcode) */}
              <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 6 }}>
                Pilih Kategori Pelanggaran *
              </Text>
              {disciplineLoadingCategories ? (
                <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                  <ActivityIndicator size="small" color="#E11D48" />
                  <Text style={{ fontSize: 11, color: '#64748B', marginTop: 4 }}>Memuat daftar kategori pelanggaran...</Text>
                </View>
              ) : disciplineCategories.length === 0 ? (
                <TouchableOpacity
                  onPress={loadDisciplineCategories}
                  style={{ padding: 10, borderRadius: 10, backgroundColor: '#FFF1F2', alignItems: 'center', marginBottom: 10 }}
                >
                  <Text style={{ fontSize: 11, color: '#E11D48', fontWeight: '700' }}>Kategori belum termuat. Ketuk untuk memuat ulang.</Text>
                </TouchableOpacity>
              ) : (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingBottom: 8 }}>
                  {disciplineCategories.map((cat: any) => {
                    const isSel = selectedDisciplineCategoryId === String(cat.id);
                    const level = String(cat.level || 'ringan').toLowerCase();
                    const levelBg = level === 'berat' ? '#FEF2F2' : level === 'sedang' ? '#FFFBEB' : '#F1F5F9';
                    const levelBorder = level === 'berat' ? '#FECACA' : level === 'sedang' ? '#FDE68A' : '#CBD5E1';
                    const levelColor = level === 'berat' ? '#DC2626' : level === 'sedang' ? '#D97706' : '#475569';
                    const pts = cat.point_weight !== undefined ? Number(cat.point_weight) : (cat.default_points !== undefined ? Number(cat.default_points) : 0);

                    return (
                      <TouchableOpacity
                        key={cat.id}
                        onPress={() => handleSelectDisciplineCategory(cat)}
                        activeOpacity={0.8}
                        style={{
                          paddingHorizontal: 12,
                          paddingVertical: 8,
                          borderRadius: 12,
                          borderWidth: 1.5,
                          borderColor: isSel ? '#E11D48' : levelBorder,
                          backgroundColor: isSel ? '#FFF1F2' : levelBg,
                          maxWidth: 200,
                        }}
                      >
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 2 }}>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: levelColor }}>
                            {cat.code} · {level.toUpperCase()}
                          </Text>
                          <Text style={{ fontSize: 10, fontWeight: '800', color: '#E11D48' }}>
                            {pts} Poin
                          </Text>
                        </View>
                        <Text numberOfLines={2} style={{ fontSize: 11.5, fontWeight: isSel ? '800' : '600', color: isSel ? '#9F1239' : '#1E293B' }}>
                          {cat.name}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </ScrollView>
              )}

              {/* Poin Pelanggaran */}
              <View style={{ marginTop: 8, marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>
                  Bobot Poin Pengurang
                </Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFC', borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 10, paddingHorizontal: 10 }}>
                  <MaterialCommunityIcons name="minus-circle-outline" size={18} color="#E11D48" style={{ marginRight: 6 }} />
                  <TextInput
                    style={{ flex: 1, height: 40, fontSize: 13, fontWeight: '700', color: '#0F172A' }}
                    value={disciplinePoints}
                    onChangeText={setDisciplinePoints}
                    keyboardType="numeric"
                    placeholder="0"
                  />
                  <Text style={{ fontSize: 11, color: '#64748B', fontWeight: '600' }}>Poin</Text>
                </View>
              </View>

              {/* Deskripsi / Kronologi */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>
                  Kronologi & Rincian Pelanggaran *
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 12.5,
                    color: '#0F172A',
                    minHeight: 65,
                    textAlignVertical: 'top',
                  }}
                  multiline
                  numberOfLines={3}
                  placeholder="Jelaskan kejadian / pelanggaran santri secara objektif..."
                  placeholderTextColor="#94A3B8"
                  value={disciplineDescription}
                  onChangeText={setDisciplineDescription}
                />
              </View>

              {/* Tindak Lanjut / Catatan Awal */}
              <View style={{ marginBottom: 12 }}>
                <Text style={{ fontSize: 12, fontWeight: '800', color: '#1E293B', marginBottom: 4 }}>
                  Tindak Lanjut / Sanksi Awal (Opsional)
                </Text>
                <TextInput
                  style={{
                    backgroundColor: '#F8FAFC',
                    borderWidth: 1,
                    borderColor: '#CBD5E1',
                    borderRadius: 10,
                    padding: 10,
                    fontSize: 12.5,
                    color: '#0F172A',
                  }}
                  placeholder="Contoh: Teguran lisan, tugas amalan tambahan..."
                  placeholderTextColor="#94A3B8"
                  value={disciplineFollowUp}
                  onChangeText={setDisciplineFollowUp}
                />
              </View>

              {/* Switch Rujuk ke Guru BK */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#FFFBEB', borderWidth: 1, borderColor: '#FDE68A', borderRadius: 12, padding: 12, marginBottom: 16 }}>
                <View style={{ flex: 1, marginRight: 10 }}>
                  <Text style={{ fontSize: 12, fontWeight: '800', color: '#92400E' }}>
                    Rujuk ke Guru Bimbingan Konseling (BK)
                  </Text>
                  <Text style={{ fontSize: 10.5, color: '#B45309', marginTop: 2 }}>
                    Notifikasi rujukan akan otomatis dikirimkan ke konselor BK sekolah.
                  </Text>
                </View>
                <Switch
                  value={disciplineReferBk}
                  onValueChange={setDisciplineReferBk}
                  trackColor={{ false: '#CBD5E1', true: '#F59E0B' }}
                  thumbColor={disciplineReferBk ? '#D97706' : '#FFFFFF'}
                />
              </View>
            </ScrollView>

            <View style={styles.modalDivider} />

            {/* Modal Actions */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={submittingDiscipline}
                onPress={() => setDisciplineModalVisible(false)}
                style={{ flex: 1, paddingVertical: 12, borderRadius: 12, backgroundColor: '#F1F5F9', alignItems: 'center' }}
              >
                <Text style={{ fontSize: 13, fontWeight: '700', color: '#475569' }}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.88}
                disabled={submittingDiscipline}
                onPress={handleSubmitDisciplineViolation}
                style={{ flex: 1.5, paddingVertical: 12, borderRadius: 12, backgroundColor: '#E11D48', alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
              >
                {submittingDiscipline ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save" size={16} color="#FFFFFF" />
                    <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Simpan Pelanggaran</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <AppFeedbackModal
        visible={feedbackModal.visible}
        type={feedbackModal.type}
        title={feedbackModal.title}
        message={feedbackModal.message}
        onClose={() => setFeedbackModal((prev) => ({ ...prev, visible: false }))}
      />
    </View>
  );
}

// ── STYLESHEET (SPACIOUS, ELEGANT, NEVER CRAMPED) ──
const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 10 : 8,
  },
  bgBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    overflow: 'hidden',
  },
  bgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.95,
  },

  // ── Top Header Styles ──
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  headerTitleWrap: {
    flex: 1,
    marginHorizontal: 12,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 2,
    gap: 5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  headerBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.4,
  },
  headerMainTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.3,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#0D9488',
    fontWeight: '600',
    marginTop: 1,
  },
  refreshButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#CCFBF1',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 2 : 9,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#064E3B',
    fontWeight: '600',
  },

  // ── 4 KPI Grid (Card Mandiri Bersih & Proporsional 2x2) ──
  kpiCardsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  kpiTileToday: {
    width: (SCREEN_WIDTH - 32 - 8) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiTileWeek: {
    width: (SCREEN_WIDTH - 32 - 8) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    borderColor: '#BFDBFE',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiTileClasses: {
    width: (SCREEN_WIDTH - 32 - 8) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiTileStatus: {
    width: (SCREEN_WIDTH - 32 - 8) / 2,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 9,
  },
  kpiTextWrap: {
    flex: 1,
  },
  kpiValueText: {
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  kpiLabelText: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 1,
  },

  // ── Workspace Tab Bar ──
  workspaceTabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 4,
    marginBottom: 14,
    gap: 6,
    borderWidth: 1.2,
    borderColor: '#CCFBF1',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  workspaceTabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
    gap: 6,
  },
  workspaceTabItemActiveKbm: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  workspaceTabItemActiveExam: {
    backgroundColor: '#2563EB',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  tabIconSquircle: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tabIconSquircleActiveKbm: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabIconSquircleInactiveKbm: {
    backgroundColor: '#DEF7EC',
  },
  tabIconSquircleActiveExam: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  tabIconSquircleInactiveExam: {
    backgroundColor: '#EFF6FF',
  },
  workspaceTabText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  workspaceTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  workspaceTabBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  workspaceTabBadgeActiveKbm: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  workspaceTabBadgeInactiveKbm: {
    backgroundColor: '#DEF7EC',
  },
  workspaceTabBadgeActiveExam: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  workspaceTabBadgeInactiveExam: {
    backgroundColor: '#EFF6FF',
  },
  workspaceTabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },


  // ── Day Selector (Spacious Horizontal Scroll) ──
  daySelectorWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginBottom: 14,
    borderWidth: 1.2,
    borderColor: '#CCFBF1',
    shadowColor: '#064E3B',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  daySelectorHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  daySelectorTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  daySelectorTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  dayResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  dayResetBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  dayStripScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  dayCardBtn: {
    width: 84,
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  dayCardBtnActive: {
    borderColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.22,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 4,
  },
  dayCardName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
  },
  dayCardNameActive: {
    color: '#FFFFFF',
  },
  dayCountBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    marginTop: 4,
  },
  dayCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  dayCountText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  dayCountTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // ── Filters Section ──
  filtersBlock: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
    borderWidth: 1.2,
    borderColor: '#CCFBF1',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 6,
    elevation: 2,
  },
  filterSection: {},
  filterSectionLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  filterChipScroll: {
    gap: 6,
    paddingBottom: 2,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  filterChipActiveBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  filterChipText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#059669',
    fontWeight: '800',
  },

  // ── List Header (Rapi, Berikon & Berjudul Terstruktur) ──
  listSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    paddingHorizontal: 2,
  },
  listSectionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  listHeaderIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  listHeaderTitleCol: {
    flex: 1,
  },
  listSectionTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  listSectionSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
  sessionCountPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#BCF0DA',
    gap: 5,
  },
  sessionCountDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  sessionCountPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0D6B42',
  },

  // ── Schedule Cards (Spacious & Clean) ──
  scheduleCardsCol: {
    gap: 12,
  },
  scheduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1.2,
    borderColor: '#CCFBF1',
    shadowColor: '#064E3B',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  scheduleCardCurrent: {
    borderColor: '#34D399',
    borderLeftWidth: 4.5,
    borderLeftColor: '#059669',
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 3,
  },
  scheduleCardPast: {
    backgroundColor: '#FAFAFA',
    opacity: 0.92,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  timeRangeBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  timeRangeBadgeCurrent: {
    backgroundColor: '#DEF7EC',
  },
  timeRangeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  timeRangeTextCurrent: {
    color: '#059669',
    fontWeight: '800',
  },
  cardHeaderRightRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  liveStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 7,
    gap: 5,
  },
  liveStatusText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#059669',
    letterSpacing: 0.3,
  },
  pastStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 3,
  },
  pastStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  upcomingStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 3,
  },
  upcomingStatusText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D97706',
  },
  dayTagBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  dayTagText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },

  // Card Body
  cardBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  subjectIconBox: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    borderWidth: 1,
  },
  subjectInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  subjectTitleText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 5,
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  classPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 0.8,
    borderColor: '#A7F3D0',
  },
  classPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    maxWidth: SCREEN_WIDTH - 240,
  },
  roomPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 0.8,
    borderColor: '#E2E8F0',
  },
  roomPillText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Card Actions (Spacious Two-Tier Layout)
  cardActionsContainer: {
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 11,
    gap: 8,
  },
  actionBtnMain: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9.5,
    borderRadius: 12,
    gap: 6,
  },
  cardActionsSecondaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  actionBtnSecondarySmall: {
    flex: 1,
    height: 38,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 11,
    borderWidth: 1.2,
    gap: 5,
  },
  actionBtnSecondary: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  actionBtnSecondaryText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
  },
  actionBtnMutabaah: {
    backgroundColor: '#F0FDFA',
    borderColor: '#99F6E4',
  },
  actionBtnMutabaahText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  actionBtnDetail: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  actionBtnDetailText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
  },
  cardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 5,
  },
  actionBtnPrimary: {
    backgroundColor: '#059669',
  },
  actionBtnPrimaryText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionBtnCorrection: {
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  actionBtnCorrectionText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#B45309',
  },
  actionBtnDisabled: {
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  actionBtnDisabledText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  actionBtnIcon: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },

  // ── Exam Styles ──
  examContainer: {
    gap: 12,
  },
  examCategoryFilterRow: {
    marginBottom: 4,
  },
  examFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#EFF6FF',
    paddingTop: 9,
    marginTop: 4,
  },
  examFooterItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  examFooterText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // ── Loading & Empty States ──
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    marginVertical: 8,
  },
  emptyIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 18,
  },
  emptyResetBtn: {
    marginTop: 14,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  emptyResetBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },

  // ── Modal Styles ──
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    maxHeight: '86%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000000',
    shadowOpacity: 0.18,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  modalIconBox: {
    width: 46,
    height: 46,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  modalSubjectTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubjectCode: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginVertical: 14,
  },
  modalMetaPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
    marginBottom: 12,
  },
  modalMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 0.8,
    borderColor: '#E2E8F0',
  },
  modalMetaPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  modalKpiGrid: {
    flexDirection: 'row',
    gap: 6,
    marginBottom: 12,
  },
  modalKpiCard: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalKpiNumber: {
    fontSize: 15,
    fontWeight: '900',
  },
  modalKpiLabel: {
    fontSize: 9,
    fontWeight: '700',
    marginTop: 2,
  },
  modalSearchRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
    marginBottom: 10,
  },
  modalSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
  },
  modalRosterSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  modalRosterTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  modalRosterBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  modalRosterBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  modalStudentList: {
    gap: 6,
  },
  modalStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
    paddingHorizontal: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    borderWidth: 0.8,
    borderColor: '#F1F5F9',
  },
  modalStudentAvatar: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 8,
  },
  modalStudentAvatarText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalStudentInfo: {
    flex: 1,
  },
  modalStudentName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalStudentNis: {
    fontSize: 10,
    fontWeight: '500',
    color: '#64748B',
  },
  modalStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  modalStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  modalBodyRows: {
    gap: 10,
    marginBottom: 16,
  },
  modalDetailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 4,
  },
  modalDetailLabel: {
    width: 75,
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
    marginLeft: 8,
  },
  modalDetailValue: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalActionsCol: {
    gap: 8,
  },
  modalActionPrimaryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
  },
  modalActionPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalActionCorrectionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D97706',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
  },
  modalActionCorrectionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  modalActionDisabledBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
    paddingVertical: 12,
    borderRadius: 14,
    gap: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalActionDisabledBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#94A3B8',
  },
  modalActionSecondaryBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: 14,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalActionSecondaryBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSecondaryButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  modalActionMaterialsBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingVertical: 11,
    borderRadius: 14,
    gap: 6,
  },
  modalActionMaterialsBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  modalActionMutabaahBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F0FDFA',
    borderWidth: 1.2,
    borderColor: '#99F6E4',
    paddingVertical: 11,
    borderRadius: 14,
    gap: 6,
  },
  modalActionMutabaahBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F766E',
  },
  modalStudentDisciplineBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
});
