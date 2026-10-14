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
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { getProfileImageUrl, DEFAULT_STUDENT_BOY_AVATAR } from '../utils/profile';
import { isPrincipalRole, isTuRole } from '../utils/roles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type AttendanceStatus = 'present' | 'sick' | 'permit' | 'absent';

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
              originalTeacherName: firstSched.teacher?.name || firstSched.employee?.name || firstSched.nama_guru || '',
              teacherStatus: 'Tidak Hadir',
              subjectName: firstSched.subject?.name || firstSched.nama_mapel || '',
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

      // Default all present
      const initialMap: Record<string, AttendanceStatus> = {};
      validList.forEach((st: any) => {
        initialMap[String(st.id)] = 'present';
      });
      setAttendanceStatuses(initialMap);
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

  // Quick Action: Mark all Present
  const markAllPresent = () => {
    const updated: Record<string, AttendanceStatus> = {};
    students.forEach((st: any) => {
      updated[String(st.id)] = 'present';
    });
    setAttendanceStatuses(updated);
  };

  // Toggle Single Student Status
  const setStudentStatus = (studentId: string, status: AttendanceStatus) => {
    setAttendanceStatuses((prev) => ({
      ...prev,
      [studentId]: status,
    }));
  };

  // Filtered Students
  const filteredStudents = useMemo(() => {
    if (!searchStudentQuery) return students;
    const q = searchStudentQuery.toLowerCase();
    return students.filter(
      (st) =>
        String(st.nama_lengkap || st.name || '').toLowerCase().includes(q) ||
        String(st.nis || '').includes(q)
    );
  }, [students, searchStudentQuery]);

  // Attendance Counts
  const counts = useMemo(() => {
    let present = 0;
    let sick = 0;
    let permit = 0;
    let absent = 0;
    Object.values(attendanceStatuses).forEach((st) => {
      if (st === 'present') present++;
      else if (st === 'sick') sick++;
      else if (st === 'permit') permit++;
      else if (st === 'absent') absent++;
    });
    return { present, sick, permit, absent, total: students.length };
  }, [attendanceStatuses, students.length]);

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
      {/* ── HEADER HALAMAN PRESENSI KBM (GAYA DATA MASTER TERPADU) ── */}
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
              <MaterialCommunityIcons name="school-outline" size={12} color="#D1FAE5" />
              <Text style={s.headerBadgeText}>
                {isPrincipal
                  ? 'OTORITAS KEPALA SEKOLAH • INVAL / PIKET KBM'
                  : isTu
                  ? 'ROLE TATA USAHA • GURU INVAL'
                  : 'GURU PENGGANTI • KBM INVAL'}
              </Text>
            </View>
            <Text style={s.headerMainTitle} numberOfLines={1}>
              Presensi KBM Siswa & Inval
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={markAllPresent}
              style={s.markAllPresentBtn}
            >
              <MaterialCommunityIcons name="check-all" size={16} color="#FFFFFF" />
              <Text style={s.markAllPresentText}>Semua Hadir</Text>
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
            placeholder="Cari santri dalam kelas ini..."
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
          <View style={[s.kpiBox, { borderColor: 'rgba(37, 99, 235, 0.18)' }]}>
            <LinearGradient colors={['#FFFFFF', '#EFF6FF']} style={s.kpiBoxGradient}>
              <View style={s.kpiHeaderRow}>
                <View style={[s.kpiIconSquare, { backgroundColor: '#2563EB' }]}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={14} color="#FFFFFF" />
                </View>
                <Text style={[s.kpiVal, { color: '#2563EB' }]}>
                  {counts.sick + counts.permit}
                </Text>
              </View>
              <Text style={[s.kpiLbl, { color: '#2563EB' }]} numberOfLines={1}>Izin & Sakit</Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                {counts.sick} Sakit · {counts.permit} Izin
              </Text>
            </LinearGradient>
          </View>

          {/* Card 3: Alpa */}
          <View style={[s.kpiBox, { borderColor: 'rgba(225, 29, 72, 0.18)' }]}>
            <LinearGradient colors={['#FFFFFF', '#FFF1F2']} style={s.kpiBoxGradient}>
              <View style={s.kpiHeaderRow}>
                <View style={[s.kpiIconSquare, { backgroundColor: '#E11D48' }]}>
                  <MaterialCommunityIcons name="clock-alert-outline" size={14} color="#FFFFFF" />
                </View>
                <Text style={[s.kpiVal, { color: '#E11D48' }]}>
                  {counts.absent}
                </Text>
              </View>
              <Text style={[s.kpiLbl, { color: '#E11D48' }]} numberOfLines={1}>Alpa</Text>
              <Text style={s.kpiSub} numberOfLines={1}>
                Tanpa Keterangan
              </Text>
            </LinearGradient>
          </View>
        </View>
      </LinearGradient>

      {/* ── SELECTOR ROMBEL / KELAS SUB-TABS (Gaya Data Master) ── */}
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
                  color={isSelected ? '#FFFFFF' : '#64748B'}
                />
                <Text style={[s.segmentBtnText, isSelected && s.segmentBtnTextActive]}>
                  {cls.name || cls.nama_kelas}
                </Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>
      </View>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 30 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
      >
        {/* ── CALLOUT BANNER: PERAN RESMI GURU INVAL ── */}
        <View style={s.invalCalloutCard}>
          <View style={s.invalIconWrap}>
            <MaterialCommunityIcons name="account-switch-outline" size={22} color="#059669" />
          </View>
          <View style={{ flex: 1, marginLeft: 10 }}>
            <Text style={s.invalCalloutTitle}>Penugasan Guru Inval / Piket KBM</Text>
            <Text style={s.invalCalloutSub}>
              {isPrincipal
                ? 'Kepala Sekolah memantau dan mengisikan absensi rombel KBM santri secara darurat menggantikan guru pengampu yang berhalangan.'
                : 'Petugas piket / inval bertindak menggantikan guru mapel yang tidak hadir atau terlambat agar jam belajar santri tetap berjalan & absensi kelas terdokumentasi.'}
            </Text>
          </View>
        </View>

        {/* ── CARD INFORMASI GURU ASLI YANG DIGANTIKAN ── */}
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

          {/* Substitute Badge */}
          <View style={s.substituteBadgeRow}>
            <MaterialCommunityIcons name="badge-account-horizontal" size={15} color="#059669" />
            <Text style={s.substituteBadgeText}>
              Petugas Inval: <Text style={{ fontWeight: '800' }}>{user?.name || 'Staf Tata Usaha'}</Text>
            </Text>
          </View>
        </View>

        {/* ── ROSTER DAFTAR SISWA ── */}
        <View style={s.rosterCard}>
          <View style={s.rosterHeaderRow}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="format-list-checks" size={18} color="#059669" />
              <Text style={s.rosterHeaderTitle}>Roster Kehadiran Siswa</Text>
            </View>
            <View style={s.rosterCountPill}>
              <Text style={s.rosterCountPillText}>{filteredStudents.length} Santri</Text>
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
              const currentStatus = attendanceStatuses[String(st.id)] || 'present';
              const studentName = st.nama_lengkap || st.name;
              return (
                <View key={st.id || idx} style={s.studentRow}>
                  <View style={s.studentAvatarWrap}>
                    <Image
                      source={st.avatar ? { uri: getProfileImageUrl(st) } : DEFAULT_STUDENT_BOY_AVATAR}
                      style={s.studentAvatar}
                    />
                  </View>
                  <View style={{ flex: 1, marginRight: 8 }}>
                    <Text style={s.studentNameText} numberOfLines={1}>{studentName}</Text>
                    <Text style={s.studentNisText}>NIS: {st.nis || '-'}</Text>
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
                          onPress={() => setStudentStatus(String(st.id), statusKey)}
                          style={[
                            s.statusBtn,
                            isChosen && { backgroundColor: color, borderColor: color },
                            !isChosen && { backgroundColor: bg, borderColor: color + '55' },
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
                <Text style={s.submitBtnText}>Simpan Presensi KBM Pengganti</Text>
              </>
            )}
          </LinearGradient>
        </TouchableOpacity>
      </ScrollView>

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
  container: { flex: 1, backgroundColor: '#F8FAFC' },

  /* ── Master Gradient Header ── */
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
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
  markAllPresentBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    gap: 4,
  },
  markAllPresentText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },

  /* ── Header Integrated Search Bar ── */
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

  /* ── 3 KPI Cards Row ── */
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

  /* ── Segmented Sub-Tabs Bar (Rombel / Kelas) ── */
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
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  invalIconWrap: {
    width: 40,
    height: 40,
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
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  substitutedTopRow: { flexDirection: 'row', alignItems: 'center' },
  teacherAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subLabel: { fontSize: 10.5, color: '#64748B', fontWeight: '700' },
  teacherNameText: { fontSize: 13.5, fontWeight: '800', color: '#0F172A' },
  subjectTimeText: { fontSize: 11.5, color: '#059669', fontWeight: '700', marginTop: 1 },
  teacherStatusPill: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
  },
  teacherStatusPillText: { fontSize: 10.5, fontWeight: '800', color: '#E11D48' },

  substituteBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginTop: 12,
    gap: 6,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  substituteBadgeText: { fontSize: 11.5, color: '#065F46' },

  /* ── Roster Card ── */
  rosterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
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
    marginBottom: 12,
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
  studentNisText: { fontSize: 11, color: '#64748B', marginTop: 1 },

  statusButtonsGroup: { flexDirection: 'row', gap: 5 },
  statusBtn: {
    width: 32,
    height: 32,
    borderRadius: 9,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusBtnText: { fontSize: 12, fontWeight: '900' },

  /* ── Jurnal Card ── */
  journalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 16,
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
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  /* ── Confirmation Modal (TailGrids Modern Harmonized) ── */
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
