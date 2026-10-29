import React, { useState, useMemo } from 'react';
import {
  Image,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { navigationHistory } from '../stores/navigationHistoryStore';
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
  isDivisiRole,
  isTuRole,
} from '../utils/roles';
import { canAccessScreen, canAccessBilling } from '../utils/accessControl';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

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
  allowedRoles?: ('teacher' | 'parent' | 'student' | 'admin' | 'tu' | 'staff' | 'principal' | 'divisi')[];
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
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);

  const user = useAuthStore((s) => s.user);
  const roles = useAuthStore((s) => s.roles);
  const mobileConfig = useMobileConfigStore((s) => s.config);
  const clearSession = useAuthStore((s) => s.clearSession);

  const unreadNotificationCount = useNotificationBadgeStore((s) => s.unreadNotificationCount);

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

  const handleBack = () => {
    const handled = navigationHistory.goBackDynamic(navigation);
    if (!handled) {
      if (typeof navigation?.goBack === 'function' && navigation.canGoBack()) {
        navigation.goBack();
        return;
      }
      if (typeof navigation?.navigate === 'function') {
        navigation.navigate('Beranda');
      }
    }
  };

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
  const isPrincipal = isPrincipalRole(roles);
  const isDivisi = isDivisiRole(roles);
  const isLeader = isFoundationRole(roles) || isPrincipal || isSuperAdmin || isDivisi;
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
      if ((canTeacher || isTeacher) && !isPrincipal) {
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
      if (isTeacher || isTu) {
        list.push({
          id: 'presensi_kbm',
          label: 'Presensi KBM & Kelas',
          desc: 'Presensi tatap muka jadwal KBM, checklist siswa, dan scanner kelas',
          tag: 'Presensi KBM',
          icon: 'calendar-check-outline',
          color: '#059669',
          bg: '#ECFDF5',
          route: 'QR Code',
          category: 'kbm',
          allowedRoles: ['teacher', 'tu', 'admin'],
        });
      }
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
        label: (isPrincipal || isDivisi) ? 'Supervisi Bahan & Modul Ajar' : 'Bahan & Modul Ajar',
        desc: (isPrincipal || isDivisi) ? 'Tinjau, evaluasi, dan validasi modul ajar guru' : 'Modul ajar, silabus, dan bahan referensi kurikulum',
        tag: (isPrincipal || isDivisi) ? 'Supervisi' : 'Modul',
        icon: 'book-multiple',
        color: '#0D9488',
        bg: '#E6FFFA',
        route: 'Materi',
        category: 'kbm',
        allowedRoles: ['teacher', 'student', 'tu', 'admin'],
      });
      list.push({
        id: 'tugas_lms',
        label: (isPrincipal || isDivisi) ? 'Monitoring Tugas Siswa' : 'Tugas & LMS',
        desc: (isPrincipal || isDivisi) ? 'Pantau distribusi dan pengumpulan tugas belajar santri' : 'Distribusi tugas, pemantauan pengumpulan, dan penilaian PR',
        tag: (isPrincipal || isDivisi) ? 'Monitoring' : 'Tugas',
        icon: 'clipboard-text',
        color: '#F59E0B',
        bg: '#FEF9EC',
        route: 'Tugas',
        category: 'kbm',
        allowedRoles: ['teacher', 'student', 'tu', 'admin'],
      });
      if (isTeacher || isTu) {
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
      if (isPrincipal || isDivisi || isFoundationRole(roles)) {
        list.push({
          id: 'nilai_rapor_evaluasi',
          label: 'Evaluasi & Rapor Siswa',
          desc: 'Tinjau capaian nilai santri, pengesahan dan catatan rapor unit',
          tag: 'Rapor',
          icon: 'card-account-details-star-outline',
          color: '#10B981',
          bg: '#E8FAF2',
          route: 'Nilai',
          category: 'kbm',
        });
      }
    }

    // --- UJIAN & ASESMEN (Akses Guru, Tim Kurikulum, Kepala Sekolah & Divisi Pendidikan) ---
    if (canTeacher || isTeacher || isTu || isPrincipal || isDivisi) {
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
        allowedRoles: ['teacher', 'student', 'tu', 'admin', 'principal', 'divisi'],
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
        allowedRoles: ['teacher', 'tu', 'admin', 'principal', 'divisi'],
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
        allowedRoles: ['teacher', 'tu', 'admin', 'principal', 'divisi'],
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
    }

    // Mutaba'ah Yaumiyyah
    list.push({
      id: 'mutabaah_ibadah',
      label: 'Mutaba’ah Yaumiyyah',
      desc: 'Pemantauan ibadah harian santri, sholat, dan amalan yaumiyyah',
      tag: 'Ibadah',
      icon: 'checkbox-marked-circle-outline',
      color: '#059669',
      bg: '#DCFCE7',
      route: 'Mutabaah',
      category: 'keagamaan',
    });

    // Tahfizh Al-Qur'an (Khusus Guru Pengampu, Musyrif, Pimpinan, Wali Santri, dan Santri)
    if (isTeacher || isLeader || isParent || isStudent || canTeacher) {
      list.push({
        id: 'tahfizh_quran',
        label: 'Setoran Tahfizh Qur’an',
        desc: 'Pencatatan ziyadah, muraja’ah hafalan santri, serta capaian juz',
        tag: 'Tahfizh',
        icon: 'book-open-page-variant',
        color: '#0D9488',
        bg: '#E6FFFA',
        route: 'Tahfizh',
        category: 'keagamaan',
        allowedRoles: ['teacher', 'parent', 'student', 'admin'],
      });
    }

    // Mushaf Al-Qur'an Digital
    list.push({
      id: 'mushaf_quran',
      label: 'Al-Qur’an Al-Karim',
      desc: 'Mushaf digital 30 juz lengkap dengan terjemahan dan audio',
      tag: 'Al-Qur’an',
      icon: 'book-open-variant',
      color: '#059669',
      bg: '#ECFDF5',
      route: 'Quran',
      category: 'keagamaan',
    });

    // Kumpulan Doa & Dzikir
    list.push({
      id: 'doa_dzikir',
      label: 'Doa & Dzikir Harian',
      desc: 'Dzikir pagi petang, doa harian, dan tuntunan ibadah sunnah',
      tag: 'Doa',
      icon: 'hands-pray',
      color: '#D97706',
      bg: '#FEF3C7',
      route: 'DoaDzikir',
      category: 'keagamaan',
    });

    // --- KOMUNIKASI & WARTA SEKOLAH ---
    list.push({
      id: 'informasi_sekolah',
      label: 'Warta & Pengumuman',
      desc: 'Pengumuman resmi yayasan, artikel kegiatan, dan berita sekolah',
      tag: 'Warta',
      icon: 'bullhorn-outline',
      color: '#E11D48',
      bg: '#FFF1F2',
      route: 'Informasi',
      category: 'info',
    });

    list.push({
      id: 'kalender_akademik',
      label: 'Kalender Pendidikan',
      desc: 'Agenda akademik tahunan, libur sekolah, dan jadwal ujian terpadu',
      tag: 'Agenda',
      icon: 'calendar-month-outline',
      color: '#2563EB',
      bg: '#EFF6FF',
      route: 'Kalender',
      category: 'info',
    });

    // Pusat Bantuan & FAQ
    list.push({
      id: 'pusat_bantuan_faq',
      label: 'Pusat Bantuan & Panduan FAQ',
      desc: 'Pertanyaan umum, solusi kendala akun, panduan aplikasi & kontak admin',
      tag: 'Panduan FAQ',
      icon: 'frequently-asked-questions',
      color: '#059669',
      bg: '#DCFCE7',
      route: 'Bantuan',
      category: 'info',
    });

    // Data Master Terpadu (Akses Pimpinan, TU, Admin)
    if (canData || isLeader || isTu) {
      list.push({
        id: 'data_master',
        label: 'Data Master Pendidikan',
        desc: 'Database rombel, data santri, identitas pegawai, dan statistik sekolah',
        tag: 'Master Data',
        icon: 'database-cog-outline',
        color: '#7C3AED',
        bg: '#F5F3FF',
        route: 'Data',
        category: 'info',
        allowedRoles: ['admin', 'tu'],
      });
    }

    // Portal Orang Tua Wali
    if (canParent && isParent) {
      list.push({
        id: 'portal_wali',
        label: 'Portal Orang Tua / Wali',
        desc: 'Akses pemantauan ananda, laporan terpadu, dan komunikasi madrasah',
        tag: 'Wali Santri',
        icon: 'account-child-circle',
        color: '#059669',
        bg: '#DCFCE7',
        route: 'Orang Tua',
        category: 'akun',
        allowedRoles: ['parent'],
      });
    }

    // Tagihan & Keuangan (Orang Tua & TU / Bendahara)
    if (canBilling || (canParent && isParent && !isTeacher)) {
      list.push({
        id: 'tagihan_spp',
        label: 'Tagihan & SPP Santri',
        desc: 'Informasi tagihan pembayaran SPP dan riwayat status keuangan santri',
        tag: 'Keuangan',
        icon: 'cash-multiple',
        color: '#059669',
        bg: '#ECFDF5',
        route: 'Tagihan',
        category: 'akun',
        allowedRoles: ['parent', 'tu', 'staff', 'admin'],
      });
    }

    // Portal Siswa (Hanya jika akun siswa murni)
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

    // Profil & Pengaturan Akun
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

    // Keluar Akun
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
      // 1. Jika guru murni (bukan TU), sembunyikan menu khusus orang tua dan siswa
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

      // 2. Jika siswa murni: Hapus menu yang sudah ada di menu utama siswa agar tidak redundan
      if (isStudent && !isTeacher && !isParent && !isTu) {
        const studentPrimaryMenuIds = [
          'portal_siswa',
          'jadwal_kbm',
          'bahan_ajar',
          'tugas_lms',
          'presensi_kbm',
          'guru_workspace',
          'input_nilai',
          'bank_soal',
          'kisi_kisi',
          'absensi_kbm',
        ];
        if (studentPrimaryMenuIds.includes(item.id)) {
          return false;
        }
        if (item.route === 'Orang Tua' || item.route === 'Siswa' || item.route === 'Tagihan' || item.route === 'Data') {
          return false;
        }
      }

      // 3. Jika bukan admin/yayasan/TU, jangan tampilkan data master
      if (!isLeader && !canData && !isTu && item.route === 'Data') {
        return false;
      }

      // 4. Filter berdasarkan kategori terpilih
      if (selectedCategory !== 'all' && item.category !== selectedCategory) {
        return false;
      }

      // 5. Filter berdasarkan pencarian nama, deskripsi, atau tag
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchesLabel = item.label.toLowerCase().includes(query);
        const matchesDesc = item.desc.toLowerCase().includes(query);
        const matchesTag = item.tag.toLowerCase().includes(query);
        return matchesLabel || matchesDesc || matchesTag;
      }

      return true;
    });
  }, [allServices, isTeacher, isParent, isStudent, isLeader, isTu, canData, canBilling, selectedCategory, searchQuery]);

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
      const activeChildId = useActiveChildStore.getState().activeChildId;
      const isGeneral =
        service.route === 'Quran' ||
        service.route === 'DoaDzikir' ||
        service.route === 'Profil' ||
        service.route === 'Informasi' ||
        service.route === 'Kalender' ||
        service.route === 'Bantuan' ||
        service.route === 'Data';

      let finalParams = service.params ? { ...service.params } : undefined;
      if (isParent && activeChildId && !isGeneral) {
        finalParams = {
          ...finalParams,
          child_id: String(activeChildId),
          student_id: String(activeChildId),
        };
      } else if (isStudent && !isGeneral) {
        const studentId = (user as any)?.student?.id || (user as any)?.student_id || user?.id;
        if (studentId) {
          finalParams = {
            ...finalParams,
            child_id: String(studentId),
            student_id: String(studentId),
          };
        }
      }

      if (finalParams) {
        navigation.navigate(service.route, finalParams);
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
    <View style={styles.rootContainer}>
      <StatusBar barStyle="dark-content" backgroundColor="transparent" translucent />

      {/* ── BACKGROUND ILUSTRASI SEKOLAH IDENTIK HALAMAN MUTABA’AH ── */}
      <View style={styles.topFoliageWrapper} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN MUTABA’AH ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleBack}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#004D32" />
        </TouchableOpacity>

        <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
          Layanan & Modul Lainnya
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── BODY SCROLL CONTAINER ── */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        {/* 1. HERO GROUP CARD IDENTIK TAHFIZH GROUP CARD MUTABA'AH */}
        <View style={styles.heroSectionWrap}>
          <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald]}>
            {/* Header Box di dalam Group Card */}
            <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowEmerald]}>
              <View style={styles.tahfizhGroupCardHeaderLeft}>
                <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxEmerald]}>
                  <MaterialCommunityIcons name="apps-box" size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#064E3B' }]}>
                    Pusat Layanan & Modul Terpadu
                  </Text>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#059669' }]}>
                    Sistem Manajemen Sekolah Terpadu
                  </Text>
                </View>
              </View>

              <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeEmerald]}>
                <View style={styles.activeDotPulse} />
                <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#047857' }]}>
                  {roleLabel(roles).toUpperCase()}
                </Text>
              </View>
            </View>

            {/* Inner Content: Subtitle, KPI Stats, dan Search Box */}
            <View style={styles.heroCardBody}>
              <Text style={styles.heroCardSubtitle}>
                {isTeacher
                  ? 'Pusat navigasi modul KBM, asesmen CBT, setoran tahfizh, dan administrasi resmi pendidik.'
                  : 'Daftar modul operasional terpadu yang dapat diakses langsung sesuai dengan peran akun Anda.'}
              </Text>

              {/* KPI STATS ROW 3 KOLOM */}
              <View style={styles.kpiRow}>
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>{groupedCategories.length}</Text>
                  <Text style={styles.kpiLabel}>Kategori</Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiItem}>
                  <Text style={styles.kpiValue}>{filteredServices.length}</Text>
                  <Text style={styles.kpiLabel}>Modul Aktif</Text>
                </View>
                <View style={styles.kpiDivider} />
                <View style={styles.kpiItem}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                    <MaterialCommunityIcons name="check-decagram" size={13} color="#059669" />
                    <Text style={styles.kpiValue}>Resmi</Text>
                  </View>
                  <Text style={styles.kpiLabel}>Akses Aktif</Text>
                </View>
              </View>

              {/* SEARCH INPUT */}
              <View style={styles.searchBox}>
                <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cari modul KBM, ujian, tahfizh, jadwal, FAQ..."
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
          </View>
        </View>

        {/* 2. CATEGORY FILTER CHIPS */}
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

        {/* 3. CATEGORIZED SERVICE CARDS */}
        {groupedCategories.map((cat) => (
          <View key={cat.key} style={[styles.categoryCardWrapper, { borderColor: cat.borderColor }]}>
            {/* Category Top Banner */}
            <View style={[styles.categoryHeaderRow, { backgroundColor: cat.accentBg }]}>
              <View style={[styles.categoryIconSquare, { backgroundColor: cat.primaryColor }]}>
                <MaterialCommunityIcons name={cat.icon} size={17} color="#FFFFFF" />
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

        {/* 4. EMPTY STATE */}
        {filteredServices.length === 0 && (
          <View style={styles.emptyStateWrap}>
            <View style={styles.emptyStateIconCircle}>
              <MaterialCommunityIcons name="text-search" size={36} color="#94A3B8" />
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

        {/* 5. ALWAYS VISIBLE LOGOUT CARD BUTTON */}
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

        {/* 6. FOOTER NOTE */}
        <View style={styles.footerWrap}>
          <View style={styles.footerShieldIcon}>
            <MaterialCommunityIcons name="shield-check-outline" size={16} color="#059669" />
          </View>
          <Text style={styles.footerNote}>
            Sistem Manajemen Sekolah Terpadu • SIMSIT v2.6.4 Modern
          </Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.88,
  },

  // CLEAN TOP HEADER IDENTIK HALAMAN MUTABA’AH
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  cleanHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#004D32',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  cleanHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 16.5,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.3,
    marginHorizontal: 8,
  },
  heroBellDot: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },

  scrollContent: {
    paddingBottom: 110,
    paddingTop: 4,
  },

  // 1. HERO GROUP CARD IDENTIK TAHFIZH GROUP CARD
  heroSectionWrap: {
    paddingHorizontal: 16,
    marginBottom: 14,
  },
  tahfizhGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    overflow: 'hidden',
  },
  tahfizhGroupCardEmerald: {
    borderColor: '#A7F3D0',
  },
  tahfizhGroupCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#D1FAE5',
  },
  tahfizhGroupCardHeaderRowEmerald: {
    backgroundColor: '#F0FDF4',
  },
  tahfizhGroupCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
  },
  tahfizhGroupHeaderIconBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tahfizhGroupHeaderIconBoxEmerald: {
    backgroundColor: '#059669',
  },
  tahfizhGroupCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  tahfizhGroupCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    marginTop: 1,
  },
  tahfizhGroupActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 12,
    gap: 5,
  },
  tahfizhGroupActionBadgeEmerald: {
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
  },
  tahfizhGroupActionBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  activeDotPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },

  heroCardBody: {
    padding: 14,
  },
  heroCardSubtitle: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 17,
    fontWeight: '500',
    marginBottom: 12,
  },

  // KPI STATS ROW
  kpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 12,
  },
  kpiItem: {
    flex: 1,
    alignItems: 'center',
  },
  kpiValue: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  kpiLabel: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  kpiDivider: {
    width: 1,
    height: 22,
    backgroundColor: '#A7F3D0',
    marginHorizontal: 4,
  },

  // SEARCH BOX
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0F172A',
    padding: 0,
  },
  searchClearBtn: {
    padding: 2,
  },

  // FILTER BAR
  filterBarContainer: {
    marginBottom: 14,
  },
  filterScroll: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 2,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
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
    fontSize: 11,
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
    borderRadius: 22,
    marginHorizontal: 16,
    marginBottom: 14,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOpacity: 0.08,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  categoryHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    paddingVertical: 10,
    gap: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.06)',
  },
  categoryIconSquare: {
    width: 30,
    height: 30,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 2,
  },
  categoryHeaderTitle: {
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  categoryPillCount: {
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
    borderWidth: 1,
  },
  categoryPillCountText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  categoryHeaderDesc: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '500',
    marginTop: 1,
  },

  // ITEMS LIST
  itemsListContainer: {
    paddingHorizontal: 14,
    paddingVertical: 2,
  },
  serviceRowItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
    gap: 10,
  },
  serviceRowItemLast: {
    borderBottomWidth: 0,
  },
  iconSquircle: {
    width: 40,
    height: 40,
    borderRadius: 13,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.06,
    shadowRadius: 3,
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
    fontSize: 13,
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
    fontSize: 8.5,
    fontWeight: '800',
  },
  serviceDesc: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 15,
    fontWeight: '500',
  },
  arrowSquircle: {
    width: 28,
    height: 28,
    borderRadius: 9,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },

  // EMPTY STATE
  emptyStateWrap: {
    alignItems: 'center',
    paddingVertical: 32,
    gap: 8,
  },
  emptyStateIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  emptyStateTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#334155',
  },
  emptyStateDesc: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    paddingHorizontal: 24,
    lineHeight: 17,
  },
  emptyResetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 13,
    paddingVertical: 7.5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 6,
    marginTop: 6,
  },
  emptyResetBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },

  // LOGOUT BUTTON CARD
  moreLogoutBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    marginHorizontal: 16,
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    paddingVertical: 11,
    paddingHorizontal: 14,
    gap: 12,
    marginTop: 6,
    marginBottom: 14,
    shadowColor: '#DC2626',
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  moreLogoutIconSquare: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  moreLogoutTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#E11D48',
    letterSpacing: -0.2,
  },
  moreLogoutSub: {
    fontSize: 10,
    fontWeight: '500',
    color: '#94A3B8',
    marginTop: 1,
  },
  moreLogoutArrowSquare: {
    width: 28,
    height: 28,
    borderRadius: 9,
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
    marginTop: 4,
    marginBottom: 20,
  },
  footerShieldIcon: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#DCFCE7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  footerNote: {
    textAlign: 'center',
    fontSize: 10,
    color: '#059669',
    fontWeight: '700',
    letterSpacing: 0.4,
  },
});
