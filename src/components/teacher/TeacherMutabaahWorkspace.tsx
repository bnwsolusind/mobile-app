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
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { mobileApiService, unwrapCollection, unwrapApiData } from '../../services/mobileApiService';
import { getApiErrorMessage } from '../../services/api';
import { useAuthStore } from '../../stores/authStore';
import { useNavigationHistoryStore } from '../../stores/navigationHistoryStore';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import { TeacherMutabaahPrintModal } from './TeacherMutabaahPrintModal';
import { getDynamicAcademicYear } from '../../utils/academicYear';
import { isPrincipalRole } from '../../utils/roles';
import { TeacherStickyHeader } from '../TeacherStickyHeader';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

const padZero = (n: number) => (n < 10 ? `0${n}` : String(n));

const isoDate = (d: Date = new Date()) => {
  return `${d.getFullYear()}-${padZero(d.getMonth() + 1)}-${padZero(d.getDate())}`;
};

export const getStudentParentName = (student: any): string => {
  if (!student) return 'Orang Tua / Wali Siswa';
  const meta = student.metadata || {};
  const parentRel = student.parent || {};
  const direct =
    student.parent_name ||
    meta.nama_ayah ||
    meta.ayah?.nama ||
    meta.orang_tua?.nama_ayah ||
    meta.nama_ibu ||
    meta.ibu?.nama ||
    meta.orang_tua?.nama_ibu ||
    meta.nama_wali ||
    meta.wali?.nama ||
    (typeof meta.orang_tua === 'string' && meta.orang_tua) ||
    meta.orang_tua?.nama ||
    meta.nama_ortu ||
    meta.parent_name ||
    parentRel.full_name ||
    parentRel.name;

  if (direct && typeof direct === 'string' && direct.trim() && direct !== '-') {
    return direct.trim();
  }

  const parts = (student.name || student.nama_lengkap || '').trim().split(' ');
  if (parts.length > 1) {
    return `Bapak ${parts.slice(1).join(' ')}`;
  }
  if (parts[0]) {
    return `Bapak ${parts[0]}`;
  }
  return 'Orang Tua / Wali Siswa';
};

const STATUS_OPTIONS = [
  { value: 'good', label: 'Baik', color: '#059669', bg: '#D1FAE5', short: 'B' },
  { value: 'less', label: 'Kurang', color: '#D97706', bg: '#FEF3C7', short: 'K' },
  { value: 'not_done', label: 'Belum', color: '#E11D48', bg: '#FFE4E6', short: 'X' },
  { value: 'na', label: 'Uzur/NA', color: '#64748B', bg: '#F1F5F9', short: '—' },
];

export interface TeacherMutabaahWorkspaceProps {
  onBack?: () => void;
  navigation?: any;
}

