import React, { useState, useMemo, useEffect } from 'react';
import {
  Dimensions,
  Image,
  Linking,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../../utils/profile';
import PrincipalKpiDrilldownModal, { PrincipalKpiType } from './PrincipalKpiDrilldownModal';
import PrincipalTeacherMonitoringModal from './PrincipalTeacherMonitoringModal';

import { useAuthStore } from '../../stores/authStore';
import { isDivisiRole } from '../../utils/roles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');
const SPLASH_LOGO = require('../../../assets/launcher_source.png');

export interface PrincipalHomeScreenViewProps {
  user: any;
  dashboard: Record<string, any>;
  navigation: any;
  announcements?: any[];
  topInset?: number;
  unreadNotificationCount?: number;
  onOpenAllMenus?: () => void;
}

/**
 * Format tanggal hari ini dalam format Bahasa Indonesia
 */
function getIndonesianCurrentDate(): string {
  try {
    const now = new Date();
    const formatter = new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    return formatter.format(now);
  } catch {
    const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
    const months = [
      'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
      'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
    ];
    const d = new Date();
    return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  }
}

export default function PrincipalHomeScreenView({
  user,
  dashboard,
  navigation,
  announcements = [],
  topInset = 0,
  unreadNotificationCount = 0,
  onOpenAllMenus,
}: PrincipalHomeScreenViewProps) {
  const [avatarError, setAvatarError] = useState(false);
  const [activeKpiModal, setActiveKpiModal] = useState<PrincipalKpiType | null>(null);
  const [isTeacherMonitoringModalOpen, setIsTeacherMonitoringModalOpen] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any | null>(null);

  const [empDashboardStats, setEmpDashboardStats] = useState<any>(null);
  const [studentDashboardStats, setStudentDashboardStats] = useState<any>(null);

  // Sinkronisasi data dinamis dari backend tanpa mock
  useEffect(() => {
    let isMounted = true;
    const fetchAuxDashboards = async () => {
      try {
        const targetUnitId =
          dashboard?.school_info?.id ||
          dashboard?.data?.school_info?.id ||
          dashboard?.data?.context?.unit?.id ||
          dashboard?.context?.unit?.id ||
          user?.employee?.unit_id ||
          user?.employee?.education_unit_id ||
          user?.education_unit?.id;

        const [empRes, studentRes] = await Promise.allSettled([
          mobileApiService.getEmployeeDashboard({
            unit_id: targetUnitId,
            exclude_restricted_roles: 1,
          }),
          mobileApiService.getStudentDashboard({
            unit_id: targetUnitId,
          }),
        ]);
        if (!isMounted) return;
        if (empRes.status === 'fulfilled' && empRes.value) {
          const empData = unwrapApiData(empRes.value);
          setEmpDashboardStats(empData);
        }
        if (studentRes.status === 'fulfilled' && studentRes.value) {
          const studentData = unwrapApiData(studentRes.value);
          setStudentDashboardStats(studentData);
        }
      } catch {
        // Fallback to dashboard object
      }
    };
    fetchAuxDashboards();
    return () => {
      isMounted = false;
    };
  }, [dashboard, user]);

  const data = dashboard || {};
  const kpis = data?.kpis || {};

  const roles = useAuthStore((state) => state.roles);
  const isDivisi = isDivisiRole(roles);

  // Resolusi Identitas Pengguna & Unit
  const userName =
    user?.name ||
    user?.nama_lengkap ||
    user?.nama ||
    (isDivisi ? 'Divisi Pendidikan' : 'Kepala Sekolah');

  const userPosition =
    user?.employee?.position?.name ||
    user?.position ||
    user?.role_name ||
    (isDivisi ? 'Divisi Pendidikan' : 'Kepala Sekolah');

  const unitName = useMemo(() => {
    const candidate =
      data?.school_info?.name ||
      data?.school_info?.nama ||
      data?.context?.unit?.nama ||
      data?.context?.unit?.name ||
      user?.education_unit?.name ||
      user?.unit?.name ||
      user?.employee?.education_unit?.name ||
      (isDivisi ? 'Yayasan Dar El-Iman' : 'Unit Sekolah Dar El-Iman');
    return String(candidate);
  }, [data, user, isDivisi]);

  const tahunAjaran =
    data?.context?.tahun_ajaran?.nama ||
    data?.context?.tahun_ajaran?.name ||
    data?.academic_year ||
    '2026/2027';

  // Resolusi Foto Profil Pengguna
  const resolvedProfileImg = useMemo(() => {
    if (avatarError) return null;
    return getProfileImageUrl(user, dashboard);
  }, [user, dashboard, avatarError]);

  // Metrik Utama Unit Sekolah (100% Dinamis dari Database)
  const totalSiswa =
    kpis?.total_siswa?.total ??
    data?.total_siswa ??
    data?.total_students ??
    studentDashboardStats?.total_siswa ??
    studentDashboardStats?.total ??
    0;

  const totalGuru =
    kpis?.total_guru?.total ??
    data?.total_guru ??
    data?.total_teachers ??
    empDashboardStats?.total_guru ??
    0;

  const totalTendik =
    kpis?.total_tendik?.total ??
    (kpis?.total_pegawai?.total
      ? Math.max(0, (kpis.total_pegawai.total || 0) - (kpis.total_guru?.total || 0))
      : (empDashboardStats?.total_tendik ?? Math.max(0, (data?.total_pegawai || 0) - totalGuru)));

  const totalPegawai = kpis?.total_pegawai?.total ?? (totalGuru + totalTendik);

  const totalRombel =
    kpis?.total_rombel?.total ??
    kpis?.total_kelas?.total ??
    data?.total_rombel ??
    studentDashboardStats?.total_kelas ??
    0;

  // 8 Menu Layanan & Operasional Kepala Sekolah (4 Kolom x 2 Baris Berwarna Elegan)
  const primaryMenuItems = useMemo(() => [
    {
      id: 'supervisi_kbm',
      label: 'Supervisi KBM',
      icon: 'human-male-board' as const,
      color: '#0F766E',
      cardBg: '#F0FDFA',
      cardBorder: '#99F6E4',
      iconBg: '#CCFBF1',
      textColor: '#0F766E',
      action: () => setIsTeacherMonitoringModalOpen(true),
    },
    {
      id: 'rekap_presensi',
      label: 'Rekap Presensi',
      icon: 'clipboard-check-outline' as const,
      color: '#059669',
      cardBg: '#ECFDF5',
      cardBorder: '#A7F3D0',
      iconBg: '#D1FAE5',
      textColor: '#065F46',
      route: 'Absensi',
    },
    {
      id: 'presensi_mandiri',
      label: 'Presensi Mandiri',
      icon: 'account-clock-outline' as const,
      color: '#10B981',
      cardBg: '#F0FDF4',
      cardBorder: '#BBF7D0',
      iconBg: '#DCFCE7',
      textColor: '#166534',
      route: 'PresensiMandiriStaff',
    },
    {
      id: 'pantau_kelas',
      label: 'Pantau Rombel',
      icon: 'google-classroom' as const,
      color: '#EA580C',
      cardBg: '#FFFBEB',
      cardBorder: '#FDE68A',
      iconBg: '#FEF3C7',
      textColor: '#92400E',
      route: 'PantauKelas',
    },
    {
      id: 'buku_induk',
      label: 'Buku Induk Siswa',
      icon: 'account-school-outline' as const,
      color: '#2563EB',
      cardBg: '#EFF6FF',
      cardBorder: '#BFDBFE',
      iconBg: '#DBEAFE',
      textColor: '#1E40AF',
      route: 'MasterSiswa',
    },
    {
      id: 'data_sdm',
      label: 'Data Guru & Staf',
      icon: 'account-group-outline' as const,
      color: '#7C3AED',
      cardBg: '#FAF5FF',
      cardBorder: '#DDD6FE',
      iconBg: '#EDE9FE',
      textColor: '#5B21B6',
      route: 'Data',
      params: { initialResource: 'employees' },
    },
    {
      id: 'nilai_rapor',
      label: 'Laporan Nilai',
      icon: 'chart-box-outline' as const,
      color: '#0284C7',
      cardBg: '#F0F9FF',
      cardBorder: '#BAE6FD',
      iconBg: '#E0F2FE',
      textColor: '#075985',
      route: 'Nilai',
    },
    {
      id: 'semua_menu',
      label: 'Semua Menu',
      icon: 'view-grid-plus' as const,
      color: '#065F46',
      cardBg: '#F0FDF4',
      cardBorder: '#A7F3D0',
      iconBg: '#DCFCE7',
      textColor: '#064E3B',
      action: onOpenAllMenus,
    },
  ], [onOpenAllMenus]);

  // Sesi KBM Hari Ini (Live Monitoring Jadwal Guru Mengajar dari class_schedules)
  const todaySessions = useMemo(() => {
    const list =
      data?.today_sessions ||
      data?.kbm?.sessions ||
      data?.teaching_sessions ||
      [];
    return Array.isArray(list) ? list : [];
  }, [data]);

  // Pengumuman Terkini
  const effectiveAnnouncements = useMemo(() => {
    if (announcements && announcements.length > 0) return announcements;
    const fromData = data?.announcements || data?.tables?.announcements || [];
    return Array.isArray(fromData) ? fromData : [];
  }, [announcements, data]);

  // Civitas / Pengguna Online
  const onlineUsers = useMemo(() => {
    const list = data?.online_users || data?.active_users || [];
    return Array.isArray(list) ? list : [];
  }, [data]);

  const handleMenuPress = (item: typeof primaryMenuItems[0]) => {
    if (item.action) {
      item.action();
      return;
    }
    if (item.route) {
      try {
        navigation.navigate(item.route, item.params);
      } catch {
        onOpenAllMenus?.();
      }
    }
  };

  const handleOpenInternalChat = (userItem: any, phone?: string, name?: string) => {
    const targetUserId = userItem?.user_id || userItem?.id;
    if (targetUserId && navigation?.navigate) {
      try {
        navigation.navigate('Chat', {
          teacherId: String(targetUserId),
          recipientId: String(targetUserId),
          name: name || userItem?.nama || userItem?.name || 'Rekan Pegawai',
          role: userItem?.role || userItem?.position_name || 'Pegawai',
        });
        return;
      } catch (err) {
        console.warn('Gagal membuka chat internal:', err);
      }
    }

    // Fallback ke WhatsApp jika user tidak memiliki ID akun chat atau gagal navigasi
    if (!phone) return;
    const cleanPhone = phone.replace(/[^0-9]/g, '');
    const intlPhone = cleanPhone.startsWith('0') ? '62' + cleanPhone.substring(1) : cleanPhone;
    const url = `whatsapp://send?phone=${intlPhone}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          Linking.openURL(url);
        } else {
          Linking.openURL(`https://wa.me/${intlPhone}`);
        }
      })
      .catch(() => {
        Linking.openURL(`https://wa.me/${intlPhone}`);
      });
  };

  return (
    <View style={styles.container}>
      {/* ── Background Image & Gradient Splash Screen 2 (Layer Belakang Selaras Guru & TU) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
          resizeMode="cover"
        />
        {/* Overlay gradien transparan berbasis warna #18A165 identik dengan Guru & TU */}
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

      {/* ── Top Header Bar (Selaras Guru & Tata Usaha) ── */}
      <View style={[styles.topBar, { paddingTop: topInset + 6 }]}>
        {/* Sisi Kiri: Logo SIMSIT + "Kepala Sekolah" + Subtitle Unit */}
        <View style={styles.topBarLeft}>
          <View style={styles.logoBadgeOuter}>
            <Image
              source={SPLASH_LOGO}
              style={styles.logoBadgeImg}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.roleTitleText}>
              {isDivisi ? 'Divisi Pendidikan' : 'Kepala Sekolah'}
            </Text>
            <Text style={styles.unitSubtitleText} numberOfLines={1}>
              {unitName}
            </Text>
          </View>
        </View>

        {/* Sisi Kanan: Lonceng Notifikasi ber-Badge + Avatar Pengguna */}
        <View style={styles.topBarRight}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Notifikasi')}
            style={styles.notificationBtn}
            accessibilityLabel="Notifikasi"
          >
            <MaterialCommunityIcons name="bell" size={24} color="#064E3B" />
            {unreadNotificationCount > 0 && (
              <View style={styles.notifBadge}>
                <Text style={styles.notifBadgeText}>
                  {unreadNotificationCount > 9 ? '9+' : unreadNotificationCount}
                </Text>
              </View>
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.85}
            onPress={() => navigation?.navigate('Profil')}
            style={styles.avatarBtn}
            accessibilityLabel="Profil Pengguna"
          >
            {resolvedProfileImg ? (
              <Image
                source={{ uri: String(resolvedProfileImg) }}
                style={styles.avatarImg}
                resizeMode="cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <Image
                source={DEFAULT_PARENT_AVATAR}
                style={styles.avatarImg}
                resizeMode="cover"
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* ── Greeting Banner (Selaras Guru & Tata Usaha) ── */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingLabel}>Selamat datang,</Text>
        <Text style={styles.greetingUserName} numberOfLines={1}>
          {userName}
        </Text>
        <Text style={styles.greetingUserRole} numberOfLines={1}>
          {isDivisi ? 'Divisi Pendidikan' : 'Kepala Sekolah'} • {unitName}
        </Text>

        {/* Pill Tanggal Format Bahasa Indonesia Dinamis */}
        <View style={styles.datePill}>
          <MaterialCommunityIcons
            name="calendar-month-outline"
            size={16}
            color="#064E3B"
            style={{ marginRight: 6 }}
          />
          <Text style={styles.datePillText}>{getIndonesianCurrentDate()}</Text>
        </View>
      </View>

      {/* ── Konten Scroll Utama Tanpa Tumpang Tindih ── */}
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. METRIK UTAMA UNIT SEKOLAH (4 KARTU KPI INTERAKTIF 2x2 GRID) ── */}
        <View style={[styles.sectionCard, styles.kpiSectionCard]}>
          <LinearGradient
            colors={['#059669', '#10B981', '#34D399']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardTopAccentBar}
          />
          <LinearGradient
            colors={['#F0FDF4', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.28 }}
            style={styles.sectionCardInner}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#DEF7EC' }]}>
                  <MaterialCommunityIcons name="chart-box-outline" size={17} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.sectionTitleBold}>
                    {isDivisi ? 'Metrik Utama Pendidikan' : 'Metrik Utama Unit Sekolah'}
                  </Text>
                  <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                    {isDivisi
                      ? 'Santri, pendidik, tenaga kependidikan, dan rombel'
                      : 'Santri, pendidik, tenaga kependidikan, dan rombel'}
                  </Text>
                </View>
              </View>
            </View>

            {/* 2x2 Grid Kartu KPI Sempurna */}
            <View style={styles.kpiGrid}>
              {/* 1. Total Siswa */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveKpiModal('total_siswa')}
                style={[styles.kpiCard, { borderColor: '#A7F3D0' }]}
              >
                <LinearGradient colors={['#ECFDF5', '#F0FDF4']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#059669' }]}>
                      <MaterialCommunityIcons name="school" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillEmerald}>
                      <Text style={styles.kpiBadgePillEmeraldText}>Siswa</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#047857' }]}>{totalSiswa}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>Siswa Aktif</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>Santri terdaftar</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* 2. Total Guru */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveKpiModal('total_guru')}
                style={[styles.kpiCard, { borderColor: '#BAE6FD' }]}
              >
                <LinearGradient colors={['#F0F9FF', '#E0F2FE']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#0284C7' }]}>
                      <MaterialCommunityIcons name="account-tie" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillBlue}>
                      <Text style={styles.kpiBadgePillBlueText}>Pendidik</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#0369A1' }]}>{totalGuru}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>Guru Pengajar</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>Tenaga pendidik</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* 3. Total Tendik */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveKpiModal('total_tendik')}
                style={[styles.kpiCard, { borderColor: '#DDD6FE' }]}
              >
                <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#7C3AED' }]}>
                      <MaterialCommunityIcons name="account-check" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillPurple}>
                      <Text style={styles.kpiBadgePillPurpleText}>Tendik</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#6D28D9' }]}>{totalTendik}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>Tendik & Staf</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>SDM: {totalPegawai} staf</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* 4. Total Rombel */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveKpiModal('total_rombel')}
                style={[styles.kpiCard, { borderColor: '#FDE68A' }]}
              >
                <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#D97706' }]}>
                      <MaterialCommunityIcons name="door-open" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillAmber}>
                      <Text style={styles.kpiBadgePillAmberText}>Rombel</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#B45309' }]}>{totalRombel}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>Rombel / Kelas</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>Rombongan belajar</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* ── 3. LAYANAN & OPERASIONAL KEPALA SEKOLAH (8 MENU SQUIRCLE PASTEL) ── */}
        <View style={[styles.sectionCard, styles.menuSectionCard]}>
          <LinearGradient
            colors={['#0D9488', '#10B981', '#059669']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardTopAccentBar}
          />
          <LinearGradient
            colors={['#F0FDFA', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.25 }}
            style={styles.sectionCardInner}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#CCFBF1' }]}>
                  <MaterialCommunityIcons name="apps" size={17} color="#0D9488" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.sectionTitleBold}>
                    {isDivisi ? 'Layanan & Supervisi Pendidikan' : 'Layanan & Operasional'}
                  </Text>
                  <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                    {isDivisi
                      ? 'Menu cepat supervisi, absensi, kurikulum & akademik'
                      : 'Menu cepat supervisi, absensi, data & akademik'}
                  </Text>
                </View>
              </View>
              {onOpenAllMenus && (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={onOpenAllMenus}
                  style={styles.allMenusPillBtn}
                >
                  <Text style={styles.allMenusPillText}>Semua</Text>
                  <MaterialCommunityIcons name="chevron-right" size={12} color="#065F46" />
                </TouchableOpacity>
              )}
            </View>

            {/* 4 Kolom x 2 Baris Menu Grid Berwarna Elegan */}
            <View style={styles.menuGrid}>
              {primaryMenuItems.map((menu) => (
                <TouchableOpacity
                  key={menu.id}
                  activeOpacity={0.8}
                  onPress={() => handleMenuPress(menu)}
                  style={[
                    styles.menuItemCard,
                    {
                      backgroundColor: menu.cardBg,
                      borderColor: menu.cardBorder,
                    },
                  ]}
                >
                  <View style={[styles.menuIconWrap, { backgroundColor: menu.iconBg }]}>
                    <MaterialCommunityIcons name={menu.icon} size={24} color={menu.color} />
                  </View>
                  <Text
                    numberOfLines={2}
                    style={[styles.menuItemLabel, { color: menu.textColor }]}
                  >
                    {menu.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </LinearGradient>
        </View>

        {/* ── 4. LIVE SUPERVISI KBM HARI INI ── */}
        <View style={[styles.sectionCard, styles.supervisiSectionCard]}>
          <LinearGradient
            colors={['#0284C7', '#38BDF8', '#0EA5E9']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardTopAccentBar}
          />
          <LinearGradient
            colors={['#F0F9FF', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.3 }}
            style={styles.sectionCardInner}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialCommunityIcons name="broadcast" size={17} color="#0284C7" />
                </View>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <Text numberOfLines={1} style={styles.sectionTitleBold}>Supervisi KBM Hari Ini</Text>
                    <View style={styles.livePulseBadge}>
                      <View style={styles.livePulseDot} />
                      <Text style={styles.livePulseText}>LIVE</Text>
                    </View>
                  </View>
                  <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                    Status real-time guru mengajar & jadwal aktif
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setIsTeacherMonitoringModalOpen(true)}
                style={styles.supervisiHeaderLinkBtn}
              >
                <Text style={styles.supervisiHeaderLinkText}>Supervisi Live</Text>
                <MaterialCommunityIcons name="chevron-right" size={13} color="#0284C7" />
              </TouchableOpacity>
            </View>

            {todaySessions.length > 0 ? (
              <View style={styles.sessionListWrap}>
                {todaySessions.slice(0, 3).map((ses: any, idx: number) => {
                  const isOngoing = ses?.is_ongoing || ses?.status === 'ongoing' || ses?.status === 'in_progress';
                  return (
                    <TouchableOpacity
                      key={ses?.id || idx}
                      activeOpacity={0.76}
                      onPress={() => setIsTeacherMonitoringModalOpen(true)}
                      style={styles.sessionCardItem}
                    >
                      <View style={styles.sessionTimeCol}>
                        <Text style={styles.sessionTimeText}>{ses?.start_time || ses?.jam_mulai || '--:--'}</Text>
                        <Text style={styles.sessionTimeSubText}>{ses?.end_time || ses?.jam_selesai || '--:--'}</Text>
                      </View>
                      <View style={styles.sessionDivider} />
                      <View style={{ flex: 1 }}>
                        <View style={styles.sessionRowTop}>
                          <Text numberOfLines={1} style={styles.sessionSubjectText}>
                            {ses?.subject_name || ses?.mata_pelajaran || ses?.subject?.name || 'Mata Pelajaran'}
                          </Text>
                          <View style={[styles.sessionStatusBadge, isOngoing ? styles.sessionBadgeOngoing : styles.sessionBadgeScheduled]}>
                            <Text style={[styles.sessionStatusText, isOngoing ? styles.sessionTextOngoing : styles.sessionTextScheduled]}>
                              {isOngoing ? 'Sedang KBM' : 'Terjadwal'}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={styles.sessionTeacherText}>
                          Guru: {ses?.teacher_name || ses?.guru || ses?.teacher?.nama_lengkap || 'Guru Pengampu'}
                        </Text>
                        <Text numberOfLines={1} style={styles.sessionClassText}>
                          Kelas: {ses?.class_name || ses?.kelas || ses?.rombel || '-'} • R: {ses?.room || ses?.ruangan || 'Ruang KBM'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={styles.emptySessionBox}>
                <View style={styles.emptySessionIconWrap}>
                  <MaterialCommunityIcons name="check-decagram-outline" size={28} color="#0284C7" />
                </View>
                <Text style={styles.emptySessionTitle}>KBM Unit Berjalan Tertib</Text>
                <Text style={styles.emptySessionDesc}>
                  Seluruh sesi belajar mengajar hari ini terpantau kondusif. Buka modul supervisi untuk melihat rekapitulasi jadwal & presensi mengajar guru.
                </Text>
                <TouchableOpacity
                  activeOpacity={0.82}
                  onPress={() => setIsTeacherMonitoringModalOpen(true)}
                  style={styles.emptySessionActionBtn}
                >
                  <MaterialCommunityIcons name="broadcast" size={16} color="#0369A1" />
                  <Text style={styles.emptySessionActionText}>Pantau Jadwal & Guru Mengajar</Text>
                </TouchableOpacity>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── 5. PENGUMUMAN & INFORMASI SEKOLAH ── */}
        <View style={[styles.sectionCard, styles.announcementSectionCard]}>
          <LinearGradient
            colors={['#E11D48', '#FB7185', '#F43F5E']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.cardTopAccentBar}
          />
          <LinearGradient
            colors={['#FFF1F2', '#FFFFFF']}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 0.3 }}
            style={styles.sectionCardInner}
          >
            <View style={styles.sectionHeaderRow}>
              <View style={styles.sectionTitleWithIcon}>
                <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#FFE4E6' }]}>
                  <MaterialCommunityIcons name="bullhorn" size={17} color="#E11D48" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.sectionTitleBold}>Pengumuman & Informasi</Text>
                  <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                    Informasi penting terkini unit sekolah
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation?.navigate('Informasi')}
                style={styles.announcementHeaderLinkBtn}
              >
                <Text style={styles.announcementHeaderLinkText}>Arsip</Text>
                <MaterialCommunityIcons name="chevron-right" size={13} color="#E11D48" />
              </TouchableOpacity>
            </View>

            {effectiveAnnouncements.length > 0 ? (
              <View style={styles.announcementListWrap}>
                {effectiveAnnouncements.slice(0, 3).map((ann: any, idx: number) => {
                  const title =
                    ann?.judul_pengumuman ||
                    ann?.judul ||
                    ann?.title ||
                    ann?.name ||
                    'Pengumuman Sekolah';
                  const body =
                    ann?.isi_pengumuman ||
                    ann?.data_tambahan?.ringkasan ||
                    ann?.ringkasan ||
                    ann?.isi ||
                    ann?.content ||
                    ann?.deskripsi ||
                    'Ketuk untuk membaca informasi selengkapnya.';
                  return (
                    <TouchableOpacity
                      key={ann?.id || idx}
                      activeOpacity={0.82}
                      onPress={() => setSelectedAnnouncement(ann)}
                      style={styles.announcementCardItem}
                    >
                      <View style={styles.announcementDot} />
                      <View style={{ flex: 1 }}>
                        <Text numberOfLines={1} style={styles.announcementTitleText}>
                          {title}
                        </Text>
                        <Text numberOfLines={2} style={styles.announcementBodyText}>
                          {body}
                        </Text>
                      </View>
                      <MaterialCommunityIcons name="chevron-right" size={16} color="#FB7185" />
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <View style={{ paddingVertical: 14, alignItems: 'center' }}>
                <MaterialCommunityIcons name="bullhorn-outline" size={26} color="#FDA4AF" />
                <Text style={{ fontSize: 11, fontWeight: '600', color: '#9F1239', marginTop: 4 }}>
                  Belum ada pengumuman & informasi terbaru
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── 6. CIVITAS & STAF SEKOLAH ONLINE ── */}
        {onlineUsers.length > 0 && (
          <View style={[styles.sectionCard, styles.onlineSectionCard, { marginBottom: 30 }]}>
            <LinearGradient
              colors={['#7C3AED', '#8B5CF6', '#A78BFA']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 0 }}
              style={styles.cardTopAccentBar}
            />
            <LinearGradient
              colors={['#F5F3FF', '#FFFFFF']}
              start={{ x: 0, y: 0 }}
              end={{ x: 0, y: 0.3 }}
              style={styles.sectionCardInner}
            >
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionTitleWithIcon}>
                  <View style={[styles.sectionIconBadgeRound, { backgroundColor: '#EDE9FE' }]}>
                    <MaterialCommunityIcons name="account-network" size={17} color="#7C3AED" />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.sectionTitleBold}>Civitas & Staf Aktif</Text>
                    <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                      Status kehadiran portal ({onlineUsers.filter((u: any) => Boolean(u.is_online)).length} online, {onlineUsers.filter((u: any) => !u.is_online).length} offline)
                    </Text>
                  </View>
                </View>
              </View>

              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.onlineUserScroll}>
                {onlineUsers.map((item: any, idx: number) => {
                  const name = item?.nama || item?.name || 'Staf';
                  const role = item?.role || item?.jabatan || 'Pegawai';
                  const phone = item?.phone || item?.no_hp || item?.telepon;
                  const isOnline = Boolean(item?.is_online);
                  return (
                    <View key={item?.id || idx} style={[styles.onlineUserCard, isOnline ? styles.onlineUserCardOnline : styles.onlineUserCardOffline]}>
                      <View style={styles.onlineUserAvatarBox}>
                        <Image
                          source={item?.foto ? { uri: item.foto } : DEFAULT_PARENT_AVATAR}
                          style={styles.onlineUserAvatarImg}
                          resizeMode="cover"
                        />
                        <View style={[styles.onlineUserStatusDot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
                      </View>
                      <Text numberOfLines={1} style={styles.onlineUserNameText}>{name}</Text>
                      <Text numberOfLines={1} style={styles.onlineUserRoleText}>{role}</Text>
                      <View style={[styles.onlineStatusBadge, { backgroundColor: isOnline ? '#ECFDF5' : '#FEF2F2', borderColor: isOnline ? '#A7F3D0' : '#FECACA' }]}>
                        <View style={[styles.onlineStatusMiniDot, { backgroundColor: isOnline ? '#10B981' : '#EF4444' }]} />
                        <Text style={[styles.onlineStatusBadgeText, { color: isOnline ? '#065F46' : '#991B1B' }]}>
                          {isOnline ? 'Online' : 'Offline'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => handleOpenInternalChat(item, phone, name)}
                        style={styles.onlineUserChatBtn}
                      >
                        <MaterialCommunityIcons name="chat-processing-outline" size={13} color="#FFFFFF" />
                        <Text style={styles.onlineUserChatBtnText}>Pesan</Text>
                      </TouchableOpacity>
                    </View>
                  );
                })}
              </ScrollView>
            </LinearGradient>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>

      {/* ── MODAL DRILLDOWN KPI UTAMA ── */}
      {activeKpiModal && (
        <PrincipalKpiDrilldownModal
          type={activeKpiModal}
          isOpen={Boolean(activeKpiModal)}
          onClose={() => setActiveKpiModal(null)}
          dashboardData={dashboard}
        />
      )}

      {/* ── MODAL SUPERVISI & PANTAU GURU MENGAJAR (JADWAL KBM RIIL) ── */}
      <PrincipalTeacherMonitoringModal
        visible={isTeacherMonitoringModalOpen}
        onClose={() => setIsTeacherMonitoringModalOpen(false)}
        unitName={unitName}
      />

      {/* ── MODAL BACA PENGUMUMAN ── */}
      {selectedAnnouncement && (
        <Modal
          visible={Boolean(selectedAnnouncement)}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedAnnouncement(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalContentBox}>
              <View style={styles.modalHeaderRow}>
                <View style={styles.modalIconBox}>
                  <MaterialCommunityIcons name="bullhorn" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={2} style={styles.modalTitleText}>
                    {selectedAnnouncement?.judul_pengumuman || selectedAnnouncement?.judul || selectedAnnouncement?.title || 'Pengumuman'}
                  </Text>
                  <Text style={styles.modalSubtitleText}>Pengumuman & Informasi Resmi</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedAnnouncement(null)}
                  style={styles.modalCloseBtn}
                >
                  <MaterialCommunityIcons name="close" size={18} color="#64748B" />
                </TouchableOpacity>
              </View>
              <ScrollView style={styles.modalBodyScroll}>
                <Text style={styles.modalContentText}>
                  {selectedAnnouncement?.isi_pengumuman || selectedAnnouncement?.isi || selectedAnnouncement?.content || selectedAnnouncement?.deskripsi || selectedAnnouncement?.data_tambahan?.ringkasan || '-'}
                </Text>
              </ScrollView>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedAnnouncement(null)}
                style={styles.modalPrimaryBtn}
              >
                <Text style={styles.modalPrimaryBtnText}>Tutup Informasi</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F0FDF4',
  },

  /* Background Layer (Selaras Guru & Tata Usaha) */
  bgBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 440,
    width: '100%',
  },
  bgImage: {
    width: '100%',
    height: '100%',
  },

  /* Top Bar */
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  logoBadgeOuter: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginRight: 10,
  },
  logoBadgeImg: {
    width: 32,
    height: 32,
  },
  titleCol: {
    flex: 1,
  },
  roleTitleText: {
    fontSize: 18,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  unitSubtitleText: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#0D9488',
    marginTop: 1,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  notificationBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
    borderWidth: 1,
    borderColor: 'rgba(6, 78, 59, 0.12)',
  },
  notifBadge: {
    position: 'absolute',
    top: 4,
    right: 4,
    backgroundColor: '#E11D48',
    borderRadius: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  notifBadgeText: {
    color: '#FFFFFF',
    fontSize: 9.5,
    fontWeight: '800',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: '#FFFFFF',
    backgroundColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },

  /* Greeting Section */
  greetingSection: {
    paddingHorizontal: 16,
    marginTop: 12,
    marginBottom: 14,
  },
  greetingLabel: {
    fontSize: 15.5,
    fontWeight: '600',
    color: '#065F46',
  },
  greetingUserName: {
    fontSize: 22,
    fontWeight: '800',
    color: '#064E3B',
    marginTop: 2,
    letterSpacing: -0.3,
  },
  greetingUserRole: {
    fontSize: 13.5,
    fontWeight: '600',
    color: '#0D9488',
    marginTop: 2,
  },
  datePill: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.9)',
    borderColor: 'rgba(6, 78, 59, 0.15)',
    borderWidth: 1,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 5.5,
    marginTop: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 2,
    elevation: 1,
  },
  datePillText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
  },

  scrollBody: {
    paddingHorizontal: 16,
    paddingTop: 4,
    gap: 14,
  },

  /* Hero Leadership Card */
  heroBannerCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  heroBannerGradient: {
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroIconBadge: {
    width: 48,
    height: 48,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  heroTagRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  heroTagPill: {
    backgroundColor: '#059669',
    paddingHorizontal: 7,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  heroTagPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  heroDotText: {
    fontSize: 10,
    color: '#0D9488',
  },
  heroSubTitleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
  },
  heroCardTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  heroCardDesc: {
    fontSize: 11.5,
    color: '#047857',
    fontWeight: '500',
    marginTop: 2,
    lineHeight: 16,
  },
  heroActionChevron: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(5, 150, 105, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 8,
  },

  /* Section Card Themed Containers */
  sectionCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    backgroundColor: '#FFFFFF',
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 8,
    elevation: 3,
  },
  cardTopAccentBar: {
    height: 3.5,
    width: '100%',
  },
  sectionCardInner: {
    padding: 16,
  },
  kpiSectionCard: {
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOpacity: 0.08,
  },
  menuSectionCard: {
    borderColor: '#6EE7B7',
    shadowColor: '#0D9488',
    shadowOpacity: 0.09,
  },
  supervisiSectionCard: {
    borderColor: '#7DD3FC',
    shadowColor: '#0284C7',
    shadowOpacity: 0.09,
  },
  announcementSectionCard: {
    borderColor: '#FECDD3',
    shadowColor: '#E11D48',
    shadowOpacity: 0.09,
  },
  onlineSectionCard: {
    borderColor: '#DDD6FE',
    shadowColor: '#7C3AED',
    shadowOpacity: 0.08,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  sectionTitleWithIcon: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  sectionIconBadgeRound: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleBold: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  sectionSubtitleText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  livePulseBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginLeft: 6,
  },
  livePulseDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#0284C7',
  },
  livePulseText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#0284C7',
  },
  kpiHeaderLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  kpiHeaderLinkText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#059669',
  },
  supervisiHeaderLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#E0F2FE',
    borderColor: '#BAE6FD',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  supervisiHeaderLinkText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0284C7',
  },
  announcementHeaderLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFE4E6',
    borderColor: '#FECDD3',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  announcementHeaderLinkText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#E11D48',
  },
  allMenusPillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
  },
  allMenusPillText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#065F46',
  },

  /* 2x2 KPI Grid */
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  kpiCard: {
    width: '48.5%',
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1.5,
  },
  kpiGradient: {
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 6,
  },
  kpiIconWrap: {
    width: 26,
    height: 26,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiBadgePillEmerald: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  kpiBadgePillEmeraldText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#065F46',
  },
  kpiBadgePillBlue: {
    backgroundColor: '#E0F2FE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  kpiBadgePillBlueText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0369A1',
  },
  kpiBadgePillPurple: {
    backgroundColor: '#EDE9FE',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  kpiBadgePillPurpleText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#6D28D9',
  },
  kpiBadgePillAmber: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  kpiBadgePillAmberText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#B45309',
  },
  kpiCount: {
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: -0.5,
    marginBottom: 2,
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
  },
  kpiSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },

  /* Menu Grid 4 Kolom x 2 Baris (2 Rows x 4 Columns Responsif Berwarna) */
  menuGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  menuItemCard: {
    width: '23.2%',
    minHeight: 88,
    borderRadius: 16,
    paddingVertical: 10,
    paddingHorizontal: 3,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1.5,
  },
  menuIconWrap: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  menuItemLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 13,
  },

  /* Session List */
  sessionListWrap: {
    gap: 8,
  },
  sessionCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1.2,
    borderColor: '#BAE6FD',
    shadowColor: '#0284C7',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  sessionTimeCol: {
    alignItems: 'center',
    justifyContent: 'center',
    minWidth: 48,
  },
  sessionTimeText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0284C7',
  },
  sessionTimeSubText: {
    fontSize: 10,
    color: '#64748B',
  },
  sessionDivider: {
    width: 1,
    height: 36,
    backgroundColor: '#BAE6FD',
    marginHorizontal: 10,
  },
  sessionRowTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  sessionSubjectText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
    marginRight: 6,
  },
  sessionStatusBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  sessionBadgeOngoing: {
    backgroundColor: '#DEF7EC',
  },
  sessionBadgeScheduled: {
    backgroundColor: '#F1F5F9',
  },
  sessionStatusText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  sessionTextOngoing: {
    color: '#059669',
  },
  sessionTextScheduled: {
    color: '#64748B',
  },
  sessionTeacherText: {
    fontSize: 11,
    color: '#334155',
    fontWeight: '600',
  },
  sessionClassText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },

  emptySessionBox: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 18,
    paddingHorizontal: 12,
  },
  emptySessionIconWrap: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  emptySessionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#064E3B',
    textAlign: 'center',
  },
  emptySessionDesc: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
    marginBottom: 12,
  },
  emptySessionActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  emptySessionActionText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },

  /* Announcement List */
  announcementListWrap: {
    gap: 8,
  },
  announcementCardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 11,
    borderWidth: 1.2,
    borderColor: '#FECDD3',
    gap: 10,
    shadowColor: '#E11D48',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  announcementDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E11D48',
  },
  announcementTitleText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  announcementBodyText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    lineHeight: 15,
  },

  /* Online Users */
  onlineUserScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  onlineUserCard: {
    width: 104,
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 10,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  onlineUserCardOnline: {
    borderColor: '#A7F3D0',
    backgroundColor: '#F0FDF4',
  },
  onlineUserCardOffline: {
    borderColor: '#FECACA',
    backgroundColor: '#FFF5F5',
  },
  onlineUserAvatarBox: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
    position: 'relative',
    marginBottom: 6,
  },
  onlineUserAvatarImg: {
    width: '100%',
    height: '100%',
  },
  onlineUserStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 11,
    height: 11,
    borderRadius: 6,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  onlineUserNameText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0F172A',
    textAlign: 'center',
  },
  onlineUserRoleText: {
    fontSize: 9.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 1,
    marginBottom: 4,
  },
  onlineStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3.5,
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 999,
    borderWidth: 1,
    marginBottom: 6,
  },
  onlineStatusMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  onlineStatusBadgeText: {
    fontSize: 8.5,
    fontWeight: '800',
  },
  onlineUserChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4.5,
    backgroundColor: '#059669',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 3,
    shadowOffset: { width: 0, height: 1.5 },
    elevation: 2,
  },
  onlineUserChatBtnText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },

  /* Modal Styles */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    width: '100%',
    maxHeight: '80%',
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  modalIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitleText: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitleText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBodyScroll: {
    maxHeight: 280,
    marginVertical: 8,
  },
  modalContentText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  modalPrimaryBtn: {
    backgroundColor: '#059669',
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 14,
  },
  modalPrimaryBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
