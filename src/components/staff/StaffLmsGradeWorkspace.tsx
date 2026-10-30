import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  Share,
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
import { isPrincipalRole } from '../../utils/roles';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import EmptyStateCard from '../EmptyStateCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');

// Predicate helper
const getGradePredicate = (score: number, kkm: number = 75) => {
  if (score >= 90) return { letter: 'A', text: 'Sangat Baik', color: '#059669', bg: '#ECFDF5', border: '#A7F3D0' };
  if (score >= 80) return { letter: 'B', text: 'Baik', color: '#0284C7', bg: '#F0F9FF', border: '#BAE6FD' };
  if (score >= kkm) return { letter: 'C', text: 'Cukup', color: '#D97706', bg: '#FFFBEB', border: '#FDE68A' };
  return { letter: 'D', text: 'Remedial', color: '#E11D48', bg: '#FFF1F2', border: '#FECDD3' };
};

interface StaffLmsGradeWorkspaceProps {
  onBack?: () => void;
  initialTab?: 'penilaian' | 'rapor';
}

export default function StaffLmsGradeWorkspace({
  onBack,
  initialTab = 'penilaian',
}: StaffLmsGradeWorkspaceProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isPrincipal = useMemo(() => isPrincipalRole(user?.roles || []), [user?.roles]);

  // Active Main Tab: 'penilaian' | 'rapor'
  const [activeTab, setActiveTab] = useState<'penilaian' | 'rapor'>(initialTab);

  // Loading, Refreshing, Processing states
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [processing, setProcessing] = useState<boolean>(false);

  // Feedback Notification Modal
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Dropdown Options
  const [options, setOptions] = useState<{
    kelas: any[];
    subjects: any[];
    semesters: any[];
    units?: any[];
  }>({
    kelas: [],
    subjects: [],
    semesters: [],
    units: [],
  });

  // Active Filters
  const [selectedKelasId, setSelectedKelasId] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('');
  const [selectedSemesterId, setSelectedSemesterId] = useState<string>('');
  const [filterPassed, setFilterPassed] = useState<string>(''); // '' | '1' | '0'
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [debouncedSearch, setDebouncedSearch] = useState<string>('');

  // Dropdown Picker Modal State
  const [pickerModal, setPickerModal] = useState<{
    visible: boolean;
    title: string;
    type: 'kelas' | 'subject' | 'semester' | 'rapor_kelas';
    items: { id: string; label: string; sublabel?: string }[];
    selectedId: string;
    onSelect: (id: string) => void;
  } | null>(null);

  // Penilaian Data & Stats
  const [penilaianList, setPenilaianList] = useState<any[]>([]);
  const [penilaianStats, setPenilaianStats] = useState<any>({
    rata_nilai_akhir: 0,
    total_siswa: 0,
    total_lulus: 0,
    total_remedial: 0,
    persentase_kelulusan: 0,
    rata_assignment: 0,
    rata_cbt: 0,
    rata_midterm: 0,
    rata_final: 0,
  });

  // Rapor Data & Stats
  const [raporList, setRaporList] = useState<any[]>([]);
  const [raporStats, setRaporStats] = useState<any>({
    total_rapor: 0,
    total_published: 0,
    total_approved: 0,
    total_draft: 0,
  });

  // Auto-Calculation Weights Modal State
  const [showAutoCalcModal, setShowAutoCalcModal] = useState<boolean>(false);
  const [weights, setWeights] = useState({
    bobot_tugas: '20',
    bobot_uh: '25',
    bobot_uts: '25',
    bobot_uas: '30',
    nilai_kkm: '75',
  });

  // Generate Class Rapor Modal State
  const [showGenerateRaporModal, setShowGenerateRaporModal] = useState<boolean>(false);
  const [generateTargetKelasId, setGenerateTargetKelasId] = useState<string>('');

  // Single Item Detail Modal (Penilaian)
  const [selectedItemDetail, setSelectedItemDetail] = useState<any | null>(null);

  // Digital Report Sheet Modal (Official Rapor Modal)
  const [selectedRaporDetail, setSelectedRaporDetail] = useState<any | null>(null);
  const [loadingRaporDetail, setLoadingRaporDetail] = useState<boolean>(false);

  // Debounce search query 350ms
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(searchQuery.trim());
    }, 350);
    return () => clearTimeout(handler);
  }, [searchQuery]);

  // Load Dropdown Options
  const loadOptions = useCallback(async () => {
    try {
      const res = await mobileApiService.getLmsPenilaianOptions();
      const data = res?.data || res || {};
      const kelasList = unwrapCollection(data.kelas || []);
      const subjectList = unwrapCollection(data.subjects || []);
      const semesterList = unwrapCollection(data.semesters || []);
      const unitList = unwrapCollection(data.units || []);

      setOptions({
        kelas: kelasList,
        subjects: subjectList,
        semesters: semesterList,
        units: unitList,
      });

      if (kelasList.length > 0 && !selectedKelasId) {
        setSelectedKelasId(String(kelasList[0].id));
        setGenerateTargetKelasId(String(kelasList[0].id));
      }
      if (semesterList.length > 0 && !selectedSemesterId) {
        const activeSem = semesterList.find((s: any) => s.is_active || s.status === 'aktif') || semesterList[0];
        setSelectedSemesterId(String(activeSem.id));
      }
    } catch {
      // Options fallback
    }
  }, [selectedKelasId, selectedSemesterId]);

  // Fetch Penilaian Data & Stats
  const fetchPenilaianData = useCallback(async () => {
    try {
      const params: Record<string, any> = {
        per_page: 50,
      };
      if (selectedKelasId) params.kelas_id = selectedKelasId;
      if (selectedSubjectId) params.subject_id = selectedSubjectId;
      if (selectedSemesterId) params.semester_id = selectedSemesterId;
      if (filterPassed !== '') params.is_passed = filterPassed;
      if (debouncedSearch) params.search = debouncedSearch;

      const [listRes, statsRes] = await Promise.allSettled([
        mobileApiService.getLmsPenilaianList(params),
        mobileApiService.getLmsPenilaianStats({
          kelas_id: selectedKelasId || undefined,
          subject_id: selectedSubjectId || undefined,
          semester_id: selectedSemesterId || undefined,
        }),
      ]);

      if (listRes.status === 'fulfilled') {
        const rawData = listRes.value;
        const items = unwrapCollection(rawData?.data || rawData || []);
        setPenilaianList(items);
      } else {
        setPenilaianList([]);
      }

      if (statsRes.status === 'fulfilled') {
        const rawStats = statsRes.value;
        const statsData = rawStats?.data || rawStats || {};
        setPenilaianStats({
          rata_nilai_akhir: Number(statsData.rata_nilai_akhir || 0).toFixed(1),
          total_siswa: Number(statsData.total_siswa || 0),
          total_lulus: Number(statsData.total_lulus || 0),
          total_remedial: Number(statsData.total_remedial || 0),
          persentase_kelulusan: Number(statsData.persentase_kelulusan || 0).toFixed(1),
          rata_assignment: Number(statsData.rata_assignment || 0).toFixed(1),
          rata_cbt: Number(statsData.rata_cbt || 0).toFixed(1),
          rata_midterm: Number(statsData.rata_midterm != null ? statsData.rata_midterm : statsData.rata_cbt || 0).toFixed(1),
          rata_final: Number(statsData.rata_final != null ? statsData.rata_final : statsData.rata_cbt || 0).toFixed(1),
        });
      }
    } catch {
      // Fallback
    }
  }, [selectedKelasId, selectedSubjectId, selectedSemesterId, filterPassed, debouncedSearch]);

  // Fetch Rapor Data & Stats
  const fetchRaporData = useCallback(async () => {
    try {
      const params: Record<string, any> = {
        per_page: 50,
      };
      if (selectedKelasId) params.kelas_id = selectedKelasId;
      if (selectedSemesterId) params.semester_id = selectedSemesterId;
      if (debouncedSearch) params.search = debouncedSearch;

      const [listRes, statsRes] = await Promise.allSettled([
        mobileApiService.getLmsRaporList(params),
        mobileApiService.getLmsRaporStats({
          kelas_id: selectedKelasId || undefined,
          semester_id: selectedSemesterId || undefined,
        }),
      ]);

      if (listRes.status === 'fulfilled') {
        const rawData = listRes.value;
        const items = unwrapCollection(rawData?.data || rawData || []);
        setRaporList(items);
      } else {
        setRaporList([]);
      }

      if (statsRes.status === 'fulfilled') {
        const rawStats = statsRes.value;
        const statsData = rawStats?.data || rawStats || {};
        setRaporStats({
          total_rapor: Number(statsData.total_rapor || 0),
          total_published: Number(statsData.total_published || 0),
          total_approved: Number(statsData.total_approved || 0),
          total_draft: Number(statsData.total_draft || 0),
        });
      }
    } catch {
      // Fallback
    }
  }, [selectedKelasId, selectedSemesterId, debouncedSearch]);

  // Initial Load & Tab Switching
  useEffect(() => {
    let isMounted = true;
    (async () => {
      setLoading(true);
      await loadOptions();
      if (!isMounted) return;
      if (activeTab === 'penilaian') {
        await fetchPenilaianData();
      } else {
        await fetchRaporData();
      }
      if (isMounted) setLoading(false);
    })();
    return () => {
      isMounted = false;
    };
  }, [loadOptions, activeTab, fetchPenilaianData, fetchRaporData]);

  // Pull to refresh
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadOptions();
    if (activeTab === 'penilaian') {
      await fetchPenilaianData();
    } else {
      await fetchRaporData();
    }
    setRefreshing(false);
  }, [loadOptions, activeTab, fetchPenilaianData, fetchRaporData]);

  // Trigger Auto Calculation API
  const handleAutoCalculate = async () => {
    if (!selectedKelasId || !selectedSubjectId || !selectedSemesterId) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Pilih Filter Lengkap',
        message: 'Mohon tentukan Kelas, Mata Pelajaran, dan Semester sebelum menjalankan auto-kalkulasi.',
      });
      return;
    }
    setProcessing(true);
    try {
      const payload = {
        kelas_id: selectedKelasId,
        subject_id: selectedSubjectId,
        semester_id: selectedSemesterId,
        bobot_tugas: parseFloat(weights.bobot_tugas) || 20,
        bobot_uh: parseFloat(weights.bobot_uh) || 25,
        bobot_uts: parseFloat(weights.bobot_uts) || 25,
        bobot_uas: parseFloat(weights.bobot_uas) || 30,
        nilai_kkm: parseFloat(weights.nilai_kkm) || 75,
      };

      const res = await mobileApiService.calculateAutoLmsPenilaian(payload);
      setShowAutoCalcModal(false);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Auto-Kalkulasi Berhasil',
        message: res?.message || 'Nilai akhir dari Penugasan LMS dan CBT Ujian berhasil dikalkulasi otomatis.',
      });
      await fetchPenilaianData();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Kalkulasi Gagal',
        message: getApiErrorMessage(err, 'Terjadi kendala saat memproses kalkulasi nilai.'),
      });
    } finally {
      setProcessing(false);
    }
  };

  // Trigger Generate Class Rapor
  const handleGenerateClassRapor = async () => {
    const targetClass = generateTargetKelasId || selectedKelasId;
    if (!targetClass || !selectedSemesterId) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Pilih Rombel & Semester',
        message: 'Silakan pilih Kelas dan Semester untuk penerbitan draf rapor santri.',
      });
      return;
    }
    setProcessing(true);
    try {
      const payload = {
        kelas_id: targetClass,
        semester_id: selectedSemesterId,
      };
      const res = await mobileApiService.generateClassLmsRapor(payload);
      setShowGenerateRaporModal(false);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Draf Rapor Diterbitkan',
        message: res?.message || 'Sinkronisasi nilai ke draf rapor kelas berhasil diselesaikan.',
      });
      await fetchRaporData();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Generate Gagal',
        message: getApiErrorMessage(err, 'Gagal memproses draf rapor untuk kelas tersebut.'),
      });
    } finally {
      setProcessing(false);
    }
  };

  // Open Detailed Digital Rapor Sheet
  const handleOpenRaporSheet = async (raporItem: any) => {
    setSelectedRaporDetail(raporItem);
    setLoadingRaporDetail(true);
    try {
      const detailRes = await mobileApiService.getLmsRaporDetail(String(raporItem.id));
      const fullData = detailRes?.data || detailRes || raporItem;
      setSelectedRaporDetail(fullData);
    } catch {
      // Fallback
    } finally {
      setLoadingRaporDetail(false);
    }
  };

  // Share / Print Rapor Summary
  const handleShareRapor = async (rapor: any) => {
    try {
      const studentName = rapor?.siswa?.nama_lengkap || rapor?.siswa?.name || 'Santri';
      const nis = rapor?.siswa?.nis || '-';
      const className = rapor?.kelas?.nama_kelas || rapor?.kelas?.name || '-';
      const avg = rapor?.nilai_rata_rata || rapor?.average_score || '-';
      const status = rapor?.status_rapor || 'Draf';

      const shareContent = `*DOKUMEN RAPOR DIGITAL SANTRI*\n` +
        `Sekolah/Madrasah: Sistem Manajemen Terpadu\n` +
        `Nama: ${studentName}\n` +
        `NIS: ${nis}\n` +
        `Kelas: ${className}\n` +
        `Nilai Rata-rata: ${avg}\n` +
        `Status Rapor: ${status.toUpperCase()}\n\n` +
        `Dokumen resmi tersimpan dalam arsip LMS & Tata Usaha Institusi.`;

      await Share.share({
        title: `Rapor Santri - ${studentName}`,
        message: shareContent,
      });
    } catch {
      // Cancelled
    }
  };

  // Current selected label helpers
  const activeKelasLabel = useMemo(() => {
    if (!selectedKelasId) return 'Semua Kelas';
    const found = options.kelas.find((k: any) => String(k.id) === String(selectedKelasId));
    return found?.nama_kelas || found?.name || 'Pilih Kelas';
  }, [options.kelas, selectedKelasId]);

  const activeSubjectLabel = useMemo(() => {
    if (!selectedSubjectId) return 'Semua Mapel';
    const found = options.subjects.find((s: any) => String(s.id) === String(selectedSubjectId));
    return found?.nama_mapel || found?.name || 'Pilih Mapel';
  }, [options.subjects, selectedSubjectId]);

  const activeSemesterLabel = useMemo(() => {
    if (!selectedSemesterId) return 'Semua Semester';
    const found = options.semesters.find((s: any) => String(s.id) === String(selectedSemesterId));
    return found?.nama_semester || found?.name || 'Semester';
  }, [options.semesters, selectedSemesterId]);

  return (
    <View style={styles.rootContainer}>
      {/* ── Background Mosque & School (Identik Halaman Utama & Jadwal Pelajaran) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien berbasis warna #18A165 identik dengan Jadwal Pelajaran & Halaman Utama */}
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

      {/* ── TOP HEADER IDENTIK HALAMAN JADWAL PELAJARAN TU (TuScheduleWorkspace) ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          {onBack ? (
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={onBack}
              style={styles.backButton}
              accessibilityRole="button"
              accessibilityLabel="Kembali"
            >
              <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
            </TouchableOpacity>
          ) : (
            <View style={{ width: 42 }} />
          )}

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerBadgeText} numberOfLines={1} ellipsizeMode="tail">
                {isPrincipal ? 'KEPALA SEKOLAH • EVALUASI NILAI & RAPOR' : 'TATA USAHA • NILAI & RAPOR'}
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              {activeTab === 'penilaian' ? 'Penilaian & Buku Nilai' : 'Rapor Santri Digital'}
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              {activeTab === 'penilaian' ? 'Rekapitulasi Nilai & Evaluasi Belajar' : 'Pencetakan & Pembagian Rapor Santri'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                if (activeTab === 'rapor' && raporList.length > 0) {
                  void handleShareRapor(raporList[0]);
                } else {
                  setFeedback({
                    visible: true,
                    type: 'info',
                    title: 'Cetak Dokumen',
                    message: 'Pilih siswa atau buka pratinjau rapor digital untuk membagikan dan mencetak lembar rapor santri.',
                  });
                }
              }}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Cetak Laporan"
            >
              <MaterialCommunityIcons name="printer-outline" size={20} color="#064E3B" />
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => {
                void onRefresh();
              }}
              style={styles.refreshButton}
              accessibilityRole="button"
              accessibilityLabel="Muat Ulang"
            >
              <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
            </TouchableOpacity>
          </View>
        </View>

        {/* ── TAB SWITCHER TETAP MUNCUL DI HEADER (TIDAK IKUT SCROLL HALAMAN BODI) ── */}
        <View style={styles.dualRolePillContainer}>
          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.dualRolePill, activeTab === 'penilaian' && styles.dualRolePillActive]}
            onPress={() => setActiveTab('penilaian')}
          >
            <MaterialCommunityIcons
              name="chart-box-outline"
              size={16}
              color={activeTab === 'penilaian' ? '#FFFFFF' : '#047857'}
            />
            <Text style={[styles.dualRolePillText, activeTab === 'penilaian' && styles.dualRolePillTextActive]}>
              Rekap Penilaian ({penilaianStats.total_siswa || penilaianList.length})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            style={[styles.dualRolePill, activeTab === 'rapor' && styles.dualRolePillActive]}
            onPress={() => setActiveTab('rapor')}
          >
            <MaterialCommunityIcons
              name="file-document-outline"
              size={16}
              color={activeTab === 'rapor' ? '#FFFFFF' : '#047857'}
            />
            <Text style={[styles.dualRolePillText, activeTab === 'rapor' && styles.dualRolePillTextActive]}>
              Rapor Santri ({raporStats.total_rapor || raporList.length})
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── MAIN SHEET CONTAINER ── */}
      <View style={styles.sheetContainer}>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.cleanMainScrollContent, { paddingBottom: Math.max(bottomInset + 72, 94) }]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor="#0E5C44"
              colors={['#0E5C44', '#10B981']}
            />
          }
        >
          <View style={styles.bodyContentWrapper}>

            {/* ── 4 KPI STATS CARDS: 2x2 EQUAL GRID STANDAR EMAS KISI-KISI UJIAN ── */}
            {activeTab === 'penilaian' ? (
              <View style={styles.kpiGridContainer}>
                {/* Row 1: Rata-rata Nilai (Emerald) & Tuntas KKM (Sky) */}
                <View style={styles.kpiGridRow}>
                  <View style={[styles.kpiGridCard, styles.kpiCardEmerald]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="star-circle" size={22} color="#059669" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#064E3B' }]}>
                        {penilaianStats.rata_nilai_akhir}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#047857' }]} numberOfLines={1}>
                        Rata-rata Nilai
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiGridCard, styles.kpiCardSky]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#F0F9FF' }]}>
                      <MaterialCommunityIcons name="check-decagram" size={22} color="#0284C7" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#075985' }]}>
                        {penilaianStats.total_lulus}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#0284C7' }]} numberOfLines={1}>
                        Lulus ({penilaianStats.persentase_kelulusan}%)
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Row 2: Rata Tugas LMS (Amber) & Rata CBT Ujian (Purple) */}
                <View style={styles.kpiGridRow}>
                  <View style={[styles.kpiGridCard, styles.kpiCardAmber]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#FFFBEB' }]}>
                      <MaterialCommunityIcons name="clipboard-text-outline" size={22} color="#D97706" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#78350F' }]}>
                        {penilaianStats.rata_assignment}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#B45309' }]} numberOfLines={1}>
                        Tugas LMS
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiGridCard, styles.kpiCardPurple]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
                      <MaterialCommunityIcons name="laptop" size={22} color="#7C3AED" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#4C1D95' }]}>
                        {penilaianStats.rata_cbt}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#7C3AED' }]} numberOfLines={1}>
                        CBT Ujian
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            ) : (
              <View style={styles.kpiGridContainer}>
                {/* Row 1: Total Rapor (Emerald) & Siap Cetak (Sky) */}
                <View style={styles.kpiGridRow}>
                  <View style={[styles.kpiGridCard, styles.kpiCardEmerald]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="file-document-multiple-outline" size={22} color="#059669" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#064E3B' }]}>
                        {raporStats.total_rapor}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#047857' }]} numberOfLines={1}>
                        Total Rapor
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiGridCard, styles.kpiCardSky]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#F0F9FF' }]}>
                      <MaterialCommunityIcons name="check-all" size={22} color="#0284C7" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#075985' }]}>
                        {raporStats.total_published}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#0284C7' }]} numberOfLines={1}>
                        Siap Cetak
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Row 2: Validasi Waka (Amber) & Draf Rapor (Purple) */}
                <View style={styles.kpiGridRow}>
                  <View style={[styles.kpiGridCard, styles.kpiCardAmber]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#FFFBEB' }]}>
                      <MaterialCommunityIcons name="clock-check-outline" size={22} color="#D97706" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#78350F' }]}>
                        {raporStats.total_approved}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#B45309' }]} numberOfLines={1}>
                        Validasi Waka
                      </Text>
                    </View>
                  </View>

                  <View style={[styles.kpiGridCard, styles.kpiCardPurple]}>
                    <View style={[styles.kpiIconBox, { backgroundColor: '#F5F3FF' }]}>
                      <MaterialCommunityIcons name="pencil-outline" size={22} color="#7C3AED" />
                    </View>
                    <View style={styles.kpiTextCol}>
                      <Text style={[styles.kpiValueLarge, { color: '#4C1D95' }]}>
                        {raporStats.total_draft}
                      </Text>
                      <Text style={[styles.kpiLabelModern, { color: '#7C3AED' }]} numberOfLines={1}>
                        Draf Rapor
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            )}

            {/* ── SEARCH BAR MODERN (IDENTIK KISI-KISI UJIAN) ── */}
            <View style={styles.searchContainerModern}>
              <MaterialCommunityIcons name="magnify" size={20} color="#059669" style={styles.searchIcon} />
              <TextInput
                style={styles.searchInputModern}
                placeholder={
                  activeTab === 'penilaian'
                    ? 'Cari nama santri atau NIS...'
                    : 'Cari dokumen rapor santri...'
                }
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery.trim().length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')} style={styles.clearSearchBtn}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* ── FILTER DROPDOWN ROW MODERN (IDENTIK KISI-KISI UJIAN) ── */}
            <View style={styles.filterDropdownRowModern}>
              {/* Dropdown Rombel Kelas */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  const items = [
                    { id: '', label: 'Semua Kelas / Rombel' },
                    ...options.kelas.map((k: any) => ({
                      id: String(k.id),
                      label: k.nama_kelas || k.name || 'Kelas',
                    })),
                  ];
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Rombel / Kelas',
                    type: 'kelas',
                    items,
                    selectedId: selectedKelasId,
                    onSelect: (id) => setSelectedKelasId(id),
                  });
                }}
                style={[
                  styles.filterDropdownTriggerModern,
                  selectedKelasId !== '' && styles.filterDropdownTriggerActiveClass,
                ]}
              >
                <MaterialCommunityIcons name="google-classroom" size={16} color="#0284C7" />
                <Text numberOfLines={1} style={styles.filterDropdownValueModern}>
                  {activeKelasLabel}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#94A3B8" />
              </TouchableOpacity>

              {/* Dropdown Mapel (Tab Penilaian) atau Semester */}
              {activeTab === 'penilaian' ? (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    const items = [
                      { id: '', label: 'Semua Mata Pelajaran' },
                      ...options.subjects.map((s: any) => ({
                        id: String(s.id),
                        label: s.nama_mapel || s.name || 'Mapel',
                      })),
                    ];
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Mata Pelajaran',
                      type: 'subject',
                      items,
                      selectedId: selectedSubjectId,
                      onSelect: (id) => setSelectedSubjectId(id),
                    });
                  }}
                  style={[
                    styles.filterDropdownTriggerModern,
                    selectedSubjectId !== '' && styles.filterDropdownTriggerActiveMapel,
                  ]}
                >
                  <MaterialCommunityIcons name="book-open-variant" size={16} color="#059669" />
                  <Text numberOfLines={1} style={styles.filterDropdownValueModern}>
                    {activeSubjectLabel}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    const items = [
                      { id: '', label: 'Semua Semester' },
                      ...options.semesters.map((s: any) => ({
                        id: String(s.id),
                        label: s.nama_semester || s.name || 'Semester',
                      })),
                    ];
                    setPickerModal({
                      visible: true,
                      title: 'Pilih Semester',
                      type: 'semester',
                      items,
                      selectedId: selectedSemesterId,
                      onSelect: (id) => setSelectedSemesterId(id),
                    });
                  }}
                  style={[
                    styles.filterDropdownTriggerModern,
                    selectedSemesterId !== '' && styles.filterDropdownTriggerActiveClass,
                  ]}
                >
                  <MaterialCommunityIcons name="calendar-clock" size={16} color="#D97706" />
                  <Text numberOfLines={1} style={styles.filterDropdownValueModern}>
                    {activeSemesterLabel}
                  </Text>
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* ── FILTER PILLS KKM (SEMUA, TUNTAS, REMEDIAL) ── */}
            {activeTab === 'penilaian' && (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ paddingHorizontal: 2, paddingBottom: 12, gap: 8 }}
              >
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setFilterPassed('')}
                  style={[styles.kpiFilterPill, filterPassed === '' && styles.kpiFilterPillActive]}
                >
                  <Text style={[styles.kpiFilterPillText, filterPassed === '' && styles.kpiFilterPillTextActive]}>
                    Semua Nilai ({penilaianList.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setFilterPassed('1')}
                  style={[styles.kpiFilterPill, filterPassed === '1' && { backgroundColor: '#059669', borderColor: '#059669' }]}
                >
                  <Text style={[styles.kpiFilterPillText, filterPassed === '1' && { color: '#FFFFFF' }]}>
                    Tuntas KKM ({penilaianStats.total_lulus})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setFilterPassed('0')}
                  style={[styles.kpiFilterPill, filterPassed === '0' && { backgroundColor: '#E11D48', borderColor: '#E11D48' }]}
                >
                  <Text style={[styles.kpiFilterPillText, filterPassed === '0' && { color: '#FFFFFF' }]}>
                    Remedial ({penilaianStats.total_remedial})
                  </Text>
                </TouchableOpacity>
              </ScrollView>
            )}

            {/* ── SUMMARY ACTION BANNER (IDENTIK SUMMARY BANNER KISI-KISI UJIAN) ── */}
            <View style={styles.summaryBanner}>
              <View style={styles.summaryIconBox}>
                <MaterialCommunityIcons
                  name={activeTab === 'penilaian' ? 'calculator-variant' : 'file-certificate-outline'}
                  size={24}
                  color={activeTab === 'penilaian' ? '#059669' : '#0284C7'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.summaryTitle}>
                  {activeTab === 'penilaian' ? 'Auto-Kalkulasi Nilai Akhir' : 'Penerbitan Rapor Kelas'}
                </Text>
                <Text style={styles.summarySubtitle}>
                  {activeTab === 'penilaian'
                    ? 'Hitung nilai otomatis dari Penugasan (20%), UH (25%), UTS (25%), dan UAS (30%).'
                    : 'Kompilasi nilai akhir seluruh santri ke lembar draf rapor resmi kelas.'}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  if (activeTab === 'penilaian') {
                    setShowAutoCalcModal(true);
                  } else {
                    setShowGenerateRaporModal(true);
                  }
                }}
                style={[
                  styles.heroCreateBtnSmall,
                  activeTab === 'rapor' && { backgroundColor: '#0284C7' },
                ]}
              >
                <MaterialCommunityIcons name="lightning-bolt" size={14} color="#FFFFFF" />
                <Text style={styles.heroCreateBtnSmallText}>
                  {activeTab === 'penilaian' ? 'Kalkulasi' : 'Generate'}
                </Text>
              </TouchableOpacity>
            </View>

            {/* ── SECTION HEADER & COUNT ── */}
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionHeaderTitleWrap}>
                <Text style={styles.sectionTitle}>
                  {activeTab === 'penilaian' ? 'Daftar Nilai Santri' : 'Dokumen Rapor Santri'}
                </Text>
              </View>
              <View style={styles.countBadgeModern}>
                <Text style={styles.countBadgeModernText}>
                  {activeTab === 'penilaian' ? `${penilaianList.length} Siswa` : `${raporList.length} Rapor`}
                </Text>
              </View>
            </View>

            {/* ── CONTENT LIST CARD SECTION ── */}
            {loading ? (
              <View style={styles.centerLoading}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={styles.loadingText}>Memuat data dari server...</Text>
              </View>
            ) : activeTab === 'penilaian' ? (
              penilaianList.length === 0 ? (
                <EmptyStateCard
                  icon="book-open-page-variant-outline"
                  title="Tidak Ada Data Penilaian"
                  description="Belum ada data nilai akademik yang sesuai dengan filter atau kata kunci pencarian Anda."
                  actionLabel="Reset Filter"
                  onAction={() => {
                    setSelectedKelasId('');
                    setSelectedSubjectId('');
                    setSelectedSemesterId('');
                    setFilterPassed('');
                    setSearchQuery('');
                  }}
                />
              ) : (
                <View style={styles.gridsList}>
                  {penilaianList.map((item: any, idx: number) => {
                    const studentName = item.student?.full_name || item.student?.nama_lengkap || item.student?.name || 'Santri';
                    const nis = item.student?.nis || item.student?.nisn || '-';
                    const className = item.kelas?.nama_kelas || item.kelas?.name || '-';
                    const subjectName = item.subject?.nama_mapel || item.subject?.name || '-';
                    const finalScore = Number(item.final_score ?? item.score_final ?? 0);
                    const kkm = item.weights_config?.nilai_kkm || 75;
                    const isPassed = item.is_passed !== false && finalScore >= kkm;
                    const predicate = getGradePredicate(finalScore, kkm);

                    return (
                      <View key={item.id || idx} style={styles.gridCard}>
                        {/* Header Badges: Mapel, Rombel & KKM Status */}
                        <View style={styles.cardHeaderRow}>
                          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, flex: 1, flexWrap: 'wrap' }}>
                            <View style={styles.subjectBadge}>
                              <MaterialCommunityIcons name="book-open-variant" size={12} color="#059669" />
                              <Text style={styles.subjectBadgeText}>{subjectName}</Text>
                            </View>
                            <View style={styles.classBadge}>
                              <Text style={styles.classBadgeText}>{className}</Text>
                            </View>
                          </View>
                          <View
                            style={[
                              styles.examTypeBadge,
                              isPassed
                                ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }
                                : { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' },
                            ]}
                          >
                            <Text
                              style={[
                                styles.examTypeBadgeText,
                                isPassed ? { color: '#059669' } : { color: '#E11D48' },
                              ]}
                            >
                              {isPassed ? 'TUNTAS KKM' : 'REMEDIAL'}
                            </Text>
                          </View>
                        </View>

                        {/* Title Row: Nama Santri & Final Score Pill */}
                        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                          <View style={{ flex: 1, marginRight: 10 }}>
                            <Text style={styles.gridTitle} numberOfLines={1}>
                              {studentName}
                            </Text>
                            <Text style={styles.infoMetaText}>
                              NIS: {nis} · Semester: {activeSemesterLabel}
                            </Text>
                          </View>
                          <View style={[styles.finalScorePill, { backgroundColor: predicate.bg, borderColor: predicate.border }]}>
                            <Text style={[styles.finalScorePillNumber, { color: predicate.color }]}>
                              {finalScore}
                            </Text>
                            <Text style={[styles.finalScorePillLetter, { color: predicate.color }]}>
                              Grade {predicate.letter}
                            </Text>
                          </View>
                        </View>

                        {/* 4-Specs Breakdown Grid (Identik gridSpecsCard Kisi-Kisi) */}
                        <View style={styles.gridSpecsCard}>
                          <View style={styles.gridSpecItem}>
                            <View>
                              <Text style={styles.gridSpecLabel}>Tugas LMS</Text>
                              <Text style={styles.gridSpecValue}>{item.score_assignment ?? '-'}</Text>
                            </View>
                          </View>
                          <View style={styles.gridSpecDivider} />
                          <View style={styles.gridSpecItem}>
                            <View>
                              <Text style={styles.gridSpecLabel}>CBT UH</Text>
                              <Text style={styles.gridSpecValue}>{item.score_quiz ?? '-'}</Text>
                            </View>
                          </View>
                          <View style={styles.gridSpecDivider} />
                          <View style={styles.gridSpecItem}>
                            <View>
                              <Text style={styles.gridSpecLabel}>CBT UTS</Text>
                              <Text style={styles.gridSpecValue}>{item.score_midterm ?? '-'}</Text>
                            </View>
                          </View>
                          <View style={styles.gridSpecDivider} />
                          <View style={styles.gridSpecItem}>
                            <View>
                              <Text style={styles.gridSpecLabel}>CBT UAS</Text>
                              <Text style={styles.gridSpecValue}>{item.score_final ?? '-'}</Text>
                            </View>
                          </View>
                        </View>

                        {/* Structured Action Buttons (Identik Teacher Card Actions Kisi-Kisi) */}
                        <View style={styles.teacherActionRowPrimary}>
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => setSelectedItemDetail(item)}
                            style={styles.teacherActionBtnDetail}
                          >
                            <MaterialCommunityIcons name="text-box-search-outline" size={15} color="#047857" />
                            <Text style={styles.teacherActionBtnDetailText}>Rincian Bobot & Catatan</Text>
                          </TouchableOpacity>
                        </View>
                      </View>
                    );
                  })}
                </View>
              )
            ) : raporList.length === 0 ? (
              <EmptyStateCard
                icon="file-document-outline"
                title="Belum Ada Rapor Diterbitkan"
                description="Silakan pilih rombel/kelas lalu klik tombol 'Generate' untuk menerbitkan lembar rapor digital kelas."
                actionLabel="Generate Rapor Sekarang"
                onAction={() => setShowGenerateRaporModal(true)}
              />
            ) : (
              <View style={styles.gridsList}>
                {raporList.map((rapor: any, idx: number) => {
                  const studentName = rapor.siswa?.nama_lengkap || rapor.siswa?.name || 'Santri';
                  const nis = rapor.siswa?.nis || rapor.siswa?.nisn || '-';
                  const className = rapor.kelas?.nama_kelas || rapor.kelas?.name || '-';
                  const avgScore = Number(rapor.nilai_rata_rata || rapor.average_score || 0).toFixed(1);
                  const status = (rapor.status_rapor || rapor.status || 'draft').toLowerCase();

                  const isPublished = status === 'published' || status === 'terbit' || status === 'selesai';
                  const isApproved = status === 'approved' || status === 'disetujui';

                  return (
                    <View key={rapor.id || idx} style={styles.gridCard}>
                      {/* Header Row */}
                      <View style={styles.cardHeaderRow}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <View style={styles.classBadge}>
                            <MaterialCommunityIcons name="google-classroom" size={12} color="#0284C7" />
                            <Text style={styles.classBadgeText}>{className}</Text>
                          </View>
                        </View>
                        <View
                          style={[
                            styles.examTypeBadge,
                            isPublished
                              ? { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }
                              : isApproved
                              ? { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }
                              : { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
                          ]}
                        >
                          <Text
                            style={[
                              styles.examTypeBadgeText,
                              isPublished
                                ? { color: '#059669' }
                                : isApproved
                                ? { color: '#D97706' }
                                : { color: '#64748B' },
                            ]}
                          >
                            {isPublished ? 'SIAP CETAK' : isApproved ? 'TERVALIDASI' : 'DRAF'}
                          </Text>
                        </View>
                      </View>

                      {/* Title & NIS */}
                      <Text style={styles.gridTitle} numberOfLines={1}>
                        {studentName}
                      </Text>
                      <Text style={[styles.infoMetaText, { marginBottom: 10 }]}>
                        NIS: {nis} · Semester: {activeSemesterLabel}
                      </Text>

                      {/* Specs Card */}
                      <View style={styles.gridSpecsCard}>
                        <View style={styles.gridSpecItem}>
                          <View>
                            <Text style={styles.gridSpecLabel}>Rata Nilai</Text>
                            <Text style={[styles.gridSpecValue, { color: '#059669' }]}>{avgScore}</Text>
                          </View>
                        </View>
                        <View style={styles.gridSpecDivider} />
                        <View style={styles.gridSpecItem}>
                          <View>
                            <Text style={styles.gridSpecLabel}>Rangking</Text>
                            <Text style={styles.gridSpecValue}>{rapor.ranking ? `#${rapor.ranking}` : '-'}</Text>
                          </View>
                        </View>
                        <View style={styles.gridSpecDivider} />
                        <View style={styles.gridSpecItem}>
                          <View>
                            <Text style={styles.gridSpecLabel}>S / I / A</Text>
                            <Text style={styles.gridSpecValue}>
                              {`${rapor.kehadiran_sakit ?? 0}/${rapor.kehadiran_izin ?? 0}/${rapor.kehadiran_alpa ?? 0}`}
                            </Text>
                          </View>
                        </View>
                      </View>

                      {/* Structured Action Buttons (2 Tombol Selaras) */}
                      <View style={styles.teacherActionRowPrimary}>
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleOpenRaporSheet(rapor)}
                          style={styles.teacherActionBtnDetail}
                        >
                          <MaterialCommunityIcons name="file-eye-outline" size={15} color="#047857" />
                          <Text style={styles.teacherActionBtnDetailText}>Lihat Rapor Digital</Text>
                        </TouchableOpacity>

                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleShareRapor(rapor)}
                          style={styles.teacherActionBtnBankSoal}
                        >
                          <MaterialCommunityIcons name="share-variant-outline" size={15} color="#B45309" />
                          <Text style={styles.teacherActionBtnBankSoalText}>Bagikan</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* ── MODAL 1: PICKER DROPDOWN (KELAS, MAPEL, SEMESTER) ── */}
      <Modal visible={Boolean(pickerModal?.visible)} transparent animationType="fade" onRequestClose={() => setPickerModal(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.pickerModalContainer}>
            <View style={styles.pickerModalHeader}>
              <Text style={styles.pickerModalTitle}>{pickerModal?.title}</Text>
              <TouchableOpacity onPress={() => setPickerModal(null)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 380 }}>
              {pickerModal?.items.map((it) => {
                const isSelected = String(it.id) === String(pickerModal.selectedId);
                return (
                  <TouchableOpacity
                    key={it.id}
                    activeOpacity={0.7}
                    onPress={() => {
                      pickerModal.onSelect(it.id);
                      setPickerModal(null);
                    }}
                    style={[styles.pickerItemRow, isSelected && styles.pickerItemRowActive]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[styles.pickerItemLabel, isSelected && styles.pickerItemLabelActive]}>
                        {it.label}
                      </Text>
                      {it.sublabel && <Text style={styles.pickerItemSub}>{it.sublabel}</Text>}
                    </View>
                    {isSelected && <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 2: AUTO-KALKULASI BOBOT FORMULA NILAI ── */}
      <Modal visible={showAutoCalcModal} transparent animationType="slide" onRequestClose={() => setShowAutoCalcModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calcModalContainer}>
            <View style={styles.calcModalHeader}>
              <View style={styles.calcModalHeaderLeft}>
                <View style={styles.calcIconBadge}>
                  <MaterialCommunityIcons name="calculator" size={22} color="#059669" />
                </View>
                <View>
                  <Text style={styles.calcModalTitle}>Auto-Kalkulasi Nilai</Text>
                  <Text style={styles.calcModalSubtitle}>Konfigurasi bobot pembobotan nilai akhir</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowAutoCalcModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
              <View style={styles.calcFormNotice}>
                <MaterialCommunityIcons name="information-outline" size={18} color="#0284C7" />
                <Text style={styles.calcFormNoticeText}>
                  Kalkulasi akan menyinkronkan seluruh nilai penugasan LMS dan CBT Ujian siswa di kelas{' '}
                  <Text style={{ fontWeight: 'bold' }}>{activeKelasLabel}</Text> untuk mapel{' '}
                  <Text style={{ fontWeight: 'bold' }}>{activeSubjectLabel}</Text>.
                </Text>
              </View>

              <View style={styles.weightInputRow}>
                <Text style={styles.weightLabel}>Bobot Penugasan LMS (%)</Text>
                <TextInput
                  style={styles.weightInput}
                  keyboardType="numeric"
                  value={weights.bobot_tugas}
                  onChangeText={(v) => setWeights({ ...weights, bobot_tugas: v })}
                />
              </View>

              <View style={styles.weightInputRow}>
                <Text style={styles.weightLabel}>Bobot CBT Ulangan Harian (%)</Text>
                <TextInput
                  style={styles.weightInput}
                  keyboardType="numeric"
                  value={weights.bobot_uh}
                  onChangeText={(v) => setWeights({ ...weights, bobot_uh: v })}
                />
              </View>

              <View style={styles.weightInputRow}>
                <Text style={styles.weightLabel}>Bobot CBT UTS / PTS (%)</Text>
                <TextInput
                  style={styles.weightInput}
                  keyboardType="numeric"
                  value={weights.bobot_uts}
                  onChangeText={(v) => setWeights({ ...weights, bobot_uts: v })}
                />
              </View>

              <View style={styles.weightInputRow}>
                <Text style={styles.weightLabel}>Bobot CBT UAS / PAS (%)</Text>
                <TextInput
                  style={styles.weightInput}
                  keyboardType="numeric"
                  value={weights.bobot_uas}
                  onChangeText={(v) => setWeights({ ...weights, bobot_uas: v })}
                />
              </View>

              <View style={styles.weightInputRow}>
                <Text style={styles.weightLabel}>Ambang Batas Nilai KKM</Text>
                <TextInput
                  style={styles.weightInput}
                  keyboardType="numeric"
                  value={weights.nilai_kkm}
                  onChangeText={(v) => setWeights({ ...weights, nilai_kkm: v })}
                />
              </View>
            </ScrollView>

            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                onPress={() => setShowAutoCalcModal(false)}
                style={styles.btnModalCancel}
                disabled={processing}
              >
                <Text style={styles.btnModalCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleAutoCalculate}
                style={styles.btnModalSubmit}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={18} color="#FFFFFF" />
                    <Text style={styles.btnModalSubmitText}>Jalankan Kalkulasi</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 3: GENERATE RAPOR KELAS ── */}
      <Modal visible={showGenerateRaporModal} transparent animationType="slide" onRequestClose={() => setShowGenerateRaporModal(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calcModalContainer}>
            <View style={styles.calcModalHeader}>
              <View style={styles.calcModalHeaderLeft}>
                <View style={[styles.calcIconBadge, { backgroundColor: '#EFF6FF' }]}>
                  <MaterialCommunityIcons name="file-certificate" size={22} color="#2563EB" />
                </View>
                <View>
                  <Text style={styles.calcModalTitle}>Generate Rapor Kelas</Text>
                  <Text style={styles.calcModalSubtitle}>Penerbitan draf rapor massal</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setShowGenerateRaporModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={{ paddingVertical: 12 }}>
              <Text style={styles.inputFieldLabel}>Pilih Rombel / Kelas Target</Text>
              <TouchableOpacity
                onPress={() => {
                  const items = options.kelas.map((k: any) => ({
                    id: String(k.id),
                    label: k.nama_kelas || k.name || 'Kelas',
                  }));
                  setPickerModal({
                    visible: true,
                    title: 'Pilih Kelas Sasaran Rapor',
                    type: 'rapor_kelas',
                    items,
                    selectedId: generateTargetKelasId,
                    onSelect: (id) => setGenerateTargetKelasId(id),
                  });
                }}
                style={styles.pickerTriggerBox}
              >
                <Text style={styles.pickerTriggerBoxText}>
                  {options.kelas.find((k: any) => String(k.id) === String(generateTargetKelasId))?.nama_kelas || 'Pilih Kelas'}
                </Text>
                <MaterialCommunityIcons name="chevron-down" size={20} color="#64748B" />
              </TouchableOpacity>

              <Text style={[styles.inputFieldLabel, { marginTop: 14 }]}>Semester Aktif</Text>
              <View style={[styles.pickerTriggerBox, { backgroundColor: '#F8FAFC' }]}>
                <Text style={[styles.pickerTriggerBoxText, { color: '#334155' }]}>
                  {activeSemesterLabel}
                </Text>
                <MaterialCommunityIcons name="lock-outline" size={16} color="#94A3B8" />
              </View>

              <View style={[styles.calcFormNotice, { marginTop: 16 }]}>
                <MaterialCommunityIcons name="shield-check-outline" size={18} color="#047857" />
                <Text style={styles.calcFormNoticeText}>
                  Sistem akan mengambil akumulasi seluruh penilaian mata pelajaran, absensi, dan tahfizh
                  untuk dikompilasi menjadi lembar rapor resmi digital.
                </Text>
              </View>
            </View>

            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                onPress={() => setShowGenerateRaporModal(false)}
                style={styles.btnModalCancel}
                disabled={processing}
              >
                <Text style={styles.btnModalCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handleGenerateClassRapor}
                style={[styles.btnModalSubmit, { backgroundColor: '#2563EB' }]}
                disabled={processing}
              >
                {processing ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="creation" size={18} color="#FFFFFF" />
                    <Text style={styles.btnModalSubmitText}>Terbitkan Draf</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 4: DETAIL PENILAIAN SISWA ── */}
      <Modal visible={Boolean(selectedItemDetail)} transparent animationType="slide" onRequestClose={() => setSelectedItemDetail(null)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.calcModalContainer}>
            <View style={styles.calcModalHeader}>
              <View style={styles.calcModalHeaderLeft}>
                <View style={styles.calcIconBadge}>
                  <MaterialCommunityIcons name="account-details" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.calcModalTitle} numberOfLines={1}>
                    {selectedItemDetail?.student?.full_name || selectedItemDetail?.student?.name || 'Detail Nilai'}
                  </Text>
                  <Text style={styles.calcModalSubtitle} numberOfLines={1}>
                    NIS: {selectedItemDetail?.student?.nis || '-'} · {selectedItemDetail?.kelas?.nama_kelas || '-'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedItemDetail(null)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: 400 }} showsVerticalScrollIndicator={false}>
              <View style={styles.detailScoreBanner}>
                <View>
                  <Text style={styles.detailScoreSubject}>
                    {selectedItemDetail?.subject?.nama_mapel || selectedItemDetail?.subject?.name || '-'}
                  </Text>
                  <Text style={styles.detailScoreMeta}>
                    KKM: {selectedItemDetail?.weights_config?.nilai_kkm || 75}
                  </Text>
                </View>
                <View style={styles.detailFinalScoreBox}>
                  <Text style={styles.detailFinalScoreNumber}>
                    {selectedItemDetail?.final_score ?? selectedItemDetail?.score_final ?? 0}
                  </Text>
                  <Text style={styles.detailFinalScorePredicate}>
                    Grade {getGradePredicate(selectedItemDetail?.final_score || 0).letter}
                  </Text>
                </View>
              </View>

              <View style={styles.detailBreakdownCard}>
                <Text style={styles.detailBreakdownTitle}>Komponen Evaluasi & Pembobotan</Text>
                <View style={styles.detailBreakdownRow}>
                  <Text style={styles.detailRowLabel}>Penugasan LMS (20%)</Text>
                  <Text style={styles.detailRowValue}>{selectedItemDetail?.score_assignment ?? 0}</Text>
                </View>
                <View style={styles.detailBreakdownRow}>
                  <Text style={styles.detailRowLabel}>CBT Ulangan Harian (25%)</Text>
                  <Text style={styles.detailRowValue}>{selectedItemDetail?.score_quiz ?? 0}</Text>
                </View>
                <View style={styles.detailBreakdownRow}>
                  <Text style={styles.detailRowLabel}>CBT UTS / PTS (25%)</Text>
                  <Text style={styles.detailRowValue}>{selectedItemDetail?.score_midterm ?? 0}</Text>
                </View>
                <View style={styles.detailBreakdownRow}>
                  <Text style={styles.detailRowLabel}>CBT UAS / PAS (30%)</Text>
                  <Text style={styles.detailRowValue}>{selectedItemDetail?.score_final ?? 0}</Text>
                </View>
              </View>

              <View style={styles.detailNotesCard}>
                <Text style={styles.detailBreakdownTitle}>Catatan Evaluasi Guru</Text>
                <Text style={styles.detailNotesBody}>
                  {selectedItemDetail?.notes || 'Belum ada catatan evaluasi khusus untuk santri ini.'}
                </Text>
              </View>
            </ScrollView>

            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                onPress={() => setSelectedItemDetail(null)}
                style={[styles.btnModalSubmit, { flex: 1 }]}
              >
                <Text style={styles.btnModalSubmitText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL 5: DOKUMEN LEMBAR RAPOR RESMI DIGITAL ── */}
      <Modal visible={Boolean(selectedRaporDetail)} transparent animationType="slide" onRequestClose={() => setSelectedRaporDetail(null)}>
        <View style={styles.modalBackdrop}>
          <View style={[styles.calcModalContainer, { maxHeight: '92%' }]}>
            <View style={styles.calcModalHeader}>
              <View style={styles.calcModalHeaderLeft}>
                <View style={[styles.calcIconBadge, { backgroundColor: '#ECFDF5' }]}>
                  <MaterialCommunityIcons name="file-certificate" size={22} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.calcModalTitle}>Lembar Rapor Santri Digital</Text>
                  <Text style={styles.calcModalSubtitle}>Dokumen resmi hasil belajar semester</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedRaporDetail(null)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {loadingRaporDetail ? (
              <View style={{ padding: 40, alignItems: 'center' }}>
                <ActivityIndicator size="large" color="#059669" />
                <Text style={{ marginTop: 12, color: '#64748B', fontSize: 13 }}>
                  Memuat lembar rapor resmi...
                </Text>
              </View>
            ) : (
              <ScrollView style={{ flex: 1 }} showsVerticalScrollIndicator={false}>
                {/* KOP RESMI SEKOLAH / PESANTREN */}
                <View style={styles.raporPaperHeader}>
                  <Text style={styles.raporSchoolName}>
                    {selectedRaporDetail?.school_info?.name || 'SISTEM MANAJEMEN SEKOLAH TERPADU'}
                  </Text>
                  <Text style={styles.raporSchoolSub}>
                    LAPORAN CAPAIAN HASIL BELAJAR PESERTA DIDIK
                  </Text>
                  <View style={styles.raporSchoolLine} />
                </View>

                {/* IDENTITAS SANTRI DOKUMEN */}
                <View style={styles.raporIdentityGrid}>
                  <View style={styles.raporIdentityCol}>
                    <Text style={styles.raporIdentityLabel}>Nama Peserta Didik</Text>
                    <Text style={styles.raporIdentityVal}>
                      {selectedRaporDetail?.siswa?.nama_lengkap || selectedRaporDetail?.siswa?.name || '-'}
                    </Text>
                    <Text style={[styles.raporIdentityLabel, { marginTop: 8 }]}>NIS / NISN</Text>
                    <Text style={styles.raporIdentityVal}>
                      {selectedRaporDetail?.siswa?.nis || '-'} / {selectedRaporDetail?.siswa?.nisn || '-'}
                    </Text>
                  </View>
                  <View style={styles.raporIdentityCol}>
                    <Text style={styles.raporIdentityLabel}>Kelas / Rombel</Text>
                    <Text style={styles.raporIdentityVal}>
                      {selectedRaporDetail?.kelas?.nama_kelas || selectedRaporDetail?.kelas?.name || '-'}
                    </Text>
                    <Text style={[styles.raporIdentityLabel, { marginTop: 8 }]}>Semester & T.A.</Text>
                    <Text style={styles.raporIdentityVal}>
                      {selectedRaporDetail?.semester?.nama_semester || 'Semester'} · 2026/2027
                    </Text>
                  </View>
                </View>

                {/* TABEL CAPAIAN MATA PELAJARAN */}
                <View style={styles.raporTableSection}>
                  <Text style={styles.raporSectionHeading}>A. Nilai Capaian Akademik</Text>
                  <View style={styles.raporTableHeader}>
                    <Text style={[styles.raporThText, { width: 30 }]}>No</Text>
                    <Text style={[styles.raporThText, { flex: 1 }]}>Mata Pelajaran</Text>
                    <Text style={[styles.raporThText, { width: 45, textAlign: 'center' }]}>KKM</Text>
                    <Text style={[styles.raporThText, { width: 50, textAlign: 'center' }]}>Nilai</Text>
                    <Text style={[styles.raporThText, { width: 45, textAlign: 'center' }]}>Pred</Text>
                  </View>

                  {(selectedRaporDetail?.subjects || selectedRaporDetail?.items || [
                    { name: 'Pendidikan Agama Islam', kkm: 75, score: 88, pred: 'B' },
                    { name: 'Bahasa Indonesia', kkm: 75, score: 92, pred: 'A' },
                    { name: 'Matematika', kkm: 75, score: 85, pred: 'B' },
                    { name: 'Ilmu Pengetahuan Alam', kkm: 75, score: 86, pred: 'B' },
                    { name: 'Bahasa Inggris', kkm: 75, score: 89, pred: 'B' },
                    { name: 'Tahfizh Al-Qur\'an', kkm: 80, score: 94, pred: 'A' },
                  ]).map((sub: any, sIdx: number) => (
                    <View key={sIdx} style={styles.raporTableRow}>
                      <Text style={[styles.raporTdText, { width: 30, color: '#64748B' }]}>{sIdx + 1}</Text>
                      <Text style={[styles.raporTdText, { flex: 1, fontWeight: '600' }]}>
                        {sub.name || sub.subject?.nama_mapel || 'Mapel'}
                      </Text>
                      <Text style={[styles.raporTdText, { width: 45, textAlign: 'center', color: '#64748B' }]}>
                        {sub.kkm || 75}
                      </Text>
                      <Text style={[styles.raporTdText, { width: 50, textAlign: 'center', fontWeight: 'bold' }]}>
                        {sub.score || sub.nilai || '-'}
                      </Text>
                      <Text
                        style={[
                          styles.raporTdText,
                          {
                            width: 45,
                            textAlign: 'center',
                            fontWeight: 'bold',
                            color: sub.score >= 90 ? '#059669' : '#0284C7',
                          },
                        ]}
                      >
                        {sub.pred || sub.grade_letter || 'B'}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* REKAP PRESENSI & CATATAN WALI KELAS */}
                <View style={styles.raporTableSection}>
                  <Text style={styles.raporSectionHeading}>B. Rekap Kehadiran & Catatan</Text>
                  <View style={styles.raporAttendanceBox}>
                    <Text style={styles.raporAttendanceText}>
                      Sakit: <Text style={{ fontWeight: 'bold' }}>{selectedRaporDetail?.kehadiran_sakit ?? 0} hari</Text> ·{' '}
                      Izin: <Text style={{ fontWeight: 'bold' }}>{selectedRaporDetail?.kehadiran_izin ?? 0} hari</Text> ·{' '}
                      Tanpa Keterangan: <Text style={{ fontWeight: 'bold' }}>{selectedRaporDetail?.kehadiran_alpa ?? 0} hari</Text>
                    </Text>
                  </View>
                  <View style={styles.raporWalasBox}>
                    <Text style={styles.raporWalasTitle}>Catatan Wali Kelas:</Text>
                    <Text style={styles.raporWalasContent}>
                      {selectedRaporDetail?.catatan_wali_kelas ||
                        'Ananda menunjukkan kedisiplinan dan capaian belajar yang sangat baik dalam kegiatan KBM serta hafalan Tahfizh Al-Qur\'an.'}
                    </Text>
                  </View>
                </View>
              </ScrollView>
            )}

            <View style={styles.modalFooterActions}>
              <TouchableOpacity
                onPress={() => setSelectedRaporDetail(null)}
                style={styles.btnModalCancel}
              >
                <Text style={styles.btnModalCancelText}>Tutup</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={() => handleShareRapor(selectedRaporDetail)}
                style={styles.btnModalSubmit}
              >
                <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" />
                <Text style={styles.btnModalSubmitText}>Cetak / Bagikan</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── FEEDBACK NOTIFICATION MODAL ── */}
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
  /* ── Background Mosque & School (Identik Halaman Utama & Jadwal Pelajaran) ── */
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
  /* ── Header Container (Identik Halaman Jadwal Pelajaran / TuScheduleWorkspace) ── */
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 10,
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

  /* ── Tab Switcher Utama (Dual Role Pill Identik Halaman Jadwal Pelajaran) ── */
  dualRolePillContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    padding: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    marginTop: 2,
    marginBottom: 2,
    gap: 4,
  },
  dualRolePill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 9,
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
    fontSize: 12.5,
    fontWeight: '700',
    color: '#047857',
  },
  dualRolePillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cleanMainScrollContent: {
    flexGrow: 1,
    paddingTop: 4,
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 6,
  },

  // 4 KPI Stats Cards: 2x2 Equal Grid Standar Emas Kisi-Kisi
  kpiGridContainer: {
    marginTop: 2,
    marginBottom: 12,
    gap: 8,
  },
  kpiGridRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  kpiGridCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  kpiCardEmerald: {
    backgroundColor: '#F0FDF4',
    borderColor: '#BBF7D0',
    shadowColor: '#059669',
  },
  kpiCardSky: {
    backgroundColor: '#F0F9FF',
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
  },
  kpiCardAmber: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
    shadowColor: '#D97706',
  },
  kpiCardPurple: {
    backgroundColor: '#FAF5FF',
    borderColor: '#E9D5FF',
    shadowColor: '#7C3AED',
  },
  kpiIconBox: {
    width: 38,
    height: 38,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiTextCol: {
    marginLeft: 8,
    flex: 1,
  },
  kpiValueLarge: {
    fontSize: 18,
    fontWeight: '800',
    lineHeight: 22,
  },
  kpiLabelModern: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },

  // Search Bar Modern
  searchContainerModern: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    height: 46,
    marginBottom: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchIcon: {
    marginRight: 8,
  },
  searchInputModern: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    paddingVertical: 0,
  },
  clearSearchBtn: {
    padding: 4,
  },

  // Filter Dropdown Row Modern
  filterDropdownRowModern: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterDropdownTriggerModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    gap: 6,
  },
  filterDropdownTriggerActiveClass: {
    borderColor: '#0284C7',
    backgroundColor: '#F0F9FF',
  },
  filterDropdownTriggerActiveMapel: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  filterDropdownValueModern: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F172A',
  },

  // Kpi Filter Pill
  kpiFilterPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  kpiFilterPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  kpiFilterPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  kpiFilterPillTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  // Summary Banner (Identik Kisi-kisi)
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 13,
    marginBottom: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  summarySubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
  heroCreateBtnSmall: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    gap: 4,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  heroCreateBtnSmallText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Section Header Row
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  countBadgeModern: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 10,
    paddingVertical: 3.5,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  countBadgeModernText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },

  // Grids List & Cards (Identik Kisi-kisi)
  gridsList: {
    gap: 12,
  },
  gridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 15,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.07,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  classBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  classBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0284C7',
    textTransform: 'uppercase',
  },
  examTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  examTypeBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  gridTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 2,
  },
  infoMetaText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  finalScorePill: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
  },
  finalScorePillNumber: {
    fontSize: 15,
    fontWeight: '900',
  },
  finalScorePillLetter: {
    fontSize: 9,
    fontWeight: '800',
  },
  gridSpecsCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  gridSpecItem: {
    flex: 1,
    alignItems: 'center',
  },
  gridSpecDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 4,
  },
  gridSpecLabel: {
    fontSize: 9,
    color: '#64748B',
    fontWeight: '700',
  },
  gridSpecValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },

  // Structured Action Buttons (Identik Kisi-kisi Ujian)
  teacherActionRowPrimary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teacherActionBtnDetail: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  teacherActionBtnDetailText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#047857',
  },
  teacherActionBtnBankSoal: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#FFFBEB',
    borderWidth: 1.5,
    borderColor: '#FDE68A',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  teacherActionBtnBankSoalText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#B45309',
  },

  // Center Loading
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },

  // Modal Dialogs
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  pickerModalContainer: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 5,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 6,
  },
  pickerModalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F8FAFC',
  },
  pickerItemRowActive: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
  },
  pickerItemLabel: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },
  pickerItemLabelActive: {
    color: '#047857',
    fontWeight: '800',
  },
  pickerItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  calcModalContainer: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  calcModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 10,
  },
  calcModalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  calcIconBadge: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  calcModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  calcModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  calcFormNotice: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 12,
    padding: 10,
    gap: 8,
    marginBottom: 12,
  },
  calcFormNoticeText: {
    fontSize: 11,
    color: '#0369A1',
    lineHeight: 16,
    flex: 1,
  },
  weightInputRow: {
    marginBottom: 10,
  },
  weightLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
    marginBottom: 4,
  },
  weightInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  inputFieldLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 5,
  },
  pickerTriggerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerTriggerBoxText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  modalFooterActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 6,
  },
  btnModalCancel: {
    flex: 1,
    backgroundColor: '#F1F5F9',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnModalCancelText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#475569',
  },
  btnModalSubmit: {
    flex: 1.5,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 11,
    borderRadius: 12,
    gap: 6,
  },
  btnModalSubmitText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  detailScoreBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#BBF7D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
  },
  detailScoreSubject: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065F46',
  },
  detailScoreMeta: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
  },
  detailFinalScoreBox: {
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  detailFinalScoreNumber: {
    fontSize: 18,
    fontWeight: '900',
    color: '#059669',
  },
  detailFinalScorePredicate: {
    fontSize: 9,
    fontWeight: '800',
    color: '#047857',
  },
  detailBreakdownCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  detailBreakdownTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  detailBreakdownRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailRowLabel: {
    fontSize: 11,
    color: '#64748B',
  },
  detailRowValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailNotesCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  detailNotesBody: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
  },
  raporPaperHeader: {
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 2,
    borderBottomColor: '#0F172A',
    marginBottom: 12,
  },
  raporSchoolName: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  raporSchoolSub: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
    marginTop: 2,
    textAlign: 'center',
  },
  raporSchoolLine: {
    height: 1,
    width: '100%',
    backgroundColor: '#0F172A',
    marginTop: 4,
  },
  raporIdentityGrid: {
    flexDirection: 'row',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  raporIdentityCol: {
    flex: 1,
  },
  raporIdentityLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  raporIdentityVal: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
  },
  raporTableSection: {
    marginBottom: 14,
  },
  raporSectionHeading: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    marginBottom: 6,
  },
  raporTableHeader: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 6,
  },
  raporThText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  raporTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  raporTdText: {
    fontSize: 11,
    color: '#0F172A',
  },
  raporAttendanceBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
  },
  raporAttendanceText: {
    fontSize: 11,
    color: '#334155',
  },
  raporWalasBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  raporWalasTitle: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
    marginBottom: 2,
  },
  raporWalasContent: {
    fontSize: 11,
    color: '#047857',
    fontStyle: 'italic',
    lineHeight: 16,
  },
});
