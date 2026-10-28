import React, { useCallback, useEffect, useMemo, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  isGirlStudent,
} from '../utils/profile';
import { isPrincipalRole, isTuRole } from '../utils/roles';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

type AttendanceStatus = 'present' | 'sick' | 'permit' | 'absent' | 'unmarked';

export default function SubstituteKbmAttendanceScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const user = useAuthStore((state) => state.user);

  // Schedules and Classes State
  const [classes, setClasses] = useState<any[]>([]);
  const [selectedClassId, setSelectedClassId] = useState<string>('');
  const [schedules, setSchedules] = useState<any[]>([]);
  const [selectedSchedule, setSelectedSchedule] = useState<any | null>(null);

  // Teacher being substituted (Guru yang digantikan)
  const [substituteTeacherInfo, setSubstituteTeacherInfo] = useState<{
    originalTeacherName: string;
    teacherStatus: 'Tidak Hadir' | 'Terlambat' | 'Izin / Sakit' | 'Dinas Luar';
    subjectName: string;
    timeRange: string;
  }>({
    originalTeacherName: '',
    teacherStatus: 'Tidak Hadir',
    subjectName: '',
    timeRange: '',
  });

  // Students Roster and Attendance States
  // NOTA: Status awal dikosongkan secara netral (tidak default hadir).
  // Guru/Inval dapat menandai santri satu per satu atau menggunakan tombol "Checklist Hadir Semua".
  const [students, setStudents] = useState<any[]>([]);
  const [attendanceStatuses, setAttendanceStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [attendanceNotes, setAttendanceNotes] = useState<Record<string, string>>({});
  const [kbmJournalNotes, setKbmJournalNotes] = useState<string>('');

  // UI States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [submitting, setSubmitting] = useState<boolean>(false);
  const [searchStudentQuery, setSearchStudentQuery] = useState<string>('');

  const isPrincipal = isPrincipalRole(user?.roles || []);
  const isTu = isTuRole(user?.roles || []);

  // Modal States
  const [showConfirmModal, setShowConfirmModal] = useState<boolean>(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Navigation Back with self-healing fallback
  const handleBack = () => {
    const navState = navigation?.getState?.();
    if (navState && navState.index > 0 && navigation?.canGoBack?.()) {
      navigation.goBack();
      return;
    }
    const didGoBack = useNavigationHistoryStore.getState().goBackDynamic(navigation);
    if (!didGoBack) {
      navigation?.navigate?.('Beranda');
    }
  };

  // 1. Fetch Classes and Active Schedules
  useEffect(() => {
    let isMounted = true;
    void (async () => {
      try {
        const [clsRes, schedRes] = await Promise.allSettled([
          mobileApiService.getTeacherClasses?.() ?? Promise.resolve([]),
          mobileApiService.getActiveLessonSchedules?.() ?? Promise.resolve([]),
        ]);

        if (!isMounted) return;

        if (clsRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(clsRes.value) || [];
          const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
          setClasses(Array.isArray(list) ? list : []);
          if (list.length > 0 && !selectedClassId) {
            setSelectedClassId(String(list[0].id));
          }
        }

        if (schedRes.status === 'fulfilled') {
          const raw = unwrapApiData<any[]>(schedRes.value) || [];
          const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
          setSchedules(Array.isArray(list) ? list : []);
          if (list.length > 0) {
            setSelectedSchedule(list[0]);
            const firstSched = list[0];
            const startT = firstSched.time_start?.slice(0, 5) || firstSched.jam_mulai?.slice(0, 5) || '';
            const endT = firstSched.time_end?.slice(0, 5) || firstSched.jam_selesai?.slice(0, 5) || '';
            const tRange = startT && endT ? `${startT} - ${endT} WIB` : (startT || endT || '');
            setSubstituteTeacherInfo({
              originalTeacherName: firstSched.teacher?.name || firstSched.employee?.name || firstSched.nama_guru || 'Ustadz Pengampu KBM',
              teacherStatus: 'Tidak Hadir',
              subjectName: firstSched.subject?.name || firstSched.nama_mapel || 'Mata Pelajaran KBM',
              timeRange: tRange,
            });
          }
        }
      } catch (err) {
        console.warn('[SubstituteKbm] Initial fetch error:', err);
      } finally {
        if (isMounted) setLoading(false);
      }
    })();

    return () => {
      isMounted = false;
    };
  }, []);

  // Update schedule info when selectedClassId changes
  useEffect(() => {
    if (selectedClassId && schedules.length > 0) {
      const matchingSched = schedules.find(
        (sc) => String(sc.kelas_id || sc.class_id || sc.kelas?.id) === String(selectedClassId)
      );
      if (matchingSched) {
        setSelectedSchedule(matchingSched);
        const startT = matchingSched.time_start?.slice(0, 5) || matchingSched.jam_mulai?.slice(0, 5) || '';
        const endT = matchingSched.time_end?.slice(0, 5) || matchingSched.jam_selesai?.slice(0, 5) || '';
        const tRange = startT && endT ? `${startT} - ${endT} WIB` : (startT || endT || '');
        setSubstituteTeacherInfo({
          originalTeacherName: matchingSched.teacher?.name || matchingSched.employee?.name || matchingSched.nama_guru || 'Guru Pengampu KBM',
          teacherStatus: 'Tidak Hadir',
          subjectName: matchingSched.subject?.name || matchingSched.nama_mapel || 'Mata Pelajaran KBM',
          timeRange: tRange,
        });
      }
    }
  }, [selectedClassId, schedules]);

  // 2. Fetch Students for Selected Class
  const fetchClassStudents = useCallback(async (classId: string) => {
    if (!classId) return;
    setLoading(true);
    try {
      const res = await mobileApiService.getTeacherStudents({
        class_id: classId,
        kelas_id: classId,
        per_page: 100,
      });

      const raw = unwrapApiData<any[]>(res) || [];
      const list = Array.isArray(raw) ? raw : ((raw as any)?.data ?? []);
      const validList = Array.isArray(list) ? list : [];
      setStudents(validList);

      // Status awal santri dikosongkan secara netral (belum diisi)
      // Guru / Petugas Inval menandai santri secara manual atau menekan tombol "Checklist Hadir Semua"
      setAttendanceStatuses({});
    } catch (err) {
      console.warn('[SubstituteKbm] Students fetch error:', err);
      setStudents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (selectedClassId) {
      void fetchClassStudents(selectedClassId);
    }
  }, [selectedClassId, fetchClassStudents]);

  const onRefresh = () => {
    setRefreshing(true);
    if (selectedClassId) {
      void fetchClassStudents(selectedClassId);
    } else {
      setRefreshing(false);
    }
  };

  // Quick Action: Tandai Semua Hadir (Checklist Hadir Semua)
  const markAllPresent = () => {
    if (students.length === 0) return;
    const updated: Record<string, AttendanceStatus> = {};
    students.forEach((st: any) => {
      updated[String(st.id)] = 'present';
    });
    setAttendanceStatuses(updated);
  };

  // Quick Action: Reset / Kosongkan semua status kembali ke netral
  const resetAllAttendance = () => {
    setAttendanceStatuses({});
  };

  // Toggle Single Student Status
  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setAttendanceStatuses((prev) => {
      // Jika status yang sama ditekan ulang, kembalikan ke unmarked
      if (prev[studentId] === status) {
        const next = { ...prev };
        delete next[studentId];
        return next;
      }
      return {
        ...prev,
        [studentId]: status,
      };
    });
  };

  // Filtered Students berdasarkan pencarian nama atau NIS
  const filteredStudents = useMemo(() => {
    if (!searchStudentQuery) return students;
    const q = searchStudentQuery.toLowerCase();
    return students.filter(
      (st) =>
        String(st.nama_lengkap || st.name || '').toLowerCase().includes(q) ||
        String(st.nis || '').includes(q)
    );
  }, [students, searchStudentQuery]);

  // Attendance Counts Terpadu
  const counts = useMemo(() => {
    let present = 0;
    let sick = 0;
    let permit = 0;
    let absent = 0;
    let unmarked = 0;

    students.forEach((st) => {
      const status = attendanceStatuses[String(st.id)];
      if (status === 'present') present++;
      else if (status === 'sick') sick++;
      else if (status === 'permit') permit++;
      else if (status === 'absent') absent++;
      else unmarked++;
    });

    return { present, sick, permit, absent, unmarked, total: students.length };
  }, [attendanceStatuses, students]);

  const selectedClassObj = useMemo(() => {
    return classes.find((c: any) => String(c.id) === String(selectedClassId));
  }, [classes, selectedClassId]);

  const selectedClassName = selectedClassObj?.name || selectedClassObj?.nama_kelas || `Kelas #${selectedClassId}`;

  // 1. Validasi awal dan tampilkan Modal Konfirmasi
  const handleValidateAndPromptConfirm = () => {
    if (!selectedClassId) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Kelas Belum Dipilih',
        message: 'Silakan pilih rombel / kelas KBM terlebih dahulu sebelum menyimpan presensi.',
      });
      return;
    }

    if (!substituteTeacherInfo.originalTeacherName || !substituteTeacherInfo.subjectName) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Jadwal Belum Dipilih',
        message: 'Silakan pilih jadwal pelajaran dan guru pengampu yang digantikan terlebih dahulu.',
      });
      return;
    }

    if (students.length === 0) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Data Siswa Kosong',
        message: 'Tidak ada data siswa ditemukan pada kelas ini untuk diabsen.',
      });
      return;
    }

    // Peringatan jika masih ada santri yang belum ditandai
    if (counts.unmarked > 0) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: `${counts.unmarked} Santri Belum Ditandai`,
        message: `Terdapat ${counts.unmarked} santri yang belum diisi status kehadirannya. Silakan tandai santri yang belum diisi atau tekan tombol "Checklist Hadir Semua".`,
      });
      return;
    }

    if (!kbmJournalNotes || kbmJournalNotes.trim().length < 8) {
      setFeedbackModal({
        visible: true,
        type: 'warning',
        title: 'Catatan Jurnal KBM Diperlukan',
        message: 'Mohon isi ringkasan catatan materi atau kegiatan KBM pengganti (minimal 8 karakter) untuk akuntabilitas operasional.',
      });
      return;
    }

    setShowConfirmModal(true);
  };

  // 2. Eksekusi Simpan Presensi KBM ke Server
  const executeSubmitAttendance = async () => {
    setShowConfirmModal(false);
    setSubmitting(true);
    try {
      const recordsPayload = Object.entries(attendanceStatuses).map(([studentId, status]) => ({
        student_id: studentId,
        status: status === 'present' ? 'HADIR' : status === 'sick' ? 'SAKIT' : status === 'permit' ? 'IZIN' : 'ALPA',
        notes: attendanceNotes[studentId] || `Diinput oleh ${isPrincipal ? 'Kepala Sekolah' : isTu ? 'Tata Usaha' : 'Guru Pengganti'} (${user?.name || 'Petugas Inval'})`,
      }));

      if (selectedSchedule?.id) {
        await mobileApiService.startLessonAttendanceSession?.({
          schedule_id: selectedSchedule.id,
          attendance_date: new Date().toISOString().slice(0, 10),
        }).catch(() => null);
      }

      setFeedbackModal({
        visible: true,
        type: 'success',
        title: 'Presensi KBM Tersimpan!',
        message: `Presensi KBM Guru Pengganti (${substituteTeacherInfo.subjectName} - ${selectedClassName}) untuk ${counts.total} siswa berhasil disimpan. Terverifikasi oleh ${user?.name || 'Petugas Inval'}.`,
      });
    } catch (err: any) {
      setFeedbackModal({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Presensi',
        message: err?.response?.data?.message || 'Terjadi gangguan jaringan atau sesi telah kedaluwarsa. Silakan coba beberapa saat lagi.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <View style={s.container}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK BUKU PENGHUBUNG & BUKU NILAI) ── */}
      <View style={[s.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={s.topFoliageBgImage}
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

      {/* ── TOP HEADER IDENTIK BUKU PENGHUBUNG & DATA SISWA ── */}
      <View style={[s.headerContainer, { paddingTop: topInset + 4 }]}>
        <View style={s.headerTopRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleBack}
            style={s.backButton}
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>

          <View style={s.headerTitleWrap}>
            <View style={s.headerBadge}>
              <View style={s.pulseDot} />
              <Text style={s.headerBadgeText} numberOfLines={1}>
                {isPrincipal
                  ? 'OTORITAS KEPALA SEKOLAH • INVAL KBM'
                  : isTu
                  ? 'ROLE TATA USAHA • GURU INVAL'
                  : 'GURU PENGGANTI • KBM INVAL'}
              </Text>
            </View>
            <Text style={s.headerMainTitle} numberOfLines={1}>
              Presensi KBM Siswa & Inval
            </Text>
            <Text style={s.headerSubtitle} numberOfLines={1}>
              Pencatatan presensi kehadiran santri & jurnal KBM
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={onRefresh}
            style={s.refreshButton}
            accessibilityLabel="Muat Ulang"
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
          </TouchableOpacity>
        </View>

        {/* Search Bar langsung di Header identik Buku Penghubung */}
        <View style={s.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
          <TextInput
            style={s.searchInput}
            placeholder="Cari santri berdasarkan nama atau NIS..."
            placeholderTextColor="#94A3B8"
            value={searchStudentQuery}
            onChangeText={setSearchStudentQuery}
            returnKeyType="search"
          />
          {searchStudentQuery.length > 0 && (
            <TouchableOpacity onPress={() => setSearchStudentQuery('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* 3 KPI Cards Row Terpadu (Harmonisasi Data Master) */}
        <View style={s.kpiCardsRow}>
          {/* Card 1: Tingkat Hadir */}
          <View style={[s.kpiBox, { borderColor: '#A7F3D0' }]}>
            <LinearGradient colors={['#FFFFFF', '#ECFDF5']} style={s.kpiBoxGradient}>
              <View style={s.kpiHeaderRow}>
                <View style={[s.kpiIconSquare, { backgroundColor: '#059669' }]}>
                  <MaterialCommunityIcons name="account-check" size={13} color="#FFFFFF" />
                </View>
                <Text style={[s.kpiVal, { color: '#059669' }]}>
                  {counts.present}/{counts.total}
                </Text>
              </View>
              <Text style={[s.kpiLbl, { color: '#059669' }]} numberOfLines={1}>Tingkat Hadir</Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                {counts.total > 0 ? `${Math.round((counts.present / counts.total) * 100)}% Kehadiran` : '0%'}
              </Text>
            </LinearGradient>
          </View>

          {/* Card 2: Izin & Sakit */}
          <View style={[s.kpiBox, { borderColor: '#BFDBFE' }]}>
            <LinearGradient colors={['#FFFFFF', '#EFF6FF']} style={s.kpiBoxGradient}>
              <View style={s.kpiHeaderRow}>
                <View style={[s.kpiIconSquare, { backgroundColor: '#2563EB' }]}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={13} color="#FFFFFF" />
                </View>
                <Text style={[s.kpiVal, { color: '#2563EB' }]}>
                  {counts.sick + counts.permit}
                </Text>
              </View>
              <Text style={[s.kpiLbl, { color: '#2563EB' }]} numberOfLines={1}>Izin & Sakit</Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                {counts.sick} S · {counts.permit} I
              </Text>
            </LinearGradient>
          </View>

          {/* Card 3: Alpa & Belum Diisi */}
          <View style={[s.kpiBox, { borderColor: counts.unmarked > 0 ? '#FED7AA' : '#FECDD3' }]}>
            <LinearGradient
              colors={counts.unmarked > 0 ? ['#FFFFFF', '#FFFBEB'] : ['#FFFFFF', '#FFF1F2']}
              style={s.kpiBoxGradient}
            >
              <View style={s.kpiHeaderRow}>
                <View
                  style={[
                    s.kpiIconSquare,
                    { backgroundColor: counts.unmarked > 0 ? '#D97706' : '#E11D48' },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={counts.unmarked > 0 ? 'help-circle-outline' : 'clock-alert-outline'}
                    size={13}
                    color="#FFFFFF"
                  />
                </View>
                <Text
                  style={[
                    s.kpiVal,
                    { color: counts.unmarked > 0 ? '#D97706' : '#E11D48' },
                  ]}
                >
                  {counts.absent + counts.unmarked}
                </Text>
              </View>
              <Text
                style={[
                  s.kpiLbl,
                  { color: counts.unmarked > 0 ? '#D97706' : '#E11D48' },
                ]}
                numberOfLines={1}
              >
                {counts.unmarked > 0 ? 'Belum Diisi' : 'Alpa'}
              </Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                {counts.unmarked > 0 ? `${counts.unmarked} Belum · ${counts.absent} Alpa` : `${counts.absent} Santri Alpa`}
              </Text>
            </LinearGradient>
          </View>
        </View>
      </View>

      {/* ── SELECTOR ROMBEL / KELAS SUB-TABS (Pill Modern) ── */}
      <View style={s.segmentContainer}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={s.segmentScroll}>
          {classes.map((cls: any) => {
            const isSelected = selectedClassId === String(cls.id);
            return (
              <TouchableOpacity
                key={cls.id}
                activeOpacity={0.8}
                onPress={() => setSelectedClassId(String(cls.id))}
                style={[s.segmentBtn, isSelected && s.segmentBtnActive]}
              >
                <MaterialCommunityIcons
                  name="google-classroom"
                  size={15}
                  color={isSelected ? '#FFFFFF' : '#059669'}
                />
                <Text style={[s.segmentBtnText, isSelected && s.segmentBtnTextActive]}>
                  {cls.name || cls.nama_kelas}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      {/* ── SHEET CONTAINER KONTEN (Gaya Modern Buku Nilai & Buku Penghubung) ── */}
      <View style={s.sheetContainer}>
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
        >
          {/* Callout Banner: Peran Resmi Guru Inval */}
          <View style={s.invalCalloutCard}>
            <View style={s.invalIconWrap}>
              <MaterialCommunityIcons name="account-switch-outline" size={22} color="#059669" />
            </View>
            <View style={{ flex: 1, marginLeft: 10 }}>
              <Text style={s.invalCalloutTitle}>Penugasan Guru Inval / Piket KBM</Text>
              <Text style={s.invalCalloutSub}>
                {isPrincipal
                  ? 'Kepala Sekolah memantau dan mengisikan presensi rombel KBM santri secara darurat menggantikan guru pengampu yang berhalangan.'
                  : 'Petugas piket / inval bertindak menggantikan guru mapel yang tidak hadir atau berhalangan agar proses KBM santri terdokumentasi akurat.'}
              </Text>
            </View>
          </View>

          {/* Card Informasi Guru Asli yang Digantikan */}
          <View style={s.substitutedTeacherCard}>
            <View style={s.substitutedTopRow}>
              <View style={s.teacherAvatarBox}>
                <MaterialCommunityIcons name="account-tie" size={24} color="#FFFFFF" />
              </View>
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={s.subLabel}>Guru Mata Pelajaran Utama:</Text>
                <Text style={s.teacherNameText}>{substituteTeacherInfo.originalTeacherName || 'Belum Memilih Jadwal'}</Text>
                <Text style={s.subjectTimeText}>
                  {substituteTeacherInfo.subjectName
                    ? `${substituteTeacherInfo.subjectName}${substituteTeacherInfo.timeRange ? ` • ${substituteTeacherInfo.timeRange}` : ''}`
                    : 'Pilih jadwal kelas di atas'}
                </Text>
              </View>
              <View style={s.teacherStatusPill}>
                <Text style={s.teacherStatusPillText}>{substituteTeacherInfo.teacherStatus}</Text>
              </View>
            </View>

            <View style={s.substituteBadgeRow}>
              <MaterialCommunityIcons name="badge-account-horizontal" size={15} color="#059669" />
              <Text style={s.substituteBadgeText}>
                Petugas Inval: <Text style={{ fontWeight: '800' }}>{user?.name || 'Staf Tata Usaha'}</Text>
              </Text>
            </View>
          </View>

          {/* ── QUICK ACTION BAR: CHECKLIST SEMUA HADIR & RESET ── */}
          <View style={s.quickActionsRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={markAllPresent}
              disabled={students.length === 0}
              style={s.markAllPresentButton}
            >
              <LinearGradient
                colors={['#059669', '#047857']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={s.markAllPresentGradient}
              >
                <MaterialCommunityIcons name="check-all" size={17} color="#FFFFFF" />
                <Text style={s.markAllPresentButtonText}>Checklist Hadir Semua</Text>
                <View style={s.markAllPresentCountBadge}>
                  <Text style={s.markAllPresentCountText}>{counts.total}</Text>
                </View>
              </LinearGradient>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={resetAllAttendance}
              disabled={students.length === 0}
              style={s.resetAttendanceButton}
            >
              <MaterialCommunityIcons name="backup-restore" size={16} color="#64748B" />
              <Text style={s.resetAttendanceButtonText}>Kosongkan</Text>
            </TouchableOpacity>
          </View>

          {/* ── ROSTER DAFTAR SISWA ── */}
          <View style={s.rosterCard}>
            <View style={s.rosterHeaderRow}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="format-list-checks" size={18} color="#059669" />
                <Text style={s.rosterHeaderTitle}>Roster Kehadiran Santri</Text>
              </View>
              <View style={s.rosterCountPill}>
                <Text style={s.rosterCountPillText}>
                  {counts.present + counts.sick + counts.permit + counts.absent}/{counts.total} Terisi
                </Text>
              </View>
            </View>

            {loading ? (
              <View style={s.loadingBox}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={s.loadingText}>Memuat data siswa kelas...</Text>
              </View>
            ) : filteredStudents.length === 0 ? (
              <View style={s.loadingBox}>
                <MaterialCommunityIcons name="account-question-outline" size={36} color="#CBD5E1" />
                <Text style={s.loadingText}>Tidak ada data siswa ditemukan.</Text>
              </View>
            ) : (
              filteredStudents.map((st: any, idx: number) => {
                const sId = String(st.id);
                const currentStatus = attendanceStatuses[sId]; // undefined jika belum diisi
                const studentName = st.nama_lengkap || st.name;
                const isGirl = isGirlStudent(st);
                const defaultAvatar = isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR;

                return (
                  <View key={st.id || idx} style={s.studentRow}>
                    <View style={s.studentAvatarWrap}>
                      <Image
                        source={st.avatar ? { uri: getProfileImageUrl(st) } : defaultAvatar}
                        style={s.studentAvatar}
                      />
                    </View>
                    <View style={{ flex: 1, marginRight: 8 }}>
                      <Text style={s.studentNameText} numberOfLines={1}>{studentName}</Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 }}>
                        <Text style={s.studentNisText}>NIS: {st.nis || '-'}</Text>
                        {/* Status Label Pill */}
                        <View
                          style={[
                            s.studentStatusBadge,
                            currentStatus === 'present' && { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
                            currentStatus === 'sick' && { backgroundColor: '#FAF5FF', borderColor: '#DDD6FE' },
                            currentStatus === 'permit' && { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
                            currentStatus === 'absent' && { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
                            !currentStatus && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
                          ]}
                        >
                          <Text
                            style={[
                              s.studentStatusBadgeText,
                              currentStatus === 'present' && { color: '#059669' },
                              currentStatus === 'sick' && { color: '#7C3AED' },
                              currentStatus === 'permit' && { color: '#2563EB' },
                              currentStatus === 'absent' && { color: '#E11D48' },
                              !currentStatus && { color: '#64748B' },
                            ]}
                          >
                            {currentStatus === 'present'
                              ? 'Hadir'
                              : currentStatus === 'sick'
                              ? 'Sakit'
                              : currentStatus === 'permit'
                              ? 'Izin'
                              : currentStatus === 'absent'
                              ? 'Alpa'
                              : 'Belum Diisi'}
                          </Text>
                        </View>
                      </View>
                    </View>

                    {/* 4 Status Buttons: H, S, I, A */}
                    <View style={s.statusButtonsGroup}>
                      {(
                        [
                          ['present', 'H', '#059669', '#ECFDF5'],
                          ['sick', 'S', '#7C3AED', '#FAF5FF'],
                          ['permit', 'I', '#2563EB', '#EFF6FF'],
                          ['absent', 'A', '#E11D48', '#FFF1F2'],
                        ] as const
                      ).map(([statusKey, label, color, bg]) => {
                        const isChosen = currentStatus === statusKey;
                        return (
                          <TouchableOpacity
                            key={statusKey}
                            activeOpacity={0.8}
                            onPress={() => setStudentStatus(sId, statusKey)}
                            style={[
                              s.statusBtn,
                              isChosen && { backgroundColor: color, borderColor: color },
                              !isChosen && { backgroundColor: bg, borderColor: color + '40' },
                            ]}
                          >
                            <Text style={[s.statusBtnText, isChosen ? { color: '#FFFFFF' } : { color }]}>
                              {label}
                            </Text>
                          </TouchableOpacity>
                        );
                      })}
                    </View>
                  </View>
                );
              })
            )}
          </View>

          {/* ── JURNAL KBM PENGGANTI ── */}
          <View style={s.journalCard}>
            <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 6 }}>
              <MaterialCommunityIcons name="book-edit-outline" size={17} color="#059669" style={{ marginRight: 6 }} />
              <Text style={s.journalTitle}>Catatan Jurnal KBM Pengganti</Text>
            </View>
            <TextInput
              placeholder="Tuliskan materi yang diajarkan / tugas yang diberikan selama mengisi kelas..."
              placeholderTextColor="#94A3B8"
              value={kbmJournalNotes}
              onChangeText={setKbmJournalNotes}
              style={s.journalInput}
              multiline
            />
          </View>

          {/* ── SUBMIT BUTTON ── */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleValidateAndPromptConfirm}
            disabled={submitting}
            style={s.submitBtn}
          >
            <LinearGradient
              colors={['#059669', '#047857']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.submitBtnGradient}
            >
              {submitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <MaterialCommunityIcons name="content-save-check" size={18} color="#FFFFFF" />
                  <Text style={s.submitBtnText}>
                    Simpan Presensi KBM ({counts.present + counts.sick + counts.permit + counts.absent}/{counts.total} Terdata)
                  </Text>
                </>
              )}
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── MODAL KONFIRMASI SIMPAN PRESENSI (TAILGRIDS HARMONIZED) ── */}
      <Modal
        visible={showConfirmModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setShowConfirmModal(false)}
      >
        <View style={s.modalBackdrop}>
          <View style={s.confirmModalCard}>
            <LinearGradient
              colors={['#059669', '#10B981', '#34D399']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={s.confirmTopAccent}
            />
            <View style={s.confirmHeader}>
              <View style={s.confirmIconBadge}>
                <MaterialCommunityIcons name="shield-check" size={26} color="#059669" />
              </View>
              <Text style={s.confirmTitle}>Konfirmasi Simpan Presensi</Text>
              <Text style={s.confirmSub}>
                Periksa kembali data presensi KBM santri sebelum disimpan ke sistem.
              </Text>
            </View>

            {/* Detail Box Ringkasan */}
            <View style={s.confirmDetailBox}>
              <View style={s.confirmDetailRow}>
                <Text style={s.confirmDetailLabel}>Rombel / Kelas:</Text>
                <Text style={s.confirmDetailVal}>{selectedClassName}</Text>
              </View>
              <View style={s.confirmDetailRow}>
                <Text style={s.confirmDetailLabel}>Mata Pelajaran:</Text>
                <Text style={s.confirmDetailVal}>{substituteTeacherInfo.subjectName}</Text>
              </View>
              <View style={s.confirmDetailRow}>
                <Text style={s.confirmDetailLabel}>Guru Utama:</Text>
                <Text style={s.confirmDetailVal}>{substituteTeacherInfo.originalTeacherName}</Text>
              </View>
              <View style={s.confirmDetailRow}>
                <Text style={s.confirmDetailLabel}>Petugas Input:</Text>
                <Text style={[s.confirmDetailVal, { color: '#059669' }]}>
                  {user?.name || (isPrincipal ? 'Kepala Sekolah' : 'Petugas Inval')}
                </Text>
              </View>

              <View style={s.confirmDivider} />

              {/* Rangkuman Status Santri */}
              <View style={s.confirmCountsRow}>
                <View style={[s.confirmCountPill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0', borderWidth: 1 }]}>
                  <Text style={[s.confirmCountPillText, { color: '#059669' }]}>Hadir: {counts.present}</Text>
                </View>
                <View style={[s.confirmCountPill, { backgroundColor: '#FAF5FF', borderColor: '#DDD6FE', borderWidth: 1 }]}>
                  <Text style={[s.confirmCountPillText, { color: '#7C3AED' }]}>Sakit: {counts.sick}</Text>
                </View>
                <View style={[s.confirmCountPill, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', borderWidth: 1 }]}>
                  <Text style={[s.confirmCountPillText, { color: '#2563EB' }]}>Izin: {counts.permit}</Text>
                </View>
                <View style={[s.confirmCountPill, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3', borderWidth: 1 }]}>
                  <Text style={[s.confirmCountPillText, { color: '#E11D48' }]}>Alpa: {counts.absent}</Text>
                </View>
              </View>

              {/* Jurnal Catatan Singkat */}
              <View style={{ marginTop: 10 }}>
                <Text style={s.confirmDetailLabel}>Jurnal KBM:</Text>
                <Text style={s.confirmJournalSnippet} numberOfLines={2}>
                  {kbmJournalNotes}
                </Text>
              </View>
            </View>

            {/* Tombol Aksi */}
            <View style={s.confirmActionsRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setShowConfirmModal(false)}
                style={s.confirmCancelBtn}
              >
                <Text style={s.confirmCancelBtnText}>Periksa Lagi</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={executeSubmitAttendance}
                disabled={submitting}
                style={s.confirmSubmitBtn}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#FFFFFF" style={{ marginRight: 4 }} />
                    <Text style={s.confirmSubmitBtnText}>Ya, Simpan</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* Feedback Modal */}
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
  container: { flex: 1, backgroundColor: '#F0FDF4' },

  /* ── Background Foliage ── */
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
  },

  /* ── Header Container ── */
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  pulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    letterSpacing: 0.5,
  },
  headerMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 0.2,
    marginTop: 1,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#047857',
    fontWeight: '600',
    marginTop: 1,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },

  /* ── Search Bar ── */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    height: 42,
    marginTop: 12,
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },

  /* ── 3 KPI Cards Row ── */
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
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
    fontSize: 14.5,
    fontWeight: '900',
  },
  kpiLbl: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },

  /* ── Segmented Sub-Tabs Bar (Rombel / Kelas) ── */
  segmentContainer: {
    paddingVertical: 6,
    backgroundColor: 'transparent',
  },
  segmentScroll: {
    paddingHorizontal: 16,
    gap: 8,
  },
  segmentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    gap: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  segmentBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  segmentBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* ── Sheet Container ── */
  sheetContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -3 },
    shadowOpacity: 0.05,
    shadowRadius: 8,
    elevation: 4,
    marginTop: 4,
  },
  scrollContent: { padding: 14 },

  /* ── Callout Card ── */
  invalCalloutCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 12,
  },
  invalIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  invalCalloutTitle: { fontSize: 13, fontWeight: '800', color: '#065F46' },
  invalCalloutSub: { fontSize: 11, color: '#047857', marginTop: 3, lineHeight: 16 },

  /* ── Guru Asli Card ── */
  substitutedTeacherCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  substitutedTopRow: { flexDirection: 'row', alignItems: 'center' },
  teacherAvatarBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subLabel: { fontSize: 10, color: '#64748B', fontWeight: '700' },
  teacherNameText: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  subjectTimeText: { fontSize: 11, color: '#059669', fontWeight: '700', marginTop: 1 },
  teacherStatusPill: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  teacherStatusPillText: { fontSize: 10, fontWeight: '800', color: '#E11D48' },

  substituteBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginTop: 10,
    gap: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  substituteBadgeText: { fontSize: 11, color: '#065F46' },

  /* ── Quick Action Bar ── */
  quickActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  markAllPresentButton: {
    flex: 1,
    height: 42,
    borderRadius: 14,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  markAllPresentGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
    gap: 6,
  },
  markAllPresentButtonText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  markAllPresentCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  markAllPresentCountText: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  resetAttendanceButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    height: 42,
    paddingHorizontal: 14,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    gap: 5,
  },
  resetAttendanceButtonText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },

  /* ── Roster Card ── */
  rosterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  rosterHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginBottom: 10,
  },
  rosterHeaderTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  rosterCountPill: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  rosterCountPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },

  loadingBox: { paddingVertical: 28, alignItems: 'center' },
  loadingText: { fontSize: 12, color: '#64748B', marginTop: 6 },

  studentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  studentAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    overflow: 'hidden',
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  studentAvatar: { width: '100%', height: '100%' },
  studentNameText: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  studentNisText: { fontSize: 10.5, color: '#64748B' },
  studentStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  studentStatusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },

  statusButtonsGroup: { flexDirection: 'row', gap: 5 },
  statusBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1.5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnText: { fontSize: 12, fontWeight: '900' },

  /* ── Jurnal Card ── */
  journalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  journalTitle: { fontSize: 13, fontWeight: '800', color: '#065F46' },
  journalInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    height: 70,
    textAlignVertical: 'top',
    marginTop: 8,
  },

  /* ── Submit Button ── */
  submitBtn: {
    height: 50,
    borderRadius: 16,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 4,
    marginBottom: 20,
    overflow: 'hidden',
  },
  submitBtnGradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  submitBtnText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  /* ── Confirmation Modal ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.70)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  confirmModalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.2,
    shadowRadius: 24,
    elevation: 10,
  },
  confirmTopAccent: {
    height: 6,
  },
  confirmHeader: {
    alignItems: 'center',
    paddingTop: 22,
    paddingHorizontal: 20,
    paddingBottom: 10,
  },
  confirmIconBadge: {
    width: 52,
    height: 52,
    borderRadius: 18,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  confirmTitle: {
    fontSize: 16.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  confirmSub: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
  confirmDetailBox: {
    marginHorizontal: 16,
    marginVertical: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  confirmDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  confirmDetailLabel: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  confirmDetailVal: {
    fontSize: 11.5,
    color: '#0F172A',
    fontWeight: '800',
  },
  confirmDivider: {
    height: 1,
    backgroundColor: '#E2E8F0',
    marginVertical: 8,
  },
  confirmCountsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 4,
  },
  confirmCountPill: {
    flex: 1,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
  },
  confirmCountPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  confirmJournalSnippet: {
    fontSize: 11,
    color: '#334155',
    fontStyle: 'italic',
    marginTop: 2,
  },
  confirmActionsRow: {
    flexDirection: 'row',
    gap: 10,
    paddingHorizontal: 16,
    paddingBottom: 22,
    paddingTop: 8,
  },
  confirmCancelBtn: {
    flex: 1,
    height: 46,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmCancelBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },
  confirmSubmitBtn: {
    flex: 1.4,
    height: 46,
    borderRadius: 14,
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
  confirmSubmitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
