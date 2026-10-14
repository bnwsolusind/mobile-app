import React, { useState, useMemo } from 'react';
import {
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { mobileApiService } from '../services/mobileApiService';
import AppFeedbackModal, { FeedbackType } from '../components/AppFeedbackModal';
import {
  roleLabel,
  isTeacherRole,
  isParentRole,
  isStudentRole,
  isSuperAdminRole,
  isFoundationRole,
  isPrincipalRole,
  isTuRole,
} from '../utils/roles';
import { canAccessScreen, canAccessBilling } from '../utils/accessControl';

type CategoryKey = 'all' | 'kbm' | 'ujian' | 'keagamaan' | 'info' | 'akun';

interface ServiceItem {
  id: string;
  label: string;
  desc: string;
  tag: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  color: string;
  bg: string;
  route: string;
  category: 'kbm' | 'ujian' | 'keagamaan' | 'info' | 'akun';
  params?: Record<string, any>;
  allowedRoles?: ('teacher' | 'parent' | 'student' | 'admin' | 'tu' | 'staff')[];
}

interface CategoryConfig {
  key: 'kbm' | 'ujian' | 'keagamaan' | 'info' | 'akun';
  title: string;
  subtitle: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  primaryColor: string;
  accentBg: string;
  borderColor: string;
  gradientColors: [string, string];
}

const CATEGORY_CONFIGS: Record<string, CategoryConfig> = {
  kbm: {
    key: 'kbm',
    title: 'Pembelajaran & KBM',
    subtitle: 'Modul ajar, jadwal kelas, tugas LMS, dan input nilai santri',
    icon: 'school-outline',
    primaryColor: '#059669',
    accentBg: '#ECFDF5',
    borderColor: '#A7F3D0',
    gradientColors: ['#059669', '#10B981'],
  },
  ujian: {
    key: 'ujian',
    title: 'Asesmen & Ujian CBT',
    subtitle: 'Pelaksanaan ujian online, penyusunan bank soal, dan kisi-kisi',
    icon: 'laptop',
    primaryColor: '#2563EB',
    accentBg: '#EFF6FF',
    borderColor: '#BFDBFE',
    gradientColors: ['#2563EB', '#3B82F6'],
  },
  keagamaan: {
    key: 'keagamaan',
    title: 'Keagamaan & Absensi',
    subtitle: 'Presensi KBM, setoran tahfizh, mutaba’ah ibadah, Al-Qur’an & doa',
    icon: 'book-open-page-variant',
    primaryColor: '#D97706',
    accentBg: '#FFFBEB',
    borderColor: '#FDE68A',
    gradientColors: ['#D97706', '#F59E0B'],
  },
  info: {
    key: 'info',
    title: 'Komunikasi & Warta',
    subtitle: 'Buku penghubung wali murid, kalender tahun ajaran, dan warta sekolah',
    icon: 'bullhorn-outline',
    primaryColor: '#E11D48',
    accentBg: '#FFF1F2',
    borderColor: '#FECDD3',
    gradientColors: ['#E11D48', '#F43F5E'],
  },
  akun: {
    key: 'akun',
    title: 'Akun & Administrasi',
    subtitle: 'Profil pendidik, ubah data, ganti password, sesi dan data master',
    icon: 'shield-account-outline',
    primaryColor: '#7C3AED',
    accentBg: '#FAF5FF',
    borderColor: '#DDD6FE',
    gradientColors: ['#7C3AED', '#8B5CF6'],
  },
};

export default function MoreScreen({ navigation }: any) {
  const user = useAuthStore((s) => s.user);
  const roles = useAuthStore((s) => s.roles);
  const mobileConfig = useMobileConfigStore((s) => s.config);

  const clearSession = useAuthStore((s) => s.clearSession);

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<CategoryKey>('all');
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
    confirmText?: string;
    cancelText?: string;
    onConfirm?: () => void;
  } | null>(null);

  const handleLogout = () => {
    setFeedbackModal({
      visible: true,
      type: 'confirm',
      title: 'Keluar dari Aplikasi?',
      message: 'Sesi masuk Anda pada perangkat ini akan dihapus. Anda dapat masuk kembali kapan saja.',
      confirmText: 'Ya, Keluar',
      cancelText: 'Batal',
      onConfirm: async () => {
        setFeedbackModal(null);
        try {
          await mobileApiService.logout();
        } catch {}
        finally {
          clearSession();
        }
      },
    });
  };

  const isTeacher = isTeacherRole(roles);
  const isParent = isParentRole(roles);
  const isStudent = isStudentRole(roles);
  const isSuperAdmin = isSuperAdminRole(roles);
  const isLeader = isFoundationRole(roles) || isPrincipalRole(roles) || isSuperAdmin;
  const isTu = isTuRole(roles);

  const canData = canAccessScreen('data', user, mobileConfig).allowed;
  const canTeacher = canAccessScreen('teacher', user, mobileConfig).allowed;
  const canAttendance = canAccessScreen('attendance', user, mobileConfig).allowed;
  const canParent = canAccessScreen('parent', user, mobileConfig).allowed;
  const canStudent = canAccessScreen('student', user, mobileConfig).allowed;
  const canBilling = canAccessBilling(user, mobileConfig);

  // Master definition of all mobile system services
  const allServices: ServiceItem[] = useMemo(() => {
    const list: ServiceItem[] = [];

    // --- KBM & PEMBELAJARAN (Akses Guru, Pimpinan, dan TU) ---
    if (canTeacher || isTeacher || isLeader || isTu) {
      if (canTeacher || isTeacher || isLeader) {
        list.push({
          id: 'guru_workspace',
          label: 'Ruang Kerja Guru',
          desc: 'Ruang kerja terpadu, presensi cepat, dan jurnal pembelajaran',
          tag: 'Pendidik',
          icon: 'human-male-board',
          color: '#059669',
          bg: '#DCFCE7',
          route: 'Guru',
          category: 'kbm',
          allowedRoles: ['teacher', 'admin'],
        });
      }
      list.push({
        id: 'presensi_kbm',
        label: 'Presensi KBM & Kelas',
        desc: 'Presensi tatap muka jadwal KBM, checklist siswa, dan scanner kelas',
        tag: 'Presensi KBM',
        icon: 'calendar-check-outline',
        color: '#0891B2',
        bg: '#ECFEFF',
        route: 'QR Code',
        category: 'kbm',
        allowedRoles: ['teacher', 'tu', 'admin'],
      });
      list.push({
        id: 'jadwal_kbm',
        label: 'Jadwal Pelajaran KBM',
        desc: 'Jadwal tatap muka mingguan dan jam ajar kelas aktif',
        tag: 'Jadwal',
        icon: 'clock-time-four',
        color: '#7C3AED',
        bg: '#F5F3FF',
        route: 'Jadwal',
        category: 'kbm',
        allowedRoles: ['teacher', 'student', 'tu', 'admin'],
      });
      list.push({
        id: 'bahan_ajar',
        label: 'Bahan & Modul Ajar',
        desc: 'Modul ajar, silabus, dan bahan referensi kurikulum',
        tag: 'Modul',
        icon: 'book-multiple',
        color: '#0D9488',
        bg: '#E6FFFA',
        route: 'Materi',
        category: 'kbm',
        allowedRoles: ['teacher', 'student', 'tu', 'admin'],
      });
      list.push({
        id: 'tugas_lms',
        label: 'Tugas & LMS',
        desc: 'Distribusi tugas, pemantauan pengumpulan, dan penilaian PR',
        tag: 'Tugas',
        icon: 'clipboard-text',
        color: '#F59E0B',
        bg: '#FEF9EC',
        route: 'Tugas',
        category: 'kbm',
        allowedRoles: ['teacher', 'student', 'tu', 'admin'],
      });
      if (isTeacher || isLeader || isTu) {
        list.push({
          id: 'input_nilai',
          label: 'Input Nilai Siswa',
          desc: 'Entri nilai harian, PTS, PAS, dan rekap capaian rapor',
          tag: 'Penilaian',
          icon: 'chart-box',
          color: '#10B981',
          bg: '#E8FAF2',
          route: 'Nilai',
          category: 'kbm',
          allowedRoles: ['teacher', 'tu', 'admin'],
        });
      }
    }

    // --- UJIAN & ASESMEN (Akses Guru, Pimpinan, dan TU sesuai hak akses web) ---
    if (canTeacher || isTeacher || isLeader || isTu) {
      list.push({
        id: 'ujian_cbt',
        label: 'Ujian CBT Online',
        desc: 'Pelaksanaan ujian online berbasis komputer & timer otomatis',
        tag: 'CBT Online',
        icon: 'laptop',
        color: '#2563EB',
        bg: '#EFF6FF',
        route: 'CbtExams',
        category: 'ujian',
        allowedRoles: ['teacher', 'student', 'tu', 'admin'],
      });
      list.push({
        id: 'bank_soal',
        label: 'Bank Soal Terpadu',
        desc: 'Penyusunan butir soal pilihan ganda, esai, dan kunci jawaban',
        tag: 'Bank Soal',
        icon: 'database-outline',
        color: '#0D9488',
        bg: '#E6FFFA',
        route: 'BankSoal',
        category: 'ujian',
        allowedRoles: ['teacher', 'tu', 'admin'],
      });
      list.push({
        id: 'kisi_kisi',
        label: 'Kisi-kisi Asesmen',
        desc: 'Perumusan indikator soal dan kisi-kisi evaluasi belajar',
        tag: 'Kisi-kisi',
        icon: 'file-question',
        color: '#EF4444',
        bg: '#FEF2F2',
        route: 'KisiKisi',
        category: 'ujian',
        allowedRoles: ['teacher', 'tu', 'admin'],
      });
    }

    // --- KEAGAMAAN & ABSENSI ---
    if (canAttendance || isTeacher || isLeader || isStudent || isParent) {
      list.push({
        id: 'absensi_kbm',
        label: 'Presensi & Kehadiran',
        desc: 'Presensi mandiri harian staf, izin santri, dan rekapitulasi kehadiran',
        tag: 'Presensi',
        icon: 'clipboard-check-outline',
        color: '#059669',
        bg: '#DCFCE7',
        route: 'Absensi',
        category: 'keagamaan',
        allowedRoles: ['teacher', 'tu', 'admin'],
      });
      list.push({
        id: 'tahfizh_quran',
        label: 'Tahfizh Al-Qur’an',
        desc: 'Setoran hafalan, mutaba’ah tahfizh, dan riwayat juz santri',
        tag: 'Tahfizh',
        icon: 'book-marker',
        color: '#2563EB',
        bg: '#EFF6FF',
        route: 'Tahfizh',
        category: 'keagamaan',
        allowedRoles: ['teacher', 'student', 'parent'],
      });
      list.push({
        id: 'mutabaah_santri',
        label: 'Mutaba’ah Yaumiyyah',
        desc: 'Evaluasi sholat berjamaah, tilawah, dan ibadah harian santri',
        tag: 'Amalan',
        icon: 'clipboard-check',
        color: '#D97706',
        bg: '#FEF3C7',
        route: 'Mutabaah',
        category: 'keagamaan',
        allowedRoles: ['teacher', 'student', 'parent'],
      });
      list.push({
        id: 'al_quran_digital',
        label: 'Al-Qur’an Digital',
        desc: 'Membaca mushaf 30 juz lengkap dengan tajwid dan terjemahan',
        tag: 'Al-Qur’an',
        icon: 'book-open-variant',
        color: '#059669',
        bg: '#F0FDF4',
        route: 'Quran',
        category: 'keagamaan',
      });
      list.push({
        id: 'doa_dzikir',
        label: 'Doa & Dzikir Harian',
        desc: 'Kumpulan doa harian, dzikir pagi petang, dan hadits pilihan',
        tag: 'Doa',
        icon: 'hands-pray',
        color: '#F97316',
        bg: '#FFF7ED',
        route: 'DoaDzikir',
        category: 'keagamaan',
      });
    }

    // --- KOMUNIKASI & INFORMASI ---
    list.push({
      id: 'buku_hubung',
      label: 'Buku Penghubung',
      desc: 'Komunikasi dan pesan terarah langsung dengan wali murid santri',
      tag: 'Chat Ortu',
      icon: 'book-open-page-variant',
      color: '#8B5CF6',
      bg: '#F5F3FF',
      route: 'Chat',
      category: 'info',
      allowedRoles: ['teacher', 'parent'],
    });
    list.push({
      id: 'kalender_akademik',
      label: 'Kalender Akademik',
      desc: 'Agenda tahun ajaran, jadwal libur, dan jadwal kegiatan sekolah',
      tag: 'Agenda',
      icon: 'calendar-month',
      color: '#0284C7',
      bg: '#F0F9FF',
      route: 'Kalender',
      category: 'info',
    });
    list.push({
      id: 'informasi_warta',
      label: 'Warta & Pengumuman',
      desc: 'Berita resmi sekolah, pengumuman penting, dan surat edaran',
      tag: 'Pengumuman',
      icon: 'bullhorn',
      color: '#E11D48',
      bg: '#FFF1F2',
      route: 'Informasi',
      category: 'info',
    });

    // --- DATA MASTER (Khusus Admin / Pimpinan / Yayasan / Tata Usaha) ---
    if (canData || isTu) {
      list.push({
        id: 'data_master',
        label: 'Data Master Terpadu',
        desc: 'Kelola data guru, siswa, rombel, dan unit sekolah',
        tag: 'Pusat Data',
        icon: 'database-outline',
        color: '#059669',
        bg: '#E6F4EA',
        route: 'Data',
        category: 'akun',
        allowedRoles: ['admin', 'tu', 'staff'],
      });
      list.push({
        id: 'kelola_alumni',
        label: 'Kelola Alumni & Mutasi',
        desc: 'Penelusuran kelulusan siswa, mutasi masuk/keluar, dan tracer study',
        tag: 'Alumni',
        icon: 'account-switch',
        color: '#7C3AED',
        bg: '#F5F3FF',
        route: 'MutasiSiswa',
        params: { tab: 'alumni' },
        category: 'akun',
        allowedRoles: ['admin', 'tu', 'staff'],
      });
    }

    // --- PORTAL ORANG TUA (Hanya jika akun memang wali murid / bukan guru murni) ---
    if (canParent && isParent && !isTeacher && !isTu) {
      list.push({
        id: 'portal_ortu',
        label: 'Portal Orang Tua',
        desc: 'Layanan terpadu khusus kebutuhan wali murid santri',
        tag: 'Wali Murid',
        icon: 'account-group',
        color: '#059669',
        bg: '#ECFDF5',
        route: 'Orang Tua',
        category: 'akun',
        allowedRoles: ['parent'],
      });
    }

    // --- TAGIHAN & KEUANGAN (Orang Tua & TU / Bendahara) ---
    if (canBilling || (canParent && isParent && !isTeacher)) {
      list.push({
        id: 'tagihan_spp',
        label: 'Tagihan & SPP Santri',
        desc: 'Informasi tagihan pembayaran SPP dan riwayat status keuangan santri',
        tag: 'Keuangan',
        icon: 'cash-multiple',
        color: '#E11D48',
        bg: '#FFF1F4',
        route: 'Tagihan',
        category: 'akun',
        allowedRoles: ['parent', 'tu', 'staff', 'admin'],
      });
    }

    // --- PORTAL SISWA (Hanya jika akun memang siswa / bukan guru) ---
    if (canStudent && isStudent && !isTeacher && !isTu) {
      list.push({
        id: 'portal_siswa',
        label: 'Portal Siswa',
        desc: 'Akses belajar, materi KBM, tugas, dan nilai santri',
        tag: 'Santri',
        icon: 'school-outline',
        color: '#3B82F6',
        bg: '#EFF6FF',
        route: 'Siswa',
        category: 'akun',
        allowedRoles: ['student'],
      });
    }

    // --- PENGATURAN & AKUN ---
    list.push({
      id: 'profil_akun',
      label: 'Profil & Pengaturan Akun',
      desc: 'Biodata diri, ubah data kontak, ganti password & sesi perangkat',
      tag: 'Akun',
      icon: 'account-circle-outline',
      color: '#059669',
      bg: '#DCFCE7',
      route: 'Profil',
      category: 'akun',
    });
    list.push({
      id: 'keluar_akun',
      label: 'Keluar dari Akun (Logout)',
      desc: 'Hapus sesi login perangkat ini dan kembali ke halaman masuk',
      tag: 'Logout',
      icon: 'logout-variant',
      color: '#DC2626',
      bg: '#FEE2E2',
      route: 'LOGOUT_ACTION',
      category: 'akun',
    });

    return list;
  }, [
    canTeacher,
    isTeacher,
    isLeader,
    isTu,
    canAttendance,
    canData,
    canParent,
    isParent,
    canStudent,
    isStudent,
    canBilling,
  ]);

  // STRICT FILTERING: Sembunyikan menu yang bukan role akses pengguna saat login
  const filteredServices = useMemo(() => {
    return allServices.filter((item) => {
      // 1. Jika pengguna adalah Guru murni (bukan TU), sembunyikan menu khusus orang tua dan siswa
      if (isTeacher && !isTu) {
        if (item.allowedRoles?.includes('parent') && !item.allowedRoles?.includes('teacher')) {
          return false;
        }
        if (item.allowedRoles?.includes('student') && !item.allowedRoles?.includes('teacher')) {
          return false;
        }
        if (item.route === 'Orang Tua' || item.route === 'Siswa') {
          return false;
        }
        if (item.route === 'Tagihan' && !canBilling) {
          return false;
        }
      }

      // 2. Jika bukan admin/yayasan/TU, jangan tampilkan data master
      if (!isLeader && !canData && !isTu && item.route === 'Data') {
        return false;
      }

      // 3. Filter berdasarkan kategori terpilih
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // 4. Filter berdasarkan pencarian nama, deskripsi, atau tag
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesLabel = item.label.toLowerCase().includes(query);
        const matchesDesc = item.desc.toLowerCase().includes(query);
        const matchesTag = item.tag.toLowerCase().includes(query);
        return matchesLabel || matchesDesc || matchesTag;
      }

      return true;
    });
  }, [allServices, isTeacher, isLeader, isTu, canData, canBilling, selectedCategory, searchQuery]);

  // Kelompokkan menu ke dalam kategori
  const groupedCategories = useMemo(() => {
    const keys: ('kbm' | 'ujian' | 'keagamaan' | 'info' | 'akun')[] = ['kbm', 'ujian', 'keagamaan', 'info', 'akun'];
    return keys
      .map((key) => {
        const cfg = CATEGORY_CONFIGS[key];
        const items = filteredServices.filter((s) => s.category === key);
        return { ...cfg, items };
      })
      .filter((c) => c.items.length > 0);
  }, [filteredServices]);

  const handleNavigate = (service: ServiceItem) => {
    if (service.route === 'LOGOUT_ACTION') {
      handleLogout();
      return;
    }
    try {
      if (service.params) {
        navigation.navigate(service.route, service.params);
      } else {
        navigation.navigate(service.route);
      }
    } catch {
      navigation.navigate(service.route);
    }
  };

  const filterTabs: { id: CategoryKey; label: string; icon: keyof typeof MaterialCommunityIcons.glyphMap }[] = [
    { id: 'all', label: 'Semua Modul', icon: 'view-grid-outline' },
    { id: 'kbm', label: 'KBM & Ajar', icon: 'school-outline' },
    { id: 'ujian', label: 'Asesmen CBT', icon: 'laptop' },
    { id: 'keagamaan', label: 'Keagamaan', icon: 'book-open-page-variant' },
    { id: 'info', label: 'Warta & Chat', icon: 'bullhorn-outline' },
    { id: 'akun', label: 'Akun & Profil', icon: 'shield-account-outline' },
  ];

  return (
    <SafeAreaView style={styles.safeArea} edges={['top']}>
      <StatusBar barStyle="light-content" backgroundColor="#044E36" />
      <ScrollView style={styles.screen} contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>

        {/* FULL BLEED LUSH EMERALD HERO HEADER */}
        <View style={styles.heroContainer}>
          <LinearGradient
            colors={['#022C22', '#064E3B', '#047857', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.decorCircle1} />
          <View style={styles.decorCircle2} />
          <View style={styles.decorCircle3} />

          {/* Top Badges */}
          <View style={styles.roleBadgeRow}>
            <View style={styles.roleTagPill}>
              <MaterialCommunityIcons name="shield-check" size={13} color="#059669" style={{ marginRight: 5 }} />
              <Text style={styles.roleTagText}>{roleLabel(roles).toUpperCase()}</Text>
            </View>
            <View style={styles.totalPill}>
              <View style={styles.activeDotPulse} />
              <Text style={styles.totalPillText}>{filteredServices.length} Modul Tersedia</Text>
            </View>
          </View>

          <Text style={styles.heroTitle}>Layanan Lainnya</Text>
          <Text style={styles.heroSubtitle}>
            {isTeacher
              ? 'Pusat navigasi modul KBM, asesmen, tahfizh, dan administrasi resmi pendidik.'
              : 'Daftar modul operasional terpadu yang dapat diakses sesuai peran akun Anda.'}
          </Text>

          {/* KPI METRICS ROW */}
          <View style={styles.kpiRow}>
            <View style={styles.kpiItem}>
              <Text style={styles.kpiValue}>{groupedCategories.length}</Text>
              <Text style={styles.kpiLabel}>Kategori</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiItem}>
              <Text style={styles.kpiValue}>{filteredServices.length}</Text>
              <Text style={styles.kpiLabel}>Menu Aktif</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiItem}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <MaterialCommunityIcons name="check-decagram" size={14} color="#34D399" />
                <Text style={styles.kpiValue}>Resmi</Text>
              </View>
              <Text style={styles.kpiLabel}>Akses Guru</Text>
            </View>
          </View>

          {/* SEARCH INPUT */}
          <View style={styles.searchBox}>
            <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari modul KBM, ujian, tahfizh, jadwal..."
              placeholderTextColor="#94A3B8"
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={() => setSearchQuery('')}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                style={styles.searchClearBtn}
              >
                <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* BODY CONTAINER */}
        <View style={styles.bodyContainer}>

          {/* INTERACTIVE CATEGORY FILTER CHIPS */}
          <View style={styles.filterBarContainer}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
              {filterTabs.map((tab) => {
                const isSelected = selectedCategory === tab.id;
                return (
                  <TouchableOpacity
                    key={tab.id}
                    activeOpacity={0.8}
                    onPress={() => setSelectedCategory(tab.id)}
                    style={[styles.filterChip, isSelected && styles.filterChipActive]}
                  >
                    <MaterialCommunityIcons
                      name={tab.icon}
                      size={14}
                      color={isSelected ? '#FFFFFF' : '#059669'}
                      style={{ marginRight: 5 }}
                    />
                    <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                      {tab.label}
                    </Text>
                    {isSelected && (
                      <View style={styles.filterCheckDot}>
                        <MaterialCommunityIcons name="check" size={9} color="#059669" />
                      </View>
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* CATEGORIZED SECTIONS */}
          {groupedCategories.map((cat) => (
            <View key={cat.key} style={[styles.categoryCardWrapper, { borderColor: cat.borderColor }]}>
              {/* Category Top Banner */}
              <View style={[styles.categoryHeaderRow, { backgroundColor: cat.accentBg }]}>
                <View style={[styles.categoryIconSquare, { backgroundColor: cat.primaryColor }]}>
                  <MaterialCommunityIcons name={cat.icon} size={18} color="#FFFFFF" />
                </View>

                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.categoryHeaderTitle, { color: cat.primaryColor }]}>{cat.title}</Text>
                    <View style={[styles.categoryPillCount, { backgroundColor: '#FFFFFF', borderColor: cat.borderColor }]}>
                      <Text style={[styles.categoryPillCountText, { color: cat.primaryColor }]}>{cat.items.length}</Text>
                    </View>
                  </View>
                  <Text style={styles.categoryHeaderDesc} numberOfLines={1}>{cat.subtitle}</Text>
                </View>
              </View>

              {/* Items List */}
              <View style={styles.itemsListContainer}>
                {cat.items.map((item, idx) => {
                  const isLast = idx === cat.items.length - 1;
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.78}
                      style={[styles.serviceRowItem, isLast && styles.serviceRowItemLast]}
                      onPress={() => handleNavigate(item)}
                    >
                      {/* Squircle 3D Icon Badge */}
                      <View style={[styles.iconSquircle, { backgroundColor: item.bg }]}>
                        <MaterialCommunityIcons name={item.icon} size={22} color={item.color} />
                      </View>

                      {/* Text Description */}
                      <View style={styles.textCol}>
                        <View style={styles.titleRow}>
                          <Text style={styles.serviceTitle} numberOfLines={1}>
                            {item.label}
                          </Text>
                          <View style={[styles.tagPill, { backgroundColor: item.bg }]}>
                            <Text style={[styles.tagPillText, { color: item.color }]}>{item.tag}</Text>
                          </View>
                        </View>
                        <Text style={styles.serviceDesc} numberOfLines={2}>
                          {item.desc}
                        </Text>
                      </View>

                      {/* Squircle Arrow Chevron */}
                      <View style={[styles.arrowSquircle, { borderColor: cat.borderColor }]}>
                        <MaterialCommunityIcons name="chevron-right" size={18} color={cat.primaryColor} />
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            </View>
          ))}

          {/* EMPTY STATE */}
          {filteredServices.length === 0 && (
            <View style={styles.emptyStateWrap}>
              <View style={styles.emptyStateIconCircle}>
                <MaterialCommunityIcons name="text-search" size={38} color="#94A3B8" />
              </View>
              <Text style={styles.emptyStateTitle}>Layanan Tidak Ditemukan</Text>
              <Text style={styles.emptyStateDesc}>
                Tidak ada modul yang cocok dengan kata kunci &quot;{searchQuery}&quot; atau filter kategori yang dipilih.
              </Text>
              <TouchableOpacity
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
                style={styles.emptyResetBtn}
              >
                <MaterialCommunityIcons name="refresh" size={16} color="#059669" />
                <Text style={styles.emptyResetBtnText}>Reset Filter & Pencarian</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* ALWAYS VISIBLE LOGOUT CARD BUTTON */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={handleLogout}
            style={styles.moreLogoutBtn}
          >
            <View style={styles.moreLogoutIconSquare}>
              <MaterialCommunityIcons name="logout-variant" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.moreLogoutTitle}>Keluar dari Akun (Logout)</Text>
              <Text style={styles.moreLogoutSub}>Akhiri sesi login perangkat ini secara aman</Text>
            </View>
            <View style={styles.moreLogoutArrowSquare}>
              <MaterialCommunityIcons name="chevron-right" size={18} color="#DC2626" />
            </View>
          </TouchableOpacity>

          {/* FOOTER NOTE */}
          <View style={styles.footerWrap}>
            <View style={styles.footerShieldIcon}>
              <MaterialCommunityIcons name="shield-check-outline" size={16} color="#059669" />
            </View>
            <Text style={styles.footerNote}>
              Sistem Manajemen Sekolah Terpadu • SIMSIT v2.6.4 Modern
            </Text>
          </View>
        </View>

      </ScrollView>

      {/* Confirmation Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'confirm'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          confirmText={feedbackModal.confirmText}
          cancelText={feedbackModal.cancelText}
          onConfirm={feedbackModal.onConfirm}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#044E36',
  },
  screen: {
    flex: 1,
    backgroundColor: '#044E36',
  },
  content: {
    paddingBottom: 110,
  },

  // HERO FULL CONTAINER
  heroContainer: {
    position: 'relative',
    overflow: 'hidden',
    paddingTop: 22,
    paddingBottom: 26,
    paddingHorizontal: 20,
    borderBottomLeftRadius: 36,
    borderBottomRightRadius: 36,
    shadowColor: '#064E3B',
    shadowOpacity: 0.38,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 9,
  },
  decorCircle1: {
    position: 'absolute',
    top: -60,
    right: -50,
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -40,
    left: -40,
    width: 160,
    height: 160,
    borderRadius: 80,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  decorCircle3: {
    position: 'absolute',
    top: 30,
    left: -20,
    width: 90,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255,255,255,0.04)',
  },
  roleBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 8,
  },
  roleTagPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 4,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
  },
  roleTagText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: 0.3,
  },
  totalPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.18)',
    borderRadius: 16,
    paddingHorizontal: 11,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    gap: 6,
  },
  activeDotPulse: {
    width: 7,
    height: 7,
    borderRadius: 3.5,
    backgroundColor: '#34D399',
  },
  totalPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroTitle: {
    fontSize: 23,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.4,
    marginBottom: 4,
  },
  heroSubtitle: {
    fontSize: 12,
    color: '#D1FAE5',
    lineHeight: 18,
    fontWeight: '500',
    marginBottom: 16,
  },

  // KPI STATS ROW
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(2, 44, 34, 0.52)',
    borderRadius: 18,
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    marginBottom: 14,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  kpiLabel: {
    fontSize: 9.5,
    color: '#A7F3D0',
    fontWeight: '700',
    marginTop: 2,
  },
  kpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255,255,255,0.2)',
    marginHorizontal: 4,
  },

  // SEARCH BOX
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  searchClearBtn: {
    padding: 2,
  },

  // BODY CONTAINER
  bodyContainer: {
    backgroundColor: '#F0FDF4',
    paddingTop: 16,
    paddingHorizontal: 16,
    minHeight: 500,
  },

  // FILTER BAR
  filterBarContainer: {
    marginBottom: 16,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderWidth: 1.5,
    borderColor: '#D1FAE5',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    elevation: 3,
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  filterCheckDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 4,
  },

  // CATEGORY CARDS
  categoryCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    borderWidth: 1.5,
    marginBottom: 16,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOpacity: 0.08,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 11,
    gap: 10,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  categoryIconSquare: {
    width: 32,
    height: 32,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryHeaderTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  categoryPillCount: {
    paddingHorizontal: 7,
    paddingVertical: 1,
    borderRadius: 10,
    borderWidth: 1,
  },
  categoryPillCountText: {
    fontSize: 10,
    fontWeight: '800',
  },
  categoryHeaderDesc: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },

  // ITEMS LIST
  itemsListContainer: {
    paddingHorizontal: 14,
    paddingVertical: 4,
  },
  serviceRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    gap: 12,
  },
  serviceRowItemLast: {
    borderBottomWidth: 0,
  },
  iconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 15,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 1,
  },
  textCol: {
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  serviceTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
    flexShrink: 1,
  },
  tagPill: {
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  tagPillText: {
    fontSize: 9,
    fontWeight: '800',
  },
  serviceDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    fontWeight: '500',
  },
  arrowSquircle: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // EMPTY STATE
  emptyStateWrap: {
    alignItems: 'center',
    paddingVertical: 36,
    gap: 8,
  },
  emptyStateIconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyStateTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  emptyStateDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 18,
  },
  emptyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 6,
    marginTop: 6,
  },
  emptyResetBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },

  // LOGOUT BUTTON CARD
  moreLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    paddingVertical: 13,
    paddingHorizontal: 14,
    gap: 12,
    marginBottom: 16,
    shadowColor: '#DC2626',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  moreLogoutIconSquare: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLogoutTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#E11D48',
    letterSpacing: -0.2,
  },
  moreLogoutSub: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1.5,
  },
  moreLogoutArrowSquare: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#FFF1F2',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },

  // FOOTER
  footerWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
    marginBottom: 24,
  },
  footerShieldIcon: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
