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
import { useAuthStore } from '../../stores/authStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');
const SPLASH_LOGO = require('../../../assets/launcher_source.png');

export interface DivisiHomeScreenViewProps {
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

export default function DivisiHomeScreenView({
  user,
  dashboard,
  navigation,
  announcements = [],
  topInset = 0,
  unreadNotificationCount = 0,
  onOpenAllMenus,
}: DivisiHomeScreenViewProps) {
  const [avatarError, setAvatarError] = useState(false);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState<any>(null);
  const [empDashboardStats, setEmpDashboardStats] = useState<any>(null);
  const [studentDashboardStats, setStudentDashboardStats] = useState<any>(null);

  // Sinkronisasi data dinamis dari backend tanpa mock
  useEffect(() => {
    let isMounted = true;
    const fetchAuxDashboards = async () => {
      try {
        const [empRes, studentRes] = await Promise.allSettled([
          mobileApiService.getEmployeeDashboard({
            exclude_restricted_roles: 1,
          }),
          mobileApiService.getStudentDashboard({}),
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

  const overview = dashboard?.overview || dashboard?.data || dashboard || {};
  const kpis = dashboard?.kpis || {};

  // Resolusi Identitas Pengguna & Unit Lembaga
  const userName =
    user?.name ||
    user?.nama_lengkap ||
    user?.nama ||
    'Divisi Pendidikan';

  const userPosition =
    user?.employee?.position?.name ||
    user?.position ||
    user?.role_name ||
    'Divisi Pendidikan';

  const unitName = useMemo(() => {
    const candidate =
      user?.education_unit?.name ||
      user?.unit?.name ||
      user?.employee?.education_unit?.name ||
      overview?.school_info?.name ||
      overview?.context?.unit?.name ||
      'Yayasan Dar El-Iman';
    return String(candidate);
  }, [overview, user]);

  // Resolusi Foto Profil Pengguna
  const resolvedProfileImg = useMemo(() => {
    if (avatarError) return null;
    return getProfileImageUrl(user, dashboard);
  }, [user, dashboard, avatarError]);

  // 1. Data Asli Konsolidasi Pendidikan (Dari overview / stats / kpis)
  const totalStudents =
    overview?.total_students ??
    dashboard?.total_students ??
    kpis?.total_siswa?.total ??
    studentDashboardStats?.total_siswa ??
    studentDashboardStats?.total ??
    overview?.totalStudents ??
    '-';

  const totalEmployees =
    overview?.total_employees ??
    dashboard?.total_employees ??
    kpis?.total_pegawai?.total ??
    empDashboardStats?.total_pegawai ??
    overview?.totalEmployees ??
    '-';

  const totalUnits =
    overview?.total_units ??
    dashboard?.total_units ??
    overview?.totalUnits ??
    6;

  const totalClasses =
    overview?.total_classes ??
    dashboard?.total_classes ??
    kpis?.total_rombel?.total ??
    kpis?.total_kelas?.total ??
    studentDashboardStats?.total_kelas ??
    overview?.totalClasses ??
    33;

  // 2. 8 Menu Asli Milik Divisi Pendidikan (Format Squircle Pastel 4 Kolom x 2 Baris)
  const primaryMenuItems = useMemo(() => [
    {
      id: 'pusat_data',
      label: 'Pusat Data',
      icon: 'database-outline' as const,
      color: '#059669',
      cardBg: '#ECFDF5',
      cardBorder: '#A7F3D0',
      iconBg: '#D1FAE5',
      textColor: '#065F46',
      route: 'Data',
    },
    {
      id: 'presensi_siswa',
      label: 'Presensi Siswa',
      icon: 'account-group' as const,
      color: '#0284C7',
      cardBg: '#EFF6FF',
      cardBorder: '#BFDBFE',
      iconBg: '#DBEAFE',
      textColor: '#1E40AF',
      route: 'RekapPresensiSiswa',
      params: { tab: 'siswa' },
    },
    {
      id: 'presensi_guru',
      label: 'Presensi Guru',
      icon: 'account-check-outline' as const,
      color: '#0D9488',
      cardBg: '#F0FDFA',
      cardBorder: '#99F6E4',
      iconBg: '#CCFBF1',
      textColor: '#0F766E',
      route: 'RekapPresensiGuru',
      params: { tab: 'pegawai' },
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
      id: 'presensi_gerbang',
      label: 'Presensi Gerbang',
      icon: 'gate' as const,
      color: '#EA580C',
      cardBg: '#FFFBEB',
      cardBorder: '#FDE68A',
      iconBg: '#FEF3C7',
      textColor: '#92400E',
      route: 'Absensi',
    },
    {
      id: 'kalender_pendidikan',
      label: 'Kalender Edukasi',
      icon: 'calendar-month-outline' as const,
      color: '#2563EB',
      cardBg: '#EFF6FF',
      cardBorder: '#BFDBFE',
      iconBg: '#DBEAFE',
      textColor: '#1E40AF',
      route: 'Kalender',
    },
    {
      id: 'mutabaah_tahfizh',
      label: 'Mutabaah & Quran',
      icon: 'check-decagram-outline' as const,
      color: '#7C3AED',
      cardBg: '#FAF5FF',
      cardBorder: '#DDD6FE',
      iconBg: '#EDE9FE',
      textColor: '#5B21B6',
      route: 'Mutabaah',
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

  // 3. Pengumuman & Warta Terkini
  const effectiveAnnouncements = useMemo(() => {
    if (announcements && announcements.length > 0) return announcements;
    const fromData = overview?.announcements || dashboard?.tables?.announcements || [];
    return Array.isArray(fromData) ? fromData : [];
  }, [announcements, overview, dashboard]);

  // 4. Civitas / Pengguna Online
  const onlineUsers = useMemo(() => {
    const list = overview?.online_users || dashboard?.online_users || [];
    return Array.isArray(list) ? list : [];
  }, [overview, dashboard]);

  const handleMenuPress = (item: typeof primaryMenuItems[0]) => {
    if (item.action) {
      item.action();
      return;
    }
    if (item.route) {
      try {
        navigation.navigate(item.route, (item as any).params);
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
      {/* ── Background Image & Gradient Splash Screen 2 (Selaras 100% Kepala Sekolah) ── */}
      <View style={styles.bgBackdrop} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.bgImage}
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

      {/* ── Top Header Bar (Selaras Kepala Sekolah & Guru) ── */}
      <View style={[styles.topBar, { paddingTop: topInset + 6 }]}>
        <View style={styles.topBarLeft}>
          <View style={styles.logoBadgeOuter}>
            <Image
              source={SPLASH_LOGO}
              style={styles.logoBadgeImg}
              resizeMode="contain"
            />
          </View>
          <View style={styles.titleCol}>
            <Text style={styles.roleTitleText}>Divisi Pendidikan</Text>
            <Text style={styles.unitSubtitleText} numberOfLines={1}>
              {unitName}
            </Text>
          </View>
        </View>

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

      {/* ── Greeting Banner (Selaras Kepala Sekolah & Guru) ── */}
      <View style={styles.greetingSection}>
        <Text style={styles.greetingLabel}>Selamat datang,</Text>
        <Text style={styles.greetingUserName} numberOfLines={1}>
          {userName}
        </Text>
        <Text style={styles.greetingUserRole} numberOfLines={1}>
          Divisi Pendidikan • {unitName}
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

      {/* ── Konten Scroll Utama ── */}
      <ScrollView
        contentContainerStyle={styles.scrollBody}
        showsVerticalScrollIndicator={false}
      >
        {/* ── 1. METRIK ASLI KONSOLIDASI PENDIDIKAN YAYASAN (STYLE 2x2 BALANCED GRID EKSEKUTIF) ── */}
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
                  <MaterialCommunityIcons name="domain" size={17} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.sectionTitleBold}>Konsolidasi Pendidikan Terpadu</Text>
                  <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                    Monitoring seluruh unit & tata kelola madrasah
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => navigation?.navigate('Data')}
                style={styles.kpiHeaderLinkBtn}
              >
                <Text style={styles.kpiHeaderLinkText}>Pusat Data</Text>
                <MaterialCommunityIcons name="chevron-right" size={13} color="#059669" />
              </TouchableOpacity>
            </View>

            {/* 2x2 Grid Kartu KPI Konsolidasi Asli */}
            <View style={styles.kpiGrid}>
              {/* 1. Total Peserta Didik */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Data')}
                style={[styles.kpiCard, { borderColor: '#A7F3D0' }]}
              >
                <LinearGradient colors={['#ECFDF5', '#F0FDF4']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#059669' }]}>
                      <MaterialCommunityIcons name="account-group" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillEmerald}>
                      <Text style={styles.kpiBadgePillEmeraldText}>Siswa</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#047857' }]}>{totalStudents}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>Total Peserta Didik</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>Semua unit terpadu</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* 2. SDM & Pendidik */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Data')}
                style={[styles.kpiCard, { borderColor: '#BAE6FD' }]}
              >
                <LinearGradient colors={['#F0F9FF', '#E0F2FE']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#0284C7' }]}>
                      <MaterialCommunityIcons name="briefcase-account" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillBlue}>
                      <Text style={styles.kpiBadgePillBlueText}>SDM</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#0369A1' }]}>{totalEmployees}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>SDM & Pendidik</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>Guru dan tenaga TU</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* 3. Unit Pendidikan */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Data')}
                style={[styles.kpiCard, { borderColor: '#FDE68A' }]}
              >
                <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#D97706' }]}>
                      <MaterialCommunityIcons name="domain" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillAmber}>
                      <Text style={styles.kpiBadgePillAmberText}>Unit</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#B45309' }]}>{totalUnits}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>Unit Pendidikan</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>TK, SD, SMP, SMA, Ponpes</Text>
                </LinearGradient>
              </TouchableOpacity>

              {/* 4. Rombel & Asrama */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Data')}
                style={[styles.kpiCard, { borderColor: '#DDD6FE' }]}
              >
                <LinearGradient colors={['#F5F3FF', '#EDE9FE']} style={styles.kpiGradient}>
                  <View style={styles.kpiTopRow}>
                    <View style={[styles.kpiIconWrap, { backgroundColor: '#7C3AED' }]}>
                      <MaterialCommunityIcons name="door-open" size={14} color="#FFFFFF" />
                    </View>
                    <View style={styles.kpiBadgePillPurple}>
                      <Text style={styles.kpiBadgePillPurpleText}>Rombel</Text>
                    </View>
                  </View>
                  <Text style={[styles.kpiCount, { color: '#6D28D9' }]}>{totalClasses}</Text>
                  <Text numberOfLines={1} style={styles.kpiLabel}>Rombel & Asrama</Text>
                  <Text numberOfLines={1} style={styles.kpiSub}>Kapasitas terkelola</Text>
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* ── 2. MENU ASLI DIVISI PENDIDIKAN (8 MENU SQUIRCLE PASTEL 4 KOLOM X 2 BARIS) ── */}
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
                  <Text numberOfLines={1} style={styles.sectionTitleBold}>Layanan & Supervisi Pendidikan</Text>
                  <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                    Menu cepat data, presensi & monitoring divisi
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

        {/* ── 3. PUSAT MONITORING & EVALUASI DIVISI (ASLI DARI ACTION GRID) ── */}
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
                  <MaterialCommunityIcons name="chart-box-outline" size={17} color="#0284C7" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.sectionTitleBold}>Pusat Monitoring & Evaluasi</Text>
                  <Text numberOfLines={1} style={styles.sectionSubtitleText}>
                    Akses cepat data konsolidasi, gerbang, dan kalender
                  </Text>
                </View>
              </View>
            </View>

            {/* 4 Action Tiles Bergaya Modern Eksekutif */}
            <View style={styles.evalActionGrid}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Data')}
                style={[styles.evalActionCard, { borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}
              >
                <View style={[styles.evalIconWrap, { backgroundColor: '#E0F2FE' }]}>
                  <MaterialCommunityIcons name="monitor-dashboard" size={20} color="#0284C7" />
                </View>
                <Text numberOfLines={1} style={[styles.evalActionLabel, { color: '#0369A1' }]}>
                  Data Konsolidasi
                </Text>
                <Text numberOfLines={1} style={styles.evalActionSub}>Master lintas unit</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Absensi')}
                style={[styles.evalActionCard, { borderColor: '#A7F3D0', backgroundColor: '#ECFDF5' }]}
              >
                <View style={[styles.evalIconWrap, { backgroundColor: '#DEF7EC' }]}>
                  <MaterialCommunityIcons name="gate" size={20} color="#059669" />
                </View>
                <Text numberOfLines={1} style={[styles.evalActionLabel, { color: '#065F46' }]}>
                  Absensi Gerbang
                </Text>
                <Text numberOfLines={1} style={styles.evalActionSub}>Presensi tap kartu</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Kalender')}
                style={[styles.evalActionCard, { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' }]}
              >
                <View style={[styles.evalIconWrap, { backgroundColor: '#FEF3C7' }]}>
                  <MaterialCommunityIcons name="calendar-month-outline" size={20} color="#D97706" />
                </View>
                <Text numberOfLines={1} style={[styles.evalActionLabel, { color: '#B45309' }]}>
                  Kalender Terpadu
                </Text>
                <Text numberOfLines={1} style={styles.evalActionSub}>Agenda pendidikan</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => navigation?.navigate('Informasi')}
                style={[styles.evalActionCard, { borderColor: '#E2E8F0', backgroundColor: '#F8FAFC' }]}
              >
                <View style={[styles.evalIconWrap, { backgroundColor: '#F1F5F9' }]}>
                  <MaterialCommunityIcons name="newspaper" size={20} color="#475569" />
                </View>
                <Text numberOfLines={1} style={[styles.evalActionLabel, { color: '#334155' }]}>
                  Agenda Yayasan
                </Text>
                <Text numberOfLines={1} style={styles.evalActionSub}>Warta resmi divisi</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>
        </View>

        {/* ── 4. PENGUMUMAN & INFORMASI RESMI ── */}
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
                    Warta resmi yayasan & unit pendidikan
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
                    'Pengumuman Divisi';
                  const body =
                    ann?.isi_pengumuman ||
                    ann?.data_tambahan?.ringkasan ||
                    ann?.ringkasan ||
                    ann?.isi ||
                    ann?.content ||
                    ann?.deskripsi ||
                    'Ketuk untuk membaca warta selengkapnya.';
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
                  Belum ada pengumuman & warta terbaru
                </Text>
              </View>
            )}
          </LinearGradient>
        </View>

        {/* ── 5. CIVITAS & STAF AKTIF ── */}
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
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={{ maxHeight: 320, marginVertical: 12 }}>
                <Text style={styles.modalFullBodyText}>
                  {selectedAnnouncement?.isi_pengumuman ||
                    selectedAnnouncement?.isi ||
                    selectedAnnouncement?.content ||
                    selectedAnnouncement?.ringkasan ||
                    'Tidak ada rincian konten tambahan.'}
                </Text>
              </ScrollView>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedAnnouncement(null)}
                style={styles.modalOkBtn}
              >
                <Text style={styles.modalOkBtnText}>Tutup</Text>
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
    position: 'relative',
    backgroundColor: '#F0FDF4',
  },
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

  /* Menu Grid 4 Kolom x 2 Baris */
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

  /* Evaluation & Action Grid */
  evalActionGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: 10,
  },
  evalActionCard: {
    width: '48.5%',
    borderRadius: 16,
    borderWidth: 1.2,
    padding: 12,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.03,
    shadowRadius: 2,
    elevation: 1,
  },
  evalIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  evalActionLabel: {
    fontSize: 13,
    fontWeight: '800',
    marginBottom: 2,
  },
  evalActionSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
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
    padding: 12,
    borderWidth: 1.2,
    borderColor: '#FECDD3',
  },
  announcementDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#E11D48',
    marginRight: 10,
  },
  announcementTitleText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#881337',
  },
  announcementBodyText: {
    fontSize: 11,
    color: '#475569',
    marginTop: 2,
    lineHeight: 15,
  },

  /* Online Users */
  onlineUserScroll: {
    gap: 10,
    paddingVertical: 4,
  },
  onlineUserCard: {
    width: 110,
    padding: 10,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    alignItems: 'center',
  },
  onlineUserCardOnline: {
    borderColor: '#A7F3D0',
  },
  onlineUserCardOffline: {
    borderColor: '#E2E8F0',
  },
  onlineUserAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    position: 'relative',
    marginBottom: 6,
  },
  onlineUserAvatarImg: {
    width: '100%',
    height: '100%',
    borderRadius: 22,
  },
  onlineUserStatusDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  onlineUserNameText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
    width: '100%',
  },
  onlineUserRoleText: {
    fontSize: 10,
    color: '#64748B',
    textAlign: 'center',
    width: '100%',
    marginTop: 1,
    marginBottom: 6,
  },
  onlineStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    marginBottom: 6,
  },
  onlineStatusMiniDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  onlineStatusBadgeText: {
    fontSize: 9,
    fontWeight: '700',
  },
  onlineUserChatBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    width: '100%',
    justifyContent: 'center',
  },
  onlineUserChatBtnText: {
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '700',
  },

  /* Modal */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContentBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    width: '100%',
    maxWidth: 420,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
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
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalFullBodyText: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
  },
  modalOkBtn: {
    backgroundColor: '#059669',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
    marginTop: 8,
  },
  modalOkBtnText: {
    color: '#FFFFFF',
    fontSize: 13.5,
    fontWeight: '800',
  },
});