export default function TeacherMutabaahWorkspace({
  onBack,
  navigation: propNavigation,
}: TeacherMutabaahWorkspaceProps) {
  const internalNavigation = useNavigation<any>();
  const navigation = propNavigation || internalNavigation;
  const user = useAuthStore((state) => state.user);
  const insets = useSafeAreaInsets();
  const isPrincipal = useMemo(() => isPrincipalRole(user?.roles || []), [user?.roles]);

  const handleBack = useCallback(() => {
    if (onBack) {
      onBack();
      return;
    }
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
  }, [onBack, navigation]);

  // Scroll & Sticky Header Animation (Identik dengan Workspace Tahfizh)
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

  // Loading States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [verifyingId, setVerifyingId] = useState<string | null>(null);

  // Selected Date
  const [selectedDate, setSelectedDate] = useState<string>(() => isoDate(new Date()));

  // Context & Assignment (Rombel / Kelas)
  const [context, setContext] = useState<any>(null);
  const [assignmentId, setAssignmentId] = useState<string>('');
  const [template, setTemplate] = useState<any>(null);
  const [students, setStudents] = useState<any[]>([]);

  // Search & Filter
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'finalized'>('all');
  const [classPickerVisible, setClassPickerVisible] = useState<boolean>(false);

  // Modal 1: Input Jurnal Mutabaah Siswa
  const [inputStudent, setInputStudent] = useState<any>(null);
  const [inputModalVisible, setInputModalVisible] = useState<boolean>(false);
  const [inputDate, setInputDate] = useState<string>(() => isoDate(new Date()));
  const [inputValues, setInputValues] = useState<Record<string, string>>({});
  const [inputNotes, setInputNotes] = useState<Record<string, string>>({});
  const [loadingInputModal, setLoadingInputModal] = useState<boolean>(false);
  const [savingItemKey, setSavingItemKey] = useState<string | null>(null);
  const [inputScopeTab, setInputScopeTab] = useState<'school' | 'home' | 'all'>('school');

  // Modal 2: Preview & Cetak Laporan Mutaba'ah Resmi
  const [previewStudent, setPreviewStudent] = useState<any>(null);
  const [printModalVisible, setPrintModalVisible] = useState<boolean>(false);

  // Feedback modal
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Load Context
  const loadContext = useCallback(async () => {
    try {
      const res = await mobileApiService.getMutabaahDailyContext({ date: selectedDate });
      const ctx = unwrapApiData<any>(res) || res?.data || res;
      setContext(ctx);
      const assignments = ctx?.assignments || [];
      if (assignments.length > 0) {
        setAssignmentId((curr) => {
          const match = assignments.some((a: any) => String(a.id) === String(curr));
          return match ? curr : String(assignments[0].id);
        });
      }
    } catch (err: any) {
      console.warn('Fallback loading mutabaah context', err);
    }
  }, [selectedDate]);

  // Load Students
  const loadStudents = useCallback(async () => {
    if (!assignmentId) {
      try {
        const res = await mobileApiService.getTeacherMutabaah({ date: selectedDate });
        const list = unwrapCollection(res);
        setStudents(
          list.map((item: any) => ({
            id: item.student?.id || item.student_id || item.id,
            nis: item.student?.nis || item.nis || '-',
            name: item.student?.nama_lengkap || item.student?.name || item.name || 'Santri',
            status: item.status || (item.is_finalized ? 'finalized' : 'draft'),
            progress:
              item.progress !== undefined
                ? Number(item.progress)
                : item.details?.length
                ? Math.min(100, Math.round((item.details.length / Math.max(context?.template?.items?.length || 9, 1)) * 100))
                : 0,
            details: item.details || [],
            raw: item,
          }))
        );
      } catch {
        setStudents([]);
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
      return;
    }

    setLoading(true);
    try {
      const res = await mobileApiService.getMutabaahDailyStudents({
        date: selectedDate,
        supervisor_assignment_id: assignmentId,
      });
      const data = unwrapApiData<any>(res) || res?.data || res;
      const list = data?.students || [];
      setStudents(list);
      if (data?.template) {
        setTemplate(data.template);
      }
    } catch {
      setStudents([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [assignmentId, selectedDate]);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  useEffect(() => {
    void loadStudents();
  }, [loadStudents]);

  // Active Assignment Object
  const currentAssignment = useMemo(() => {
    const list = context?.assignments || [];
    return list.find((a: any) => String(a.id) === String(assignmentId)) || list[0] || null;
  }, [context, assignmentId]);

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((s) => {
      const name = String(s.name || s.nama_lengkap || '').toLowerCase();
      const nis = String(s.nis || '');
      const q = searchQuery.toLowerCase().trim();
      const matchSearch = !q || name.includes(q) || nis.includes(q);
      if (!matchSearch) return false;

      const isFinal = s.status === 'finalized' || s.status === 'completed' || s.status === 'approved';
      if (statusFilter === 'pending') return !isFinal;
      if (statusFilter === 'finalized') return isFinal;
      return true;
    });
  }, [students, searchQuery, statusFilter]);

  // KPI Stats
  const stats = useMemo(() => {
    const total = students.length;
    const verified = students.filter((s) => s.status === 'finalized' || s.status === 'completed' || s.status === 'approved').length;
    const pending = total - verified;
    return { total, verified, pending };
  }, [students]);

  // Shift Date
  const shiftDate = (days: number) => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + days);
    setSelectedDate(isoDate(d));
  };

  // Approval One-Click
  const handleVerify = async (student: any) => {
    if (isPrincipal) {
      setFeedback({
        visible: true,
        type: 'info',
        title: 'Supervisi Kepala Sekolah',
        message: 'Peran Kepala Sekolah hanya untuk memantau capaian dan melihat rekapitulasi. Persetujuan harian dilakukan oleh Guru/Musyrif.',
      });
      return;
    }

    setVerifyingId(String(student.id));
    try {
      if (student.raw?.id) {
        await mobileApiService.verifyTeacherMutabaah(String(student.raw.id));
      } else if (assignmentId) {
        await mobileApiService.finalizeMutabaahDailyStudent({
          student_id: student.id,
          activity_date: selectedDate,
          supervisor_assignment_id: assignmentId,
        });
      }
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Ibadah Santri Disetujui! ✨',
        message: `Catatan mutabaah ${student.name} berhasil diverifikasi.`,
      });
      await loadStudents();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memverifikasi',
        message: getApiErrorMessage(err, 'Terjadi kendala saat memverifikasi mutabaah santri.'),
      });
    } finally {
      setVerifyingId(null);
    }
  };

  // Open Input Modal
  const handleOpenInputModal = async (student: any) => {
    if (isPrincipal) {
      setFeedback({
        visible: true,
        type: 'info',
        title: 'Supervisi Kepala Sekolah',
        message: 'Peran Kepala Sekolah hanya untuk memantau capaian dan melihat rekapitulasi. Pengisian jurnal harian dilakukan oleh Guru/Musyrif.',
      });
      return;
    }

    setInputStudent(student);
    setInputDate(selectedDate);
    setInputValues({});
    setInputNotes({});
    setInputModalVisible(true);
    setLoadingInputModal(true);

    try {
      if (assignmentId) {
        const res = await mobileApiService.getMutabaahDailyStudentDetail(student.id, {
          date: selectedDate,
          supervisor_assignment_id: assignmentId,
        });
        const data = unwrapApiData<any>(res) || res?.data || res;
        const vals: Record<string, string> = {};
        const nts: Record<string, string> = {};
        Object.entries(data?.values || {}).forEach(([itemId, val]: [string, any]) => {
          vals[itemId] = val?.status_value?.value || val?.status_value || '';
          if (val?.notes) nts[itemId] = val.notes;
        });
        setInputValues(vals);
        setInputNotes(nts);
      }
    } catch (err) {
      console.warn('Failed loading student daily values', err);
    } finally {
      setLoadingInputModal(false);
    }
  };

  // Save Single Cell
  const handleSaveCell = async (templateItemId: string, statusValue: string) => {
    if (!inputStudent || !assignmentId) return;
    setSavingItemKey(templateItemId);
    const prev = inputValues[templateItemId];
    setInputValues((curr) => ({ ...curr, [templateItemId]: statusValue }));

    try {
      await mobileApiService.saveMutabaahDailyCell({
        student_id: inputStudent.id,
        activity_date: inputDate,
        supervisor_assignment_id: assignmentId,
        template_item_id: templateItemId,
        status_value: statusValue,
        notes: inputNotes[templateItemId] || null,
      });
    } catch (err: any) {
      setInputValues((curr) => ({ ...curr, [templateItemId]: prev }));
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Amalan',
        message: getApiErrorMessage(err, 'Item mutabaah belum dapat disimpan.'),
      });
    } finally {
      setSavingItemKey(null);
    }
  };

  // Open Print Modal
  const handleOpenPrintModal = (student: any) => {
    setPreviewStudent(student);
    setPrintModalVisible(true);
  };

  return (
    <View style={styles.container}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK JADWAL & MATERI) ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={[
            'rgba(240, 253, 244, 0)',
            'rgba(240, 253, 244, 0.50)',
            '#F0FDF4',
          ]}
          locations={[0.45, 0.78, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── 1. STICKY HEADER DENGAN TAB STATUS (Translucent Frosted Mint) ── */}
      <TeacherStickyHeader
        scrollY={scrollY}
        topInset={insets.top}
        title={isPrincipal ? "Supervisi Mutaba'ah" : "Mutaba'ah Yaumiyyah"}
        subtitle={`${currentAssignment?.rombel_name || currentAssignment?.kelas_name || 'Rombel Unit'} · ${new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}`}
        navigation={navigation}
        onBack={handleBack}
        tabs={[
          {
            id: 'all',
            label: 'Semua',
            icon: 'account-group-outline',
            count: stats.total,
            active: statusFilter === 'all',
            onPress: () => setStatusFilter('all'),
          },
          {
            id: 'finalized',
            label: 'Terverifikasi',
            icon: 'check-decagram-outline',
            count: stats.verified,
            active: statusFilter === 'finalized',
            onPress: () => setStatusFilter('finalized'),
          },
          {
            id: 'pending',
            label: 'Menunggu',
            icon: 'clock-outline',
            count: stats.pending,
            active: statusFilter === 'pending',
            onPress: () => setStatusFilter('pending'),
          },
        ]}
      />

      {/* ── 2. SCROLLVIEW UTAMA ── */}
      <Animated.ScrollView
        style={styles.screen}
        contentContainerStyle={[
          styles.mainScrollContent,
          { paddingBottom: Math.max(insets.bottom + 140, 160) },
        ]}
        onScroll={handleMainScroll}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={() => {
              setRefreshing(true);
              void loadStudents();
            }}
            colors={['#059669']}
          />
        }
      >
        {/* 2a. Header Statis Workspace (Non-solid, bersih & elegan) */}
        <View style={[styles.staticTopBarWrapper, { paddingTop: insets.top + 8 }]}>
          <View style={styles.staticTopBarRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={handleBack}
              style={styles.staticSquircleBackBtn}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
            </TouchableOpacity>

            <View style={styles.staticHeaderTitles}>
              <View style={styles.staticBadgeRow}>
                <View style={styles.staticRoleBadge}>
                  <MaterialCommunityIcons
                    name={isPrincipal ? "shield-check-outline" : "clipboard-check-outline"}
                    size={12}
                    color="#047857"
                  />
                  <Text style={styles.staticRoleText}>
                    {isPrincipal ? "Supervisi Kepala Sekolah" : "Portal Guru & Musyrif"}
                  </Text>
                </View>
                <Text style={styles.staticYearText}>T.A {getDynamicAcademicYear(context)}</Text>
              </View>
              <Text style={styles.staticMainTitle} numberOfLines={1}>
                {isPrincipal ? "Monitoring & Supervisi Mutaba'ah" : "Mutaba'ah Yaumiyyah"}
              </Text>
              <Text style={styles.staticSubTitle} numberOfLines={1}>
                {isPrincipal
                  ? "Pantau kepatuhan & rekapitulasi amalan santri se-unit sekolah"
                  : "Pencatatan amalan ibadah harian & evaluasi berkala santri"}
              </Text>
            </View>
          </View>
        </View>

        {/* 2b. Badan Halaman Konten (Body) */}
        <View style={styles.bodyContentWrapper}>
          {/* UNIFIED FILTER CARD (Pola Filter Terpadu Presensi Siswa) */}
          <View style={styles.filterCard}>
            <View style={styles.filterCardHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="filter-variant" size={17} color="#059669" />
                <Text style={styles.filterCardTitle}>Filter Data Mutaba'ah</Text>
              </View>
              {(searchQuery.length > 0 || statusFilter !== 'all' || selectedDate !== isoDate(new Date())) ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    setSelectedDate(isoDate(new Date()));
                  }}
                >
                  <Text style={styles.filterResetBtn}>Reset Filter</Text>
                </TouchableOpacity>
              ) : null}
            </View>

            {/* In-Card Search Input Bar (Harmonisasi VIS-B2-005) */}
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
              <TextInput
                placeholder="Cari santri berdasarkan nama / NIS..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>

            {/* Card Pemilihan Rombel di Bodi */}
            <TouchableOpacity
              onPress={() => setClassPickerVisible(true)}
              style={styles.bodyRombelCard}
              activeOpacity={0.85}
            >
              <View style={styles.bodyRombelLeft}>
                <View style={styles.bodyRombelIconBox}>
                  <MaterialCommunityIcons name="google-classroom" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.bodyRombelSubLabel}>Rombel / Kelompok Binaan</Text>
                  <Text style={styles.bodyRombelMainTitle}>
                    {currentAssignment?.rombel_name || currentAssignment?.kelas_name || 'Semua Rombel Binaan'}
                  </Text>
                  <Text style={styles.bodyRombelCountText}>
                    {filteredStudents.length} Santri Binaan · {new Date(selectedDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}
                  </Text>
                </View>
              </View>
              <View style={styles.bodyRombelChevronBox}>
                <MaterialCommunityIcons name="chevron-down" size={18} color="#059669" />
              </View>
            </TouchableOpacity>

            {/* Card Pemilihan Tanggal di Bodi */}
            <View style={styles.bodyDateCard}>
              <TouchableOpacity onPress={() => shiftDate(-1)} style={styles.bodyDateNavBtn} activeOpacity={0.8}>
                <MaterialCommunityIcons name="chevron-left" size={18} color="#064E3B" />
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setSelectedDate(isoDate(new Date()))}
                style={styles.bodyDateInfoCenter}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="calendar-month-outline" size={16} color="#059669" />
                <View style={{ alignItems: 'center' }}>
                  <Text style={styles.bodyDateDayText}>
                    {new Date(selectedDate).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                    })}
                  </Text>
                  <Text style={styles.bodyDateSubHint}>
                    {selectedDate === isoDate(new Date()) ? '● Hari Ini' : 'Ketuk untuk kembali ke hari ini'}
                  </Text>
                </View>
              </TouchableOpacity>

              <TouchableOpacity onPress={() => shiftDate(1)} style={styles.bodyDateNavBtn} activeOpacity={0.8}>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#064E3B" />
              </TouchableOpacity>
            </View>
          </View>

          {/* KPI Stats Summary Bar (Warna Aktif Full Solid Sesuai Pilihan) */}
          <View style={styles.statsBar}>
            <TouchableOpacity
              onPress={() => setStatusFilter('all')}
              style={[styles.statItem, statusFilter === 'all' ? styles.statItemActiveAll : styles.statItemInactive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.statLabel, statusFilter === 'all' && styles.statLabelActiveWhite]}>Total Santri</Text>
              <Text style={[styles.statValue, statusFilter === 'all' ? styles.statValueActiveWhite : { color: '#0F172A' }]}>
                {stats.total}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setStatusFilter('finalized')}
              style={[styles.statItem, statusFilter === 'finalized' ? styles.statItemActiveFinalized : styles.statItemInactive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.statLabel, statusFilter === 'finalized' && styles.statLabelActiveWhite]}>Terverifikasi</Text>
              <Text style={[styles.statValue, statusFilter === 'finalized' ? styles.statValueActiveWhite : { color: '#047857' }]}>
                {stats.verified}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => setStatusFilter('pending')}
              style={[styles.statItem, statusFilter === 'pending' ? styles.statItemActivePending : styles.statItemInactive]}
              activeOpacity={0.8}
            >
              <Text style={[styles.statLabel, statusFilter === 'pending' && styles.statLabelActiveWhite]}>Menunggu</Text>
              <Text style={[styles.statValue, statusFilter === 'pending' ? styles.statValueActiveWhite : { color: '#B45309' }]}>
                {stats.pending}
              </Text>
            </TouchableOpacity>
          </View>

        {/* 2d. Student Card List (Desain Rapi, Anti-Berhimpitan, Anti-Overflow) */}
        <View style={styles.studentListSection}>
          {loading ? (
            <View style={styles.loaderBox}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loaderText}>Memuat amalan ibadah santri...</Text>
            </View>
          ) : filteredStudents.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Tidak Ada Data Santri</Text>
              <Text style={styles.emptySub}>
                Tidak ditemukan santri pada rombel ini atau kata kunci pencarian tidak sesuai.
              </Text>
            </View>
          ) : (
            filteredStudents.map((item: any, idx: number) => {
              const studentName = item.name || item.nama_lengkap || 'Santri';
              const nis = item.nis || '-';
              const parentName = getStudentParentName(item);
              const isFinal = item.status === 'finalized' || item.status === 'completed' || item.status === 'approved';
              const progress = item.progress || (isFinal ? 100 : 0);

              return (
                <View key={item.id || idx} style={styles.card}>
                  {/* Card Header */}
                  <View style={styles.cardHeader}>
                    <View style={styles.avatarCircle}>
                      <Text style={styles.avatarText}>
                        {(studentName || 'S').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.studentName} numberOfLines={1}>{studentName}</Text>
                      <Text style={styles.studentSub} numberOfLines={1}>
                        NIS: {nis} · Ortu: <Text style={{ color: '#047857', fontWeight: '700' }}>{parentName}</Text>
                      </Text>
                    </View>
                    <View style={[styles.statusBadge, isFinal ? styles.statusBadgeDone : styles.statusBadgePending]}>
                      <Text style={[styles.statusBadgeText, isFinal ? styles.statusBadgeTextDone : styles.statusBadgeTextPending]}>
                        {isFinal ? 'Disetujui' : 'Draft'}
                      </Text>
                    </View>
                  </View>

                  {/* Progress Indicator */}
                  <View style={styles.progressRow}>
                    <View style={styles.progressBar}>
                      <View style={[styles.progressFill, { width: `${progress}%` }]} />
                    </View>
                    <Text style={styles.progressText}>{progress}% Terisi</Text>
                  </View>

                  {/* Card Actions (Kepala Sekolah: Monitoring & Rekap Saja; Guru: Input, Cetak, Setujui) */}
                  {isPrincipal ? (
                    <View style={styles.principalCardActionRow}>
                      <TouchableOpacity
                        onPress={() => handleOpenPrintModal(item)}
                        style={styles.cardPrincipalPrintBtn}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="printer-outline" size={15} color="#0284C7" />
                        <Text style={styles.cardPrincipalPrintBtnText}>Cetak / Pratinjau Rekap</Text>
                      </TouchableOpacity>
                      <View style={[styles.principalStatusPill, isFinal ? styles.principalStatusPillDone : styles.principalStatusPillPending]}>
                        <MaterialCommunityIcons
                          name={isFinal ? 'check-decagram' : 'clock-outline'}
                          size={13}
                          color={isFinal ? '#059669' : '#D97706'}
                        />
                        <Text style={[styles.principalStatusPillText, { color: isFinal ? '#059669' : '#D97706' }]}>
                          {isFinal ? 'Telah Disetujui' : 'Menunggu Guru'}
                        </Text>
                      </View>
                    </View>
                  ) : (
                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        onPress={() => handleOpenInputModal(item)}
                        style={styles.cardInputBtn}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="pencil-outline" size={14} color="#047857" />
                        <Text style={styles.cardInputBtnText}>Isi Jurnal</Text>
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleOpenPrintModal(item)}
                        style={styles.cardPrintBtn}
                        activeOpacity={0.8}
                      >
                        <MaterialCommunityIcons name="printer-outline" size={14} color="#0284C7" />
                        <Text style={styles.cardPrintBtnText}>Cetak</Text>
                      </TouchableOpacity>

                      {!isFinal ? (
                        <TouchableOpacity
                          onPress={() => handleVerify(item)}
                          disabled={verifyingId === String(item.id)}
                          style={styles.cardVerifyBtn}
                          activeOpacity={0.8}
                        >
                          {verifyingId === String(item.id) ? (
                            <ActivityIndicator size="small" color="#FFFFFF" />
                          ) : (
                            <>
                              <MaterialCommunityIcons name="check-decagram" size={14} color="#FFFFFF" />
                              <Text style={styles.cardVerifyBtnText}>Setujui</Text>
                            </>
                          )}
                        </TouchableOpacity>
                      ) : (
                        <View style={styles.verifiedSmallBadge}>
                          <MaterialCommunityIcons name="check-all" size={14} color="#059669" />
                          <Text style={styles.verifiedSmallText}>Lengkap</Text>
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}
        </View>
      </View>
    </Animated.ScrollView>

      {/* MODAL 1: PICKER ROMBEL / KELAS */}
      <Modal visible={classPickerVisible} transparent animationType="slide" onRequestClose={() => setClassPickerVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>Pilih Rombel Binaan</Text>
              <TouchableOpacity onPress={() => setClassPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }} showsVerticalScrollIndicator={false}>
              {(context?.assignments || []).map((a: any) => {
                const isSelected = String(a.id) === String(assignmentId);
                const title = a.rombel_name || a.kelas_name || `Unit ${a.unit_name || 'Sekolah'}`;
                return (
                  <TouchableOpacity
                    key={a.id}
                    onPress={() => {
                      setAssignmentId(String(a.id));
                      setClassPickerVisible(false);
                    }}
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                    activeOpacity={0.8}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? 'check-circle' : 'circle-outline'}
                      size={18}
                      color={isSelected ? '#059669' : '#94A3B8'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerItemText, isSelected && styles.pickerItemTextActive]}>
                        {title}
                      </Text>
                      <Text style={styles.pickerItemSub}>{a.unit_name || 'Unit Pendidikan'}</Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* MODAL 2: INPUT JURNAL MUTABAAH SISWA (BOTTOM SHEET DARI BAWAH KE ATAS) */}
      <Modal visible={inputModalVisible} transparent animationType="slide" onRequestClose={() => setInputModalVisible(false)}>
        <View style={styles.modalOverlayBottom}>
          <View style={styles.inputModalContent}>
            {/* Top Sheet Drag Handle */}
            <View style={styles.sheetHandleWrap}>
              <View style={styles.sheetHandleBar} />
            </View>

            {/* Header Modal */}
            <View style={styles.inputModalHeader}>
              <View style={{ flex: 1, paddingRight: 8 }}>
                <Text style={styles.inputModalTitle} numberOfLines={1}>
                  Jurnal: {inputStudent?.name || inputStudent?.nama_lengkap}
                </Text>
                <Text style={styles.inputModalSub} numberOfLines={1}>
                  Ortu: {getStudentParentName(inputStudent)} · {inputDate}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setInputModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Scope Tabs Rapi Tanpa Berhimpitan (Segmented Container) */}
            <View style={styles.scopeTabsContainer}>
              <TouchableOpacity
                onPress={() => setInputScopeTab('all')}
                style={[styles.scopePill, inputScopeTab === 'all' && styles.scopePillActiveAll]}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="view-grid-outline"
                  size={14}
                  color={inputScopeTab === 'all' ? '#047857' : '#64748B'}
                />
                <Text
                  style={[styles.scopePillText, inputScopeTab === 'all' && styles.scopePillTextActiveAll]}
                  numberOfLines={1}
                >
                  Semua
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setInputScopeTab('school')}
                style={[styles.scopePill, inputScopeTab === 'school' && styles.scopePillActiveSchool]}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="school-outline"
                  size={14}
                  color={inputScopeTab === 'school' ? '#047857' : '#64748B'}
                />
                <Text
                  style={[styles.scopePillText, inputScopeTab === 'school' && styles.scopePillTextActiveSchool]}
                  numberOfLines={1}
                >
                  Di Sekolah
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => setInputScopeTab('home')}
                style={[styles.scopePill, inputScopeTab === 'home' && styles.scopePillActiveHome]}
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons
                  name="home-heart"
                  size={14}
                  color={inputScopeTab === 'home' ? '#047857' : '#64748B'}
                />
                <Text
                  style={[styles.scopePillText, inputScopeTab === 'home' && styles.scopePillTextActiveHome]}
                  numberOfLines={1}
                >
                  Pantauan Ortu
                </Text>
              </TouchableOpacity>
            </View>

            {/* Agenda Items List */}
            <ScrollView style={styles.inputItemsScroll} showsVerticalScrollIndicator={false}>
              {loadingInputModal ? (
                <View style={styles.loaderBox}>
                  <ActivityIndicator size="small" color="#059669" />
                  <Text style={styles.loaderText}>Memuat agenda amalan...</Text>
                </View>
              ) : (
                (template?.items || []).filter((item: any) => {
                  if (inputScopeTab === 'school') return item.scope !== 'home';
                  if (inputScopeTab === 'home') return item.scope === 'home';
                  return true;
                }).map((item: any) => {
                  const currentVal = inputValues[item.id] || '';
                  const activeOpt = STATUS_OPTIONS.find((o) => o.value === currentVal);

                  return (
                    <View key={item.id} style={styles.inputItemRow}>
                      <View style={styles.inputItemHeader}>
                        <View style={{ flex: 1, paddingRight: 6 }}>
                          <Text style={styles.inputItemName}>{item.name}</Text>
                          <Text style={styles.inputItemCategory}>
                            {item.scope === 'home' ? '🏠 Pantauan Ortu' : '🏫 Di Sekolah'}
                          </Text>
                        </View>
                        {/* Status Saat Ini: Default belum / kosong (—), jangan langsung B */}
                        <View
                          style={[
                            styles.itemStatusBadge,
                            !currentVal && styles.itemStatusBadgeUnset,
                            currentVal === 'good' && styles.itemStatusBadgeGood,
                            currentVal === 'less' && styles.itemStatusBadgeLess,
                            currentVal === 'not_done' && styles.itemStatusBadgeNotDone,
                            currentVal === 'na' && styles.itemStatusBadgeNa,
                          ]}
                        >
                          <Text
                            style={[
                              styles.itemStatusBadgeText,
                              !currentVal && styles.itemStatusTextUnset,
                              currentVal === 'good' && styles.itemStatusTextGood,
                              currentVal === 'less' && styles.itemStatusTextLess,
                              currentVal === 'not_done' && styles.itemStatusTextNotDone,
                              currentVal === 'na' && styles.itemStatusTextNa,
                            ]}
                          >
                            {activeOpt ? `${activeOpt.label} (${activeOpt.short})` : 'Belum Diisi (—)'}
                          </Text>
                        </View>
                      </View>

                      {/* Status Buttons (Bisa Toggle / Kosongkan Kembali jika sudah aktif) */}
                      <View style={styles.statusOptionsRow}>
                        {STATUS_OPTIONS.map((opt) => {
                          const isActive = currentVal === opt.value;
                          return (
                            <TouchableOpacity
                              key={opt.value}
                              onPress={() => {
                                const nextVal = isActive ? '' : opt.value;
                                handleSaveCell(item.id, nextVal);
                              }}
                              style={[
                                styles.statusOptBtn,
                                isActive && { backgroundColor: opt.color, borderColor: opt.color },
                              ]}
                              activeOpacity={0.8}
                            >
                              <Text
                                style={[
                                  styles.statusOptText,
                                  isActive && { color: '#FFFFFF', fontWeight: '800' },
                                ]}
                              >
                                {opt.label}
                              </Text>
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    </View>
                  );
                })
              )}
            </ScrollView>

            {/* Footer Modal */}
            <View style={styles.inputModalFooter}>
              <TouchableOpacity
                onPress={() => setInputModalVisible(false)}
                style={styles.inputModalDoneBtn}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                <Text style={styles.inputModalDoneText}>Selesai Mengisi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* MODAL 3: CETAK LAPORAN RESMI MUTABA'AH (100% SESUAI FORMAT WEB DASHBOARD) */}
      <TeacherMutabaahPrintModal
        visible={printModalVisible}
        student={previewStudent}
        assignment={currentAssignment}
        template={template}
        context={context}
        selectedDate={selectedDate}
        onClose={() => setPrintModalVisible(false)}
      />

      {/* Universal Feedback Modal */}
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
  screen: {
    flex: 1,
  },
  mainScrollContent: {
    flexGrow: 1,
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
    width: '100%',
    height: '100%',
    opacity: 0.45,
  },

  // 2. HEADER STATIS WORKSPACE (Translucent, Bersih & Elegan)
  staticTopBarWrapper: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: 'transparent',
  },
  staticTopBarRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  staticSquircleBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  staticHeaderTitles: {
    flex: 1,
  },
  staticBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  staticRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  staticRoleText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#064E3B',
  },
  staticYearText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  staticMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#064E3B',
  },
  staticSubTitle: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },

  // 2b. BODY CONTENT WRAPPER
  bodyContentWrapper: {
    paddingTop: 12,
  },
  filterCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginHorizontal: 16,
    marginBottom: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
    gap: 8,
  },
  filterCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ECFDF5',
  },
  filterCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  filterResetBtn: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  bodyRombelCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  bodyRombelLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  bodyRombelIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bodyRombelSubLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  bodyRombelMainTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 1,
  },
  bodyRombelCountText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  bodyRombelChevronBox: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bodyDateCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 5,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  bodyDateNavBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bodyDateInfoCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    flex: 1,
  },
  bodyDateDayText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  bodyDateSubHint: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
    marginTop: 1,
  },

  // KPI Stats Bar (Segmented Container & Solid Full Tabs)
  statsBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 14,
    padding: 4,
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  statItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 10,
  },
  statItemInactive: {
    backgroundColor: 'transparent',
  },
  statItemActiveAll: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  statItemActiveFinalized: {
    backgroundColor: '#047857',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  statItemActivePending: {
    backgroundColor: '#D97706',
    shadowColor: '#D97706',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  statLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  statLabelActiveWhite: {
    color: '#F8FAFC',
    fontWeight: '800',
  },
  statValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  statValueActiveWhite: {
    color: '#FFFFFF',
    fontWeight: '900',
    marginTop: 2,
  },

  // Search Bar
  searchBarWrap: {
    paddingHorizontal: 16,
    marginTop: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    gap: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    paddingVertical: 0,
  },

  // Student Cards
  studentListSection: {
    paddingHorizontal: 16,
    marginTop: 12,
    gap: 10,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
    overflow: 'hidden',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065F46',
  },
  metaCol: {
    flex: 1,
  },
  studentName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgeDone: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgePending: {
    backgroundColor: '#FFFBEB',
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  statusBadgeTextDone: {
    color: '#047857',
  },
  statusBadgeTextPending: {
    color: '#B45309',
  },
  progressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 10,
  },
  progressBar: {
    flex: 1,
    height: 5,
    backgroundColor: '#F1F5F9',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: '#10B981',
    borderRadius: 3,
  },
  progressText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  cardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderTopWidth: 1,
    borderTopColor: '#ECFDF5',
    paddingTop: 9,
  },
  cardInputBtn: {
    flex: 1.15,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  cardInputBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  cardPrintBtn: {
    flex: 0.9,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#F0F9FF',
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  cardPrintBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0284C7',
  },
  cardVerifyBtn: {
    flex: 0.95,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    backgroundColor: '#059669',
    paddingVertical: 7,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
    elevation: 2,
  },
  cardVerifyBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  verifiedSmallBadge: {
    flex: 0.95,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    paddingVertical: 7,
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  verifiedSmallText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  principalCardActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 9,
    gap: 8,
  },
  cardPrincipalPrintBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#F0F9FF',
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  cardPrincipalPrintBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0284C7',
  },
  principalStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
  },
  principalStatusPillDone: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  principalStatusPillPending: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  principalStatusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },

  // Modals
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  pickerModalContent: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 18,
    maxHeight: '75%',
    shadowColor: '#000',
    elevation: 8,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 8,
  },
  pickerModalTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 10,
    borderRadius: 12,
    gap: 10,
    marginBottom: 4,
  },
  pickerItemActive: {
    backgroundColor: '#FEF3C7',
  },
  pickerItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  pickerItemTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  pickerItemSub: {
    fontSize: 10,
    color: '#64748B',
  },
  modalOverlayBottom: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  sheetHandleWrap: {
    width: '100%',
    alignItems: 'center',
    paddingVertical: 8,
    backgroundColor: '#F0FDF4',
  },
  sheetHandleBar: {
    width: 44,
    height: 4.5,
    borderRadius: 3,
    backgroundColor: '#A7F3D0',
  },
  inputModalContent: {
    width: '100%',
    maxHeight: '90%',
    height: '84%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 10,
  },
  inputModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  inputModalTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  inputModalSub: {
    fontSize: 10.5,
    color: '#047857',
    marginTop: 2,
    fontWeight: '600',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  // Scope Tabs Segmented Container (Rapi & Anti-Berhimpitan)
  scopeTabsContainer: {
    flexDirection: 'row',
    padding: 4,
    marginHorizontal: 14,
    marginVertical: 10,
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    gap: 4,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  scopePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 7,
    paddingHorizontal: 6,
    borderRadius: 9,
    backgroundColor: 'transparent',
  },
  scopePillActiveAll: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1.5,
  },
  scopePillActiveSchool: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1.5,
  },
  scopePillActiveHome: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#10B981',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1.5,
  },
  scopePillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  scopePillTextActiveAll: {
    color: '#047857',
    fontWeight: '800',
  },
  scopePillTextActiveSchool: {
    color: '#047857',
    fontWeight: '800',
  },
  scopePillTextActiveHome: {
    color: '#047857',
    fontWeight: '800',
  },
  inputItemsScroll: {
    paddingHorizontal: 14,
    paddingTop: 4,
    paddingBottom: 16,
  },
  inputItemRow: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  inputItemHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 9,
  },
  inputItemName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  inputItemCategory: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  itemStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  itemStatusBadgeUnset: {
    backgroundColor: '#F8FAFC',
    borderColor: '#CBD5E1',
  },
  itemStatusBadgeGood: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  itemStatusBadgeLess: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  itemStatusBadgeNotDone: {
    backgroundColor: '#FFF1F2',
    borderColor: '#FECDD3',
  },
  itemStatusBadgeNa: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  itemStatusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  itemStatusTextUnset: {
    color: '#94A3B8',
  },
  itemStatusTextGood: {
    color: '#047857',
  },
  itemStatusTextLess: {
    color: '#B45309',
  },
  itemStatusTextNotDone: {
    color: '#E11D48',
  },
  itemStatusTextNa: {
    color: '#64748B',
  },
  statusOptionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statusOptBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 9,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusOptText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  inputModalFooter: {
    padding: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  inputModalDoneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#047857',
    borderRadius: 12,
    paddingVertical: 10,
  },
  inputModalDoneText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loaderBox: {
    paddingVertical: 40,
    alignItems: 'center',
  },
  loaderText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 8,
  },
  emptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
  },
});
