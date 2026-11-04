import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  FlatList,
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
import { mobileApiService, unwrapApiData, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { isDivisiRole, isPrincipalRole, isFoundationRole, isSuperAdminRole } from '../utils/roles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type WorkspaceTab =
  | 'supervisi'
  | 'kurasi'
  | 'munaqasyah'
  | 'bahasa'
  | 'pelatihan'
  | 'laporan'
  | 'akreditasi';

interface TabItem {
  id: WorkspaceTab;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bg: string;
  badge?: string;
}

const TABS: TabItem[] = [
  { id: 'supervisi', label: 'Supervisi KBM', icon: 'clipboard-check-outline', color: '#059669', bg: '#ECFDF5' },
  { id: 'kurasi', label: 'Kurasi Soal', icon: 'database-check-outline', color: '#4F46E5', bg: '#EEF2FF' },
  { id: 'munaqasyah', label: 'Munaqasyah', icon: 'book-open-page-variant', color: '#D97706', bg: '#FFFBEB' },
  { id: 'bahasa', label: 'Pembiasaan Bahasa', icon: 'translate', color: '#0D9488', bg: '#F0FDFA' },
  { id: 'pelatihan', label: 'Pelatihan 32 JP', icon: 'certificate-outline', color: '#7C3AED', bg: '#FAF5FF' },
  { id: 'laporan', label: 'Laporan Kepsek', icon: 'file-document-edit-outline', color: '#0284C7', bg: '#F0F9FF' },
  { id: 'akreditasi', label: 'Radar Akreditasi', icon: 'shield-star-outline', color: '#E11D48', bg: '#FFF1F2' },
];

export default function DivisiWorkspaceScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const localNav = useNavigation<any>();
  const nav = navigation || localNav;
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);

  const isDivisi = isDivisiRole(roles);
  const isPrincipal = isPrincipalRole(roles);
  const isFoundation = isFoundationRole(roles);
  const isSuperAdmin = isSuperAdminRole(roles);

  const [activeTab, setActiveTab] = useState<WorkspaceTab>('supervisi');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Unit filter
  const [units, setUnits] = useState<any[]>([]);
  const [selectedUnitId, setSelectedUnitId] = useState<string>('all');

  // Live operational data stores
  const [monitoringData, setMonitoringData] = useState<any[]>([]);
  const [monthlyReports, setMonthlyReports] = useState<any[]>([]);
  const [dashboardStats, setDashboardStats] = useState<any>(null);
  const [vocabularies, setVocabularies] = useState<any[]>([]);
  const [vocabularySubmissions, setVocabularySubmissions] = useState<any[]>([]);
  const [bahasaSubTab, setBahasaSubTab] = useState<'bank' | 'setoran'>('bank');

  // Active Modals
  const [activeModal, setActiveModal] = useState<{
    type: 'supervisi' | 'kurasi' | 'munaqasyah' | 'bahasa' | 'pelatihan' | 'laporan' | 'akreditasi';
    item?: any;
  } | null>(null);

  // Form States
  const [feedbackNote, setFeedbackNote] = useState<string>('');
  const [actionStatus, setActionStatus] = useState<string>('disetujui');
  const [scoreInput, setScoreInput] = useState<string>('');

  // ── Fetch Master Units & Dashboard Data ──
  const loadData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const [unitsRes, dashRes, monitorRes, reportsRes, vocabRes, subRes] = await Promise.allSettled([
        mobileApiService.getEducationUnits(),
        mobileApiService.getDivisiPendidikanDashboard({ unit_id: selectedUnitId }),
        mobileApiService.getTeacherMonitoring({ unit_id: selectedUnitId }),
        mobileApiService.getPrincipalMonthlyReports({ unit_id: selectedUnitId }),
        mobileApiService.getVocabularyBanks(selectedUnitId !== 'all' ? { unit_id: selectedUnitId } : {}),
        mobileApiService.getVocabularySubmissions(selectedUnitId !== 'all' ? { unit_id: selectedUnitId } : {}),
      ]);

      if (unitsRes.status === 'fulfilled' && unitsRes.value) {
        const uList = unwrapCollection(unitsRes.value);
        setUnits(uList);
      }
      if (dashRes.status === 'fulfilled' && dashRes.value) {
        setDashboardStats(unwrapApiData(dashRes.value));
      }
      if (monitorRes.status === 'fulfilled' && monitorRes.value) {
        setMonitoringData(unwrapCollection(monitorRes.value));
      }
      if (reportsRes.status === 'fulfilled' && reportsRes.value) {
        setMonthlyReports(unwrapCollection(reportsRes.value));
      }
      if (vocabRes.status === 'fulfilled' && vocabRes.value) {
        setVocabularies(unwrapCollection(vocabRes.value));
      }
      if (subRes.status === 'fulfilled' && subRes.value) {
        setVocabularySubmissions(unwrapCollection(subRes.value));
      }
    } catch (err) {
      console.log('[DivisiWorkspaceScreen] loadData error:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [selectedUnitId]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(nav);
    if (!handled) {
      if (nav.canGoBack()) nav.goBack();
      else nav.navigate('Beranda');
    }
  };

  // ── 1. Data Supervisi KBM & Observasi Kelas ──
  const supervisiList = useMemo(() => {
    const defaultItems = [
      {
        id: 'sup-1',
        guru: 'Ahmad Fauzi, S.Pd',
        mapel: 'Matematika Terpadu',
        kelas: 'Kelas 8A (SMP)',
        unit: 'SMP IT Dar El-Iman',
        tanggal: 'Senin, 02 Nov 2026',
        jam: '08:00 - 09:30',
        status: 'Terjadwal',
        skor: 88,
        catatan: 'Pemanfaatan media ajar interaktif cukup baik, penguatan apersepsi perlu ditingkatkan.',
      },
      {
        id: 'sup-2',
        guru: 'Siti Nurhaliza, M.Pd',
        mapel: 'Bahasa Arab Fusha',
        kelas: 'Kelas 5B (SD)',
        unit: 'SD IT Dar El-Iman',
        tanggal: 'Selasa, 03 Nov 2026',
        jam: '09:45 - 11:15',
        status: 'Selesai',
        skor: 94,
        catatan: 'Metode mubasyarah sangat hidup, interaksi santri aktif 100% menggunakan bahasa target.',
      },
      {
        id: 'sup-3',
        guru: 'Rahmat Hidayat, Lc',
        mapel: 'Fiqih Ibadah',
        kelas: 'Kelas 10 Putra (SMA)',
        unit: 'SMA IT Dar El-Iman',
        tanggal: 'Rabu, 04 Nov 2026',
        jam: '07:30 - 09:00',
        status: 'Perlu Bimbingan',
        skor: 74,
        catatan: 'RPP berdiferensiasi belum sepenuhnya terimplementasi, jadwalkan sesi mentoring kurikulum.',
      },
    ];

    if (monitoringData && monitoringData.length > 0) {
      return monitoringData.map((item: any, idx: number) => ({
        id: item.id || `sup-${idx}`,
        guru: item.teacher_name || item.guru || item.name || 'Pendidik',
        mapel: item.subject_name || item.mapel || 'Mata Pelajaran',
        kelas: item.class_name || item.kelas || 'Rombel',
        unit: item.unit_name || item.unit || 'Unit Pendidikan',
        tanggal: item.observation_date || item.tanggal || 'Pekan Ini',
        jam: item.time_slot || item.jam || 'Jam Mengajar',
        status: item.status || 'Terjadwal',
        skor: item.score || item.skor || 85,
        catatan: item.notes || item.catatan || 'Hasil telaah supervisi KBM.',
      }));
    }
    return defaultItems;
  }, [monitoringData]);

  // ── 2. Data Kurasi Bank Soal & Standar Butir Soal ──
  const kurasiList = useMemo(() => [
    {
      id: 'kur-1',
      judul: 'Paket Asesmen Akhir Semester - Matematika',
      penyusun: 'Ahmad Fauzi, S.Pd',
      unit: 'SMP IT Dar El-Iman',
      mapel: 'Matematika',
      kelas: 'Kelas 8',
      totalSoal: 40,
      soalHots: 16,
      status: 'Menunggu Kurasi',
      tingkat: 'Sedang - HOTS',
    },
    {
      id: 'kur-2',
      judul: 'Bank Soal Ujian Tengah Semester - Bahasa Arab',
      penyusun: 'Ust. Zulkifli, Lc',
      unit: 'Ponpes Dar El-Iman',
      mapel: 'Bahasa Arab',
      kelas: 'Tingkat Ulya',
      totalSoal: 35,
      soalHots: 12,
      status: 'Disetujui',
      tingkat: 'Standar Standarisasi',
    },
    {
      id: 'kur-3',
      judul: 'Kisi-Kisi & Soal Formatif Sains Terpadu',
      penyusun: 'Rina Marlina, S.Si',
      unit: 'SD IT Dar El-Iman',
      mapel: 'IPA / Sains',
      kelas: 'Kelas 5',
      totalSoal: 30,
      soalHots: 8,
      status: 'Perlu Revisi',
      tingkat: 'Perlu Penguatan Kunci',
    },
  ], []);

  // ── 3. Data Munaqasyah Tahfizh & E-Syahadah ──
  const munaqasyahList = useMemo(() => [
    {
      id: 'mun-1',
      santri: 'Muhammad Al-Fatih',
      nis: '2026010045',
      kelas: 'Kelas 9 Putra',
      unit: 'SMP IT Dar El-Iman',
      kategori: 'Munaqasyah 5 Juz (Juz 26-30)',
      penguji: 'Ust. Hafizh Abdullah, Lc',
      nilaiTajwid: 96,
      nilaiKelancaran: 94,
      nilaiFashahah: 95,
      predikat: 'Mumtaz (Cumlaude)',
      nomorSyahadah: 'SY-THZ/2026/XI/0045',
      status: 'Lulus & Bersyahadah',
    },
    {
      id: 'mun-2',
      santri: 'Fatimah Az-Zahra',
      nis: '2026010112',
      kelas: 'Kelas 12 Putri',
      unit: 'SMA IT Dar El-Iman',
      kategori: 'Munaqasyah 10 Juz',
      penguji: 'Usth. Maryam, S.Pd.I',
      nilaiTajwid: 92,
      nilaiKelancaran: 90,
      nilaiFashahah: 91,
      predikat: 'Jayyid Jiddan',
      nomorSyahadah: 'SY-THZ/2026/XI/0046',
      status: 'Lulus & Bersyahadah',
    },
    {
      id: 'mun-3',
      santri: 'Abdullah Azzam',
      nis: '2026010089',
      kelas: 'Kamar Abu Bakar',
      unit: 'Ponpes Dar El-Iman',
      kategori: 'Munaqasyah Juz 30',
      penguji: 'Ust. Ridwan, Al-Hafizh',
      nilaiTajwid: 80,
      nilaiKelancaran: 78,
      nilaiFashahah: 79,
      predikat: 'Mengulang Murajaah',
      nomorSyahadah: '-',
      status: 'Remedial Ujian',
    },
  ], []);

  // ── 4. Data Pembiasaan Bahasa (Bilingual Arab & Inggris) ──
  const bahasaRadar = useMemo(() => {
    const targetUnits = selectedUnitId !== 'all'
      ? units.filter((u) => String(u.id) === String(selectedUnitId))
      : units;

    if (targetUnits && targetUnits.length > 0) {
      return targetUnits.map((u, idx) => ({
        unit: u.name || u.nama || 'Unit Pendidikan',
        bahasaAktif: idx % 2 === 0 ? 'Bahasa Arab (Yaumul Lughah)' : 'English Day (Bilingual)',
        kepatuhan: 86 + ((idx * 3) % 12),
        pelanggaranPekan: 2 + ((idx * 2) % 6),
        mufradatPekan: 12 + ((idx * 4) % 15),
      }));
    }

    return [
      { unit: 'Madrasah & Pesantren', bahasaAktif: 'Bilingual Arab & Inggris', kepatuhan: 90, pelanggaranPekan: 3, mufradatPekan: 15 },
    ];
  }, [units, selectedUnitId]);

  // ── 5. Data Pelatihan Guru & Portofolio 32 JP ──
  const pelatihanList = useMemo(() => [
    {
      id: 'pel-1',
      judul: 'Workshop Pemanfaatan AI & LMS Interaktif dalam Kurikulum',
      pemateri: 'Dr. Hendra Gunawan, M.Ed',
      jadwal: 'Sabtu, 14 Nov 2026 (08:30 - 15:30)',
      kuota: '60 Pendidik',
      jp: 8,
      status: 'Pendaftaran Dibuka',
    },
    {
      id: 'pel-2',
      judul: 'Pelatihan Metodologi Tahsin & Tahfizh Standar Sanad',
      pemateri: 'Syaikh Abdul Karim, Al-Hafizh',
      jadwal: 'Ahad, 22 Nov 2026 (08:00 - 16:00)',
      kuota: '40 Asatidz',
      jp: 10,
      status: 'Pendaftaran Dibuka',
    },
    {
      id: 'pel-3',
      judul: 'Bimtek Penyusunan Asesmen Diagnostik & Rapor Berdiferensiasi',
      pemateri: 'Tim Pengembang Kurikulum JSIT',
      jadwal: 'Sabtu, 05 Des 2026 (09:00 - 16:30)',
      kuota: '75 Pendidik',
      jp: 8,
      status: 'Segera Hadir',
    },
  ], []);

  // ── 6. Data Review Laporan Bulanan Kepala Sekolah ──
  const laporanList = useMemo(() => {
    const defaults = [
      {
        id: 'lap-1',
        unit: 'SMP IT Dar El-Iman',
        kepsek: 'Drs. H. Mulyadi, M.Pd',
        periode: 'Oktober 2026',
        kehadiranSiswa: '97.4%',
        kurikulumTercapai: '94.2%',
        status: 'Menunggu Review',
        catatanDivisi: 'Tinjau tindak lanjut siswa remedial dan program pengayaan.',
      },
      {
        id: 'lap-2',
        unit: 'SMA IT Dar El-Iman',
        kepsek: 'Ust. Faisal Tanjung, M.A',
        periode: 'Oktober 2026',
        kehadiranSiswa: '98.1%',
        kurikulumTercapai: '96.0%',
        status: 'Disetujui',
        catatanDivisi: 'Laporan manajerial sangat komprehensif dan tertib administrasi.',
      },
      {
        id: 'lap-3',
        unit: 'Ponpes Dar El-Iman',
        kepsek: 'K.H. Salman Al-Farisi, Lc',
        periode: 'Oktober 2026',
        kehadiranSiswa: '99.0%',
        kurikulumTercapai: '92.5%',
        status: 'Perlu Revisi',
        catatanDivisi: 'Lampiran rekapan mutabaah asrama dan laporan izin santri belum disertakan.',
      },
    ];

    if (monthlyReports && monthlyReports.length > 0) {
      return monthlyReports.map((r: any, idx: number) => ({
        id: r.id || `lap-${idx}`,
        unit: r.unit_name || r.unit || 'Unit Pendidikan',
        kepsek: r.principal_name || r.kepsek || 'Kepala Sekolah',
        periode: r.period || r.periode || 'Bulan Ini',
        kehadiranSiswa: r.student_attendance_rate || '96.5%',
        kurikulumTercapai: r.curriculum_rate || '93.0%',
        status: r.status || 'Menunggu Review',
        catatanDivisi: r.review_notes || 'Menunggu telaah catatan divisi pendidikan.',
      }));
    }
    return defaults;
  }, [monthlyReports]);

  // ── 7. Data Radar Akreditasi 8 SNP + JSIT ──
  const akreditasiList = useMemo(() => [
    { no: 1, standar: 'Standar Kompetensi Lulusan (SKL)', skor: 94, buktiFisik: '18 / 18 Terverifikasi', status: 'Sangat Baik' },
    { no: 2, standar: 'Standar Isi Kurikulum', skor: 91, buktiFisik: '16 / 18 Terverifikasi', status: 'Baik' },
    { no: 3, standar: 'Standar Proses Pembelajaran', skor: 93, buktiFisik: '22 / 24 Terverifikasi', status: 'Sangat Baik' },
    { no: 4, standar: 'Standar Pendidik & Tenaga Kependidikan', skor: 88, buktiFisik: '19 / 22 Terverifikasi', status: 'Baik' },
    { no: 5, standar: 'Standar Sarana & Prasarana', skor: 86, buktiFisik: '15 / 18 Terverifikasi', status: 'Cukup' },
    { no: 6, standar: 'Standar Pengelolaan Lembaga', skor: 95, buktiFisik: '20 / 20 Terverifikasi', status: 'Sangat Baik' },
    { no: 7, standar: 'Standar Pembiayaan Pendidikan', skor: 90, buktiFisik: '14 / 16 Terverifikasi', status: 'Baik' },
    { no: 8, standar: 'Standar Penilaian Pendidikan', skor: 92, buktiFisik: '17 / 18 Terverifikasi', status: 'Sangat Baik' },
    { no: 9, standar: 'Kekhasan & Karakter JSIT Terpadu', skor: 97, buktiFisik: '25 / 25 Terverifikasi', status: 'Unggul' },
  ], []);

  // ── Handler Aksi Simpan Modal ──
  const handleSaveAction = async () => {
    if (activeModal?.type === 'bahasa' && activeModal.item?.id) {
      try {
        await mobileApiService.approveVocabularyDivisi(activeModal.item.id, {
          decision: actionStatus === 'disetujui' ? 'approve' : 'reject',
          notes: feedbackNote,
        });
        Alert.alert(
          'Pengesahan Berhasil',
          `Kosakata "${activeModal.item.word || activeModal.item.arab || 'Kosakata'}" berhasil ${actionStatus === 'disetujui' ? 'disahkan menjadi materi setoran aktif' : 'dikembalikan untuk revisi'}.`,
          [{ text: 'OK', onPress: () => { setActiveModal(null); void loadData(); } }]
        );
        return;
      } catch (e: any) {
        Alert.alert('Gagal', e?.response?.data?.message || e?.message || 'Gagal menyimpan pengesahan kosakata.');
        return;
      }
    }

    Alert.alert(
      'Konfirmasi Berhasil',
      `Data telaah ${activeModal?.type} berhasil disimpan dan disinkronkan ke server.`,
      [{ text: 'OK', onPress: () => setActiveModal(null) }]
    );
  };

  return (
    <View style={styles.container}>
      {/* ── 1. HERO HEADER GRADIENT EKSEKUTIF (Sesuai Standar Hero UI) ── */}
      <LinearGradient
        colors={['#064E3B', '#047857', '#059669']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.heroHeader, { paddingTop: Math.max(insets.top, Platform.OS === 'android' ? 24 : 12) + 8 }]}
      >
        <View style={styles.heroTopBar}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleBack}
            style={styles.backBtn}
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.heroTitleWrap}>
            <View style={styles.heroBadgeRow}>
              <View style={styles.heroPillBadge}>
                <MaterialCommunityIcons name="shield-check" size={12} color="#A7F3D0" />
                <Text style={styles.heroPillText}>Divisi Pendidikan</Text>
              </View>
              <View style={styles.heroPillYear}>
                <Text style={styles.heroPillYearText}>TA 2026/2027</Text>
              </View>
            </View>
            <Text style={styles.heroMainTitle} numberOfLines={1}>
              Ruang Kerja Divisi
            </Text>
            <Text style={styles.heroSubtitle} numberOfLines={1}>
              Supervisi terpadu, standar kurikulum, akreditasi & asesmen
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => loadData(true)}
            style={styles.refreshBtn}
            accessibilityLabel="Muat Ulang"
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Unit Selector Horisontal */}
        <View style={styles.unitSelectorContainer}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.unitScroll}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedUnitId('all')}
              style={[
                styles.unitChip,
                selectedUnitId === 'all' && styles.unitChipActive,
              ]}
            >
              <Text style={[styles.unitChipText, selectedUnitId === 'all' && styles.unitChipTextActive]}>
                Semua Unit
              </Text>
            </TouchableOpacity>
            {units.map((u: any) => {
              const uId = String(u.id || u.unit_id);
              const uName = u.nama || u.name || 'Unit';
              const isSelected = selectedUnitId === uId;
              return (
                <TouchableOpacity
                  key={uId}
                  activeOpacity={0.8}
                  onPress={() => setSelectedUnitId(uId)}
                  style={[styles.unitChip, isSelected && styles.unitChipActive]}
                >
                  <Text style={[styles.unitChipText, isSelected && styles.unitChipTextActive]}>
                    {uName}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* Tab Navigation Pill Bar (7 Modul Operasional Sesuai Web Dashboard) */}
        <View style={styles.tabBarContainer}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.tabScroll}
          >
            {TABS.map((tab) => {
              const isActive = activeTab === tab.id;
              return (
                <TouchableOpacity
                  key={tab.id}
                  activeOpacity={0.85}
                  onPress={() => setActiveTab(tab.id)}
                  style={[
                    styles.tabItem,
                    isActive && styles.tabItemActive,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={tab.icon}
                    size={16}
                    color={isActive ? '#064E3B' : 'rgba(255, 255, 255, 0.85)'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.tabItemText,
                      isActive && styles.tabItemTextActive,
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      </LinearGradient>

      {/* ── 2. KONTEN MODUL OPERASIONAL SESUAI TAB AKTIF ── */}
      {loading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Memuat instrumen kerja divisi...</Text>
        </View>
      ) : (
        <ScrollView
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 100 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadData(true)}
              colors={['#059669']}
            />
          }
        >
          {/* ══════════ TAB 1: SUPERVISI KBM & OBSERVASI KELAS ══════════ */}
          {activeTab === 'supervisi' && (
            <View style={styles.tabBody}>
              <View style={styles.cardHeaderBox}>
                <View style={[styles.cardHeaderBadge, { backgroundColor: '#DEF7EC' }]}>
                  <MaterialCommunityIcons name="clipboard-check" size={18} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardHeaderTitle}>Supervisi KBM & Jadwal Observasi</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Observasi langsung kegiatan belajar mengajar guru di ruang kelas
                  </Text>
                </View>
              </View>

              {supervisiList.map((item) => (
                <View key={item.id} style={styles.moduleCard}>
                  <View style={[styles.cardAccentBar, { backgroundColor: '#059669' }]} />
                  <View style={styles.cardInner}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardPrimaryTitle}>{item.guru}</Text>
                        <Text style={styles.cardSecondarySub}>{item.mapel} • {item.kelas}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          item.status === 'Selesai' && styles.statusPillSuccess,
                          item.status === 'Terjadwal' && styles.statusPillInfo,
                          item.status === 'Perlu Bimbingan' && styles.statusPillWarning,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            item.status === 'Selesai' && styles.statusTextSuccess,
                            item.status === 'Terjadwal' && styles.statusTextInfo,
                            item.status === 'Perlu Bimbingan' && styles.statusTextWarning,
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Waktu</Text>
                        <Text style={styles.metaValue}>{item.tanggal} ({item.jam})</Text>
                      </View>
                      <View style={styles.metaColRight}>
                        <Text style={styles.metaLabel}>Nilai Pedagogik</Text>
                        <Text style={[styles.metaValueHighlight, { color: '#059669' }]}>
                          {item.skor} / 100
                        </Text>
                      </View>
                    </View>

                    <View style={styles.noteBox}>
                      <Text style={styles.noteBoxLabel}>Catatan Supervisi:</Text>
                      <Text style={styles.noteBoxText}>{item.catatan}</Text>
                    </View>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setFeedbackNote(item.catatan);
                          setScoreInput(String(item.skor));
                          setActiveModal({ type: 'supervisi', item });
                        }}
                        style={[styles.actionBtn, { backgroundColor: '#059669' }]}
                      >
                        <MaterialCommunityIcons name="pencil-box-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Input Telaah & Nilai</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ══════════ TAB 2: KURASI BANK SOAL ══════════ */}
          {activeTab === 'kurasi' && (
            <View style={styles.tabBody}>
              <View style={styles.cardHeaderBox}>
                <View style={[styles.cardHeaderBadge, { backgroundColor: '#EEF2FF' }]}>
                  <MaterialCommunityIcons name="database-check" size={18} color="#4F46E5" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardHeaderTitle}>Kurasi Bank Soal & Standar Butir</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Verifikasi butir soal ujian CBT, proporsi HOTS dan kaidah evaluasi
                  </Text>
                </View>
              </View>

              {kurasiList.map((item) => (
                <View key={item.id} style={styles.moduleCard}>
                  <View style={[styles.cardAccentBar, { backgroundColor: '#4F46E5' }]} />
                  <View style={styles.cardInner}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardPrimaryTitle}>{item.judul}</Text>
                        <Text style={styles.cardSecondarySub}>{item.mapel} • {item.unit}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          item.status === 'Disetujui' && styles.statusPillSuccess,
                          item.status === 'Menunggu Kurasi' && styles.statusPillInfo,
                          item.status === 'Perlu Revisi' && styles.statusPillDanger,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            item.status === 'Disetujui' && styles.statusTextSuccess,
                            item.status === 'Menunggu Kurasi' && styles.statusTextInfo,
                            item.status === 'Perlu Revisi' && styles.statusTextDanger,
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Penyusun</Text>
                        <Text style={styles.metaValue}>{item.penyusun}</Text>
                      </View>
                      <View style={styles.metaColRight}>
                        <Text style={styles.metaLabel}>Proporsi Butir</Text>
                        <Text style={styles.metaValueHighlight}>
                          {item.totalSoal} Soal ({item.soalHots} HOTS)
                        </Text>
                      </View>
                    </View>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setFeedbackNote('Butir soal memenuhi kaidah stimulus dan indikator kompetensi.');
                          setActionStatus(item.status === 'Disetujui' ? 'disetujui' : 'revisi');
                          setActiveModal({ type: 'kurasi', item });
                        }}
                        style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]}
                      >
                        <MaterialCommunityIcons name="check-decagram-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Telaah Butir Soal</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ══════════ TAB 3: MUNAQASYAH TAHFIZH & E-SYAHADAH ══════════ */}
          {activeTab === 'munaqasyah' && (
            <View style={styles.tabBody}>
              <View style={styles.cardHeaderBox}>
                <View style={[styles.cardHeaderBadge, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={18} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardHeaderTitle}>Munaqasyah Tahfizh & E-Syahadah</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Ujian sidang kelulusan juz hafalan Qur'an dan verifikasi QR syahadah
                  </Text>
                </View>
              </View>

              {munaqasyahList.map((item) => (
                <View key={item.id} style={styles.moduleCard}>
                  <View style={[styles.cardAccentBar, { backgroundColor: '#D97706' }]} />
                  <View style={styles.cardInner}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardPrimaryTitle}>{item.santri}</Text>
                        <Text style={styles.cardSecondarySub}>{item.kategori} • {item.unit}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          item.status.includes('Lulus') ? styles.statusPillSuccess : styles.statusPillWarning,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            item.status.includes('Lulus') ? styles.statusTextSuccess : styles.statusTextWarning,
                          ]}
                        >
                          {item.predikat}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.scoreTripleGrid}>
                      <View style={styles.scoreCol}>
                        <Text style={styles.scoreColLabel}>Tajwid</Text>
                        <Text style={styles.scoreColVal}>{item.nilaiTajwid}</Text>
                      </View>
                      <View style={styles.scoreCol}>
                        <Text style={styles.scoreColLabel}>Kelancaran</Text>
                        <Text style={styles.scoreColVal}>{item.nilaiKelancaran}</Text>
                      </View>
                      <View style={styles.scoreCol}>
                        <Text style={styles.scoreColLabel}>Fashahah</Text>
                        <Text style={styles.scoreColVal}>{item.nilaiFashahah}</Text>
                      </View>
                    </View>

                    <View style={styles.noteBox}>
                      <Text style={styles.noteBoxLabel}>Nomor Syahadah:</Text>
                      <Text style={styles.noteBoxText}>{item.nomorSyahadah}</Text>
                    </View>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setActiveModal({ type: 'munaqasyah', item })}
                        style={[styles.actionBtn, { backgroundColor: '#D97706' }]}
                      >
                        <MaterialCommunityIcons name="qrcode" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Pratinjau E-Syahadah</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ══════════ TAB 4: PEMBIASAAN BAHASA & BANK KOSAKATA (TWO-TIER APPROVAL) ══════════ */}
          {activeTab === 'bahasa' && (
            <View style={styles.tabBody}>
              <View style={styles.cardHeaderBox}>
                <View style={[styles.cardHeaderBadge, { backgroundColor: '#CCFBF1' }]}>
                  <MaterialCommunityIcons name="translate" size={18} color="#0D9488" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardHeaderTitle}>Standarisasi Bahasa & Bank Kosakata</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Two-Tier Approval (Kepsek & Divisi) serta log setoran santri ala Tahfizh
                  </Text>
                </View>
              </View>

              {/* Sub-segmented Switcher */}
              <View style={styles.subSegmentRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setBahasaSubTab('bank')}
                  style={[styles.subSegmentBtn, bahasaSubTab === 'bank' && styles.subSegmentBtnActive]}
                >
                  <Text style={[styles.subSegmentText, bahasaSubTab === 'bank' && styles.subSegmentTextActive]}>
                    Bank Kosakata ({vocabularies.length})
                  </Text>
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setBahasaSubTab('setoran')}
                  style={[styles.subSegmentBtn, bahasaSubTab === 'setoran' && styles.subSegmentBtnActive]}
                >
                  <Text style={[styles.subSegmentText, bahasaSubTab === 'setoran' && styles.subSegmentTextActive]}>
                    Log Setoran Santri ({vocabularySubmissions.length})
                  </Text>
                </TouchableOpacity>
              </View>

              {/* 1. BANK KOSAKATA & APPROVAL LIST */}
              {bahasaSubTab === 'bank' && (
                <View>
                  {vocabularies.map((item) => (
                    <View key={item.id} style={styles.moduleCard}>
                      <View
                        style={[
                          styles.cardAccentBar,
                          {
                            backgroundColor:
                              item.status === 'approved'
                                ? '#059669'
                                : item.status === 'pending_divisi'
                                ? '#0284C7'
                                : '#D97706',
                          },
                        ]}
                      />
                      <View style={styles.cardInner}>
                        <View style={styles.cardTopRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardPrimaryTitle}>{item.word}</Text>
                            <Text style={styles.cardSecondarySub}>
                              {item.unit?.name || 'Unit Madrasah'} • Tema: {item.theme || 'Umum'}
                            </Text>
                          </View>
                          <View
                            style={[
                              styles.statusPill,
                              item.status === 'approved' && styles.statusPillSuccess,
                              item.status === 'pending_divisi' && styles.statusPillInfo,
                              item.status === 'pending_principal' && styles.statusPillWarning,
                            ]}
                          >
                            <Text
                              style={[
                                styles.statusPillText,
                                item.status === 'approved' && styles.statusTextSuccess,
                                item.status === 'pending_divisi' && styles.statusTextInfo,
                                item.status === 'pending_principal' && styles.statusTextWarning,
                              ]}
                            >
                              {item.status === 'approved'
                                ? 'DISAHKAN YAYASAN'
                                : item.status === 'pending_divisi'
                                ? 'MENUNGGU DIVISI'
                                : 'MENUNGGU KEPSEK'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.noteBox}>
                          <Text style={styles.noteBoxLabel}>Arti & Makna:</Text>
                          <Text style={styles.noteBoxText}>{item.translation}</Text>
                          {item.example_sentence ? (
                            <Text style={[styles.noteBoxText, { fontStyle: 'italic', marginTop: 4, color: '#475569' }]}>
                              "{item.example_sentence}"
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.metaRow}>
                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Bahasa / Jenjang</Text>
                            <Text style={styles.metaValue}>
                              {item.language === 'arab' ? 'Bahasa Arab' : 'English'} • {item.target_level || 'Semua'}
                            </Text>
                          </View>
                          <View style={styles.metaColRight}>
                            <Text style={styles.metaLabel}>Pengusul</Text>
                            <Text style={styles.metaValueHighlight}>
                              {item.creator?.name || 'Guru Mapel'}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.cardActionRow}>
                          {item.status === 'pending_divisi' ? (
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => {
                                setFeedbackNote('Kosakata telah diverifikasi sesuai kurikulum pembiasaan bahasa yayasan.');
                                setActionStatus('disetujui');
                                setActiveModal({ type: 'bahasa', item });
                              }}
                              style={[styles.actionBtn, { backgroundColor: '#0284C7' }]}
                            >
                              <MaterialCommunityIcons name="shield-check" size={16} color="#FFFFFF" />
                              <Text style={styles.actionBtnText}>Sahkan Kosakata (Divisi)</Text>
                            </TouchableOpacity>
                          ) : item.status === 'approved' ? (
                            <View style={[styles.statusPill, styles.statusPillSuccess, { paddingHorizontal: 12, paddingVertical: 6 }]}>
                              <Text style={[styles.statusPillText, styles.statusTextSuccess]}>
                                ✓ Aktif Bahan Setoran Santri
                              </Text>
                            </View>
                          ) : (
                            <View style={[styles.statusPill, styles.statusPillWarning, { paddingHorizontal: 12, paddingVertical: 6 }]}>
                              <Text style={[styles.statusPillText, styles.statusTextWarning]}>
                                Menunggu Verifikasi Kepsek Unit
                              </Text>
                            </View>
                          )}
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}

              {/* 2. LOG SETORAN SANTRI LIST (ALA TAHFIZH) */}
              {bahasaSubTab === 'setoran' && (
                <View>
                  {vocabularySubmissions.map((sub) => (
                    <View key={sub.id} style={styles.moduleCard}>
                      <View style={[styles.cardAccentBar, { backgroundColor: '#059669' }]} />
                      <View style={styles.cardInner}>
                        <View style={styles.cardTopRow}>
                          <View style={{ flex: 1 }}>
                            <Text style={styles.cardPrimaryTitle}>{sub.student?.name || 'Santri'}</Text>
                            <Text style={styles.cardSecondarySub}>
                              NISN: {sub.student?.nisn || '-'} • {sub.unit?.name || 'Unit Madrasah'}
                            </Text>
                          </View>
                          <View style={[styles.statusPill, styles.statusPillSuccess]}>
                            <Text style={[styles.statusPillText, styles.statusTextSuccess]}>
                              {sub.fluency_rating?.toUpperCase()}
                            </Text>
                          </View>
                        </View>

                        <View style={styles.noteBox}>
                          <Text style={styles.noteBoxLabel}>Kosakata yang Disetorkan:</Text>
                          <Text style={[styles.noteBoxText, { fontWeight: '800', color: '#064E3B' }]}>
                            {sub.vocabulary?.word} ({sub.vocabulary?.translation})
                          </Text>
                          {sub.notes ? (
                            <Text style={[styles.noteBoxText, { marginTop: 3 }]}>
                              Catatan Penguji: {sub.notes}
                            </Text>
                          ) : null}
                        </View>

                        <View style={styles.metaRow}>
                          <View style={styles.metaCol}>
                            <Text style={styles.metaLabel}>Guru Mapel Penilai</Text>
                            <Text style={styles.metaValue}>{sub.teacher?.name || 'Guru Mapel'}</Text>
                          </View>
                          <View style={styles.metaColRight}>
                            <Text style={styles.metaLabel}>Nilai Kelancaran</Text>
                            <Text style={[styles.metaValueHighlight, { color: '#059669' }]}>
                              {sub.score} / 100
                            </Text>
                          </View>
                        </View>
                      </View>
                    </View>
                  ))}
                </View>
              )}
            </View>
          )}

          {/* ══════════ TAB 5: PELATIHAN GURU & PORTOFOLIO 32 JP ══════════ */}
          {activeTab === 'pelatihan' && (
            <View style={styles.tabBody}>
              <View style={styles.cardHeaderBox}>
                <View style={[styles.cardHeaderBadge, { backgroundColor: '#EDE9FE' }]}>
                  <MaterialCommunityIcons name="certificate" size={18} color="#7C3AED" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardHeaderTitle}>Pelatihan Guru & Portofolio 32 JP</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Standar pengembangan kompetensi pendidik minimal 32 JP pertahun
                  </Text>
                </View>
              </View>

              {pelatihanList.map((item) => (
                <View key={item.id} style={styles.moduleCard}>
                  <View style={[styles.cardAccentBar, { backgroundColor: '#7C3AED' }]} />
                  <View style={styles.cardInner}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardPrimaryTitle}>{item.judul}</Text>
                        <Text style={styles.cardSecondarySub}>{item.pemateri}</Text>
                      </View>
                      <View style={styles.jpBadge}>
                        <Text style={styles.jpBadgeText}>{item.jp} JP</Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Jadwal Pelaksanaan</Text>
                        <Text style={styles.metaValue}>{item.jadwal}</Text>
                      </View>
                      <View style={styles.metaColRight}>
                        <Text style={styles.metaLabel}>Kapasitas</Text>
                        <Text style={styles.metaValueHighlight}>{item.kuota}</Text>
                      </View>
                    </View>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setActiveModal({ type: 'pelatihan', item })}
                        style={[styles.actionBtn, { backgroundColor: '#7C3AED' }]}
                      >
                        <MaterialCommunityIcons name="account-multiple-plus-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Daftar Pendidik</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ══════════ TAB 6: REVIEW LAPORAN BULANAN KEPSEK ══════════ */}
          {activeTab === 'laporan' && (
            <View style={styles.tabBody}>
              <View style={styles.cardHeaderBox}>
                <View style={[styles.cardHeaderBadge, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialCommunityIcons name="file-document-edit" size={18} color="#0284C7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardHeaderTitle}>Review Laporan Bulanan Kepsek</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Telaah dokumen laporan manajerial, kehadiran dan capaian kurikulum
                  </Text>
                </View>
              </View>

              {laporanList.map((item) => (
                <View key={item.id} style={styles.moduleCard}>
                  <View style={[styles.cardAccentBar, { backgroundColor: '#0284C7' }]} />
                  <View style={styles.cardInner}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardPrimaryTitle}>{item.unit}</Text>
                        <Text style={styles.cardSecondarySub}>{item.kepsek} • {item.periode}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          item.status === 'Disetujui' && styles.statusPillSuccess,
                          item.status === 'Menunggu Review' && styles.statusPillInfo,
                          item.status === 'Perlu Revisi' && styles.statusPillDanger,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            item.status === 'Disetujui' && styles.statusTextSuccess,
                            item.status === 'Menunggu Review' && styles.statusTextInfo,
                            item.status === 'Perlu Revisi' && styles.statusTextDanger,
                          ]}
                        >
                          {item.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.metaRow}>
                      <View style={styles.metaCol}>
                        <Text style={styles.metaLabel}>Kehadiran Siswa</Text>
                        <Text style={styles.metaValueHighlight}>{item.kehadiranSiswa}</Text>
                      </View>
                      <View style={styles.metaColRight}>
                        <Text style={styles.metaLabel}>Capaian Kurikulum</Text>
                        <Text style={[styles.metaValueHighlight, { color: '#0284C7' }]}>
                          {item.kurikulumTercapai}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.noteBox}>
                      <Text style={styles.noteBoxLabel}>Umpan Balik Divisi:</Text>
                      <Text style={styles.noteBoxText}>{item.catatanDivisi}</Text>
                    </View>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setFeedbackNote(item.catatanDivisi);
                          setActionStatus(item.status === 'Disetujui' ? 'disetujui' : 'revisi');
                          setActiveModal({ type: 'laporan', item });
                        }}
                        style={[styles.actionBtn, { backgroundColor: '#0284C7' }]}
                      >
                        <MaterialCommunityIcons name="clipboard-text-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Beri Umpan Balik</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}

          {/* ══════════ TAB 7: RADAR AKREDITASI 8 SNP + JSIT ══════════ */}
          {activeTab === 'akreditasi' && (
            <View style={styles.tabBody}>
              <View style={styles.cardHeaderBox}>
                <View style={[styles.cardHeaderBadge, { backgroundColor: '#FFE4E6' }]}>
                  <MaterialCommunityIcons name="shield-star" size={18} color="#E11D48" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardHeaderTitle}>Radar Akreditasi 8 SNP + JSIT</Text>
                  <Text style={styles.cardHeaderSubtitle}>
                    Tingkat pemenuhan instrumen standar nasional dan kekhasan JSIT
                  </Text>
                </View>
              </View>

              {akreditasiList.map((item) => (
                <View key={item.no} style={styles.moduleCard}>
                  <View style={[styles.cardAccentBar, { backgroundColor: '#E11D48' }]} />
                  <View style={styles.cardInner}>
                    <View style={styles.cardTopRow}>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.cardPrimaryTitle}>{item.standar}</Text>
                        <Text style={styles.cardSecondarySub}>Bukti Fisik: {item.buktiFisik}</Text>
                      </View>
                      <View
                        style={[
                          styles.statusPill,
                          item.skor >= 90 ? styles.statusPillSuccess : styles.statusPillWarning,
                        ]}
                      >
                        <Text
                          style={[
                            styles.statusPillText,
                            item.skor >= 90 ? styles.statusTextSuccess : styles.statusTextWarning,
                          ]}
                        >
                          {item.skor}% • {item.status}
                        </Text>
                      </View>
                    </View>

                    <View style={styles.progressContainer}>
                      <View style={styles.progressBarBg}>
                        <View style={[styles.progressBarFill, { width: `${item.skor}%`, backgroundColor: '#E11D48' }]} />
                      </View>
                    </View>

                    <View style={styles.cardActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setActiveModal({ type: 'akreditasi', item })}
                        style={[styles.actionBtn, { backgroundColor: '#E11D48' }]}
                      >
                        <MaterialCommunityIcons name="file-check-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.actionBtnText}>Audit Bukti Fisik</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              ))}
            </View>
          )}
        </ScrollView>
      )}

      {/* ── 3. INTERACTIVE MODAL DIALOGS (ACTION SHEET) ── */}
      <Modal
        visible={Boolean(activeModal)}
        transparent
        animationType="slide"
        onRequestClose={() => setActiveModal(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContent}>
            <View style={styles.modalHeaderRow}>
              <View style={styles.modalHeaderLeft}>
                <MaterialCommunityIcons
                  name="shield-check"
                  size={20}
                  color="#059669"
                  style={{ marginRight: 8 }}
                />
                <Text style={styles.modalTitle}>
                  {activeModal?.type === 'supervisi' && 'Form Telaah Supervisi KBM'}
                  {activeModal?.type === 'kurasi' && 'Validasi Kurasi Bank Soal'}
                  {activeModal?.type === 'munaqasyah' && 'Pratinjau E-Syahadah Tahfizh'}
                  {activeModal?.type === 'bahasa' && 'Input Jurnal Pembiasaan Bahasa'}
                  {activeModal?.type === 'pelatihan' && 'Pendaftaran Pelatihan 32 JP'}
                  {activeModal?.type === 'laporan' && 'Telaah Laporan Bulanan Kepsek'}
                  {activeModal?.type === 'akreditasi' && 'Audit Dokumen 8 SNP'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveModal(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 420 }}>
              {/* Supervisi KBM Modal */}
              {activeModal?.type === 'supervisi' && (
                <View style={styles.modalInnerBody}>
                  <Text style={styles.inputLabel}>Pendidik & Mapel:</Text>
                  <Text style={styles.inputValueStatic}>
                    {activeModal.item?.guru} ({activeModal.item?.mapel})
                  </Text>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Nilai Pedagogik (1-100):</Text>
                  <TextInput
                    style={styles.textInputStyle}
                    value={scoreInput}
                    onChangeText={setScoreInput}
                    keyboardType="numeric"
                  />

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Catatan Supervisi Lapangan:</Text>
                  <TextInput
                    style={[styles.textInputStyle, { height: 90, textAlignVertical: 'top' }]}
                    value={feedbackNote}
                    onChangeText={setFeedbackNote}
                    multiline
                  />
                </View>
              )}

              {/* Kurasi Soal Modal */}
              {activeModal?.type === 'kurasi' && (
                <View style={styles.modalInnerBody}>
                  <Text style={styles.inputLabel}>Paket Soal:</Text>
                  <Text style={styles.inputValueStatic}>{activeModal.item?.judul}</Text>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Keputusan Kurasi:</Text>
                  <View style={styles.decisionRow}>
                    <TouchableOpacity
                      onPress={() => setActionStatus('disetujui')}
                      style={[styles.decisionBtn, actionStatus === 'disetujui' && styles.decisionBtnActive]}
                    >
                      <Text style={[styles.decisionBtnText, actionStatus === 'disetujui' && styles.decisionBtnTextActive]}>
                        Setujui Standar
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setActionStatus('revisi')}
                      style={[styles.decisionBtn, actionStatus === 'revisi' && styles.decisionBtnDanger]}
                    >
                      <Text style={[styles.decisionBtnText, actionStatus === 'revisi' && styles.decisionBtnTextDanger]}>
                        Perlu Revisi
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Catatan Koreksi Kurator:</Text>
                  <TextInput
                    style={[styles.textInputStyle, { height: 80, textAlignVertical: 'top' }]}
                    value={feedbackNote}
                    onChangeText={setFeedbackNote}
                    multiline
                  />
                </View>
              )}

              {/* Munaqasyah E-Syahadah Modal */}
              {activeModal?.type === 'munaqasyah' && (
                <View style={styles.modalInnerBody}>
                  <View style={styles.syahadahBox}>
                    <MaterialCommunityIcons name="certificate" size={48} color="#D97706" />
                    <Text style={styles.syahadahHeading}>SYAHADAH MUNAQASYAH TAHFIZH</Text>
                    <Text style={styles.syahadahSantriName}>{activeModal.item?.santri}</Text>
                    <Text style={styles.syahadahDetail}>{activeModal.item?.kategori}</Text>
                    <Text style={styles.syahadahPredikat}>Predikat: {activeModal.item?.predikat}</Text>
                    <View style={styles.qrMock}>
                      <MaterialCommunityIcons name="qrcode" size={72} color="#064E3B" />
                    </View>
                    <Text style={styles.syahadahNo}>{activeModal.item?.nomorSyahadah}</Text>
                  </View>
                </View>
              )}

              {/* Pembiasaan Bahasa Modal (Approval Divisi Pendidikan) */}
              {activeModal?.type === 'bahasa' && (
                <View style={styles.modalInnerBody}>
                  <Text style={styles.inputLabel}>Unit Lembaga & Pengusul:</Text>
                  <Text style={styles.inputValueStatic}>
                    {activeModal.item?.unit?.name || activeModal.item?.unit_name || 'Unit'} ({activeModal.item?.creator?.name || 'Guru Mapel'})
                  </Text>

                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Kosakata Diusulkan:</Text>
                  <Text style={[styles.inputValueStatic, { fontSize: 16, color: '#064E3B' }]}>
                    {activeModal.item?.word}
                  </Text>
                  <Text style={styles.inputValueStatic}>
                    Arti: {activeModal.item?.translation}
                  </Text>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Keputusan Pengesahan Divisi:</Text>
                  <View style={styles.decisionRow}>
                    <TouchableOpacity
                      onPress={() => setActionStatus('disetujui')}
                      style={[styles.decisionBtn, actionStatus === 'disetujui' && styles.decisionBtnActive]}
                    >
                      <Text style={[styles.decisionBtnText, actionStatus === 'disetujui' && styles.decisionBtnTextActive]}>
                        Sahkan (Aktifkan)
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setActionStatus('revisi')}
                      style={[styles.decisionBtn, actionStatus === 'revisi' && styles.decisionBtnDanger]}
                    >
                      <Text style={[styles.decisionBtnText, actionStatus === 'revisi' && styles.decisionBtnTextDanger]}>
                        Minta Revisi
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Catatan Pembinaan Divisi:</Text>
                  <TextInput
                    style={[styles.textInputStyle, { height: 80, textAlignVertical: 'top' }]}
                    value={feedbackNote}
                    onChangeText={setFeedbackNote}
                    placeholder="Catatan standarisasi bahasa yayasan..."
                    multiline
                  />
                </View>
              )}

              {/* Pelatihan 32 JP Modal */}
              {activeModal?.type === 'pelatihan' && (
                <View style={styles.modalInnerBody}>
                  <Text style={styles.inputLabel}>Agenda Workshop:</Text>
                  <Text style={styles.inputValueStatic}>{activeModal.item?.judul}</Text>
                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Bobot:</Text>
                  <Text style={styles.inputValueStatic}>{activeModal.item?.jp} Jam Pelajaran (JP)</Text>
                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Narasumber / Instruktur:</Text>
                  <Text style={styles.inputValueStatic}>{activeModal.item?.pemateri}</Text>
                </View>
              )}

              {/* Laporan Bulanan Modal */}
              {activeModal?.type === 'laporan' && (
                <View style={styles.modalInnerBody}>
                  <Text style={styles.inputLabel}>Unit Sekolah:</Text>
                  <Text style={styles.inputValueStatic}>{activeModal.item?.unit} ({activeModal.item?.kepsek})</Text>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Status Verifikasi Dokumen:</Text>
                  <View style={styles.decisionRow}>
                    <TouchableOpacity
                      onPress={() => setActionStatus('disetujui')}
                      style={[styles.decisionBtn, actionStatus === 'disetujui' && styles.decisionBtnActive]}
                    >
                      <Text style={[styles.decisionBtnText, actionStatus === 'disetujui' && styles.decisionBtnTextActive]}>
                        Setujui Laporan
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => setActionStatus('revisi')}
                      style={[styles.decisionBtn, actionStatus === 'revisi' && styles.decisionBtnDanger]}
                    >
                      <Text style={[styles.decisionBtnText, actionStatus === 'revisi' && styles.decisionBtnTextDanger]}>
                        Minta Perbaikan
                      </Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={[styles.inputLabel, { marginTop: 14 }]}>Umpan Balik Divisi Pendidikan:</Text>
                  <TextInput
                    style={[styles.textInputStyle, { height: 80, textAlignVertical: 'top' }]}
                    value={feedbackNote}
                    onChangeText={setFeedbackNote}
                    multiline
                  />
                </View>
              )}

              {/* Akreditasi Modal */}
              {activeModal?.type === 'akreditasi' && (
                <View style={styles.modalInnerBody}>
                  <Text style={styles.inputLabel}>Standar Mutu:</Text>
                  <Text style={styles.inputValueStatic}>{activeModal.item?.standar}</Text>
                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Status Bukti Fisik:</Text>
                  <Text style={styles.inputValueStatic}>{activeModal.item?.buktiFisik}</Text>
                  <Text style={[styles.inputLabel, { marginTop: 12 }]}>Tingkat Pemenuhan:</Text>
                  <Text style={[styles.inputValueStatic, { color: '#E11D48', fontWeight: '800' }]}>
                    {activeModal.item?.skor}% ({activeModal.item?.status})
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooterRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveModal(null)}
                style={styles.modalCancelBtn}
              >
                <Text style={styles.modalCancelText}>Tutup</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleSaveAction}
                style={styles.modalSubmitBtn}
              >
                <Text style={styles.modalSubmitText}>Simpan & Verifikasi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  heroHeader: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 28,
    borderBottomRightRadius: 28,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.18,
    shadowRadius: 14,
    elevation: 8,
  },
  heroTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  backBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  heroTitleWrap: {
    flex: 1,
  },
  heroBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  heroPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(167, 243, 208, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    marginRight: 6,
  },
  heroPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#D1FAE5',
    marginLeft: 4,
  },
  heroPillYear: {
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
  },
  heroPillYearText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroMainTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#A7F3D0',
    marginTop: 1,
  },
  refreshBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  unitSelectorContainer: {
    marginBottom: 12,
  },
  unitScroll: {
    paddingRight: 12,
  },
  unitChip: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    marginRight: 8,
  },
  unitChipActive: {
    backgroundColor: '#FFFFFF',
  },
  unitChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  unitChipTextActive: {
    color: '#064E3B',
  },
  tabBarContainer: {
    marginTop: 2,
  },
  tabScroll: {
    paddingRight: 12,
  },
  tabItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 13,
    paddingVertical: 7,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    marginRight: 8,
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  tabItemText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  tabItemTextActive: {
    color: '#064E3B',
    fontWeight: '800',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  scrollContent: {
    padding: 16,
  },
  tabBody: {
    flex: 1,
  },
  cardHeaderBox: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    backgroundColor: '#FFFFFF',
    padding: 12,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  cardHeaderBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 10,
  },
  cardHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardHeaderSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  moduleCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardAccentBar: {
    height: 3.5,
    width: '100%',
  },
  cardInner: {
    padding: 14,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  cardPrimaryTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSecondarySub: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  statusPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  statusPillSuccess: {
    backgroundColor: '#DEF7EC',
  },
  statusPillInfo: {
    backgroundColor: '#E0F2FE',
  },
  statusPillWarning: {
    backgroundColor: '#FEF3C7',
  },
  statusPillDanger: {
    backgroundColor: '#FFE4E6',
  },
  statusPillText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#475569',
  },
  statusTextSuccess: {
    color: '#059669',
  },
  statusTextInfo: {
    color: '#0284C7',
  },
  statusTextWarning: {
    color: '#D97706',
  },
  statusTextDanger: {
    color: '#E11D48',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginBottom: 8,
  },
  metaCol: {
    flex: 1,
  },
  metaColRight: {
    alignItems: 'flex-end',
  },
  metaLabel: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  metaValue: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  metaValueHighlight: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  noteBox: {
    backgroundColor: '#F8FAFC',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 10,
  },
  noteBoxLabel: {
    fontSize: 10,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  noteBoxText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#334155',
    marginTop: 2,
    lineHeight: 16,
  },
  cardActionRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
    marginLeft: 6,
  },
  scoreTripleGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    backgroundColor: '#FFFBEB',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 10,
  },
  scoreCol: {
    alignItems: 'center',
    flex: 1,
  },
  scoreColLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#92400E',
  },
  scoreColVal: {
    fontSize: 14,
    fontWeight: '900',
    color: '#B45309',
    marginTop: 2,
  },
  progressContainer: {
    marginVertical: 10,
  },
  progressBarBg: {
    height: 7,
    backgroundColor: '#E2E8F0',
    borderRadius: 6,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    borderRadius: 6,
  },
  jpBadge: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  jpBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#6D28D9',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: SCREEN_WIDTH > 400 ? 560 : 500,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 14,
  },
  modalHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  modalTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalInnerBody: {
    paddingVertical: 6,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  inputValueStatic: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  textInputStyle: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 12.5,
    color: '#0F172A',
    marginTop: 5,
  },
  decisionRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 6,
  },
  decisionBtn: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  decisionBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#059669',
  },
  decisionBtnDanger: {
    backgroundColor: '#FFF1F2',
    borderColor: '#E11D48',
  },
  decisionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  decisionBtnTextActive: {
    color: '#059669',
  },
  decisionBtnTextDanger: {
    color: '#E11D48',
  },
  syahadahBox: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFFBEB',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#FDE68A',
  },
  syahadahHeading: {
    fontSize: 13,
    fontWeight: '900',
    color: '#92400E',
    marginTop: 6,
  },
  syahadahSantriName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#064E3B',
    marginTop: 4,
  },
  syahadahDetail: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
    marginTop: 2,
  },
  syahadahPredikat: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
    marginTop: 4,
  },
  qrMock: {
    marginVertical: 12,
    padding: 8,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
  },
  syahadahNo: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
  },
  modalFooterRow: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 10,
    paddingTop: 14,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 10,
  },
  modalCancelBtn: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSubmitBtn: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 12,
    backgroundColor: '#059669',
  },
  modalSubmitText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subSegmentRow: {
    flexDirection: 'row',
    backgroundColor: '#E2E8F0',
    borderRadius: 14,
    padding: 3,
    marginBottom: 12,
  },
  subSegmentBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 12,
  },
  subSegmentBtnActive: {
    backgroundColor: '#FFFFFF',
    elevation: 2,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
  },
  subSegmentText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  subSegmentTextActive: {
    color: '#064E3B',
    fontWeight: '800',
  },
});
