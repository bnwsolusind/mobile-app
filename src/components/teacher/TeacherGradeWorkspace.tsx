import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
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
import { mobileApiService, unwrapCollection } from '../../services/mobileApiService';
import { getApiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import EmptyStateCard from '../EmptyStateCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// Standard assessment weights (Formatif 40% [Tugas 20%, Kuis 20%], Sumatif 60% [UTS 30%, UAS 30%])
const GRADE_WEIGHTS = {
  tugas: 0.2,
  kuis: 0.2,
  uts: 0.3,
  uas: 0.3,
};


// Dynamic subject style matching TeacherAssignmentWorkspace
const getSubjectStyle = (name?: string) => {
  const norm = (name || '').toLowerCase();
  if (norm.includes('matematik') || norm.includes('math') || norm.includes('hitung')) {
    return {
      bg: '#E0F2FE',
      color: '#2563EB',
      icon: 'file-document-edit-outline' as const,
    };
  }
  if (norm.includes('indonesia') || norm.includes('bahasa') || norm.includes('inggris') || norm.includes('arab') || norm.includes('literasi')) {
    return {
      bg: '#DCFCE7',
      color: '#16A34A',
      icon: 'book-open-page-variant-outline' as const,
    };
  }
  if (norm.includes('pai') || norm.includes('agama') || norm.includes('islam') || norm.includes('fiqih') || norm.includes('aqidah') || norm.includes('quran') || norm.includes('hadits') || norm.includes('tahfizh')) {
    return {
      bg: '#F3E8FF',
      color: '#9333EA',
      icon: 'book-open-variant' as const,
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bg: '#FEF3C7',
      color: '#EA580C',
      icon: 'weather-sunny' as const,
    };
  }
  if (norm.includes('ips') || norm.includes('sosial') || norm.includes('sejarah') || norm.includes('geografi') || norm.includes('ekonomi')) {
    return {
      bg: '#E0E7FF',
      color: '#4F46E5',
      icon: 'earth' as const,
    };
  }
  if (norm.includes('seni') || norm.includes('sbk') || norm.includes('budaya') || norm.includes('musik')) {
    return {
      bg: '#FFE4E6',
      color: '#E11D48',
      icon: 'palette-outline' as const,
    };
  }
  if (norm.includes('penjas') || norm.includes('olahraga') || norm.includes('pjok')) {
    return {
      bg: '#CCFBF1',
      color: '#0D9488',
      icon: 'soccer' as const,
    };
  }
  return {
    bg: '#E6F4EA',
    color: '#059669',
    icon: 'book-open-variant' as const,
  };
};

// Dynamic Academic Year & Semester Calculation (Zero Hardcoding)
const getDynamicAcademicInfo = (schedule?: any): string => {
  const yearName =
    schedule?.academic_year?.name ||
    schedule?.academic_year?.tahun ||
    schedule?.kelas?.academic_year?.name ||
    schedule?.tahun_ajaran?.nama ||
    schedule?.tahun_ajaran;

  const rawSemester =
    schedule?.semester?.name ||
    schedule?.semester?.nama ||
    schedule?.semester;

  const semStr = rawSemester
    ? String(rawSemester).toLowerCase().includes('semester')
      ? String(rawSemester)
      : `Semester ${rawSemester}`
    : null;

  if (yearName && semStr) {
    return `${yearName} · ${semStr}`;
  }
  if (yearName) {
    return String(yearName);
  }

  // Fallback dynamically from system calendar date
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth() + 1; // 1 - 12
  const isGanjil = currentMonth >= 7 && currentMonth <= 12;
  const startYear = isGanjil ? currentYear : currentYear - 1;
  const endYear = startYear + 1;
  const dynamicSem = isGanjil ? 'Semester Ganjil' : 'Semester Genap';

  return `${startYear}/${endYear} · ${dynamicSem}`;
};

interface GradeRow {
  student_id: string;
  student_name: string;
  nis: string;
  nilai_tugas: string;
  nilai_kuis: string;
  nilai_uts: string;
  nilai_uas: string;
  nilai_akhir: string;
}

interface TeacherGradeWorkspaceProps {
  onBack?: () => void;
  initialTab?: 'grades' | 'analysis';
}

export default function TeacherGradeWorkspace({
  onBack,
  initialTab = 'grades',
}: TeacherGradeWorkspaceProps) {
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();

  // Scroll & Sticky Header Animation (Matching TeacherAssignmentWorkspace)
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

  // Subtabs: 'grades' (Daftar Nilai Santri) | 'analysis' (Rekap & Analisis KKM)
  const [activeTab, setActiveTab] = useState<'grades' | 'analysis'>(initialTab);

  // Loading, Refreshing, Saving states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [saving, setSaving] = useState<boolean>(false);

  // Schedules (classes & subjects assigned to this teacher)
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedScheduleId, setSelectedScheduleId] = useState<string>('');
  const [showFilterScheduleDropdown, setShowFilterScheduleDropdown] = useState<boolean>(false);

  // Grades table data
  const [gradeRows, setGradeRows] = useState<GradeRow[]>([]);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Editing Single Student Modal
  const [editingStudent, setEditingStudent] = useState<GradeRow | null>(null);
  const [editTugas, setEditTugas] = useState<string>('');
  const [editKuis, setEditKuis] = useState<string>('');
  const [editUts, setEditUts] = useState<string>('');
  const [editUas, setEditUas] = useState<string>('');

  // Feedback Notification Modal
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Current active schedule object
  const activeSchedule = useMemo(() => {
    return schedules.find((s) => String(s.id) === String(selectedScheduleId)) || schedules[0] || null;
  }, [schedules, selectedScheduleId]);

  // Current active KKM threshold (dynamically from schedule/subject or null)
  const activeKKM = useMemo(() => {
    const fromSchedule = activeSchedule?.kkm || activeSchedule?.subject?.kkm || activeSchedule?.passing_grade;
    return typeof fromSchedule === 'number' && fromSchedule > 0 ? fromSchedule : null;
  }, [activeSchedule]);

  // Current filter label display
  const currentFilterScheduleLabel = useMemo(() => {
    if (!activeSchedule) return 'Semua Rombel & Mapel';
    const cls = activeSchedule.kelas?.nama_kelas || activeSchedule.kelas?.name || activeSchedule.rombel || 'Kelas';
    const subj = activeSchedule.subject?.nama_mapel || activeSchedule.subject?.name || 'Mata Pelajaran';
    return `${cls} · ${subj}`;
  }, [activeSchedule]);

  // Dynamic Academic Year & Semester
  const academicInfo = useMemo(() => {
    return getDynamicAcademicInfo(activeSchedule);
  }, [activeSchedule]);

  // Load teacher schedules
  const loadSchedules = useCallback(async () => {
    try {
      const res = await mobileApiService.getTeacherSchedules();
      const list: any[] = unwrapCollection(res);
      setSchedules(list);
      if (list.length > 0 && !selectedScheduleId) {
        setSelectedScheduleId(String(list[0].id));
      }
      return list;
    } catch {
      return [];
    }
  }, [selectedScheduleId]);

  // Load students and their grades for selected schedule
  const loadClassGrades = useCallback(async (targetSchedule?: any) => {
    const sched = targetSchedule || activeSchedule;
    if (!sched) return;
    setLoading(true);
    try {
      const classId = sched.kelas_id || sched.class_id;
      const subjectId = sched.subject_id;

      // Fetch students for class and existing recorded grades
      const [studentsRes, existingGradesRes] = await Promise.allSettled([
        mobileApiService.getTeacherStudents({ class_id: classId, per_page: 100 }),
        mobileApiService.getTeacherGrades({ class_id: classId, subject_id: subjectId }),
      ]);

      const studentList: any[] = studentsRes.status === 'fulfilled' ? unwrapCollection(studentsRes.value) : [];
      const gradeList: any[] = existingGradesRes.status === 'fulfilled' ? unwrapCollection(existingGradesRes.value) : [];

      const gradeMap = new Map<string, any>();
      for (const g of gradeList) {
        const sid = String(g.student_id);
        gradeMap.set(sid, g);
      }

      const rows: GradeRow[] = studentList.map((st: any) => {
        const sid = String(st.id);
        const existing = gradeMap.get(sid) || {};
        const tugas = existing.score_assignment ?? existing.nilai_tugas ?? '';
        const kuis = existing.score_quiz ?? existing.nilai_kuis ?? '';
        const uts = existing.score_midterm ?? existing.nilai_uts ?? '';
        const uas = existing.score_final ?? existing.nilai_uas ?? '';
        const akhir = existing.final_score ?? existing.nilai_akhir ?? '';

        return {
          student_id: sid,
          student_name: st.nama_lengkap || st.full_name || st.name || 'Santri',
          nis: st.nis || st.nisn || st.nomor_induk || '-',
          nilai_tugas: tugas !== '' ? String(tugas) : '',
          nilai_kuis: kuis !== '' ? String(kuis) : '',
          nilai_uts: uts !== '' ? String(uts) : '',
          nilai_uas: uas !== '' ? String(uas) : '',
          nilai_akhir: akhir !== '' ? String(akhir) : '',
        };
      });

      setGradeRows(rows);
    } catch {
      setGradeRows([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeSchedule]);

  // Initial load
  useEffect(() => {
    let isMounted = true;
    const init = async () => {
      setLoading(true);
      try {
        const list = await loadSchedules();
        if (!isMounted) return;
        if (list.length > 0) {
          const firstSched = list[0];
          setSelectedScheduleId(String(firstSched.id));
          await loadClassGrades(firstSched);
        } else {
          setLoading(false);
        }
      } catch {
        if (isMounted) setLoading(false);
      }
    };
    void init();
    return () => {
      isMounted = false;
    };
  }, []); // Run once on mount

  // Refresh handler (Pull to refresh)
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      const list = await loadSchedules();
      const currentActive = list.find((s) => String(s.id) === String(selectedScheduleId)) || list[0];
      if (currentActive) {
        await loadClassGrades(currentActive);
      }
    } finally {
      setRefreshing(false);
    }
  }, [loadSchedules, selectedScheduleId, loadClassGrades]);

  // Switch schedule filter
  const handleSelectSchedule = (schedId: string) => {
    setSelectedScheduleId(schedId);
    setShowFilterScheduleDropdown(false);
    const target = schedules.find((s) => String(s.id) === String(schedId));
    if (target) {
      void loadClassGrades(target);
    }
  };

  // Helper calculate Akhir
  const calculateFinalScore = (tugas: string, kuis: string, uts: string, uas: string): string => {
    const t = parseFloat(tugas) || 0;
    const k = parseFloat(kuis) || 0;
    const ut = parseFloat(uts) || 0;
    const ua = parseFloat(uas) || 0;
    if (!tugas && !kuis && !uts && !uas) return '';
    const finalVal =
      Math.round(
        (t * GRADE_WEIGHTS.tugas +
          k * GRADE_WEIGHTS.kuis +
          ut * GRADE_WEIGHTS.uts +
          ua * GRADE_WEIGHTS.uas) *
          10
      ) / 10;
    return String(finalVal);
  };

  // Predicate helper
  const getScorePredicate = (scoreStr: string) => {
    const score = parseFloat(scoreStr);
    if (isNaN(score)) return { label: '-', color: '#64748B', bg: '#F1F5F9', border: '#CBD5E1' };
    if (score >= 90) return { label: 'A', color: '#047857', bg: '#ECFDF5', border: '#A7F3D0', desc: 'Sangat Baik' };
    if (score >= 80) return { label: 'B', color: '#2563EB', bg: '#EFF6FF', border: '#BFDBFE', desc: 'Baik' };
    if (score >= 70) return { label: 'C', color: '#D97706', bg: '#FEF3C7', border: '#FDE68A', desc: 'Cukup' };
    return { label: 'D', color: '#E11D48', bg: '#FFE4E6', border: '#FECDD3', desc: 'Perlu Bimbingan' };
  };

  // Open modal edit single student
  const openEditModal = (row: GradeRow) => {
    setEditingStudent(row);
    setEditTugas(row.nilai_tugas);
    setEditKuis(row.nilai_kuis);
    setEditUts(row.nilai_uts);
    setEditUas(row.nilai_uas);
  };

  // Apply single student edit
  const applySingleEdit = () => {
    if (!editingStudent) return;
    const finalScore = calculateFinalScore(editTugas, editKuis, editUts, editUas);
    setGradeRows((prev) =>
      prev.map((r) =>
        r.student_id === editingStudent.student_id
          ? {
              ...r,
              nilai_tugas: editTugas,
              nilai_kuis: editKuis,
              nilai_uts: editUts,
              nilai_uas: editUas,
              nilai_akhir: finalScore,
            }
          : r
      )
    );
    setEditingStudent(null);
  };

  // Save all grades to server
  const handleSaveAll = async () => {
    if (!activeSchedule) return;
    setSaving(true);
    try {
      const classId = activeSchedule.kelas_id || activeSchedule.class_id;
      const subjectId = activeSchedule.subject_id;

      const formattedGrades = gradeRows.map((r) => ({
        student_id: r.student_id,
        nilai_tugas: r.nilai_tugas !== '' ? parseFloat(r.nilai_tugas) : null,
        score_assignment: r.nilai_tugas !== '' ? parseFloat(r.nilai_tugas) : null,
        nilai_kuis: r.nilai_kuis !== '' ? parseFloat(r.nilai_kuis) : null,
        score_quiz: r.nilai_kuis !== '' ? parseFloat(r.nilai_kuis) : null,
        nilai_uts: r.nilai_uts !== '' ? parseFloat(r.nilai_uts) : null,
        score_midterm: r.nilai_uts !== '' ? parseFloat(r.nilai_uts) : null,
        nilai_uas: r.nilai_uas !== '' ? parseFloat(r.nilai_uas) : null,
        score_final: r.nilai_uas !== '' ? parseFloat(r.nilai_uas) : null,
        nilai_akhir: r.nilai_akhir !== '' ? parseFloat(r.nilai_akhir) : null,
        final_score: r.nilai_akhir !== '' ? parseFloat(r.nilai_akhir) : null,
      }));

      await mobileApiService.saveTeacherGrades({
        class_id: classId,
        subject_id: subjectId,
        grades: formattedGrades,
      });

      const className = activeSchedule.kelas?.nama_kelas || activeSchedule.kelas?.name || 'terpilih';
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Nilai Berhasil Disimpan! 📊',
        message: `Daftar nilai untuk ${gradeRows.length} santri kelas ${className} berhasil disimpan ke sistem rapor.`,
      });

      await loadClassGrades();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Nilai',
        message: getApiErrorMessage(err, 'Terjadi kendala saat menyimpan daftar nilai santri.'),
      });
    } finally {
      setSaving(false);
    }
  };

  // Filtered rows by search query
  const filteredRows = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return gradeRows;
    return gradeRows.filter(
      (r) => r.student_name.toLowerCase().includes(q) || r.nis.includes(q)
    );
  }, [gradeRows, searchQuery]);

  // Statistics Summary
  const stats = useMemo(() => {
    const scores = gradeRows
      .map((r) => parseFloat(r.nilai_akhir))
      .filter((s) => !isNaN(s));

    if (scores.length === 0) {
      return {
        avg: '-',
        passed: 0,
        failed: 0,
        total: gradeRows.length,
        passPercentage: 0,
        highest: '-',
        highestStudent: '-',
        lowest: '-',
        lowestStudent: '-',
        distA: 0,
        distB: 0,
        distC: 0,
        distD: 0,
      };
    }

    const sum = scores.reduce((a, b) => a + b, 0);
    const avg = (sum / scores.length).toFixed(1);
    const hasKKM = typeof activeKKM === 'number' && activeKKM > 0;
    const passed = hasKKM ? scores.filter((s) => s >= (activeKKM as number)).length : 0;
    const failed = hasKKM ? scores.length - passed : 0;
    const passPercentage = hasKKM && scores.length > 0 ? Math.round((passed / scores.length) * 100) : 0;

    let maxScore = -1;
    let maxStudent = '-';
    let minScore = 999;
    let minStudent = '-';

    let countA = 0;
    let countB = 0;
    let countC = 0;
    let countD = 0;

    for (const row of gradeRows) {
      const val = parseFloat(row.nilai_akhir);
      if (!isNaN(val)) {
        if (val > maxScore) {
          maxScore = val;
          maxStudent = row.student_name;
        }
        if (val < minScore) {
          minScore = val;
          minStudent = row.student_name;
        }
        if (val >= 90) countA++;
        else if (val >= 80) countB++;
        else if (val >= 70) countC++;
        else countD++;
      }
    }

    return {
      avg,
      passed,
      failed,
      total: gradeRows.length,
      passPercentage,
      highest: maxScore >= 0 ? String(maxScore) : '-',
      highestStudent: maxStudent,
      lowest: minScore <= 100 ? String(minScore) : '-',
      lowestStudent: minStudent,
      distA: countA,
      distB: countB,
      distC: countC,
      distD: countD,
    };
  }, [gradeRows, activeKKM]);

  return (
    <View style={styles.container}>
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
          colors={['#0D6B42', '#18A165', '#2BD988']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stickyDecorCircle1} />
        <View style={styles.stickyDecorCircle2} />

        {/* Baris Atas Sticky: Tombol Back, Judul & Mini Counter, Tombol Simpan */}
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
                Buku Nilai & Rapor
              </Text>
              <Text numberOfLines={1} style={styles.stickySubtitle}>
                {currentFilterScheduleLabel} · {gradeRows.length} Santri
              </Text>
            </View>
          </View>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleSaveAll}
            disabled={saving || gradeRows.length === 0}
            style={[styles.stickyCreateBtn, (saving || gradeRows.length === 0) && { opacity: 0.6 }]}
            accessibilityLabel="Simpan Nilai"
          >
            {saving ? (
              <ActivityIndicator size="small" color="#047857" />
            ) : (
              <>
                <MaterialCommunityIcons name="content-save" size={16} color="#047857" />
                <Text style={styles.stickyCreateBtnText}>Simpan</Text>
              </>
            )}
          </TouchableOpacity>
        </View>

        {/* Tab Switcher Sticky */}
        <View style={styles.stickyTabBarContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('grades')}
            style={[
              styles.stickyTabButton,
              activeTab === 'grades' && styles.stickyTabButtonActive,
            ]}
          >
            <MaterialCommunityIcons
              name="clipboard-text-outline"
              size={14}
              color={activeTab === 'grades' ? '#047857' : '#D1FAE5'}
              style={{ marginRight: 6 }}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.stickyTabButtonText,
                activeTab === 'grades' && styles.stickyTabButtonTextActive,
              ]}
            >
              Daftar Nilai ({gradeRows.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setActiveTab('analysis')}
            style={[
              styles.stickyTabButton,
              activeTab === 'analysis' && styles.stickyTabButtonActive,
            ]}
          >
            <MaterialCommunityIcons
              name="chart-box-outline"
              size={14}
              color={activeTab === 'analysis' ? '#047857' : '#D1FAE5'}
              style={{ marginRight: 6 }}
            />
            <Text
              numberOfLines={1}
              style={[
                styles.stickyTabButtonText,
                activeTab === 'analysis' && styles.stickyTabButtonTextActive,
              ]}
            >
              Rekap & Analisis
            </Text>
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* ── 2. SCROLLVIEW UTAMA ── */}
      <Animated.ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.mainScrollContent,
          { paddingBottom: Math.max(insets.bottom + 80, 100) },
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
          <LinearGradient
            colors={['#047857', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
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
                <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
              </TouchableOpacity>
            )}
            <View style={styles.staticTitleCol}>
              <Text numberOfLines={1} style={styles.staticTitle}>
                Buku Nilai & Rapor Santri
              </Text>
              <Text numberOfLines={1} style={styles.staticSubtitle}>
                Kelola asesmen formatif, sumatif, dan capaian kompetensi santri
              </Text>
            </View>
          </View>
        </View>

        {/* 2b. Badan Halaman Konten (Body) */}
        <View style={styles.bodyContentWrapper}>
          {/* 3 KPI Multi-Cards Row (Harmonisasi Baseline Presensi) */}
          <View style={styles.kpiCardsRow}>
            {/* Card 1: Rata-Rata Kelas */}
            <View style={[styles.kpiBox, { borderColor: 'rgba(5, 150, 105, 0.22)' }]}>
              <LinearGradient colors={['#FFFFFF', '#ECFDF5']} style={styles.kpiBoxGradient}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconSquare, { backgroundColor: '#059669' }]}>
                    <MaterialCommunityIcons name="chart-line" size={14} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiVal, { color: '#059669' }]}>{stats.avg}</Text>
                </View>
                <Text style={[styles.kpiLbl, { color: '#059669' }]} numberOfLines={1}>Rata-Rata</Text>
                <Text style={styles.kpiSub} numberOfLines={1}>Nilai Kelas</Text>
              </LinearGradient>
            </View>

            {/* Card 2: Tuntas KKM */}
            <View style={[styles.kpiBox, { borderColor: 'rgba(37, 99, 235, 0.18)' }]}>
              <LinearGradient colors={['#FFFFFF', '#EFF6FF']} style={styles.kpiBoxGradient}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconSquare, { backgroundColor: '#2563EB' }]}>
                    <MaterialCommunityIcons name="check-decagram" size={14} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiVal, { color: '#2563EB' }]}>
                    {activeKKM !== null ? stats.passed : '-'}
                    {activeKKM !== null && (
                      <Text style={{ fontSize: 11, fontWeight: '700', color: '#60A5FA' }}>/{stats.total}</Text>
                    )}
                  </Text>
                </View>
                <Text style={[styles.kpiLbl, { color: '#2563EB' }]} numberOfLines={1}>
                  {activeKKM !== null ? `Tuntas KKM (${activeKKM})` : 'Standar KKM: -'}
                </Text>
                <Text style={styles.kpiSub} numberOfLines={1}>
                  {activeKKM !== null ? `${stats.passPercentage}% Tuntas` : 'KKM Belum Ditetapkan'}
                </Text>
              </LinearGradient>
            </View>

            {/* Card 3: Total Santri */}
            <View style={[styles.kpiBox, { borderColor: 'rgba(217, 119, 6, 0.22)' }]}>
              <LinearGradient colors={['#FFFFFF', '#FFFBEB']} style={styles.kpiBoxGradient}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconSquare, { backgroundColor: '#D97706' }]}>
                    <MaterialCommunityIcons name="account-group" size={14} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiVal, { color: '#D97706' }]}>{stats.total}</Text>
                </View>
                <Text style={[styles.kpiLbl, { color: '#D97706' }]} numberOfLines={1}>Total Santri</Text>
                <Text style={styles.kpiSub} numberOfLines={1}>Rombel Aktif</Text>
              </LinearGradient>
            </View>
          </View>

          {/* Tab Selector di Bodi (Daftar Nilai vs Rekap & Analisis) */}
          <View style={styles.bodyTabBarContainer}>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('grades')}
              style={[
                styles.bodyTabButton,
                activeTab === 'grades' && styles.bodyTabButtonActive,
              ]}
            >
              <MaterialCommunityIcons
                name="clipboard-text-outline"
                size={16}
                color={activeTab === 'grades' ? '#047857' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.bodyTabButtonText,
                  activeTab === 'grades' && styles.bodyTabButtonTextActive,
                ]}
              >
                Daftar Nilai ({gradeRows.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setActiveTab('analysis')}
              style={[
                styles.bodyTabButton,
                activeTab === 'analysis' && styles.bodyTabButtonActive,
              ]}
            >
              <MaterialCommunityIcons
                name="chart-box-outline"
                size={16}
                color={activeTab === 'analysis' ? '#047857' : '#64748B'}
                style={{ marginRight: 6 }}
              />
              <Text
                numberOfLines={1}
                style={[
                  styles.bodyTabButtonText,
                  activeTab === 'analysis' && styles.bodyTabButtonTextActive,
                ]}
              >
                Rekap & Analisis
              </Text>
            </TouchableOpacity>
          </View>

          {/* Filter Section: Pencarian, Tombol Simpan, dan Dropdown Rombel & Mapel */}
          <View style={styles.filterSection}>
            <View style={styles.searchRow}>
              <View style={styles.searchBar}>
                <MaterialCommunityIcons name="magnify" size={20} color="#64748B" style={{ marginRight: 8 }} />
                <TextInput
                  placeholder="Cari santri berdasarkan nama atau NIS..."
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

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleSaveAll}
                disabled={saving || gradeRows.length === 0}
                style={[styles.createTaskBtn, (saving || gradeRows.length === 0) && { opacity: 0.6 }]}
              >
                {saving ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save" size={18} color="#FFFFFF" />
                    <Text style={styles.createTaskBtnText}>Simpan</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Dropdown Pemilihan Rombel & Mapel Filter (Pop-up Modal, Bukan Expand) */}
            {schedules.length > 0 && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setShowFilterScheduleDropdown(true)}
                style={styles.filterDropdownTrigger}
              >
                <View style={styles.filterDropdownTriggerLeft}>
                  <View style={styles.dropdownIconCircle}>
                    <MaterialCommunityIcons
                      name="google-classroom"
                      size={16}
                      color="#047857"
                    />
                  </View>
                  <View style={styles.dropdownLabelCol}>
                    <Text style={styles.dropdownSubLabel}>Rombel & Mata Pelajaran</Text>
                    <Text style={styles.dropdownMainLabel} numberOfLines={1}>
                      {currentFilterScheduleLabel}
                    </Text>
                  </View>
                </View>
                <MaterialCommunityIcons
                  name="chevron-down"
                  size={20}
                  color="#047857"
                />
              </TouchableOpacity>
            )}

            {/* Dynamic Academic Year & Semester Pill */}
            <View style={styles.academicInfoPill}>
              <MaterialCommunityIcons name="calendar-range" size={13} color="#059669" />
              <Text style={styles.academicInfoText}>Tahun Ajaran: {academicInfo}</Text>
            </View>
          </View>

          {/* List Card Data Berdasarkan Tab Aktif */}
          {loading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Memuat buku nilai dan data santri...</Text>
            </View>
          ) : activeTab === 'grades' ? (
            filteredRows.length === 0 ? (
              <EmptyStateCard
                icon="clipboard-text-off-outline"
                title="Tidak Ada Data Santri"
                description={
                  searchQuery
                    ? `Tidak ditemukan santri dengan kata kunci "${searchQuery}".`
                    : 'Pilih rombel dan jadwal mengajar lain untuk menampilkan data santri.'
                }
              />
            ) : (
              filteredRows.map((row, index) => {
                const akhirNum = parseFloat(row.nilai_akhir);
                const hasKKM = typeof activeKKM === 'number' && activeKKM > 0;
                const isPassed = hasKKM && !isNaN(akhirNum) && akhirNum >= (activeKKM as number);
                const predicate = getScorePredicate(row.nilai_akhir);

                return (
                  <View key={row.student_id} style={styles.studentCard}>
                    {/* Header Card */}
                    <View style={styles.cardHeader}>
                      <View style={styles.indexCircle}>
                        <Text style={styles.indexText}>{index + 1}</Text>
                      </View>
                      <View style={styles.studentMeta}>
                        <Text style={styles.studentName} numberOfLines={1}>
                          {row.student_name}
                        </Text>
                        <Text style={styles.studentNis}>NIS: {row.nis}</Text>
                      </View>

                      {/* Predicate Badge */}
                      {row.nilai_akhir !== '' && (
                        <View
                          style={[
                            styles.predicateBadge,
                            { backgroundColor: predicate.bg, borderColor: predicate.border },
                          ]}
                        >
                          <Text style={[styles.predicateText, { color: predicate.color }]}>
                            {predicate.label}
                          </Text>
                        </View>
                      )}

                      {/* Edit Button */}
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => openEditModal(row)}
                        style={styles.editBtn}
                        accessibilityLabel="Edit Nilai"
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={15} color="#0E5C44" />
                        <Text style={styles.editBtnText}>Edit</Text>
                      </TouchableOpacity>
                    </View>

                    {/* Score Grid: Tugas 20%, Kuis 20%, UTS 30%, UAS 30%, Nilai Akhir */}
                    <View style={styles.scoreGrid}>
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreLabel}>Tugas (20%)</Text>
                        <Text style={styles.scoreVal}>{row.nilai_tugas || '-'}</Text>
                      </View>
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreLabel}>Kuis (20%)</Text>
                        <Text style={styles.scoreVal}>{row.nilai_kuis || '-'}</Text>
                      </View>
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreLabel}>UTS (30%)</Text>
                        <Text style={styles.scoreVal}>{row.nilai_uts || '-'}</Text>
                      </View>
                      <View style={styles.scoreBox}>
                        <Text style={styles.scoreLabel}>UAS (30%)</Text>
                        <Text style={styles.scoreVal}>{row.nilai_uas || '-'}</Text>
                      </View>
                      <View style={[styles.scoreBox, styles.finalScoreBox]}>
                        <Text style={[styles.scoreLabel, { color: '#047857', fontWeight: '800' }]}>
                          Akhir
                        </Text>
                        <Text style={[styles.scoreVal, { color: '#064E3B', fontWeight: '900' }]}>
                          {row.nilai_akhir || '-'}
                        </Text>
                      </View>
                    </View>

                    {/* Card Footer Status */}
                    <View style={styles.cardFooter}>
                      {row.nilai_akhir !== '' ? (
                        hasKKM ? (
                          <View
                            style={[
                              styles.kkmPill,
                              isPassed ? styles.kkmPillPassed : styles.kkmPillRemedial,
                            ]}
                          >
                            <MaterialCommunityIcons
                              name={isPassed ? 'check-circle' : 'alert-circle'}
                              size={12}
                              color={isPassed ? '#047857' : '#E11D48'}
                            />
                            <Text
                              style={[
                                styles.kkmPillText,
                                { color: isPassed ? '#047857' : '#E11D48' },
                              ]}
                            >
                              {isPassed ? `Tuntas (KKM ${activeKKM})` : `Perlu Remedial (< ${activeKKM})`}
                            </Text>
                          </View>
                        ) : (
                          <View style={styles.kkmPillEmpty}>
                            <MaterialCommunityIcons name="information-outline" size={12} color="#64748B" />
                            <Text style={styles.kkmPillEmptyText}>KKM: -</Text>
                          </View>
                        )
                      ) : (
                        <View style={styles.kkmPillEmpty}>
                          <MaterialCommunityIcons name="clock-outline" size={12} color="#64748B" />
                          <Text style={styles.kkmPillEmptyText}>Belum Ada Nilai</Text>
                        </View>
                      )}

                      <Text style={styles.tapEditHint}>Ketuk Edit untuk input nilai</Text>
                    </View>
                  </View>
                );
              })
            )
          ) : (
            /* TAB 2: REKAPITULASI & ANALISIS KETUNTASAN */
            <View style={styles.analysisContainer}>
              {/* Card Ketuntasan Belajar */}
              <View style={styles.analysisCard}>
                <View style={styles.analysisCardHeader}>
                  <View style={styles.analysisIconBadge}>
                    <MaterialCommunityIcons name="chart-donut" size={18} color="#047857" />
                  </View>
                  <View>
                    <Text style={styles.analysisCardTitle}>Ketuntasan Belajar Santri</Text>
                    <Text style={styles.analysisCardSubtitle}>
                      Standar KKM: {activeKKM !== null ? activeKKM : '-'} · {currentFilterScheduleLabel}
                    </Text>
                  </View>
                </View>

                {/* Progress Bar Ketuntasan */}
                <View style={styles.progressBarWrapper}>
                  <View style={styles.progressBarBg}>
                    <View
                      style={[
                        styles.progressBarFill,
                        { width: `${Math.min(stats.passPercentage, 100)}%` },
                      ]}
                    />
                  </View>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressPercentText}>
                      {activeKKM !== null ? `${stats.passPercentage}% Tuntas` : 'KKM belum ditetapkan'}
                    </Text>
                    <Text style={styles.progressRatioText}>
                      {activeKKM !== null ? `${stats.passed} dari ${stats.total} santri` : `${stats.total} santri terdaftar`}
                    </Text>
                  </View>
                </View>

                {/* 2 Summary Mini Cards */}
                <View style={styles.twoColRow}>
                  <View style={[styles.miniStatBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                    <MaterialCommunityIcons name="check-circle-outline" size={20} color="#047857" />
                    <Text style={[styles.miniStatVal, { color: '#047857' }]}>{activeKKM !== null ? stats.passed : '-'}</Text>
                    <Text style={styles.miniStatLbl}>Santri Tuntas</Text>
                  </View>

                  <View style={[styles.miniStatBox, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#E11D48" />
                    <Text style={[styles.miniStatVal, { color: '#E11D48' }]}>{activeKKM !== null ? stats.failed : '-'}</Text>
                    <Text style={styles.miniStatLbl}>Perlu Bimbingan</Text>
                  </View>
                </View>
              </View>

              {/* Distribusi Predikat (A, B, C, D) */}
              <View style={styles.analysisCard}>
                <View style={styles.analysisCardHeader}>
                  <View style={[styles.analysisIconBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                    <MaterialCommunityIcons name="medal-outline" size={18} color="#2563EB" />
                  </View>
                  <View>
                    <Text style={styles.analysisCardTitle}>Distribusi Predikat Nilai</Text>
                    <Text style={styles.analysisCardSubtitle}>Sebaran capaian kompetensi seluruh santri</Text>
                  </View>
                </View>

                <View style={styles.predicateGrid}>
                  {/* Predikat A */}
                  <View style={[styles.predicateColCard, { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' }]}>
                    <View style={[styles.badgePill, { backgroundColor: '#ECFDF5' }]}>
                      <Text style={[styles.badgePillText, { color: '#047857' }]}>A (≥ 90)</Text>
                    </View>
                    <Text style={[styles.predicateCount, { color: '#047857' }]}>{stats.distA}</Text>
                    <Text style={styles.predicateDesc}>Sangat Baik</Text>
                  </View>

                  {/* Predikat B */}
                  <View style={[styles.predicateColCard, { borderColor: '#BFDBFE', backgroundColor: '#F8FAFC' }]}>
                    <View style={[styles.badgePill, { backgroundColor: '#EFF6FF' }]}>
                      <Text style={[styles.badgePillText, { color: '#2563EB' }]}>B (80-89)</Text>
                    </View>
                    <Text style={[styles.predicateCount, { color: '#2563EB' }]}>{stats.distB}</Text>
                    <Text style={styles.predicateDesc}>Baik</Text>
                  </View>

                  {/* Predikat C */}
                  <View style={[styles.predicateColCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}>
                    <View style={[styles.badgePill, { backgroundColor: '#FEF3C7' }]}>
                      <Text style={[styles.badgePillText, { color: '#D97706' }]}>C (70-79)</Text>
                    </View>
                    <Text style={[styles.predicateCount, { color: '#D97706' }]}>{stats.distC}</Text>
                    <Text style={styles.predicateDesc}>Cukup</Text>
                  </View>

                  {/* Predikat D */}
                  <View style={[styles.predicateColCard, { borderColor: '#FECDD3', backgroundColor: '#FFF1F2' }]}>
                    <View style={[styles.badgePill, { backgroundColor: '#FFE4E6' }]}>
                      <Text style={[styles.badgePillText, { color: '#E11D48' }]}>D (&lt; 70)</Text>
                    </View>
                    <Text style={[styles.predicateCount, { color: '#E11D48' }]}>{stats.distD}</Text>
                    <Text style={styles.predicateDesc}>Bimbingan</Text>
                  </View>
                </View>
              </View>

              {/* Rekap Nilai Ekstrem (Tertinggi & Terendah) */}
              <View style={styles.analysisCard}>
                <View style={styles.analysisCardHeader}>
                  <View style={[styles.analysisIconBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                    <MaterialCommunityIcons name="trophy-outline" size={18} color="#D97706" />
                  </View>
                  <View>
                    <Text style={styles.analysisCardTitle}>Capaian Ekstrem Kelas</Text>
                    <Text style={styles.analysisCardSubtitle}>Nilai tertinggi & terendah santri</Text>
                  </View>
                </View>

                <View style={styles.extremesRow}>
                  <View style={styles.extremeItem}>
                    <Text style={styles.extremeLabel}>NILAI TERTINGGI</Text>
                    <Text style={[styles.extremeValue, { color: '#047857' }]}>{stats.highest}</Text>
                    <Text numberOfLines={1} style={styles.extremeStudentName}>
                      {stats.highestStudent}
                    </Text>
                  </View>

                  <View style={styles.extremeDivider} />

                  <View style={styles.extremeItem}>
                    <Text style={styles.extremeLabel}>NILAI TERENDAH</Text>
                    <Text style={[styles.extremeValue, { color: '#E11D48' }]}>{stats.lowest}</Text>
                    <Text numberOfLines={1} style={styles.extremeStudentName}>
                      {stats.lowestStudent}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Informasi Bobot Asesmen */}
              <View style={styles.infoWeightCard}>
                <MaterialCommunityIcons name="information-outline" size={20} color="#059669" style={{ marginRight: 10 }} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.infoWeightTitle}>Formula Pembobotan Rapor</Text>
                  <Text style={styles.infoWeightText}>
                    Nilai Akhir = (Tugas × 20%) + (Kuis × 20%) + (PTS/UTS × 30%) + (PAS/UAS × 30%).
                  </Text>
                </View>
              </View>
            </View>
          )}
        </View>
      </Animated.ScrollView>

      {/* ── 3. MODAL POP-UP PICKER JADWAL/ROMBEL (Matching TeacherAssignmentWorkspace) ── */}
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
                  <Text style={styles.pickerModalSubtitle}>Filter jadwal buku nilai guru</Text>
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
              {schedules.map((sch) => {
                const isSelected = String(sch.id) === String(selectedScheduleId);
                const clsName = sch.kelas?.nama_kelas || sch.kelas?.name || sch.rombel || 'Kelas';
                const mapelName = sch.subject?.nama_mapel || sch.subject?.name || 'Mata Pelajaran';
                const subjStyle = getSubjectStyle(mapelName);

                return (
                  <TouchableOpacity
                    key={String(sch.id)}
                    activeOpacity={0.75}
                    onPress={() => handleSelectSchedule(String(sch.id))}
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
                        <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 3 }}>
                          <View
                            style={[
                              styles.miniSubjectBadge,
                              { backgroundColor: subjStyle.bg },
                            ]}
                          >
                            <Text
                              style={[
                                styles.miniSubjectBadgeText,
                                { color: subjStyle.color },
                              ]}
                              numberOfLines={1}
                            >
                              {mapelName}
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                    {isSelected && (
                      <View style={styles.activeCheckBadge}>
                        <Text style={styles.activeCheckBadgeText}>Aktif</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </TouchableOpacity>
        </TouchableOpacity>
      </Modal>

      {/* ── 4. MODAL EDIT SINGLE STUDENT ── */}
      <Modal
        visible={Boolean(editingStudent)}
        animationType="slide"
        transparent
        onRequestClose={() => setEditingStudent(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            {/* Header Modal */}
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={styles.modalTitle}>Input Nilai Santri</Text>
                <Text style={styles.modalSub} numberOfLines={1}>
                  {editingStudent?.student_name} (NIS: {editingStudent?.nis})
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setEditingStudent(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#475569" />
              </TouchableOpacity>
            </View>

            {/* Form Inputs Grid (Tugas, Kuis, UTS, UAS) */}
            <View style={styles.modalInputsRow}>
              <View style={styles.modalInputCol}>
                <Text style={styles.modalInputLabel}>Tugas (Bobot 20%)</Text>
                <TextInput
                  keyboardType="numeric"
                  value={editTugas}
                  onChangeText={setEditTugas}
                  placeholder="0 - 100"
                  placeholderTextColor="#94A3B8"
                  style={styles.modalInputBox}
                />
              </View>

              <View style={styles.modalInputCol}>
                <Text style={styles.modalInputLabel}>Kuis (Bobot 20%)</Text>
                <TextInput
                  keyboardType="numeric"
                  value={editKuis}
                  onChangeText={setEditKuis}
                  placeholder="0 - 100"
                  placeholderTextColor="#94A3B8"
                  style={styles.modalInputBox}
                />
              </View>
            </View>

            <View style={styles.modalInputsRow}>
              <View style={styles.modalInputCol}>
                <Text style={styles.modalInputLabel}>UTS / PTS (Bobot 30%)</Text>
                <TextInput
                  keyboardType="numeric"
                  value={editUts}
                  onChangeText={setEditUts}
                  placeholder="0 - 100"
                  placeholderTextColor="#94A3B8"
                  style={styles.modalInputBox}
                />
              </View>

              <View style={styles.modalInputCol}>
                <Text style={styles.modalInputLabel}>UAS / PAS (Bobot 30%)</Text>
                <TextInput
                  keyboardType="numeric"
                  value={editUas}
                  onChangeText={setEditUas}
                  placeholder="0 - 100"
                  placeholderTextColor="#94A3B8"
                  style={styles.modalInputBox}
                />
              </View>
            </View>

            {/* Quick Score Preset Buttons */}
            <View style={styles.quickPresetRow}>
              <Text style={styles.quickPresetLabel}>Preset Cepat:</Text>
              {['75', '80', '85', '90', '100'].map((preset) => (
                <TouchableOpacity
                  key={preset}
                  onPress={() => {
                    if (!editTugas) setEditTugas(preset);
                    else if (!editKuis) setEditKuis(preset);
                    else if (!editUts) setEditUts(preset);
                    else if (!editUas) setEditUas(preset);
                  }}
                  style={styles.quickPresetChip}
                >
                  <Text style={styles.quickPresetChipText}>{preset}</Text>
                </TouchableOpacity>
              ))}
            </View>

            {/* Live Calculated Final Score & Predicate */}
            {(() => {
              const estimatedAkhir = calculateFinalScore(editTugas, editKuis, editUts, editUas);
              const pred = getScorePredicate(estimatedAkhir);
              return (
                <View style={styles.previewBox}>
                  <View>
                    <Text style={styles.previewLabel}>Estimasi Nilai Akhir</Text>
                    <Text style={styles.previewSub}>
                      {pred.label !== '-' ? `Predikat ${pred.label} (${pred.desc})` : 'Kalkulasi otomatis'}
                    </Text>
                  </View>
                  <View style={styles.previewScorePill}>
                    <Text style={styles.previewValue}>{estimatedAkhir || '-'}</Text>
                  </View>
                </View>
              );
            })()}

            {/* Actions */}
            <View style={styles.modalActions}>
              <TouchableOpacity
                onPress={() => setEditingStudent(null)}
                style={styles.cancelBtn}
              >
                <Text style={styles.cancelBtnText}>Batal</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={applySingleEdit}
                style={styles.applyBtn}
              >
                <Text style={styles.applyBtnText}>Terapkan Nilai</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── 5. FEEDBACK MODAL ── */}
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
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  // ── Sticky Header Styles (Matching TeacherAssignmentWorkspace) ──
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 8,
  },
  stickyDecorCircle1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  stickyDecorCircle2: {
    position: 'absolute',
    bottom: -15,
    left: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
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
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius: 2,
  },
  stickyTitleTextCol: {
    flex: 1,
  },
  stickyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stickySubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#A7F3D0',
    marginTop: 1,
  },
  stickyCreateBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
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
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    borderRadius: 12,
    padding: 3,
    gap: 4,
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
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  stickyTabButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#D1FAE5',
  },
  stickyTabButtonTextActive: {
    color: '#047857',
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
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    overflow: 'hidden',
    elevation: 4,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
  },
  staticDecorCircle1: {
    position: 'absolute',
    top: -25,
    right: -25,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  staticDecorCircle2: {
    position: 'absolute',
    bottom: -35,
    left: 20,
    width: 110,
    height: 110,
    borderRadius: 55,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  staticTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  staticSquircleBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  staticTitleCol: {
    flex: 1,
  },
  staticTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  staticSubtitle: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#D1FAE5',
    marginTop: 2,
  },

  // ── Body Content Wrapper ──
  bodyContentWrapper: {
    paddingHorizontal: 14,
    paddingTop: 12,
  },

  // ── 3 KPI Cards Row (Harmonisasi Baseline Presensi) ──
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.2,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
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

  // ── Body Tab Bar Switcher ──
  bodyTabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 16,
    padding: 4,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    gap: 4,
  },
  bodyTabButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    paddingHorizontal: 8,
    borderRadius: 12,
  },
  bodyTabButtonActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
  },
  bodyTabButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  bodyTabButtonTextActive: {
    color: '#047857',
    fontWeight: '900',
  },

  // ── Filter Section ──
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
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 44,
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
    paddingHorizontal: 14,
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
    borderColor: '#E2E8F0',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
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
  academicInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    marginTop: 6,
    gap: 6,
    alignSelf: 'flex-start',
  },
  academicInfoText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },

  // ── Loading & Empty ──
  loadingContainer: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 10,
  },

  // ── Student Card (TAB 1) ──
  studentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 13,
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  indexCircle: {
    width: 28,
    height: 28,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  indexText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  studentMeta: {
    flex: 1,
    marginRight: 8,
  },
  studentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentNis: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  predicateBadge: {
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    marginRight: 6,
  },
  predicateText: {
    fontSize: 11,
    fontWeight: '900',
  },
  editBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
    gap: 3,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  editBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0E5C44',
  },
  scoreGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 8,
    gap: 6,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  scoreBox: {
    flex: 1,
    alignItems: 'center',
  },
  finalScoreBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 2,
  },
  scoreLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
  },
  scoreVal: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  kkmPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  kkmPillPassed: {
    backgroundColor: '#ECFDF5',
  },
  kkmPillRemedial: {
    backgroundColor: '#FFF1F2',
  },
  kkmPillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  kkmPillEmpty: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  kkmPillEmptyText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
  },
  tapEditHint: {
    fontSize: 10,
    color: '#94A3B8',
    fontStyle: 'italic',
  },

  // ── TAB 2: REKAPITULASI & ANALISIS ──
  analysisContainer: {
    gap: 12,
  },
  analysisCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 15,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  analysisCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  analysisIconBadge: {
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
  analysisCardTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  analysisCardSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  progressBarWrapper: {
    marginBottom: 12,
  },
  progressBarBg: {
    height: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 5,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 5,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  progressPercentText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  progressRatioText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  twoColRow: {
    flexDirection: 'row',
    gap: 10,
  },
  miniStatBox: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
  },
  miniStatVal: {
    fontSize: 18,
    fontWeight: '900',
    marginTop: 4,
  },
  miniStatLbl: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  predicateGrid: {
    flexDirection: 'row',
    gap: 8,
  },
  predicateColCard: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  badgePill: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  badgePillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  predicateCount: {
    fontSize: 16,
    fontWeight: '900',
    marginTop: 6,
  },
  predicateDesc: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  extremesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  extremeItem: {
    flex: 1,
    alignItems: 'center',
  },
  extremeLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  extremeValue: {
    fontSize: 22,
    fontWeight: '900',
    marginTop: 2,
  },
  extremeStudentName: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#334155',
    marginTop: 2,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  extremeDivider: {
    width: 1,
    height: 38,
    backgroundColor: '#CBD5E1',
  },
  infoWeightCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 12,
  },
  infoWeightTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
  },
  infoWeightText: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
    lineHeight: 15,
  },

  // ── Picker Modal Styles (Pop-up Dropdown) ──
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
    borderColor: '#E2E8F0',
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
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
    flex: 1,
    marginRight: 10,
  },
  pickerHeaderIconBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  pickerModalTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  pickerCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pickerModalScroll: {
    maxHeight: 320,
  },
  pickerOptionItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 12,
    marginBottom: 6,
    borderWidth: 1,
    borderColor: 'transparent',
    backgroundColor: '#F8FAFC',
  },
  pickerOptionItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  pickerOptionLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  pickerOptionText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  pickerOptionTextActive: {
    color: '#047857',
    fontWeight: '800',
  },
  miniSubjectBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  miniSubjectBadgeText: {
    fontSize: 10,
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

  // ── Modal Edit Student ──
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 18,
    paddingBottom: Platform.OS === 'ios' ? 36 : 24,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSub: {
    fontSize: 12,
    color: '#64748B',
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
  modalInputsRow: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
  },
  modalInputCol: {
    flex: 1,
  },
  modalInputLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  modalInputBox: {
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 9,
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    backgroundColor: '#F8FAFC',
    textAlign: 'center',
  },
  quickPresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 12,
    marginTop: 2,
  },
  quickPresetLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  quickPresetChip: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  quickPresetChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  previewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    padding: 12,
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  previewLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  previewSub: {
    fontSize: 10.5,
    color: '#059669',
    marginTop: 2,
  },
  previewScorePill: {
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  previewValue: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  modalActions: {
    flexDirection: 'row',
    gap: 10,
  },
  cancelBtn: {
    flex: 1,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  applyBtn: {
    flex: 1.5,
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  applyBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
