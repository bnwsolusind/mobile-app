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

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

type EducationUnitNameSource = {
  name?: string | null;
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MutasiSiswaScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const localNav = useNavigation<any>();
  const nav = navigation || localNav;
  const user = useAuthStore((state) => state.user);
  const userUnitName = (user?.education_unit as EducationUnitNameSource | null | undefined)?.name;

  // ── States ──
  const initialTabParam = route?.params?.tab === 'alumni' ? 'alumni' : (route?.params?.tab === 'antrean' ? 'antrean' : 'mutasi');
  const [activeTab, setActiveTab] = useState<'mutasi' | 'alumni' | 'antrean'>(initialTabParam);
  const [mutasiStudents, setMutasiStudents] = useState<any[]>([]);
  const [alumniStudents, setAlumniStudents] = useState<any[]>([]);
  const [incomingMutations, setIncomingMutations] = useState<any[]>([]);
  const [availableUnits, setAvailableUnits] = useState<any[]>([]);
  const [activeStudents, setActiveStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  const [filterType, setFilterType] = useState<'all' | 'unit' | 'keluar'>('all');
  const [alumniFilter, setAlumniFilter] = useState<'all' | 'kuliah' | 'ponpes' | 'pesantren' | 'kerja' | 'bekerja' | 'sekolah'>('all');

  // ── Alumni Detail Modal State ──
  const [selectedAlumni, setSelectedAlumni] = useState<any | null>(null);
  const [alumniModalVisible, setAlumniModalVisible] = useState(false);

  // ── Form Ajukan Mutasi ──
  const [formModalVisible, setFormModalVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [formData, setFormData] = useState({
    student_id: '',
    unit_tujuan_id: '',
    jenis_mutasi: 'pindah_unit', // 'pindah_unit' | 'pindah_keluar'
    sekolah_tujuan: '',
    alasan: '',
    catatan: '',
  });

  // ── Feedback State ──
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  }>({
    visible: false,
    title: '',
  });

  // Sync with route param navigation (deep link / shortcut transition)
  useEffect(() => {
    if (route?.params?.tab === 'alumni') {
      setActiveTab('alumni');
    } else if (route?.params?.tab === 'antrean') {
      setActiveTab('antrean');
    } else if (route?.params?.tab === 'mutasi' || route?.params?.tab === 'daftar') {
      setActiveTab('mutasi');
    }
  }, [route?.params?.tab]);

  // Debounce search
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(search.trim().toLowerCase());
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Data
  const loadData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const [resStudents, resIncoming, resUnits, resAlumni] = await Promise.all([
        mobileApiService.getStudents({ per_page: 500 }),
        mobileApiService.getIncomingMutations().catch(() => ({ data: [] })),
        mobileApiService.getEducationUnits().catch(() => ({ data: [] })),
        mobileApiService.getAlumni({ per_page: 500 }).catch(() => ({ data: [] })),
      ]);

      const collStudents = unwrapCollection(resStudents);
      const collIncoming = unwrapCollection(resIncoming);
      const collUnits = unwrapCollection(resUnits);
      const collAlumni = unwrapCollection(resAlumni);

      const allList = Array.isArray(collStudents) ? collStudents : [];
      // Ambil yang berstatus mutasi
      const mutasiList = allList.filter((s) => {
        const st = String(s.status || s.status_siswa || s.metadata?.status_siswa || '').toLowerCase();
        return st.includes('mutasi');
      });

      // Ambil alumni dari endpoint alumni + fallback ke siswa berstatus lulus/alumni
      const rawAlumniList = Array.isArray(collAlumni) ? collAlumni : [];
      const alumniMap = new Map<string, any>();
      rawAlumniList.forEach((a: any) => {
        if (a && a.id) alumniMap.set(String(a.id), a);
      });
      allList.forEach((s: any) => {
        const st = String(s.status || s.status_siswa || s.metadata?.status_alumni || s.metadata?.status_siswa || '').toLowerCase();
        const isAlm = st.includes('lulus') || st.includes('alumni') || s.is_alumni === true || s.metadata?.is_alumni === true;
        if (isAlm && s && s.id && !alumniMap.has(String(s.id))) {
          alumniMap.set(String(s.id), s);
        }
      });
      const alumniList = Array.from(alumniMap.values());

      // Ambil santri aktif untuk opsi formulir
      const activeList = allList.filter((s) => {
        const st = String(s.status || s.status_siswa || 'aktif').toLowerCase();
        return !st.includes('mutasi') && !st.includes('lulus') && !st.includes('berhenti');
      });

      setMutasiStudents(mutasiList);
      setAlumniStudents(alumniList);
      setActiveStudents(activeList);
      setIncomingMutations(Array.isArray(collIncoming) ? collIncoming : []);
      setAvailableUnits(Array.isArray(collUnits) ? collUnits : []);

      if (isPull) {
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Data Berhasil Diperbarui',
          message: `Memuat ${alumniList.length} alumni, ${mutasiList.length} santri mutasi, dan ${Array.isArray(collIncoming) ? collIncoming.length : 0} antrean masuk.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Data',
        message: err?.message || 'Terjadi gangguan jaringan saat memuat data alumni & mutasi.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

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

  // Submit Pengajuan Mutasi
  const handleSubmitMutasi = async () => {
    if (!formData.student_id) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Santri Belum Dipilih',
        message: 'Silakan pilih santri yang akan diajukan mutasi terlebih dahulu.',
      });
      return;
    }
    if (formData.jenis_mutasi === 'pindah_unit' && !formData.unit_tujuan_id) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Unit Tujuan Belum Dipilih',
        message: 'Silakan pilih unit madrasah tujuan pindah dalam yayasan.',
      });
      return;
    }
    if (formData.jenis_mutasi === 'pindah_keluar' && !formData.sekolah_tujuan.trim()) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Sekolah Tujuan Kosong',
        message: 'Silakan isi nama sekolah / pesantren tujuan pindah keluar.',
      });
      return;
    }

    try {
      setSubmitting(true);
      const canonicalJenis = formData.jenis_mutasi === 'pindah_unit' ? 'pindah_unit_internal' : formData.jenis_mutasi;
      await mobileApiService.requestStudentMutation({
        student_id: formData.student_id,
        target_unit_id: formData.unit_tujuan_id || null,
        unit_tujuan_id: formData.unit_tujuan_id || null,
        sekolah_tujuan: formData.sekolah_tujuan || null,
        jenis_mutasi: canonicalJenis,
        alasan: formData.alasan,
        catatan: formData.catatan,
      });

      setFormModalVisible(false);
      setFormData({
        student_id: '',
        unit_tujuan_id: '',
        jenis_mutasi: 'pindah_unit',
        sekolah_tujuan: '',
        alasan: '',
        catatan: '',
      });

      setFeedback({
        visible: true,
        type: 'success',
        title: 'Mutasi Berhasil Diajukan',
        message: 'Permohonan mutasi santri telah berhasil didaftarkan dan menunggu verifikasi berkas.',
      });

      void loadData();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Pengajuan Mutasi Gagal',
        message: err?.message || 'Terjadi kesalahan sistem saat mengajukan mutasi santri.',
      });
    } finally {
      setSubmitting(false);
    }
  };

  // Approve Incoming Mutation
  const handleApproveMutation = (id: string, studentName: string) => {
    setFeedback({
      visible: true,
      type: 'warning',
      title: 'Pilih Kelas Tujuan Penempatan',
      message: `Persetujuan mutasi masuk untuk ${studentName} memerlukan penetapan rombel/kelas tujuan. Anda diarahkan ke menu Kelola Siswa.`,
    });
    nav.navigate('Data', {
      resource: 'students',
      filterStatus: 'mutasi',
      mode: 'mutasi',
    });
  };

  // Reject Incoming Mutation
  const handleRejectMutation = async (id: string, studentName: string) => {
    try {
      await mobileApiService.rejectStudentMutation(id, {
        catatan_penolakan: 'Ditolak oleh pimpinan unit melalui aplikasi mobile.',
        alasan_penolakan: 'Ditolak oleh pimpinan unit melalui aplikasi mobile.',
      });
      setFeedback({
        visible: true,
        type: 'info',
        title: 'Permohonan Mutasi Ditolak',
        message: `Permohonan pindahan masuk untuk santri ${studentName} telah ditolak.`,
      });
      void loadData();
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Menolak Mutasi',
        message: err?.message || 'Gagal memproses penolakan mutasi masuk.',
      });
    }
  };

  // Filtered Mutasi List
  const filteredList = useMemo(() => {
    return mutasiStudents.filter((item) => {
      if (debouncedQuery) {
        const name = String(item.name || item.nama_lengkap || '').toLowerCase();
        const nis = String(item.nis || item.nisn || '').toLowerCase();
        const tujuan = String(item.metadata?.sekolah_tujuan || item.metadata?.unit_tujuan || '').toLowerCase();
        if (!name.includes(debouncedQuery) && !nis.includes(debouncedQuery) && !tujuan.includes(debouncedQuery)) {
          return false;
        }
      }

      if (filterType === 'unit') {
        const unitTujuan = item.metadata?.unit_tujuan_id || item.metadata?.unit_tujuan;
        if (!unitTujuan) return false;
      } else if (filterType === 'keluar') {
        const sekTujuan = item.metadata?.sekolah_tujuan;
        if (!sekTujuan) return false;
      }

      return true;
    });
  }, [mutasiStudents, debouncedQuery, filterType]);

  // Filtered Alumni List
  const filteredAlumniList = useMemo(() => {
    return alumniStudents.filter((item) => {
      if (debouncedQuery) {
        const name = String(item.name || item.nama_lengkap || item.full_name || '').toLowerCase();
        const nis = String(item.nis || item.nisn || '').toLowerCase();
        const tujuan = String(
          item.metadata?.tujuan_kelulusan ||
          item.metadata?.perguruan_tinggi ||
          item.metadata?.status_lanjutan ||
          item.metadata?.pekerjaan ||
          item.tujuan_lanjut ||
          ''
        ).toLowerCase();
        if (!name.includes(debouncedQuery) && !nis.includes(debouncedQuery) && !tujuan.includes(debouncedQuery)) {
          return false;
        }
      }

      if (alumniFilter !== 'all') {
        const target = String(
          item.metadata?.tujuan_kelulusan ||
          item.metadata?.perguruan_tinggi ||
          item.metadata?.status_lanjutan ||
          item.metadata?.pekerjaan ||
          item.tujuan_lanjut ||
          ''
        ).toLowerCase();
        if (alumniFilter === 'kuliah') {
          if (!target.includes('kuliah') && !target.includes('ptn') && !target.includes('pts') && !target.includes('universitas') && !target.includes('institut') && !target.includes('kampus') && !target.includes('studi') && !target.includes('college')) return false;
        } else if (alumniFilter === 'ponpes' || alumniFilter === 'pesantren') {
          if (!target.includes('ponpes') && !target.includes('pesantren') && !target.includes('pondok') && !target.includes('mahad') && !target.includes("ma'had") && !target.includes('tahfizh') && !target.includes('tahfidz')) return false;
        } else if (alumniFilter === 'kerja' || alumniFilter === 'bekerja') {
          if (!target.includes('kerja') && !target.includes('bekerja') && !target.includes('wirausaha') && !target.includes('bisnis') && !target.includes('karir') && !target.includes('swasta') && !target.includes('pns')) return false;
        } else if (alumniFilter === 'sekolah') {
          if (!target.includes('sekolah') && !target.includes('sma') && !target.includes('smk') && !target.includes('ma ') && !target.includes('smp') && !target.includes('madrasah') && !target.includes('lanjutan')) return false;
        }
      }

      return true;
    });
  }, [alumniStudents, debouncedQuery, alumniFilter]);

  // Tracer Study Stats
  const alumniTracerStats = useMemo(() => {
    let kuliah = 0;
    let ponpes = 0;
    let kerja = 0;
    let sekolah = 0;
    alumniStudents.forEach((a) => {
      const target = String(
        a.metadata?.tujuan_kelulusan ||
        a.metadata?.perguruan_tinggi ||
        a.metadata?.status_lanjutan ||
        a.metadata?.pekerjaan ||
        a.tujuan_lanjut ||
        ''
      ).toLowerCase();
      if (target.includes('kuliah') || target.includes('ptn') || target.includes('pts') || target.includes('universitas') || target.includes('institut') || target.includes('kampus') || target.includes('studi') || target.includes('college')) {
        kuliah++;
      } else if (target.includes('ponpes') || target.includes('pesantren') || target.includes('pondok') || target.includes('mahad') || target.includes("ma'had") || target.includes('tahfizh') || target.includes('tahfidz')) {
        ponpes++;
      } else if (target.includes('kerja') || target.includes('bekerja') || target.includes('wirausaha') || target.includes('bisnis') || target.includes('karir') || target.includes('swasta') || target.includes('pns')) {
        kerja++;
      } else if (target.includes('sekolah') || target.includes('sma') || target.includes('smk') || target.includes('ma ') || target.includes('smp') || target.includes('madrasah') || target.includes('lanjutan')) {
        sekolah++;
      }
    });
    return {
      total: alumniStudents.length,
      kuliah,
      ponpes,
      kerja,
      sekolah,
      lainnya: Math.max(0, alumniStudents.length - kuliah - ponpes - kerja - sekolah),
    };
  }, [alumniStudents]);

  // Statistics KPI (Harmonisasi TAILGRIDS_ALUMNI_MUTASI_CARDS)
  const stats = useMemo(() => {
    let pindahUnit = 0;
    let pindahKeluar = 0;
    mutasiStudents.forEach((s) => {
      if (s.metadata?.unit_tujuan_id || s.metadata?.unit_tujuan) pindahUnit++;
      else pindahKeluar++;
    });
    return {
      totalMutasi: mutasiStudents.length,
      totalAlumni: alumniStudents.length,
      pindahUnit,
      pindahKeluar,
      incoming: incomingMutations.length,
    };
  }, [mutasiStudents, alumniStudents, incomingMutations]);

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);

  return (
    <View style={styles.container}>
      {/* ── Background Mosque & School (Identik Halaman Utama & Halaman Penilaian) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien berbasis warna #18A165 identik dengan Halaman Penilaian & Buku Nilai */}
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

      {/* ── HEADER HALAMAN KELOLA ALUMNI & MUTASI (IDENTIK HALAMAN PENILAIAN) ── */}
      <View style={[styles.headerContainer, { paddingTop: topInset + 6 }]}>
        <View style={styles.headerTopRow}>
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={handleGoBack}
            style={styles.backButton}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <View style={styles.pulseDot} />
              <Text style={styles.headerBadgeText} numberOfLines={1} ellipsizeMode="tail">
                KEPALA SEKOLAH • ALUMNI & MUTASI SISWA
              </Text>
            </View>
            <Text style={styles.headerMainTitle} numberOfLines={1}>
              Kelola Alumni & Mutasi
            </Text>
            <Text style={styles.headerSubtitle} numberOfLines={1}>
              Layanan Kesiswaan & Penelusuran Lulusan Terpadu
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => loadData(true)}
            style={styles.refreshButton}
            accessibilityRole="button"
            accessibilityLabel="Muat Ulang"
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#064E3B" />
          </TouchableOpacity>
        </View>

        {/* Search Bar Modern Emerald */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
          <TextInput
            style={styles.searchInput}
            placeholder={
              activeTab === 'alumni'
                ? "Cari alumni, NIS, atau tujuan studi..."
                : "Cari santri mutasi, NIS, atau sekolah tujuan..."
            }
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

        {/* 4 KPI Cards (Harmonisasi TAILGRIDS_ALUMNI_MUTASI_CARDS) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.kpiCardsScroll}
        >
          {/* Card 1: Alumni / Tamat (Emerald) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('alumni')}
            style={[styles.kpiBox, { borderColor: '#A7F3D0' }]}
          >
            <LinearGradient colors={['#ECFDF5', '#D1FAE5']} style={styles.kpiBoxGradient}>
              <View style={styles.kpiHeaderRow}>
                <View style={[styles.kpiIconSquare, { backgroundColor: '#059669' }]}>
                  <MaterialCommunityIcons name="school" size={14} color="#FFF" />
                </View>
                <Text style={[styles.kpiVal, { color: '#047857' }]}>{stats.totalAlumni}</Text>
              </View>
              <Text style={[styles.kpiLbl, { color: '#065F46' }]}>Alumni Tamat</Text>
              <Text style={styles.kpiSub}>Lulusan Terdata</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Card 2: Pindah Unit (Amber) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { setActiveTab('mutasi'); setFilterType('unit'); }}
            style={[styles.kpiBox, { borderColor: '#FDE68A' }]}
          >
            <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.kpiBoxGradient}>
              <View style={styles.kpiHeaderRow}>
                <View style={[styles.kpiIconSquare, { backgroundColor: '#D97706' }]}>
                  <MaterialCommunityIcons name="swap-horizontal" size={14} color="#FFF" />
                </View>
                <Text style={[styles.kpiVal, { color: '#B45309' }]}>{stats.pindahUnit}</Text>
              </View>
              <Text style={[styles.kpiLbl, { color: '#92400E' }]}>Pindah Unit</Text>
              <Text style={styles.kpiSub}>Internal Yayasan</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Card 3: Pindah Keluar (Rose) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => { setActiveTab('mutasi'); setFilterType('keluar'); }}
            style={[styles.kpiBox, { borderColor: '#FECDD3' }]}
          >
            <LinearGradient colors={['#FFF1F2', '#FFE4E6']} style={styles.kpiBoxGradient}>
              <View style={styles.kpiHeaderRow}>
                <View style={[styles.kpiIconSquare, { backgroundColor: '#E11D48' }]}>
                  <MaterialCommunityIcons name="logout-variant" size={14} color="#FFF" />
                </View>
                <Text style={[styles.kpiVal, { color: '#BE123C' }]}>{stats.pindahKeluar}</Text>
              </View>
              <Text style={[styles.kpiLbl, { color: '#9F1239' }]}>Pindah Keluar</Text>
              <Text style={styles.kpiSub}>Sekolah Luar</Text>
            </LinearGradient>
          </TouchableOpacity>

          {/* Card 4: Antrean Masuk (Teal / Emerald) */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setActiveTab('antrean')}
            style={[styles.kpiBox, { borderColor: '#A7F3D0' }]}
          >
            <LinearGradient colors={['#F0FDF4', '#DCFCE7']} style={styles.kpiBoxGradient}>
              <View style={styles.kpiHeaderRow}>
                <View style={[styles.kpiIconSquare, { backgroundColor: '#0D9488' }]}>
                  <MaterialCommunityIcons name="bell-ring-outline" size={14} color="#FFF" />
                </View>
                <Text style={[styles.kpiVal, { color: '#0F766E' }]}>{stats.incoming}</Text>
              </View>
              <Text style={[styles.kpiLbl, { color: '#115E59' }]}>Antrean Masuk</Text>
              <Text style={styles.kpiSub}>Menunggu Validasi</Text>
            </LinearGradient>
          </TouchableOpacity>
        </ScrollView>
      </View>

      {/* ── SEGMENTED SUB-TABS (CANONICAL 3-SECTION PARITY) ── */}
      <View style={styles.segmentContainer}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('mutasi')}
          style={[styles.segmentBtn, (activeTab === 'mutasi' || (activeTab as any) === 'daftar') && styles.segmentBtnActive]}
        >
          <MaterialCommunityIcons
            name="account-switch"
            size={16}
            color={(activeTab === 'mutasi' || (activeTab as any) === 'daftar') ? '#FFFFFF' : '#047857'}
          />
          <Text style={[styles.segmentBtnText, (activeTab === 'mutasi' || (activeTab as any) === 'daftar') && styles.segmentBtnTextActive]}>
            Mutasi ({stats.totalMutasi})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('alumni')}
          style={[styles.segmentBtn, activeTab === 'alumni' && styles.segmentBtnActive]}
        >
          <MaterialCommunityIcons
            name="school"
            size={16}
            color={activeTab === 'alumni' ? '#FFFFFF' : '#047857'}
          />
          <Text style={[styles.segmentBtnText, activeTab === 'alumni' && styles.segmentBtnTextActive]}>
            Alumni ({stats.totalAlumni})
          </Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => setActiveTab('antrean')}
          style={[styles.segmentBtn, activeTab === 'antrean' && styles.segmentBtnActive]}
        >
          <MaterialCommunityIcons
            name="tray-full"
            size={16}
            color={activeTab === 'antrean' ? '#FFFFFF' : '#047857'}
          />
          <Text style={[styles.segmentBtnText, activeTab === 'antrean' && styles.segmentBtnTextActive]}>
            Antrean ({stats.incoming})
          </Text>
        </TouchableOpacity>
      </View>

      {/* ── FILTER PILLS UNTUK TAB MUTASI ── */}
      {(activeTab === 'mutasi' || (activeTab as any) === 'daftar') && (
        <View style={styles.filterPillsRow}>
          <TouchableOpacity
            style={[styles.pillBtn, filterType === 'all' && styles.pillBtnActiveEmerald]}
            onPress={() => setFilterType('all')}
          >
            <Text style={[styles.pillBtnText, filterType === 'all' && styles.pillBtnTextActive]}>
              Semua Mutasi ({stats.totalMutasi})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pillBtn, filterType === 'unit' && styles.pillBtnActiveEmerald]}
            onPress={() => setFilterType('unit')}
          >
            <Text style={[styles.pillBtnText, filterType === 'unit' && styles.pillBtnTextActive]}>
              Pindah Unit ({stats.pindahUnit})
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.pillBtn, filterType === 'keluar' && styles.pillBtnActiveEmerald]}
            onPress={() => setFilterType('keluar')}
          >
            <Text style={[styles.pillBtnText, filterType === 'keluar' && styles.pillBtnTextActive]}>
              Pindah Keluar ({stats.pindahKeluar})
            </Text>
          </TouchableOpacity>
        </View>
      )}

      {/* ── FILTER PILLS UNTUK TAB ALUMNI ── */}
      {activeTab === 'alumni' && (
        <View style={styles.tracerSectionWrap}>
          {/* Tracer Study Header Banner */}
          <LinearGradient
            colors={['#ECFDF5', '#F0FDF4']}
            style={styles.tracerBanner}
          >
            <View style={styles.tracerBannerHeader}>
              <View style={styles.tracerIconBadge}>
                <MaterialCommunityIcons name="school-outline" size={16} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.tracerTitle}>Tracer Study & Penelusuran Alumni</Text>
                <Text style={styles.tracerSub}>Pemetaan kelulusan & studi lanjut santri</Text>
              </View>
            </View>
            <View style={styles.tracerStatsBadgesRow}>
              <View style={[styles.tracerMiniBadge, { backgroundColor: '#E0F2FE' }]}>
                <Text style={[styles.tracerMiniText, { color: '#0369A1' }]}>PTN/Kampus: {alumniTracerStats.kuliah}</Text>
              </View>
              <View style={[styles.tracerMiniBadge, { backgroundColor: '#FEF3C7' }]}>
                <Text style={[styles.tracerMiniText, { color: '#B45309' }]}>Ponpes: {alumniTracerStats.ponpes}</Text>
              </View>
              <View style={[styles.tracerMiniBadge, { backgroundColor: '#EDE9FE' }]}>
                <Text style={[styles.tracerMiniText, { color: '#6D28D9' }]}>Bekerja: {alumniTracerStats.kerja}</Text>
              </View>
            </View>
          </LinearGradient>

          {/* Tracer Filter Pills */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterPillsScroll}>
            <TouchableOpacity
              style={[styles.pillBtn, alumniFilter === 'all' && styles.pillBtnActiveEmerald]}
              onPress={() => setAlumniFilter('all')}
            >
              <Text style={[styles.pillBtnText, alumniFilter === 'all' && styles.pillBtnTextActive]}>
                Semua ({stats.totalAlumni})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillBtn, alumniFilter === 'kuliah' && styles.pillBtnActiveEmerald]}
              onPress={() => setAlumniFilter('kuliah')}
            >
              <Text style={[styles.pillBtnText, alumniFilter === 'kuliah' && styles.pillBtnTextActive]}>
                Kuliah / PTN ({alumniTracerStats.kuliah})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillBtn, (alumniFilter === 'ponpes' || alumniFilter === 'pesantren') && styles.pillBtnActiveEmerald]}
              onPress={() => setAlumniFilter('ponpes')}
            >
              <Text style={[styles.pillBtnText, (alumniFilter === 'ponpes' || alumniFilter === 'pesantren') && styles.pillBtnTextActive]}>
                Pesantren / Ponpes ({alumniTracerStats.ponpes})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillBtn, (alumniFilter === 'kerja' || alumniFilter === 'bekerja') && styles.pillBtnActiveEmerald]}
              onPress={() => setAlumniFilter('kerja')}
            >
              <Text style={[styles.pillBtnText, (alumniFilter === 'kerja' || alumniFilter === 'bekerja') && styles.pillBtnTextActive]}>
                Bekerja / Karir ({alumniTracerStats.kerja})
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={[styles.pillBtn, alumniFilter === 'sekolah' && styles.pillBtnActiveEmerald]}
              onPress={() => setAlumniFilter('sekolah')}
            >
              <Text style={[styles.pillBtnText, alumniFilter === 'sekolah' && styles.pillBtnTextActive]}>
                Sekolah Lanjutan ({alumniTracerStats.sekolah})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      )}

      {/* ── KONTEN TAB: MUTASI / ALUMNI / ANTREAN ── */}
      {activeTab === 'mutasi' || (activeTab as any) === 'daftar' ? (
        loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Memuat data mutasi santri...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredList}
            keyExtractor={(item, index) => String(item.id ?? item.nis ?? `mutasi-${index}`)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={['#059669']} />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="account-switch-outline" size={54} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Belum Ada Santri Mutasi</Text>
                <Text style={styles.emptySubtitle}>Tidak ada data santri mutasi yang sesuai dengan filter.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const studentName = item.name || item.nama_lengkap || item.full_name || 'Santri';
              const nis = item.nis || item.nisn || '—';
              const kelasName = item.kelas?.nama_kelas || item.kelas_nama || 'Kelas Terakhir';
              const metadata = item.metadata || {};
              const unitTujuan = metadata.unit_tujuan || metadata.unit_tujuan_id || '';
              const sekolahTujuan = metadata.sekolah_tujuan || '';
              const alasan = metadata.alasan || '-';
              const tglMutasi = metadata.tgl_mutasi || (item.updated_at ? new Date(item.updated_at).toLocaleDateString('id-ID') : '—');

              const isUnit = Boolean(unitTujuan);

              return (
                <View style={styles.mutationCard}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.avatarCircle, { backgroundColor: isUnit ? '#FEF3C7' : '#FFE4E6' }]}>
                      <MaterialCommunityIcons
                        name={isUnit ? 'swap-horizontal' : 'logout-variant'}
                        size={20}
                        color={isUnit ? '#D97706' : '#E11D48'}
                      />
                    </View>

                    <View style={styles.cardMainInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.studentName} numberOfLines={1}>
                          {studentName}
                        </Text>
                        <View style={[styles.tagBadge, { backgroundColor: isUnit ? '#FEF9EC' : '#FFF1F2' }]}>
                          <Text style={[styles.tagBadgeText, { color: isUnit ? '#B45309' : '#BE123C' }]}>
                            {isUnit ? 'Pindah Unit' : 'Pindah Keluar'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.nisText}>NIS: {nis} • {kelasName}</Text>
                    </View>
                  </View>

                  <View style={styles.detailBox}>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Tujuan:</Text>
                      <Text style={styles.detailItemVal}>{sekolahTujuan || unitTujuan || 'Sekolah Lain'}</Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Alasan:</Text>
                      <Text style={styles.detailItemVal} numberOfLines={2}>{alasan}</Text>
                    </View>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Tanggal:</Text>
                      <Text style={styles.detailItemVal}>{tglMutasi}</Text>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )
      ) : activeTab === 'alumni' ? (
        /* ── KONTEN TAB 2: ALUMNI & KELULUSAN ── */
        loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Memuat data alumni santri...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredAlumniList}
            keyExtractor={(item, index) => String(item.id ?? item.nis ?? `alumni-${index}`)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={['#059669']} />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="school-outline" size={54} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Belum Ada Data Alumni</Text>
                <Text style={styles.emptySubtitle}>Tidak ada santri lulusan yang sesuai dengan filter pencarian.</Text>
              </View>
            }
            renderItem={({ item }) => {
              const studentName = item.name || item.nama_lengkap || item.full_name || 'Alumni Santri';
              const nis = item.nis || item.nisn || '—';
              const metadata = item.metadata || {};
              const tahunLulus = metadata.tahun_lulus || metadata.tahun_mutasi || item.tahun_lulus || '-';
              const statusLanjutan = metadata.status_lanjutan || metadata.tujuan_kelulusan || item.status_lanjutan || 'Belum Diisi';
              const kampus = metadata.perguruan_tinggi || metadata.sekolah_tujuan || metadata.pekerjaan || '';

              return (
                <View style={styles.alumniCard}>
                  <View style={styles.cardTopRow}>
                    <View style={[styles.avatarCircle, { backgroundColor: '#ECFDF5' }]}>
                      <MaterialCommunityIcons name="school" size={20} color="#059669" />
                    </View>

                    <View style={styles.cardMainInfo}>
                      <View style={styles.nameRow}>
                        <Text style={styles.studentName} numberOfLines={1}>
                          {studentName}
                        </Text>
                        <View style={[styles.tagBadge, { backgroundColor: '#ECFDF5' }]}>
                          <Text style={[styles.tagBadgeText, { color: '#047857' }]}>
                            Alumni / Tamat
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.nisText}>NIS: {nis} • Lulus {tahunLulus}</Text>
                    </View>
                  </View>

                  <View style={styles.alumniDetailBox}>
                    <View style={styles.detailItemRow}>
                      <Text style={styles.detailItemLabel}>Studi Lanjut:</Text>
                      <Text style={styles.detailItemVal} numberOfLines={1}>
                        {statusLanjutan}
                      </Text>
                    </View>
                    {Boolean(kampus) && (
                      <View style={styles.detailItemRow}>
                        <Text style={styles.detailItemLabel}>Lembaga:</Text>
                        <Text style={styles.detailItemVal} numberOfLines={1}>
                          {kampus}
                        </Text>
                      </View>
                    )}
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.7}
                    onPress={() => {
                      setSelectedAlumni(item);
                      setAlumniModalVisible(true);
                    }}
                    style={styles.alumniActionBtn}
                  >
                    <MaterialCommunityIcons name="eye-outline" size={14} color="#059669" />
                    <Text style={styles.alumniActionBtnText}>Lihat Detail Alumni & Riwayat</Text>
                  </TouchableOpacity>
                </View>
              );
            }}
          />
        )
      ) : (
        /* ── KONTEN TAB 3: ANTREAN MASUK ── */
        <FlatList
          data={incomingMutations}
          keyExtractor={(item, index) => String(item.id ?? item.student_id ?? `incoming-${index}`)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={['#059669']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="check-circle-outline" size={54} color="#A7F3D0" />
              <Text style={styles.emptyTitle}>Semua Berkas Selesai</Text>
              <Text style={styles.emptySubtitle}>Tidak ada antrean permohonan santri pindahan masuk.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const studentName = item.student?.name || item.student_name || item.nama_siswa || 'Santri Baru';
            const asalUnit = item.from_unit?.name || item.asal_sekolah || 'Unit Asal';
            const tgl = item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : 'Hari ini';

            return (
              <View style={styles.incomingCard}>
                <View style={styles.incomingHeader}>
                  <View style={styles.incomingAvatar}>
                    <MaterialCommunityIcons name="arrow-bottom-left" size={20} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.incomingName}>{studentName}</Text>
                    <Text style={styles.incomingSub}>Asal: {asalUnit} • {tgl}</Text>
                  </View>
                  <View style={styles.incomingPendingBadge}>
                    <Text style={styles.incomingPendingText}>Menunggu</Text>
                  </View>
                </View>

                <View style={styles.incomingActionRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleRejectMutation(item.id, studentName)}
                    style={styles.rejectBtn}
                  >
                    <MaterialCommunityIcons name="close" size={15} color="#EF4444" />
                    <Text style={styles.rejectBtnText}>Tolak</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleApproveMutation(item.id, studentName)}
                    style={styles.approveBtn}
                  >
                    <MaterialCommunityIcons name="check" size={15} color="#FFFFFF" />
                    <Text style={styles.approveBtnText}>Setujui Pindahan</Text>
                  </TouchableOpacity>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── FLOATING BUTTON: AJUKAN MUTASI (Tab Mutasi) ── */}
      {(activeTab === 'mutasi' || (activeTab as any) === 'daftar') && (
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => setFormModalVisible(true)}
          style={styles.fabBtn}
        >
          <LinearGradient
            colors={['#059669', '#047857']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.fabGradient}
          >
            <MaterialCommunityIcons name="account-plus-outline" size={20} color="#FFFFFF" />
            <Text style={styles.fabText}>Ajukan Mutasi</Text>
          </LinearGradient>
        </TouchableOpacity>
      )}

      {/* ── MODAL FORMULIR PENGAJUAN MUTASI ── */}
      <Modal
        visible={formModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setFormModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="file-document-edit-outline" size={20} color="#059669" />
                <Text style={styles.modalTitle}>Formulir Mutasi Santri</Text>
              </View>
              <TouchableOpacity onPress={() => setFormModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {/* Tipe Mutasi Switch */}
              <Text style={styles.formLabel}>Tipe Mutasi</Text>
              <View style={styles.formTypeRow}>
                <TouchableOpacity
                  style={[styles.typeOption, formData.jenis_mutasi === 'pindah_unit' && styles.typeOptionActive]}
                  onPress={() => setFormData({ ...formData, jenis_mutasi: 'pindah_unit' })}
                >
                  <Text style={[styles.typeOptionText, formData.jenis_mutasi === 'pindah_unit' && styles.typeOptionTextActive]}>
                    Pindah Unit Internal
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.typeOption, formData.jenis_mutasi === 'pindah_keluar' && styles.typeOptionActive]}
                  onPress={() => setFormData({ ...formData, jenis_mutasi: 'pindah_keluar' })}
                >
                  <Text style={[styles.typeOptionText, formData.jenis_mutasi === 'pindah_keluar' && styles.typeOptionTextActive]}>
                    Pindah ke Luar
                  </Text>
                </TouchableOpacity>
              </View>

              {/* Pilih Santri */}
              <Text style={styles.formLabel}>Pilih Santri yang Dimutasi</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.studentSelectScroll}>
                {activeStudents.slice(0, 30).map((st) => {
                  const sId = String(st.id);
                  const isSelected = formData.student_id === sId;
                  return (
                    <TouchableOpacity
                      key={sId}
                      onPress={() => setFormData({ ...formData, student_id: sId })}
                      style={[styles.studentPill, isSelected && styles.studentPillActive]}
                    >
                      <Text style={[styles.studentPillText, isSelected && styles.studentPillTextActive]}>
                        {st.name || st.nama_lengkap}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {/* Tujuan */}
              {formData.jenis_mutasi === 'pindah_unit' ? (
                <>
                  <Text style={styles.formLabel}>Unit Madrasah Tujuan</Text>
                  <View style={styles.unitSelectGrid}>
                    {availableUnits.map((u) => {
                      const uId = String(u.id);
                      const isSelected = formData.unit_tujuan_id === uId;
                      return (
                        <TouchableOpacity
                          key={uId}
                          onPress={() => setFormData({ ...formData, unit_tujuan_id: uId })}
                          style={[styles.unitPill, isSelected && styles.unitPillActive]}
                        >
                          <Text style={[styles.unitPillText, isSelected && styles.unitPillTextActive]}>
                            {u.name || u.nama}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </>
              ) : (
                <>
                  <Text style={styles.formLabel}>Nama Sekolah / Lembaga Tujuan</Text>
                  <TextInput
                    style={styles.textInput}
                    placeholder="Contoh: SMP Negeri 1 Jakarta / Ponpes Modern..."
                    placeholderTextColor="#94A3B8"
                    value={formData.sekolah_tujuan}
                    onChangeText={(val) => setFormData({ ...formData, sekolah_tujuan: val })}
                  />
                </>
              )}

              {/* Alasan */}
              <Text style={styles.formLabel}>Alasan Mutasi</Text>
              <TextInput
                style={[styles.textInput, { height: 70 }]}
                placeholder="Alasan kepindahan santri..."
                placeholderTextColor="#94A3B8"
                multiline
                value={formData.alasan}
                onChangeText={(val) => setFormData({ ...formData, alasan: val })}
              />
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                disabled={submitting}
                onPress={handleSubmitMutasi}
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              >
                {submitting ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <Text style={styles.submitBtnText}>Kirim Permohonan Mutasi</Text>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL DETAIL PROFIL ALUMNI ── */}
      <Modal
        visible={alumniModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setAlumniModalVisible(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="school-outline" size={20} color="#059669" />
                <Text style={styles.modalTitle}>Detail Profil Alumni</Text>
              </View>
              <TouchableOpacity onPress={() => setAlumniModalVisible(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedAlumni && (
              <ScrollView contentContainerStyle={styles.modalBody}>
                {/* Header Profil */}
                <View style={styles.alumniDetailHeader}>
                  <View style={[styles.avatarCircleLg, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="school" size={28} color="#059669" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.alumniDetailName}>
                      {selectedAlumni.name || selectedAlumni.nama_lengkap || selectedAlumni.full_name || 'Santri Lulusan'}
                    </Text>
                    <Text style={styles.alumniDetailSub}>
                      NIS: {selectedAlumni.nis || '—'} • NISN: {selectedAlumni.nisn || '—'}
                    </Text>
                    <View style={styles.alumniStatusBadge}>
                      <Text style={styles.alumniStatusBadgeText}>ALUMNI / LULUS</Text>
                    </View>
                  </View>
                </View>

                {/* Detail Data Kelulusan */}
                <Text style={styles.formLabel}>Informasi Kelulusan & Tracer</Text>
                <View style={styles.alumniInfoBox}>
                  <View style={styles.detailItemRow}>
                    <Text style={styles.detailItemLabel}>Tahun Lulus:</Text>
                    <Text style={styles.detailItemVal}>
                      {selectedAlumni.metadata?.tahun_lulus || selectedAlumni.tahun_lulus || '-'}
                    </Text>
                  </View>
                  <View style={styles.detailItemRow}>
                    <Text style={styles.detailItemLabel}>Studi Lanjut:</Text>
                    <Text style={styles.detailItemVal}>
                      {selectedAlumni.metadata?.status_lanjutan || selectedAlumni.metadata?.tujuan_kelulusan || selectedAlumni.status_lanjutan || 'Belum Diisi'}
                    </Text>
                  </View>
                  <View style={styles.detailItemRow}>
                    <Text style={styles.detailItemLabel}>Lembaga/PTN:</Text>
                    <Text style={styles.detailItemVal}>
                      {selectedAlumni.metadata?.perguruan_tinggi || selectedAlumni.metadata?.sekolah_tujuan || selectedAlumni.metadata?.pekerjaan || '—'}
                    </Text>
                  </View>
                  <View style={styles.detailItemRow}>
                    <Text style={styles.detailItemLabel}>Unit Sekolah:</Text>
                    <Text style={styles.detailItemVal}>
                      {selectedAlumni.education_unit?.name || selectedAlumni.unit?.name || userUnitName || 'Unit Terdaftar'}
                    </Text>
                  </View>
                  <View style={styles.detailItemRow}>
                    <Text style={styles.detailItemLabel}>Kelas Asal:</Text>
                    <Text style={styles.detailItemVal}>
                      {selectedAlumni.kelas?.nama_kelas || selectedAlumni.kelas_nama || 'Kelas Terakhir'}
                    </Text>
                  </View>
                </View>

                {/* Catatan Tambahan */}
                {Boolean(selectedAlumni.metadata?.catatan || selectedAlumni.catatan) && (
                  <>
                    <Text style={styles.formLabel}>Catatan Tambahan</Text>
                    <View style={styles.alumniInfoBox}>
                      <Text style={styles.detailItemVal}>
                        {selectedAlumni.metadata?.catatan || selectedAlumni.catatan}
                      </Text>
                    </View>
                  </>
                )}
              </ScrollView>
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setAlumniModalVisible(false)}
                style={[styles.submitBtn, { backgroundColor: '#059669' }]}
              >
                <Text style={styles.submitBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── NOTIFIKASI SUKSES & GAGAL ── */}
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
  bgBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 440,
    overflow: 'hidden',
  },
  bgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.45,
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 12,
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
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    height: 44,
    gap: 8,
    shadowColor: '#059669',
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
  kpiCardsScroll: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    paddingRight: 10,
  },
  kpiCardsRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  kpiBox: {
    minWidth: 112,
    borderRadius: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiBoxGradient: {
    padding: 10,
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
  segmentContainer: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    marginHorizontal: 14,
    marginTop: 4,
    marginBottom: 8,
    padding: 4,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  segmentBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    gap: 6,
  },
  segmentBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  segmentBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  segmentBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterPillsRow: {
    flexDirection: 'row',
    paddingHorizontal: 14,
    paddingBottom: 8,
    gap: 8,
  },
  filterPillsScroll: {
    flexDirection: 'row',
    gap: 6,
    paddingHorizontal: 14,
    paddingBottom: 8,
  },
  pillBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  pillBtnActiveEmerald: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  pillBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  pillBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  tracerSectionWrap: {
    paddingTop: 2,
  },
  tracerBanner: {
    marginHorizontal: 14,
    marginBottom: 8,
    padding: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  tracerBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  tracerIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 7,
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tracerTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#065F46',
  },
  tracerSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#047857',
  },
  tracerStatsBadgesRow: {
    flexDirection: 'row',
    gap: 6,
    flexWrap: 'wrap',
  },
  tracerMiniBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tracerMiniText: {
    fontSize: 10,
    fontWeight: '700',
  },
  alumniCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  alumniDetailBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
    gap: 4,
  },
  alumniActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#ECFDF5',
  },
  alumniActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  alumniDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 8,
  },
  avatarCircleLg: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alumniDetailName: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  alumniDetailSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  alumniStatusBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  alumniStatusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
  },
  alumniInfoBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    gap: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  listContent: {
    padding: 14,
    paddingBottom: 90,
    gap: 10,
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#047857',
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
  mutationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
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
    paddingVertical: 2,
    borderRadius: 6,
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
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    padding: 8,
    marginTop: 8,
    gap: 4,
  },
  detailItemRow: {
    flexDirection: 'row',
    gap: 6,
  },
  detailItemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
    width: 55,
  },
  detailItemVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#1E293B',
    flex: 1,
  },
  incomingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  incomingHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  incomingAvatar: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  incomingName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  incomingSub: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  incomingPendingBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  incomingPendingText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#B45309',
  },
  incomingActionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#ECFDF5',
    paddingTop: 8,
  },
  rejectBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#FEF2F2',
    gap: 4,
  },
  rejectBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#EF4444',
  },
  approveBtn: {
    flex: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#059669',
    gap: 4,
  },
  approveBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  fabBtn: {
    position: 'absolute',
    bottom: 24,
    right: 18,
    borderRadius: 24,
    elevation: 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 8,
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
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
    gap: 10,
  },
  formLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
    marginTop: 4,
  },
  formTypeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeOption: {
    flex: 1,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typeOptionActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  typeOptionText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  typeOptionTextActive: {
    color: '#FFFFFF',
  },
  studentSelectScroll: {
    flexDirection: 'row',
    marginVertical: 4,
  },
  studentPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    marginRight: 6,
  },
  studentPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  studentPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  studentPillTextActive: {
    color: '#FFFFFF',
  },
  unitSelectGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  unitPill: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  unitPillActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  unitPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },
  unitPillTextActive: {
    color: '#FFFFFF',
  },
  textInput: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  submitBtn: {
    backgroundColor: '#059669',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
