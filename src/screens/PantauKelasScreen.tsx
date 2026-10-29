import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import {
  isPrincipalRole,
  isFoundationRole,
  isSuperAdminRole,
  isTuRole,
  isDivisiRole,
} from '../utils/roles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

export default function PantauKelasScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const localNav = useNavigation<any>();
  const nav = navigation || localNav;
  const user = useAuthStore((state) => state.user);

  // ── Role & Strict Unit Scope Resolution ──
  const roles = user?.roles || [];
  const isPrincipal = isPrincipalRole(roles);
  const isFoundation = isFoundationRole(roles);
  const isSuperAdmin = isSuperAdminRole(roles);
  const isDivisi = isDivisiRole(roles);
  const isTu = isTuRole(roles);
  const isGlobalPersonnel = isFoundation || isSuperAdmin || isDivisi;

  const currentUserUnitId = useMemo(() => {
    return (
      (user as any)?.education_unit_id ||
      (user as any)?.unit_id ||
      (user as any)?.unit?.id ||
      (user as any)?.employee?.unit_id ||
      (user?.metadata as any)?.unit_id ||
      (user?.metadata as any)?.education_unit_id ||
      null
    );
  }, [user]);

  const currentUserUnitName = useMemo(() => {
    return (
      (user as any)?.education_unit?.nama_unit ||
      (user as any)?.education_unit?.name ||
      (user as any)?.unit?.name ||
      (user as any)?.unit?.nama_unit ||
      ''
    );
  }, [user]);

  // ── States ──
  const [classes, setClasses] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');

  // ── Filter Kuota (Disaring melalui KPI Card interaktif) ──
  const [filterStatusRuang, setFilterStatusRuang] = useState<'all' | 'tersedia' | 'penuh' | 'over'>('all');

  // ── Drill-down Santri Per Rombel Modal ──
  const [selectedClassForDrilldown, setSelectedClassForDrilldown] = useState<any | null>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [loadingClassStudents, setLoadingClassStudents] = useState<boolean>(false);

  // ── Pindah / Kenaikan Kelas Massal State ──
  const [selectedStudentIds, setSelectedStudentIds] = useState<string[]>([]);
  const [singleStudentToMove, setSingleStudentToMove] = useState<any | null>(null);
  const [isPindahModalOpen, setIsPindahModalOpen] = useState<boolean>(false);
  const [targetKelasId, setTargetKelasId] = useState<string>('');
  const [transferMode, setTransferMode] = useState<'pindah_rombel' | 'kenaikan_kelas'>('pindah_rombel');
  const [movingLoading, setMovingLoading] = useState<boolean>(false);

  // ── Modal Ubah Kuota Rombel ──
  const [editingClass, setEditingClass] = useState<any | null>(null);
  const [newCapacity, setNewCapacity] = useState<string>('30');
  const [savingCapacity, setSavingCapacity] = useState<boolean>(false);

  // ── Feedback Notification Modal ──
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  }>({
    visible: false,
    title: '',
  });

  // Debounce search input (350ms)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(search.trim().toLowerCase());
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // ── Load Data dengan Strict Unit Scoping ──
  const loadData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const classParams: any = { per_page: 100 };
      const studentParams: any = { per_page: 500 };

      // Kunci parameter jika Kepala Sekolah atau TU (bukan global personnel)
      if (!isGlobalPersonnel && currentUserUnitId) {
        classParams.unit_pendidikan_id = currentUserUnitId;
        studentParams.unit_id = currentUserUnitId;
      }

      const [resClasses, resStudents] = await Promise.all([
        mobileApiService.getClasses(classParams),
        mobileApiService.getStudents(studentParams),
      ]);

      const collClasses = unwrapCollection(resClasses);
      const collStudents = unwrapCollection(resStudents);

      const rawClassesList = Array.isArray(collClasses) ? collClasses : [];
      const rawStudentsList = Array.isArray(collStudents) ? collStudents : [];

      // Defense filtering di sisi client untuk menjamin tidak ada kebocoran unit
      const finalClasses = (!isGlobalPersonnel && currentUserUnitId)
        ? rawClassesList.filter((c: any) => {
            const uId = c.unit_pendidikan_id || c.unit_id || c.unitPendidikan?.id || c.unit?.id;
            return !uId || String(uId) === String(currentUserUnitId);
          })
        : rawClassesList;

      const finalStudents = (!isGlobalPersonnel && currentUserUnitId)
        ? rawStudentsList.filter((st: any) => {
            const uId = st.unit_id || st.unit_pendidikan_id || st.education_unit_id || st.education_unit?.id;
            return !uId || String(uId) === String(currentUserUnitId);
          })
        : rawStudentsList;

      setClasses(finalClasses);
      setAllStudents(finalStudents);

      if (isPull) {
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Data Rombel Diperbarui',
          message: `Berhasil memuat ${finalClasses.length} rombel kelas operasional.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Data Kelas',
        message: err?.message || 'Terjadi gangguan jaringan saat memuat daftar rombel.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isGlobalPersonnel, currentUserUnitId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle Go Back
  const handleGoBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(nav);
    if (!handled) {
      if (nav.canGoBack()) {
        nav.goBack();
      } else {
        nav.navigate('Beranda');
      }
    }
  };

  // ── Chat Internal Dari Aplikasi (Bukan WhatsApp Eksternal) ──
  const handleOpenInternalChat = (wali: any, className: string) => {
    const waliId = String(wali?.id || wali?.user_id || wali?.employee_id || '');
    const waliName =
      wali?.nama_tampil ||
      wali?.nama_lengkap ||
      wali?.nama ||
      wali?.name ||
      'Wali Kelas';

    const chatPayload = {
      teacherId: waliId,
      employeeId: waliId,
      recipientId: waliId,
      teacherName: waliName,
      employeeName: waliName,
      title: `Chat: ${waliName}`,
      topic: `Koordinasi Kelas ${className}`,
      className: className,
    };

    try {
      if (nav?.navigate) {
        nav.navigate('Chat', chatPayload);
        return;
      }
    } catch {
      try {
        if (nav?.navigate) {
          nav.navigate('Chat Guru', chatPayload);
          return;
        }
      } catch {}
    }

    setFeedback({
      visible: true,
      type: 'info',
      title: 'Chat Internal SIMS',
      message: `Membuka ruang perpesanan internal aplikasi dengan Ustadz/Ustadzah ${waliName} (${className}).`,
    });
  };

  // Open Drill-Down Santri di Rombel
  const handleOpenClassStudents = async (cls: any) => {
    setSelectedClassForDrilldown(cls);
    setLoadingClassStudents(true);

    try {
      const cId = String(cls.id);
      const res = await mobileApiService.getClassStudents(cId).catch(() => null);
      const coll = unwrapCollection(res);

      if (Array.isArray(coll) && coll.length > 0) {
        setClassStudents(coll);
      } else {
        // Fallback filter dari allStudents
        const localList = allStudents.filter((st) => {
          const sClassId = String(st.kelas_id || st.kelas?.id || '');
          const sClassName = String(st.kelas?.nama_kelas || st.kelas_nama || '').toLowerCase();
          const targetName = String(cls.name || cls.nama_kelas || '').toLowerCase();
          return sClassId === cId || (Boolean(targetName) && sClassName === targetName);
        });
        setClassStudents(localList);
      }
    } catch {
      const localList = allStudents.filter((st) => {
        const sClassId = String(st.kelas_id || st.kelas?.id || '');
        return sClassId === String(cls.id);
      });
      setClassStudents(localList);
    } finally {
      setLoadingClassStudents(false);
    }
  };

  // ── Open Ubah Kuota Modal ──
  const handleOpenEditCapacity = (cls: any) => {
    setEditingClass(cls);
    setNewCapacity(String(cls.kapasitas || 30));
  };

  // ── Simpan Pembaruan Kuota Rombel ──
  const handleSaveCapacity = async () => {
    if (!editingClass) return;
    const parsedCap = parseInt(newCapacity, 10);
    if (isNaN(parsedCap) || parsedCap < 1) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Kapasitas Tidak Valid',
        message: 'Kapasitas rombel minimal harus 1 siswa.',
      });
      return;
    }

    setSavingCapacity(true);
    try {
      const classId = String(editingClass.id);

      await mobileApiService.updateClass(classId, {
        kapasitas: parsedCap,
        unit_pendidikan_id: editingClass.unit_pendidikan_id || editingClass.unitPendidikan?.id || currentUserUnitId,
        tahun_ajaran_id: editingClass.tahun_ajaran_id || editingClass.tahunAjaran?.id,
        semester_id: editingClass.semester_id || editingClass.semester?.id,
        jenjang: editingClass.jenjang || editingClass.unitPendidikan?.level || editingClass.unit_name || '',
        tingkat: String(editingClass.tingkat || '1'),
        kode_kelas: editingClass.kode_kelas || editingClass.code,
        nama_kelas: editingClass.nama_kelas || editingClass.name,
        status: editingClass.status || 'Aktif',
        wali_kelas_id: editingClass.wali_kelas_id || editingClass.wali_kelas?.id || null,
      });

      // Update state lokal
      setClasses((prev) =>
        prev.map((c) => (String(c.id) === classId ? { ...c, kapasitas: parsedCap } : c))
      );

      setEditingClass(null);
      setFeedback({
        visible: true,
        type: 'success',
        title: 'Kuota Rombel Berhasil Diubah',
        message: `Kapasitas rombel ${editingClass.name || editingClass.nama_kelas} kini disesuaikan menjadi ${parsedCap} siswa.`,
      });
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menyimpan Kuota',
        message: err?.response?.data?.message || err?.message || 'Terjadi kendala saat memperbarui kuota rombel.',
      });
    } finally {
      setSavingCapacity(false);
    }
  };

  // ── Filtered Classes (Strict Scoped, Search & Kuota Filter) ──
  const filteredClasses = useMemo(() => {
    return classes.filter((item) => {
      const className = String(item.name || item.nama_kelas || '').toLowerCase();
      const waliName = String(
        item.wali_kelas?.nama_tampil ||
        item.wali_kelas?.nama_lengkap ||
        item.wali_kelas?.nama ||
        item.wali_kelas?.name ||
        item.waliKelas?.nama_tampil ||
        item.waliKelas?.nama_lengkap ||
        item.waliKelas?.nama ||
        item.wali_name ||
        ''
      ).toLowerCase();

      // 1. Search Query
      if (debouncedQuery) {
        if (!className.includes(debouncedQuery) && !waliName.includes(debouncedQuery)) {
          return false;
        }
      }

      // 2. Filter Status Kuota Ruang
      const kap = Number(item.kapasitas || 30);
      const count = Number(item.students_count || item.jumlah_siswa || item.total_students || 0);
      const isFull = count >= kap;
      const isOver = count > kap;

      if (filterStatusRuang === 'over' && !isOver) return false;
      if (filterStatusRuang === 'penuh' && !isFull) return false;
      if (filterStatusRuang === 'tersedia' && isFull) return false;

      return true;
    });
  }, [classes, debouncedQuery, filterStatusRuang]);

  // ── Kelas Tujuan untuk Pindah Rombel & Kenaikan Kelas (Strict Unit Only) ──
  const destinationClasses = useMemo(() => {
    if (!selectedClassForDrilldown) return [];
    const sourceClassId = String(selectedClassForDrilldown.id);
    const sourceTingkat = String(selectedClassForDrilldown.tingkat || '');
    const sourceUnitId = String(
      selectedClassForDrilldown.unit_pendidikan_id ||
      selectedClassForDrilldown.unit_id ||
      selectedClassForDrilldown.unitPendidikan?.id ||
      currentUserUnitId ||
      ''
    );

    return classes
      .filter((c) => {
        const cId = String(c.id);
        if (cId === sourceClassId) return false;

        const cUnitId = String(
          c.unit_pendidikan_id ||
          c.unit_id ||
          c.unitPendidikan?.id ||
          ''
        );
        // Wajib unit yang sama persis
        if (sourceUnitId && cUnitId && sourceUnitId !== cUnitId) return false;

        const cTingkat = String(c.tingkat || '');

        if (transferMode === 'pindah_rombel') {
          return !sourceTingkat || !cTingkat || cTingkat === sourceTingkat;
        } else {
          const numSource = parseInt(sourceTingkat, 10);
          const numTarget = parseInt(cTingkat, 10);
          if (!isNaN(numSource) && !isNaN(numTarget)) {
            return numTarget > numSource;
          }
          return cTingkat !== sourceTingkat;
        }
      })
      .sort((a, b) => {
        const nameA = String(a.name || a.nama_kelas || '');
        const nameB = String(b.name || b.nama_kelas || '');
        return nameA.localeCompare(nameB);
      });
  }, [classes, selectedClassForDrilldown, transferMode, currentUserUnitId]);

  // ── Handlers Seleksi & Pemindahan Siswa ──
  const handleToggleSelectStudent = (id: string) => {
    setSelectedStudentIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    if (selectedStudentIds.length === classStudents.length) {
      setSelectedStudentIds([]);
    } else {
      setSelectedStudentIds(classStudents.map((s) => String(s.id)));
    }
  };

  const handleOpenPindahModal = (singleStudent?: any) => {
    if (singleStudent) {
      setSingleStudentToMove(singleStudent);
    } else {
      if (selectedStudentIds.length === 0) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: 'Pilih Santri',
          message: 'Silakan pilih minimal 1 santri terlebih dahulu untuk dipindahkan atau dinaikkan kelasnya.',
        });
        return;
      }
      setSingleStudentToMove(null);
    }
    setTargetKelasId('');
    setTransferMode('pindah_rombel');
    setIsPindahModalOpen(true);
  };

  const executePindahKelas = async () => {
    if (!targetKelasId) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Pilih Kelas Tujuan',
        message: 'Silakan tentukan kelas tujuan terlebih dahulu.',
      });
      return;
    }

    const targets = singleStudentToMove
      ? [singleStudentToMove]
      : classStudents.filter((s) => selectedStudentIds.includes(String(s.id)));

    if (targets.length === 0) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Tidak Ada Siswa Terpilih',
        message: 'Tidak ada data santri yang dipilih untuk dipindahkan.',
      });
      return;
    }

    const targetClassObj = classes.find((c) => String(c.id) === String(targetKelasId));
    const targetClassName = targetClassObj?.name || targetClassObj?.nama_kelas || 'Kelas Tujuan';
    const actionLabel = transferMode === 'kenaikan_kelas' ? 'Kenaikan Kelas' : 'Pindah Rombel';

    setMovingLoading(true);
    try {
      for (const st of targets) {
        await mobileApiService.updateStudent(String(st.id), {
          kelas_id: targetKelasId,
          nis: st.nis || '',
          full_name: st.name || st.nama_lengkap || st.full_name || 'Santri',
          gender: st.gender || st.jk || 'male',
          unit_id: st.unit_id || st.unit_pendidikan_id || selectedClassForDrilldown?.unit_pendidikan_id || currentUserUnitId,
        });
      }

      setIsPindahModalOpen(false);
      setSelectedStudentIds([]);
      setSingleStudentToMove(null);
      setTargetKelasId('');

      await loadData();
      if (selectedClassForDrilldown) {
        await handleOpenClassStudents(selectedClassForDrilldown);
      }

      setFeedback({
        visible: true,
        type: 'success',
        title: `✅ Berhasil ${actionLabel}`,
        message: `Sebanyak ${targets.length} santri berhasil dialihkan ke ${targetClassName}. Data tersinkronisasi ke sistem.`,
      });
    } catch (err: any) {
      const msg = err?.response?.data?.message || err?.message || `Terjadi kendala saat memproses ${actionLabel}.`;
      setFeedback({
        visible: true,
        type: 'error',
        title: `Gagal ${actionLabel}`,
        message: msg,
      });
    } finally {
      setMovingLoading(false);
    }
  };

  // ── Statistics KPI (Strict Scoped to Current Unit) ──
  const stats = useMemo(() => {
    let totalKapasitas = 0;
    let totalTerisi = 0;
    let kelasPenuh = 0;
    let kelasOver = 0;

    classes.forEach((c) => {
      const kap = Number(c.kapasitas || 30);
      const count = Number(c.students_count || c.jumlah_siswa || c.total_students || 0);
      totalKapasitas += kap;
      totalTerisi += count;
      if (count > kap) {
        kelasOver++;
        kelasPenuh++;
      } else if (count >= kap) {
        kelasPenuh++;
      }
    });

    return {
      totalRombel: classes.length,
      totalKapasitas,
      totalTerisi,
      kelasPenuh,
      kelasOver,
      kelasTersedia: Math.max(0, classes.length - kelasPenuh),
    };
  }, [classes]);

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);

  // Dynamic role title badge
  const headerRoleText = useMemo(() => {
    if (isPrincipal && currentUserUnitName) {
      return `KEPALA SEKOLAH • ${currentUserUnitName.toUpperCase()}`;
    }
    if (isTu && currentUserUnitName) {
      return `TATA USAHA • ${currentUserUnitName.toUpperCase()}`;
    }
    if (isDivisi) {
      return 'DIVISI PENDIDIKAN • PANTAU KELAS';
    }
    if (isFoundation) {
      return 'YAYASAN • SUPERVISI KELAS';
    }
    if (isSuperAdmin) {
      return 'SUPER ADMIN • PANTAU KELAS';
    }
    return currentUserUnitName ? `SUPERVISI • ${currentUserUnitName.toUpperCase()}` : 'SUPERVISI KESISWAAN';
  }, [isPrincipal, isTu, isDivisi, isFoundation, isSuperAdmin, currentUserUnitName]);

  return (
    <View style={styles.container}>
      {/* ── BACKGROUND BACKDROP MASJID & SEKOLAH (IDENTIK DATA SISWA) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image source={PARENT_HOME_BG} style={styles.bgImage} resizeMode="cover" />
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

      {/* ── STICKY HEADER (HANYA SAMPAI DI 4 CARD KPI: TOTAL ROMBEL, SANTRI TERISI, DAYA TAMPUNG, OVER) ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleGoBack}
            style={styles.backButton}
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerBadgeText} numberOfLines={1} ellipsizeMode="tail">
                {headerRoleText}
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              Pantau Kelas & Rombel
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Monitoring Kapasitas & Keterisian Rombongan Belajar
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => loadData(true)}
            style={styles.refreshButton}
            accessibilityLabel="Muat Ulang"
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
          </TouchableOpacity>
        </View>

        {/* Search Bar Terpadu Identik Data Siswa */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama rombel, wali kelas, atau ruangan..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── 4 KPI CARDS ROW (BATAS AKHIR AREA STICKY HEADER) ── */}
        <View style={styles.kpiCardsRow}>
          {/* KPI 1: Total Rombel */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFilterStatusRuang('all')}
            style={[
              styles.kpiBox,
              { borderColor: filterStatusRuang === 'all' ? '#047857' : '#A7F3D0' },
            ]}
          >
            <LinearGradient
              colors={filterStatusRuang === 'all' ? ['#ECFDF5', '#D1FAE5'] : ['#FFFFFF', '#F0FDF4']}
              style={styles.kpiBoxGradient}
            >
              <View style={styles.kpiHeaderRow}>
                <View style={[styles.kpiIconSquare, { backgroundColor: '#047857' }]}>
                  <MaterialCommunityIcons name="google-classroom" size={13} color="#FFFFFF" />
                </View>
                <Text style={[styles.kpiVal, { color: '#047857' }]}>{stats.totalRombel}</Text>
              </View>
              <Text style={[styles.kpiLbl, { color: '#047857' }]} numberOfLines={1}>
                Total Rombel
              </Text>
              <Text style={styles.kpiSub} numberOfLines={1}>Semua kelas</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* KPI 2: Santri Terisi */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFilterStatusRuang('tersedia')}
            style={[
              styles.kpiBox,
              { borderColor: filterStatusRuang === 'tersedia' ? '#0D9488' : '#99F6E4' },
            ]}
          >
            <LinearGradient
              colors={filterStatusRuang === 'tersedia' ? ['#F0FDFA', '#CCFBF1'] : ['#FFFFFF', '#F0FDFA']}
              style={styles.kpiBoxGradient}
            >
              <View style={styles.kpiHeaderRow}>
                <View style={[styles.kpiIconSquare, { backgroundColor: '#0D9488' }]}>
                  <MaterialCommunityIcons name="account-group" size={13} color="#FFFFFF" />
                </View>
                <Text style={[styles.kpiVal, { color: '#0D9488' }]}>{stats.totalTerisi}</Text>
              </View>
              <Text style={[styles.kpiLbl, { color: '#0D9488' }]} numberOfLines={1}>
                Santri Terisi
              </Text>
              <Text style={styles.kpiSub} numberOfLines={1}>Aktif di kelas</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* KPI 3: Daya Tampung */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFilterStatusRuang('all')}
            style={[styles.kpiBox, { borderColor: '#BAE6FD' }]}
          >
            <LinearGradient colors={['#FFFFFF', '#F0F9FF']} style={styles.kpiBoxGradient}>
              <View style={styles.kpiHeaderRow}>
                <View style={[styles.kpiIconSquare, { backgroundColor: '#0284C7' }]}>
                  <MaterialCommunityIcons name="seat-passenger" size={13} color="#FFFFFF" />
                </View>
                <Text style={[styles.kpiVal, { color: '#0284C7' }]}>{stats.totalKapasitas}</Text>
              </View>
              <Text style={[styles.kpiLbl, { color: '#0284C7' }]} numberOfLines={1}>
                Daya Tampung
              </Text>
              <Text style={styles.kpiSub} numberOfLines={1}>Kapasitas total</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* KPI 4: Over / Rombel Penuh */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => setFilterStatusRuang(stats.kelasOver > 0 ? 'over' : 'penuh')}
            style={[
              styles.kpiBox,
              {
                borderColor:
                  filterStatusRuang === 'over' || filterStatusRuang === 'penuh'
                    ? '#DC2626'
                    : stats.kelasOver > 0
                    ? '#FECDD3'
                    : stats.kelasPenuh > 0
                    ? '#FDE68A'
                    : '#A7F3D0',
              },
            ]}
          >
            <LinearGradient
              colors={
                filterStatusRuang === 'over' || filterStatusRuang === 'penuh'
                  ? ['#FEF2F2', '#FEE2E2']
                  : stats.kelasOver > 0
                  ? ['#FFF5F5', '#FEF2F2']
                  : stats.kelasPenuh > 0
                  ? ['#FFFBEB', '#FEF3C7']
                  : ['#FFFFFF', '#F0FDF4']
              }
              style={styles.kpiBoxGradient}
            >
              <View style={styles.kpiHeaderRow}>
                <View
                  style={[
                    styles.kpiIconSquare,
                    {
                      backgroundColor:
                        stats.kelasOver > 0
                          ? '#DC2626'
                          : stats.kelasPenuh > 0
                          ? '#D97706'
                          : '#059669',
                    },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={stats.kelasOver > 0 ? 'alert-octagon' : stats.kelasPenuh > 0 ? 'alert-circle' : 'check'}
                    size={13}
                    color="#FFFFFF"
                  />
                </View>
                <Text
                  style={[
                    styles.kpiVal,
                    {
                      color:
                        stats.kelasOver > 0
                          ? '#DC2626'
                          : stats.kelasPenuh > 0
                          ? '#D97706'
                          : '#059669',
                    },
                  ]}
                >
                  {stats.kelasPenuh}
                </Text>
              </View>
              <Text
                style={[
                  styles.kpiLbl,
                  {
                    color:
                      stats.kelasOver > 0
                        ? '#DC2626'
                        : stats.kelasPenuh > 0
                        ? '#D97706'
                        : '#059669',
                  },
                ]}
                numberOfLines={1}
              >
                {stats.kelasOver > 0 ? `${stats.kelasOver} Over` : 'Rombel Penuh'}
              </Text>
              <Text style={styles.kpiSub} numberOfLines={1}>
                {stats.kelasOver > 0 ? 'Perlu ubah kuota' : stats.kelasPenuh > 0 ? 'Kapasitas 100%' : 'Nihil penuh'}
              </Text>
            </LinearGradient>
          </TouchableOpacity>
        </View>
      </View>
      {/* ── BATAS AKHIR STICKY HEADER ── */}

      {/* ── NOTIFIKASI BANNER JIKA ADA KELAS OVER / PENUH ── */}
      {stats.kelasPenuh > 0 && (
        <View
          style={[
            styles.alertBanner,
            stats.kelasOver > 0 ? styles.alertBannerDanger : styles.alertBannerWarning,
          ]}
        >
          <View
            style={[
              styles.alertBannerIconWrap,
              { backgroundColor: stats.kelasOver > 0 ? '#FEE2E2' : '#FEF3C7' },
            ]}
          >
            <MaterialCommunityIcons
              name={stats.kelasOver > 0 ? 'alert-octagon' : 'alert-circle'}
              size={18}
              color={stats.kelasOver > 0 ? '#DC2626' : '#D97706'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.alertBannerTitle,
                { color: stats.kelasOver > 0 ? '#991B1B' : '#92400E' },
              ]}
            >
              {stats.kelasOver > 0
                ? `Perhatian: ${stats.kelasOver} Rombel Melebihi Kuota!`
                : `Notifikasi: ${stats.kelasPenuh} Rombel Kuota Penuh (100%)`}
            </Text>
            <Text
              style={[
                styles.alertBannerText,
                { color: stats.kelasOver > 0 ? '#B91C1C' : '#B45309' },
              ]}
            >
              {stats.kelasOver > 0
                ? 'Terdapat rombel dengan santri melebihi kapasitas. Klik "Ubah Kuota" pada kartu kelas untuk menambah daya tampung.'
                : 'Daya tampung maksimal telah tercapai. Santri baru tidak dapat dimasukkan ke rombel ini hingga kuota dinaikkan.'}
            </Text>
          </View>
        </View>
      )}

      {/* ── DAFTAR KELAS & ROMBEL (IDENTIK DATA SISWA CARD DESIGN) ── */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Memuat data rombel kelas...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredClasses}
          keyExtractor={(item, index) => String(item.id ?? item.kode_kelas ?? `kelas-${index}`)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={['#059669']} />
          }
          ListHeaderComponent={
            filterStatusRuang !== 'all' || search !== '' ? (
              <View style={styles.activeFilterNotice}>
                <MaterialCommunityIcons name="filter-outline" size={13} color="#047857" />
                <Text style={styles.activeFilterNoticeText}>
                  Menampilkan:{' '}
                  {filterStatusRuang === 'tersedia'
                    ? 'Rombel Tersedia Kuota'
                    : filterStatusRuang === 'penuh'
                    ? 'Rombel Penuh (100%)'
                    : filterStatusRuang === 'over'
                    ? 'Rombel Melebihi Kuota (Over)'
                    : 'Semua Rombel'}
                  {search ? ` • Cari "${search}"` : ''}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setFilterStatusRuang('all');
                    setSearch('');
                  }}
                  style={styles.resetFilterMiniBtn}
                >
                  <MaterialCommunityIcons name="close" size={13} color="#EF4444" />
                  <Text style={styles.resetFilterMiniText}>Reset</Text>
                </TouchableOpacity>
              </View>
            ) : null
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="google-classroom" size={54} color="#A7F3D0" />
              <Text style={styles.emptyTitle}>Kelas Tidak Ditemukan</Text>
              <Text style={styles.emptySubtitle}>
                Tidak ada rombel yang sesuai dengan kata kunci pencarian atau status kuota yang dipilih.
              </Text>
            </View>
          }
          renderItem={({ item }) => {
            const className = item.name || item.nama_kelas || item.title || 'Rombel';
            const tingkat = item.tingkat ? `Tingkat ${item.tingkat}` : (item.grade || '—');
            const unitName = item.unitPendidikan?.name || item.unitPendidikan?.nama_unit || item.unit_name || currentUserUnitName || 'Unit';
            const wali = item.wali_kelas || item.waliKelas || {};
            const waliName =
              wali.nama_tampil ||
              wali.nama_lengkap ||
              wali.nama ||
              wali.name ||
              item.wali_name ||
              'Belum Ditentukan';
            const kapasitas = Number(item.kapasitas || 30);
            const terisi = Number(item.students_count || item.jumlah_siswa || item.total_students || 0);

            const ratio = kapasitas > 0 ? Math.round((terisi / kapasitas) * 100) : 0;
            const isOver = terisi > kapasitas;
            const isExactFull = terisi === kapasitas;
            const isFull = terisi >= kapasitas;
            const isNearFull = !isFull && ratio >= 80;

            const progressColor = isOver
              ? '#DC2626'
              : isExactFull
              ? '#E11D48'
              : isNearFull
              ? '#D97706'
              : '#059669';

            const badgeBg = isOver
              ? '#FEF2F2'
              : isExactFull
              ? '#FFF1F2'
              : isNearFull
              ? '#FFFBEB'
              : '#ECFDF5';

            const badgeColor = isOver
              ? '#DC2626'
              : isExactFull
              ? '#BE123C'
              : isNearFull
              ? '#B45309'
              : '#047857';

            const badgeLabel = isOver
              ? `⚠️ Over Kuota (+${terisi - kapasitas})`
              : isExactFull
              ? '🔒 Kuota Penuh (100%)'
              : isNearFull
              ? 'Hampir Penuh'
              : `Tersedia (${kapasitas - terisi})`;

            return (
              <View style={[styles.classCard, isOver && styles.classCardOver]}>
                <View style={styles.cardHeaderRow}>
                  {/* Icon Squircle Identik Data Siswa */}
                  <View style={[styles.classIconSquare, { backgroundColor: isOver ? '#FEE2E2' : isFull ? '#FFF1F2' : '#ECFDF5' }]}>
                    <MaterialCommunityIcons
                      name={isOver ? 'alert-octagon' : 'google-classroom'}
                      size={22}
                      color={isOver ? '#DC2626' : isFull ? '#E11D48' : '#059669'}
                    />
                  </View>

                  {/* Title & Hierarchy Badges */}
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.classTitleText} numberOfLines={1}>
                        {className}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                      </View>
                    </View>

                    <View style={styles.hierarchyPillRow}>
                      <View style={styles.tingkatPill}>
                        <MaterialCommunityIcons name="layers-outline" size={11} color="#047857" />
                        <Text style={styles.tingkatPillText}>{tingkat}</Text>
                      </View>
                      {Boolean(unitName) && (
                        <View style={styles.unitPill}>
                          <Text style={styles.unitPillText} numberOfLines={1}>
                            {unitName}
                          </Text>
                        </View>
                      )}
                    </View>
                  </View>
                </View>

                {/* Progress Bar Keterisian Kuota */}
                <View style={[styles.progressBox, isOver && { backgroundColor: '#FEF2F2' }]}>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressLabelLeft}>
                      Keterisian: <Text style={{ fontWeight: '800', color: progressColor }}>{terisi}</Text> / {kapasitas} Santri
                    </Text>
                    <Text style={[styles.progressLabelRight, { color: progressColor }]}>{ratio}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(ratio, 100)}%`, backgroundColor: progressColor },
                      ]}
                    />
                  </View>
                </View>

                {/* Wali Kelas & Action Row */}
                <View style={styles.cardFooterRow}>
                  <View style={styles.waliInfoWrap}>
                    <View style={styles.waliAvatar}>
                      <MaterialCommunityIcons name="account-tie" size={16} color="#047857" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.waliNameText} numberOfLines={1}>
                        {waliName}
                      </Text>
                      <Text style={styles.waliLabel}>Wali Kelas</Text>
                    </View>
                  </View>

                  <View style={styles.cardActionGroup}>
                    {/* Tombol Chat Internal Dari Aplikasi (Bukan WA) */}
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => handleOpenInternalChat(wali, className)}
                      style={styles.internalChatBtn}
                      accessibilityLabel={`Chat Internal Wali Kelas ${waliName}`}
                    >
                      <MaterialCommunityIcons name="chat-processing-outline" size={14} color="#047857" />
                      <Text style={styles.internalChatBtnText}>Chat</Text>
                    </TouchableOpacity>

                    {/* Tombol Ubah Kuota Rombel */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenEditCapacity(item)}
                      style={styles.editCapacityBtn}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={13} color="#D97706" />
                      <Text style={styles.editCapacityBtnText}>Ubah Kuota</Text>
                    </TouchableOpacity>

                    {/* Tombol Drill-down Santri */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenClassStudents(item)}
                      style={styles.drilldownBtn}
                    >
                      <MaterialCommunityIcons name="account-group" size={14} color="#059669" />
                      <Text style={styles.drilldownBtnText}>Santri ({terisi})</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── MODAL DRILL-DOWN SANTRI PER ROMBEL (IDENTIK DATA SISWA MODAL) ── */}
      <Modal
        visible={Boolean(selectedClassForDrilldown)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedClassForDrilldown(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <View style={styles.modalIconBox}>
                  <MaterialCommunityIcons name="account-group" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {selectedClassForDrilldown?.name || selectedClassForDrilldown?.nama_kelas || 'Rombel'}
                  </Text>
                  <Text style={styles.modalSubtitle}>Daftar Santri Terdaftar di Kelas Ini</Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setSelectedClassForDrilldown(null);
                  setSelectedStudentIds([]);
                  setSingleStudentToMove(null);
                }}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Toolbar Aksi Massal Pindah / Kenaikan Kelas */}
            {classStudents.length > 0 && !loadingClassStudents && (
              <View style={styles.drillActionBar}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={handleToggleSelectAll}
                  style={styles.drillSelectAllWrap}
                >
                  <MaterialCommunityIcons
                    name={
                      selectedStudentIds.length === classStudents.length
                        ? 'checkbox-marked'
                        : selectedStudentIds.length > 0
                        ? 'minus-box'
                        : 'checkbox-blank-outline'
                    }
                    size={20}
                    color={selectedStudentIds.length > 0 ? '#059669' : '#64748B'}
                  />
                  <Text style={styles.drillSelectAllText}>
                    Pilih Semua ({selectedStudentIds.length}/{classStudents.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  disabled={selectedStudentIds.length === 0}
                  onPress={() => handleOpenPindahModal()}
                  style={[
                    styles.batchTransferBtn,
                    selectedStudentIds.length === 0 && styles.batchTransferBtnDisabled,
                  ]}
                >
                  <MaterialCommunityIcons
                    name="swap-horizontal-bold"
                    size={16}
                    color={selectedStudentIds.length > 0 ? '#FFFFFF' : '#94A3B8'}
                  />
                  <Text
                    style={[
                      styles.batchTransferBtnText,
                      selectedStudentIds.length === 0 && styles.batchTransferBtnTextDisabled,
                    ]}
                  >
                    Pindah / Kenaikan ({selectedStudentIds.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {loadingClassStudents ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#059669" />
                <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
                  Memuat daftar santri di rombel ini...
                </Text>
              </View>
            ) : classStudents.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="account-off-outline" size={40} color="#CBD5E1" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>Belum Ada Siswa</Text>
                <Text style={{ fontSize: 11.5, color: '#64748B', textAlign: 'center' }}>
                  Belum ada santri yang dimasukkan ke rombongan belajar ini.
                </Text>
              </View>
            ) : (
              <FlatList
                data={classStudents}
                keyExtractor={(item, index) => String(item.id ?? item.nis ?? `santri-${index}`)}
                contentContainerStyle={{ padding: 14, gap: 8 }}
                renderItem={({ item, index }) => {
                  const sId = String(item.id);
                  const isSelected = selectedStudentIds.includes(sId);
                  const isAkhwat = String(item.gender || item.jk || '').toLowerCase().startsWith('p');

                  return (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleToggleSelectStudent(sId)}
                      style={[styles.drillStudentRow, isSelected && styles.drillStudentRowSelected]}
                    >
                      {/* Checkbox Squircle */}
                      <View style={[styles.drillCheckbox, isSelected && styles.drillCheckboxSelected]}>
                        <MaterialCommunityIcons
                          name={isSelected ? 'check' : 'checkbox-blank-outline'}
                          size={14}
                          color={isSelected ? '#FFFFFF' : '#94A3B8'}
                        />
                      </View>

                      <View style={styles.drillStudentNumber}>
                        <Text style={styles.drillStudentNumberText}>{index + 1}</Text>
                      </View>

                      <View style={{ flex: 1 }}>
                        <Text style={styles.drillStudentName} numberOfLines={1}>
                          {item.name || item.nama_lengkap || item.full_name || 'Santri'}
                        </Text>
                        <Text style={styles.drillStudentNis}>NIS: {item.nis || '—'}</Text>
                      </View>

                      <View style={[styles.drillStudentGender, { backgroundColor: isAkhwat ? '#FDF2F8' : '#EFF6FF' }]}>
                        <Text style={[styles.drillStudentGenderText, { color: isAkhwat ? '#DB2777' : '#2563EB' }]}>
                          {isAkhwat ? 'Akhwat' : 'Ikhwan'}
                        </Text>
                      </View>

                      {/* Tombol Pindah Tunggal */}
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleOpenPindahModal(item)}
                        style={styles.drillSingleMoveBtn}
                      >
                        <MaterialCommunityIcons name="swap-horizontal" size={16} color="#059669" />
                      </TouchableOpacity>
                    </TouchableOpacity>
                  );
                }}
              />
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCloseMainBtn}
                onPress={() => {
                  setSelectedClassForDrilldown(null);
                  setSelectedStudentIds([]);
                  setSingleStudentToMove(null);
                }}
              >
                <Text style={styles.modalCloseMainBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL UBAH KUOTA / KAPASITAS ROMBEL (IDENTIK DATA SISWA MODAL) ── */}
      <Modal
        visible={Boolean(editingClass)}
        animationType="fade"
        transparent
        onRequestClose={() => !savingCapacity && setEditingClass(null)}
      >
        <View style={styles.modalBackdropCenter}>
          <View style={styles.editCapacityCard}>
            {/* Header Modal */}
            <View style={styles.editModalHeader}>
              <View style={styles.editModalIconSquare}>
                <MaterialCommunityIcons name="seat-passenger" size={20} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.editModalTitle}>Ubah Kuota Rombel</Text>
                <Text style={styles.editModalSubtitle} numberOfLines={1}>
                  {editingClass?.name || editingClass?.nama_kelas || 'Kelas'}
                </Text>
              </View>
              <TouchableOpacity
                disabled={savingCapacity}
                onPress={() => setEditingClass(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Info Rombel Saat Ini */}
            <View style={styles.editInfoBox}>
              <View style={styles.editInfoItem}>
                <Text style={styles.editInfoLabel}>Santri Terdaftar</Text>
                <Text style={styles.editInfoValPrimary}>
                  {Number(editingClass?.students_count || editingClass?.jumlah_siswa || 0)} Santri
                </Text>
              </View>
              <View style={styles.editInfoDivider} />
              <View style={styles.editInfoItem}>
                <Text style={styles.editInfoLabel}>Kapasitas Saat Ini</Text>
                <Text style={styles.editInfoValSecondary}>
                  {Number(editingClass?.kapasitas || 30)} Santri
                </Text>
              </View>
            </View>

            {/* Input Stepper Daya Tampung Baru */}
            <View style={styles.inputSection}>
              <Text style={styles.inputSectionLabel}>Daya Tampung Baru (Siswa):</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    const val = Math.max(1, parseInt(newCapacity, 10) - 1 || 1);
                    setNewCapacity(String(val));
                  }}
                  style={styles.stepperBtn}
                >
                  <MaterialCommunityIcons name="minus" size={20} color="#047857" />
                </TouchableOpacity>

                <TextInput
                  style={styles.stepperInput}
                  keyboardType="numeric"
                  value={newCapacity}
                  onChangeText={(txt) => setNewCapacity(txt.replace(/[^0-9]/g, ''))}
                  maxLength={3}
                />

                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => {
                    const val = (parseInt(newCapacity, 10) || 0) + 1;
                    setNewCapacity(String(val));
                  }}
                  style={styles.stepperBtn}
                >
                  <MaterialCommunityIcons name="plus" size={20} color="#047857" />
                </TouchableOpacity>
              </View>

              {/* Preset Buttons */}
              <View style={styles.presetRow}>
                {['25', '28', '30', '32', '35', '40', '50'].map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    onPress={() => setNewCapacity(preset)}
                    style={[
                      styles.presetChip,
                      newCapacity === preset && styles.presetChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        newCapacity === preset && styles.presetChipTextActive,
                      ]}
                    >
                      {preset}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Status Preview Keterisian */}
            {(() => {
              const target = parseInt(newCapacity, 10) || 0;
              const currentCount = Number(
                editingClass?.students_count ||
                editingClass?.jumlah_siswa ||
                0
              );
              if (target < currentCount) {
                return (
                  <View style={styles.previewOverBox}>
                    <MaterialCommunityIcons name="alert-octagon" size={16} color="#DC2626" />
                    <Text style={styles.previewOverText}>
                      ⚠️ Peringatan: Kuota lebih kecil dari {currentCount} santri aktif. Rombel akan berstatus over kuota!
                    </Text>
                  </View>
                );
              }
              if (target === currentCount) {
                return (
                  <View style={styles.previewFullBox}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#D97706" />
                    <Text style={styles.previewFullText}>
                      🔒 Tepat Penuh: Rombel akan terisi 100% tanpa sisa kursi kosong.
                    </Text>
                  </View>
                );
              }
              return (
                <View style={styles.previewAvailableBox}>
                  <MaterialCommunityIcons name="check-circle-outline" size={16} color="#059669" />
                  <Text style={styles.previewAvailableText}>
                    ✅ Kuota Tersedia: Tersisa kapasitas untuk {target - currentCount} santri baru.
                  </Text>
                </View>
              );
            })()}

            {/* Action Buttons */}
            <View style={styles.editActionRow}>
              <TouchableOpacity
                disabled={savingCapacity}
                onPress={() => setEditingClass(null)}
                style={styles.editCancelBtn}
              >
                <Text style={styles.editCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={savingCapacity}
                onPress={handleSaveCapacity}
                style={styles.editSaveBtn}
              >
                {savingCapacity ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.editSaveBtnText}>Simpan Kuota</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL PINDAH & KENAIKAN KELAS MASSAL (IDENTIK DATA SISWA MODAL) ── */}
      <Modal
        visible={isPindahModalOpen}
        animationType="slide"
        transparent
        onRequestClose={() => !movingLoading && setIsPindahModalOpen(false)}
      >
        <View style={styles.modalBackdropCenter}>
          <View style={styles.pindahModalCard}>
            {/* Header Modal */}
            <View style={styles.editModalHeader}>
              <View style={[styles.editModalIconSquare, { backgroundColor: transferMode === 'kenaikan_kelas' ? '#EFF6FF' : '#ECFDF5' }]}>
                <MaterialCommunityIcons
                  name={transferMode === 'kenaikan_kelas' ? 'arrow-up-bold-circle-outline' : 'swap-horizontal-bold'}
                  size={22}
                  color={transferMode === 'kenaikan_kelas' ? '#2563EB' : '#059669'}
                />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.editModalTitle}>
                  {transferMode === 'kenaikan_kelas' ? 'Kenaikan Kelas Massal' : 'Pindah Rombel Belajar'}
                </Text>
                <Text style={styles.editModalSubtitle} numberOfLines={1}>
                  {singleStudentToMove
                    ? `1 Santri: ${singleStudentToMove.name || singleStudentToMove.nama_lengkap || 'Santri'}`
                    : `${selectedStudentIds.length} Santri Terpilih dari ${selectedClassForDrilldown?.name || selectedClassForDrilldown?.nama_kelas}`}
                </Text>
              </View>
              <TouchableOpacity
                disabled={movingLoading}
                onPress={() => setIsPindahModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Switcher Mode: Pindah Rombel Setara vs Kenaikan Kelas */}
            <View style={styles.transferModeTabs}>
              <TouchableOpacity
                activeOpacity={0.8}
                disabled={movingLoading}
                onPress={() => {
                  setTransferMode('pindah_rombel');
                  setTargetKelasId('');
                }}
                style={[
                  styles.transferModeTab,
                  transferMode === 'pindah_rombel' && styles.transferModeTabActive,
                ]}
              >
                <MaterialCommunityIcons
                  name="swap-horizontal"
                  size={16}
                  color={transferMode === 'pindah_rombel' ? '#059669' : '#64748B'}
                />
                <Text
                  style={[
                    styles.transferModeTabText,
                    transferMode === 'pindah_rombel' && styles.transferModeTabTextActive,
                  ]}
                >
                  Pindah Rombel
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                disabled={movingLoading}
                onPress={() => {
                  setTransferMode('kenaikan_kelas');
                  setTargetKelasId('');
                }}
                style={[
                  styles.transferModeTab,
                  transferMode === 'kenaikan_kelas' && styles.transferModeTabActiveBlue,
                ]}
              >
                <MaterialCommunityIcons
                  name="arrow-up-circle-outline"
                  size={16}
                  color={transferMode === 'kenaikan_kelas' ? '#2563EB' : '#64748B'}
                />
                <Text
                  style={[
                    styles.transferModeTabText,
                    transferMode === 'kenaikan_kelas' && styles.transferModeTabTextActiveBlueText,
                  ]}
                >
                  Kenaikan Kelas
                </Text>
              </TouchableOpacity>
            </View>

            {/* Ringkasan Asal & Target */}
            <View style={styles.transferSummaryBox}>
              <View style={styles.transferSummaryItem}>
                <Text style={styles.transferSummaryLabel}>Kelas Asal</Text>
                <Text style={styles.transferSummaryVal} numberOfLines={1}>
                  {selectedClassForDrilldown?.name || selectedClassForDrilldown?.nama_kelas || '—'}
                </Text>
              </View>
              <MaterialCommunityIcons name="arrow-right" size={18} color="#94A3B8" />
              <View style={styles.transferSummaryItem}>
                <Text style={styles.transferSummaryLabel}>Total Santri</Text>
                <Text style={[styles.transferSummaryVal, { color: transferMode === 'kenaikan_kelas' ? '#2563EB' : '#059669' }]}>
                  {singleStudentToMove ? 1 : selectedStudentIds.length} Santri
                </Text>
              </View>
            </View>

            {/* Selector Kelas Tujuan */}
            <Text style={styles.destListTitle}>Pilih Rombel / Kelas Tujuan:</Text>
            {destinationClasses.length === 0 ? (
              <View style={styles.emptyDestBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={26} color="#94A3B8" />
                <Text style={styles.emptyDestText}>
                  {transferMode === 'kenaikan_kelas'
                    ? 'Tidak ditemukan kelas tingkat berikutnya di unit ini.'
                    : 'Tidak ada rombel setara lain yang tersedia di unit ini.'}
                </Text>
              </View>
            ) : (
              <ScrollView style={{ maxHeight: 220 }} contentContainerStyle={{ gap: 8, paddingBottom: 6 }}>
                {destinationClasses.map((item) => {
                  const cId = String(item.id);
                  const isSelected = targetKelasId === cId;
                  const kap = Number(item.kapasitas || 30);
                  const terisi = Number(item.students_count || item.jumlah_siswa || 0);
                  const movingCount = singleStudentToMove ? 1 : selectedStudentIds.length;
                  const willBe = terisi + movingCount;
                  const isWillOver = willBe > kap;

                  return (
                    <TouchableOpacity
                      key={cId}
                      activeOpacity={0.8}
                      disabled={movingLoading}
                      onPress={() => setTargetKelasId(cId)}
                      style={[
                        styles.destClassCard,
                        isSelected && styles.destClassCardSelected,
                        isWillOver && isSelected && styles.destClassCardOver,
                      ]}
                    >
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <Text style={[styles.destClassName, isSelected && styles.destClassNameSelected]}>
                            {item.name || item.nama_kelas}
                          </Text>
                          <View style={styles.destTingkatBadge}>
                            <Text style={styles.destTingkatBadgeText}>
                              Tingkat {item.tingkat || '—'}
                            </Text>
                          </View>
                        </View>
                        <Text style={styles.destClassWali} numberOfLines={1}>
                          Wali: {item.wali_kelas?.nama || item.wali_name || 'Belum Ditugaskan'}
                        </Text>
                      </View>

                      <View style={{ alignItems: 'flex-end', gap: 2 }}>
                        <View
                          style={[
                            styles.destSeatPill,
                            isWillOver ? styles.destSeatPillDanger : styles.destSeatPillNormal,
                          ]}
                        >
                          <Text
                            style={[
                              styles.destSeatPillText,
                              isWillOver && { color: '#DC2626' },
                            ]}
                          >
                            {willBe}/{kap}
                          </Text>
                        </View>
                        {isWillOver && (
                          <Text style={{ fontSize: 9, color: '#DC2626', fontWeight: '800' }}>
                            Akan Over Kuota
                          </Text>
                        )}
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}

            {/* Action Buttons Modal */}
            <View style={styles.editActionRow}>
              <TouchableOpacity
                disabled={movingLoading}
                onPress={() => setIsPindahModalOpen(false)}
                style={styles.editCancelBtn}
              >
                <Text style={styles.editCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={movingLoading || !targetKelasId}
                onPress={executePindahKelas}
                style={[
                  styles.editSaveBtn,
                  (!targetKelasId || movingLoading) && { backgroundColor: '#A7F3D0' },
                ]}
              >
                {movingLoading ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                    <Text style={styles.editSaveBtnText}>
                      Konfirmasi {transferMode === 'kenaikan_kelas' ? 'Kenaikan' : 'Pindah'}
                    </Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── NOTIFIKASI FEEDBACK MODAL ── */}
      <AppFeedbackModal
        visible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onClose={() => setFeedback({ ...feedback, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },

  /* ── Background Backdrop Mosque & School (Identik Data Siswa) ── */
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
    opacity: 0.4,
  },

  /* ── Sticky Header (Hanya Sampai Di 4 KPI Cards) ── */
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
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
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
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
    marginTop: 10,
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
  },

  /* ── 4 KPI Cards Row (Total Rombel, Santri Terisi, Daya Tampung, Over) ── */
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1.2,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  kpiBoxGradient: {
    padding: 8,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  kpiIconSquare: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiVal: {
    fontSize: 15,
    fontWeight: '900',
  },
  kpiLbl: {
    fontSize: 10,
    fontWeight: '800',
    marginTop: 4,
  },
  kpiSub: {
    fontSize: 8.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },

  /* ── Notice Filter Aktif & Reset Mini ── */
  activeFilterNotice: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 8,
    gap: 6,
  },
  activeFilterNoticeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
    flex: 1,
  },
  resetFilterMiniBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    gap: 3,
  },
  resetFilterMiniText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EF4444',
  },

  /* ── Alert Banner ── */
  alertBanner: {
    marginHorizontal: 16,
    marginTop: 2,
    marginBottom: 4,
    borderRadius: 14,
    padding: 11,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    borderWidth: 1.2,
  },
  alertBannerDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECDD3',
  },
  alertBannerWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  alertBannerIconWrap: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBannerTitle: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  alertBannerText: {
    fontSize: 10,
    fontWeight: '500',
    marginTop: 1,
    lineHeight: 14,
  },

  /* ── List Content ── */
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#064E3B',
  },
  listContent: {
    padding: 16,
    paddingTop: 6,
    gap: 10,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },

  /* ── Class Card (Identik MutationCard / StudentCard Data Siswa) ── */
  classCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    shadowColor: '#004D32',
    shadowOpacity: 0.05,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 6,
    elevation: 2,
  },
  classCardOver: {
    borderColor: '#FECDD3',
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 11,
  },
  classIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  classTitleText: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  hierarchyPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 4,
  },
  tingkatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    gap: 3,
  },
  tingkatPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  unitPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: 140,
  },
  unitPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },

  /* ── Progress Box Keterisian ── */
  progressBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabelLeft: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  progressLabelRight: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#D1FAE5',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },

  /* ── Card Footer ── */
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 12,
    paddingTop: 10,
  },
  waliInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  waliAvatar: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waliNameText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  waliLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  cardActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  internalChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    gap: 4,
  },
  internalChatBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  editCapacityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 8,
    paddingVertical: 6,
    gap: 4,
  },
  editCapacityBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#B45309',
  },
  drilldownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 9,
    paddingVertical: 6,
    gap: 4,
  },
  drilldownBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },

  /* ── MODALS STYLING (IDENTIK DATA SISWA) ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    justifyContent: 'flex-end',
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: 'rgba(15,23,42,0.6)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '500',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drillActionBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  drillSelectAllWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  drillSelectAllText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  batchTransferBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
    gap: 4,
  },
  batchTransferBtnDisabled: {
    backgroundColor: '#E2E8F0',
  },
  batchTransferBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  batchTransferBtnTextDisabled: {
    color: '#94A3B8',
  },
  drillStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 8,
  },
  drillStudentRowSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  drillCheckbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 1.5,
    borderColor: '#CBD5E1',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
  },
  drillCheckboxSelected: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  drillStudentNumber: {
    width: 22,
    alignItems: 'center',
  },
  drillStudentNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#94A3B8',
  },
  drillStudentName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  drillStudentNis: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  drillStudentGender: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  drillStudentGenderText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  drillSingleMoveBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalFooter: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCloseMainBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  modalCloseMainBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },

  /* ── EDIT CAPACITY CARD ── */
  editCapacityCard: {
    width: '100%',
    maxWidth: 380,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 16,
    shadowColor: '#064E3B',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  editModalIconSquare: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  editModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  editInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  editInfoLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  editInfoValPrimary: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#059669',
    marginTop: 2,
  },
  editInfoValSecondary: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  editInfoDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#CBD5E1',
  },
  inputSection: {
    marginBottom: 12,
  },
  inputSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    marginBottom: 10,
  },
  stepperBtn: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepperInput: {
    width: 80,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    textAlign: 'center',
    fontSize: 18,
    fontWeight: '900',
    color: '#0F172A',
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  presetChip: {
    paddingHorizontal: 11,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  previewOverBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 10,
    padding: 8,
    gap: 6,
    marginBottom: 12,
  },
  previewOverText: {
    fontSize: 10.5,
    color: '#DC2626',
    fontWeight: '700',
    flex: 1,
    lineHeight: 14,
  },
  previewFullBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    borderRadius: 10,
    padding: 8,
    gap: 6,
    marginBottom: 12,
  },
  previewFullText: {
    fontSize: 10.5,
    color: '#BE123C',
    fontWeight: '700',
    flex: 1,
    lineHeight: 14,
  },
  previewAvailableBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    padding: 8,
    gap: 6,
    marginBottom: 12,
  },
  previewAvailableText: {
    fontSize: 10.5,
    color: '#047857',
    fontWeight: '700',
    flex: 1,
    lineHeight: 14,
  },
  editActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#64748B',
  },
  editSaveBtn: {
    flex: 1.6,
    flexDirection: 'row',
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  editSaveBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* ── PINDAH MODAL ── */
  pindahModalCard: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 16,
    shadowColor: '#064E3B',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 6,
  },
  transferModeTabs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 12,
  },
  transferModeTab: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  transferModeTabActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  transferModeTabActiveBlue: {
    backgroundColor: '#EFF6FF',
    borderColor: '#2563EB',
  },
  transferModeTabText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  transferModeTabTextActive: {
    color: '#059669',
    fontWeight: '900',
  },
  transferModeTabTextActiveBlueText: {
    color: '#2563EB',
    fontWeight: '900',
  },
  transferSummaryBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  transferSummaryItem: {
    flex: 1,
    alignItems: 'center',
  },
  transferSummaryLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  transferSummaryVal: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  destListTitle: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 6,
  },
  emptyDestBox: {
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    gap: 4,
  },
  emptyDestText: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    fontWeight: '600',
  },
  destClassCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 10,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  destClassCardSelected: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  destClassCardOver: {
    backgroundColor: '#FEF2F2',
    borderColor: '#DC2626',
  },
  destClassName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  destClassNameSelected: {
    color: '#059669',
  },
  destTingkatBadge: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 4,
  },
  destTingkatBadgeText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  destClassWali: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  destSeatPill: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  destSeatPillNormal: {
    backgroundColor: '#E2E8F0',
  },
  destSeatPillDanger: {
    backgroundColor: '#FEE2E2',
  },
  destSeatPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
  },
});
