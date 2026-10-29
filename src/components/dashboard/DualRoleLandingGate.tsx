import React, { useMemo } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthUser } from '../../stores/authStore';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const PARENT_HOME_BG = require('../../../assets/parent_home_bg.jpg');
const SPLASH_LOGO = require('../../../assets/launcher_source.png');

export interface DualRoleLandingGateProps {
  user: AuthUser | null;
  dashboard: Record<string, any>;
  mobileConfig: any;
  onSelectRole: (role: 'teacher' | 'musyrif') => void;
  navigation: any;
  topInset: number;
  unreadNotificationCount?: number;
  onOpenNotifications?: () => void;
  announcements?: any[];
}

export const DualRoleLandingGate: React.FC<DualRoleLandingGateProps> = ({
  user,
  dashboard,
  mobileConfig,
  onSelectRole,
  navigation,
  topInset,
  unreadNotificationCount = 0,
  onOpenNotifications,
  announcements = [],
}) => {
  // Helper ekstraksi string dinamis aman tanpa hardcode
  const resolveString = (val: any, fallback = ''): string => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'string') return val.trim() || fallback;
    if (typeof val === 'number') return String(val);
    return fallback;
  };

  const resolveUnitName = (val: any): string | null => {
    if (!val) return null;
    if (typeof val === 'string' && val.trim().length > 0) return val.trim();
    if (typeof val === 'object') {
      if (typeof val.name === 'string' && val.name.trim().length > 0) return val.name.trim();
      if (typeof val.nama === 'string' && val.nama.trim().length > 0) return val.nama.trim();
      if (typeof val.nama_unit === 'string' && val.nama_unit.trim().length > 0) return val.nama_unit.trim();
      if (typeof val.unit_name === 'string' && val.unit_name.trim().length > 0) return val.unit_name.trim();
    }
    return null;
  };

  const teacherData = dashboard?.teacher || dashboard?.data?.teacher || {};
  const musyrifData = dashboard?.musyrif || dashboard?.asrama_info || {};

  // Nama Pengguna Dinamis
  const displayName =
    resolveString(user?.name) ||
    resolveString(teacherData?.nama) ||
    resolveString(teacherData?.name) ||
    resolveString((user as any)?.nama_lengkap) ||
    'Ustaz / Pembina';

  // Unit Sekolah Dinamis
  const schoolUnitName =
    resolveUnitName(teacherData?.education_unit) ||
    resolveUnitName(teacherData?.unit) ||
    resolveUnitName(dashboard?.unit) ||
    resolveUnitName(dashboard?.unit_name) ||
    resolveUnitName(dashboard?.education_unit) ||
    resolveUnitName(user?.unit) ||
    resolveUnitName((user as any)?.education_unit) ||
    resolveUnitName((user?.metadata as any)?.unit_name) ||
    'Sekolah Islam Terpadu';

  // Unit Asrama Dinamis
  const asramaUnitName =
    resolveUnitName(musyrifData?.asrama) ||
    resolveUnitName(musyrifData?.asrama_name) ||
    resolveUnitName(dashboard?.asrama?.name) ||
    resolveUnitName((user?.metadata as any)?.asrama_name) ||
    resolveUnitName((user?.metadata as any)?.unit_asrama) ||
    'Asrama Santri Ponpes';

  // Foto Profil Pengguna
  const profileImg = getProfileImageUrl(user, dashboard);

  return (
    <View style={[styles.mainContainer, { paddingTop: topInset + 4 }]}>
      {/* 1. Latar Belakang Gambar Ilustrasi Gedung Sekolah & Masjid (Sama Persis dengan Role Orang Tua) */}
      <Image
        source={PARENT_HOME_BG}
        style={styles.homeBgImage}
        resizeMode="cover"
      />
      <LinearGradient
        colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
        locations={[0.5, 0.82, 1]}
        style={styles.homeBgFade}
      />

      {/* 2. Header Top Bar (Logo, Judul Sekolah, Tagline, Lonceng & Profil) */}
      <View style={styles.headerBar}>
        <View style={styles.brandSection}>
          <View style={styles.logoBox}>
            <Image source={SPLASH_LOGO} style={styles.logoImg} resizeMode="contain" />
          </View>
          <View style={styles.brandTextCol}>
            <Text style={styles.schoolTitle} numberOfLines={1}>
              {mobileConfig?.branding?.school_name || 'Sekolah IT'}
            </Text>
            <Text style={styles.schoolTagline} numberOfLines={1}>
              {mobileConfig?.branding?.tagline || 'Unggul | Berkarakter | Berbasis Teknologi'}
            </Text>
          </View>
        </View>

        <View style={styles.headerActions}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onOpenNotifications || (() => navigation?.navigate('Notifikasi'))}
            style={styles.bellBtn}
            accessibilityLabel="Notifikasi"
          >
            <MaterialCommunityIcons name="bell" size={24} color="#047857" />
            {unreadNotificationCount > 0 && <View style={styles.unreadDot} />}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Profil')}
            style={styles.avatarBtn}
            accessibilityLabel="Profil Pengguna"
          >
            <Image
              source={profileImg ? { uri: profileImg } : DEFAULT_PARENT_AVATAR}
              style={styles.avatarImg}
              resizeMode="cover"
            />
          </TouchableOpacity>
        </View>
      </View>

      {/* 3. Hero Greeting Awal */}
      <View style={styles.heroGreetingBox}>
        <Text style={styles.salamText}>Assalamu'alaikum,</Text>
        <View style={styles.greetingRow}>
          <Text style={styles.greetingText} numberOfLines={1}>
            {displayName}
          </Text>
          <Text style={styles.greetingHand}> 👋</Text>
        </View>
        <Text style={styles.subDescText}>
          Anda memiliki akses multi-peran (Pendidik KBM & Pembina Asrama). Silakan pilih ruang kerja untuk memulai aktivitas.
        </Text>
      </View>

      {/* 4. Judul Bagian Pilihan Ruang Kerja */}
      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>Pilih Ruang Kerja</Text>
      </View>

      {/* 5. Kartu 1: Ruang Kerja Guru & Akademik (Gaya Persis parentSelectChildCard) */}
      <TouchableOpacity
        activeOpacity={0.88}
        style={styles.selectCard}
        onPress={() => onSelectRole('teacher')}
      >
        <View style={styles.selectCardTopRow}>
          <View style={[styles.iconCircle, { backgroundColor: '#ECFDF5' }]}>
            <MaterialCommunityIcons name="school" size={30} color="#059669" />
          </View>
          <View style={styles.cardTextCol}>
            <Text style={styles.cardTitle}>Ruang Kerja Guru & Akademik</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>
              {schoolUnitName} · Jadwal KBM, Presensi Siswa, Penilaian, CBT & Materi Ajar
            </Text>
          </View>
          <View style={[styles.chevronCircle, { backgroundColor: '#059669', shadowColor: '#059669' }]}>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
          </View>
        </View>

        <View style={[styles.selectFullBtn, { backgroundColor: '#059669', shadowColor: '#059669' }]}>
          <Text style={styles.selectFullBtnText}>Masuk Ruang Guru</Text>
        </View>
      </TouchableOpacity>

      {/* 6. Kartu 2: Ruang Kerja Musyrif Asrama (Gaya Persis parentSelectChildCard) */}
      <TouchableOpacity
        activeOpacity={0.88}
        style={[styles.selectCard, { borderColor: '#86EFAC', shadowColor: '#0D9488' }]}
        onPress={() => onSelectRole('musyrif')}
      >
        <View style={styles.selectCardTopRow}>
          <View style={[styles.iconCircle, { backgroundColor: '#F0FDFA' }]}>
            <MaterialCommunityIcons name="home-account" size={30} color="#0D9488" />
          </View>
          <View style={styles.cardTextCol}>
            <Text style={[styles.cardTitle, { color: '#0F766E' }]}>Ruang Kerja Musyrif Asrama</Text>
            <Text style={styles.cardSubtitle} numberOfLines={2}>
              {asramaUnitName} · Pengasuhan Asrama, Izin Darurat, Sholat & Kepulangan Santri
            </Text>
          </View>
          <View style={[styles.chevronCircle, { backgroundColor: '#0D9488', shadowColor: '#0D9488' }]}>
            <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
          </View>
        </View>

        <View style={[styles.selectFullBtn, { backgroundColor: '#0D9488', shadowColor: '#0D9488' }]}>
          <Text style={styles.selectFullBtnText}>Masuk Ruang Musyrif</Text>
        </View>
      </TouchableOpacity>

      {/* 7. Grid 3 Layanan Cepat (Sama Persis dengan parentServicesGrid) */}
      <View style={styles.servicesGrid}>
        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.serviceCard}
          onPress={() => navigation?.navigate('Profil')}
        >
          <View style={[styles.serviceIconBox, { backgroundColor: '#EFF6FF' }]}>
            <MaterialCommunityIcons name="account-circle" size={26} color="#2563EB" />
          </View>
          <Text numberOfLines={1} style={styles.serviceLabel}>Profil Saya</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.serviceCard}
          onPress={() => navigation?.navigate('Jadwal')}
        >
          <View style={[styles.serviceIconBox, { backgroundColor: '#FEF3C7' }]}>
            <MaterialCommunityIcons name="calendar-clock" size={26} color="#D97706" />
          </View>
          <Text numberOfLines={1} style={styles.serviceLabel}>Jadwal Guru</Text>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.75}
          style={styles.serviceCard}
          onPress={() => navigation?.navigate('Profil')}
        >
          <View style={[styles.serviceIconBox, { backgroundColor: '#ECFDF5' }]}>
            <MaterialCommunityIcons name="lifebuoy" size={26} color="#059669" />
          </View>
          <Text numberOfLines={1} style={styles.serviceLabel}>Bantuan</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  mainContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
    position: 'relative',
    paddingBottom: 40,
  },
  homeBgImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    height: 380,
    opacity: 0.95,
  },
  homeBgFade: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 380,
  },
  headerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 8,
    zIndex: 1,
  },
  brandSection: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  logoBox: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  logoImg: {
    width: 32,
    height: 32,
  },
  brandTextCol: {
    flex: 1,
  },
  schoolTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#004D32',
    letterSpacing: -0.3,
  },
  schoolTagline: {
    fontSize: 10,
    fontWeight: '600',
    color: '#047857',
    marginTop: 1,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  bellBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
    position: 'relative',
  },
  unreadDot: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  avatarBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#10B981',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  heroGreetingBox: {
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 6,
    zIndex: 1,
  },
  salamText: {
    fontSize: 13,
    color: '#047857',
    fontWeight: '700',
    marginBottom: 2,
  },
  greetingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  greetingText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: -0.4,
    flexShrink: 1,
  },
  greetingHand: {
    fontSize: 20,
    marginLeft: 4,
  },
  subDescText: {
    fontSize: 12,
    lineHeight: 18,
    fontWeight: '500',
    color: '#4B5563',
  },
  sectionHeader: {
    marginHorizontal: 18,
    marginTop: 14,
    marginBottom: 4,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  selectCard: {
    marginHorizontal: 16,
    marginTop: 10,
    borderRadius: 24,
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 10,
    elevation: 3,
  },
  selectCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardTextCol: {
    flex: 1,
    marginLeft: 12,
    marginRight: 8,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  cardSubtitle: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#047857',
    marginTop: 3,
    lineHeight: 16,
  },
  chevronCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  selectFullBtn: {
    borderRadius: 16,
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 2,
    marginTop: 2,
  },
  selectFullBtnText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  servicesGrid: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    marginTop: 14,
    gap: 8,
  },
  serviceCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  serviceIconBox: {
    width: 46,
    height: 46,
    borderRadius: 23,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  serviceLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#004D32',
    textAlign: 'center',
  },
  newsSectionCard: {
    marginHorizontal: 16,
    marginTop: 16,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  newsHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#ECFDF5',
  },
  newsHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  newsHeaderIconBox: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  newsTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
  },
  newsSubtitle: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#059669',
  },
  newsItemRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
  },
  newsItemTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#065F46',
  },
  newsItemDate: {
    fontSize: 10,
    color: '#059669',
    marginTop: 2,
  },
});

export default DualRoleLandingGate;
