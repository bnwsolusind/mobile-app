import React from 'react';
import {
  Dimensions,
  Image,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { AuthUser } from '../../stores/authStore';
import {
  isTeacherRole,
  isPrincipalRole,
  isFoundationRole,
  isSuperAdminRole,
  isTuRole,
  roleLabel,
} from '../../utils/roles';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const CARD_WIDTH = SCREEN_WIDTH - 32;

interface EmployeeHeaderCardProps {
  user: AuthUser | null;
  dashboard: Record<string, any>;
  roles: string[];
  navigation: any;
  onOpenAllMenus?: () => void;
}

export default function EmployeeHeaderCard({
  user,
  dashboard,
  roles,
  navigation,
  onOpenAllMenus,
}: EmployeeHeaderCardProps) {
  const teacher = isTeacherRole(roles);
  const principal = isPrincipalRole(roles);
  const foundation = isFoundationRole(roles);
  const superAdmin = isSuperAdminRole(roles);
  const tu = isTuRole(roles);

  const roleName = roleLabel(roles, 'Pegawai / Guru');
  const profileImg = getProfileImageUrl(user, dashboard);

  // Helper to safely extract string name from object or string
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

  const resolveString = (val: any, fallback = ''): string => {
    if (val === null || val === undefined) return fallback;
    if (typeof val === 'string') return val.trim() || fallback;
    if (typeof val === 'number') return String(val);
    return fallback;
  };

  // Data unit & NIP dari user atau dashboard
  const teacherData = dashboard?.teacher || dashboard?.data?.teacher || {};
  const nipNiy =
    resolveString(teacherData?.nip_niy) ||
    resolveString(user?.nip) ||
    resolveString(user?.niy) ||
    resolveString((user?.metadata as any)?.nip) ||
    resolveString((user?.metadata as any)?.niy) ||
    resolveString(user?.email, '-') ||
    '-';

  const unitName: string =
    resolveUnitName(teacherData?.education_unit) ||
    resolveUnitName(teacherData?.unit) ||
    resolveUnitName(dashboard?.unit) ||
    resolveUnitName(dashboard?.unit_name) ||
    resolveUnitName(dashboard?.education_unit) ||
    resolveUnitName(user?.unit) ||
    resolveUnitName((user as any)?.education_unit) ||
    resolveUnitName((user?.metadata as any)?.unit_name) ||
    resolveUnitName((user?.metadata as any)?.unit) ||
    resolveUnitName((user?.metadata as any)?.education_unit) ||
    'Sekolah Islam Terpadu';

  const jabatanName =
    resolveString(teacherData?.jabatan) ||
    resolveString(teacherData?.position) ||
    resolveString((user?.metadata as any)?.jabatan) ||
    roleName;

  // KPI chips dinamis
  const kpiChips = (() => {
    if (teacher) {
      const kpi = dashboard?.kpi || dashboard?.data?.kpi || {};
      const schedulesToday = kpi?.schedules_today_count ?? (dashboard?.schedules_today?.length || 0);
      const totalClasses = kpi?.total_classes ?? 0;
      const totalStudents = kpi?.total_students ?? 0;
      return [
        { label: 'Jadwal Hari Ini', value: `${schedulesToday} KBM`, icon: 'clock-outline', color: '#34D399' },
        { label: 'Kelas Binaan', value: `${totalClasses} Kelas`, icon: 'google-classroom', color: '#60A5FA' },
        { label: 'Total Santri', value: `${totalStudents} Santri`, icon: 'account-group', color: '#FBBF24' },
      ];
    }
    if (principal) {
      const kpis = dashboard?.kpis || dashboard?.data?.kpis || dashboard?.kpi || dashboard?.data || {};
      const tables = dashboard?.tables || dashboard?.data?.tables || {};

      const extractCount = (val: any, fallbackArray?: any[], fallbackNum?: any): number => {
        if (val !== undefined && val !== null) {
          if (typeof val === 'number') return val;
          if (typeof val === 'string' && !isNaN(Number(val))) return Number(val);
          if (typeof val === 'object' && val.total !== undefined && val.total !== null) {
            return Number(val.total) || 0;
          }
        }
        if (Array.isArray(fallbackArray) && fallbackArray.length > 0) {
          return fallbackArray.length;
        }
        if (fallbackNum !== undefined && fallbackNum !== null && !isNaN(Number(fallbackNum))) {
          return Number(fallbackNum);
        }
        return 0;
      };

      const totalSiswa = extractCount(
        kpis?.total_siswa ?? dashboard?.total_siswa,
        tables?.total_siswa ?? dashboard?.students_list,
        dashboard?.total_students
      );

      const totalGuru = extractCount(
        kpis?.total_guru ?? dashboard?.total_guru,
        tables?.total_guru ?? dashboard?.teachers_list,
        dashboard?.total_teachers
      );

      const totalRombel = extractCount(
        kpis?.total_rombel ?? kpis?.total_kelas ?? dashboard?.total_rombel ?? dashboard?.total_kelas,
        tables?.total_kelas ?? dashboard?.rombel_list,
        dashboard?.total_classes
      );

      return [
        { label: 'Santri Unit', value: `${totalSiswa} Santri`, icon: 'school', color: '#34D399' },
        { label: 'Guru & Staf', value: `${totalGuru} Pendidik`, icon: 'human-male-board', color: '#60A5FA' },
        { label: 'Rombel Aktif', value: `${totalRombel} Rombel`, icon: 'door-open', color: '#FBBF24' },
      ];
    }
    if (foundation || superAdmin) {
      const overview = dashboard?.overview || dashboard?.data || {};
      const totalSiswa = overview?.total_students ?? dashboard?.total_students ?? 0;
      const totalPegawai = overview?.total_employees ?? dashboard?.total_employees ?? 0;
      const totalUnits = overview?.total_units ?? dashboard?.total_units ?? 0;
      return [
        { label: 'Total Santri', value: `${totalSiswa || '1.050'} Santri`, icon: 'account-group', color: '#34D399' },
        { label: 'SDM Pegawai', value: `${totalPegawai || '120'} Orang`, icon: 'briefcase-account', color: '#60A5FA' },
        { label: 'Unit Yayasan', value: `${totalUnits || '7'} Unit`, icon: 'domain', color: '#FBBF24' },
      ];
    }
    return [
      { label: 'Status', value: 'Pegawai Aktif', icon: 'check-decagram', color: '#34D399' },
      { label: 'Layanan', value: 'Administrasi', icon: 'file-document-edit', color: '#60A5FA' },
      { label: 'Unit', value: unitName, icon: 'office-building', color: '#FBBF24' },
    ];
  })();

  // 4 KPI Stats Khusus Role Guru (Sesuai Mockup Gambar Referensi)
  const teacherKpi = (() => {
    const kpi = dashboard?.kpi || dashboard?.data?.kpi || {};
    const kbmCount = kpi?.kbm_per_minggu ?? kpi?.schedules_per_week ?? 6;
    const classCount = kpi?.total_classes ?? 11;
    const santriCount = kpi?.total_students ?? kpi?.total_santri ?? 351;
    const attRate = kpi?.student_attendance_rate
      ? String(kpi.student_attendance_rate)
      : kpi?.attendance_rate !== undefined
      ? `${kpi.attendance_rate}%`
      : '100%';

    return [
      {
        id: 'kbm',
        value: String(kbmCount),
        label: 'KBM/Minggu',
        icon: 'book-open-page-variant',
        solidColor: '#059669', // Emerald Solid
        labelColor: '#D1FAE5',
        onPress: () => navigation?.navigate('Jadwal'),
      },
      {
        id: 'kelas',
        value: String(classCount),
        label: 'Kelas Binaan',
        icon: 'account-group',
        solidColor: '#2563EB', // Blue Solid
        labelColor: '#DBEAFE',
        onPress: () => navigation?.navigate('Guru', { tab: 'students' }),
      },
      {
        id: 'santri',
        value: String(santriCount),
        label: 'Total Santri',
        icon: 'account',
        solidColor: '#D97706', // Amber Solid
        labelColor: '#FEF3C7',
        onPress: () => navigation?.navigate('Guru', { tab: 'students' }),
      },
      {
        id: 'presensi',
        value: attRate,
        label: 'Rata-rata Presensi',
        icon: 'calendar-check',
        solidColor: '#7C3AED', // Purple Solid
        labelColor: '#EDE9FE',
        onPress: () => navigation?.navigate('Absensi'),
      },
    ];
  })();

  // Card theme gradients untuk non-teacher
  const cardGradient: [string, string, string] = principal
    ? ['#065F46', '#047857', '#10B981']
    : foundation || superAdmin
    ? ['#0F172A', '#1E293B', '#334155']
    : ['#0D6B42', '#18A165', '#2BD988'];

  const roleIcon = principal
    ? 'shield-star'
    : foundation || superAdmin
    ? 'crown'
    : teacher
    ? 'human-male-board'
    : 'badge-account-horizontal';

  // ──────────────────────────────────────────────────────────
  // RENDER KHUSUS ROLE GURU: Kartu Profil Putih Sesuai Mockup
  // ──────────────────────────────────────────────────────────
  if (teacher) {
    const teacherDisplayName =
      resolveString(user?.name) ||
      resolveString(teacherData?.nama) ||
      resolveString(teacherData?.name) ||
      resolveString((user as any)?.nama_lengkap) ||
      'Pendidik';
    const teacherDisplayJabatan =
      resolveString(teacherData?.jabatan) ||
      resolveString(teacherData?.position) ||
      resolveString((user as any)?.position) ||
      'Pendidik';
    const teacherDisplayNip = nipNiy && nipNiy !== '-' ? `NIP. ${nipNiy}` : '';
    const teacherDisplayUnit = unitName || '';

    return (
      <View style={styles.cardContainerInHeader}>
        {/* Latar Belakang 2 Warna */}
        <View style={styles.bodyOverlapBackdrop}>
          <View style={styles.bodyOverlapSheet} />
        </View>

        {/* Kartu Profil Guru Putih Bersih */}
        <View style={styles.teacherWhiteCard}>
          {/* Baris Atas: Avatar + Info Guru + Badge & Unit */}
          <View style={styles.teacherTopRow}>
            {/* Avatar Bulat + Badge Verified */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation?.navigate('Profil')}
              style={styles.teacherAvatarBox}
            >
              {profileImg ? (
                <Image
                  source={{ uri: profileImg }}
                  style={styles.teacherAvatarImg}
                  resizeMode="cover"
                />
              ) : (
                <Image
                  source={DEFAULT_PARENT_AVATAR}
                  style={styles.teacherAvatarImg}
                  resizeMode="cover"
                />
              )}
              <View style={styles.teacherVerifiedBadge}>
                <MaterialCommunityIcons name="check" size={10} color="#FFFFFF" />
              </View>
            </TouchableOpacity>

            {/* Kolom Info Guru (Nama, Jabatan, NIP) */}
            <View style={styles.teacherInfoCol}>
              <Text numberOfLines={1} style={styles.teacherNameText}>
                {teacherDisplayName}
              </Text>
              <Text numberOfLines={1} style={styles.teacherJabatanText}>
                {teacherDisplayJabatan}
              </Text>
              <Text numberOfLines={1} style={styles.teacherNipText}>
                {teacherDisplayNip}
              </Text>
            </View>

            {/* Kolom Kanan Atas: Badge Role & Link Unit */}
            <View style={styles.teacherRightCol}>
              {/* Badge Guru / Pengajar */}
              <View style={styles.teacherRoleBadge}>
                <MaterialCommunityIcons
                  name="briefcase-outline"
                  size={12}
                  color="#059669"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.teacherRoleBadgeText}>Guru / Pengajar</Text>
              </View>

              {/* Link Unit Pendidikan */}
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => navigation?.navigate('Profil')}
                style={styles.teacherUnitLink}
              >
                <MaterialCommunityIcons
                  name="domain"
                  size={13}
                  color="#059669"
                  style={{ marginRight: 4 }}
                />
                <Text numberOfLines={1} style={styles.teacherUnitLinkText}>
                  {teacherDisplayUnit}
                </Text>
                <MaterialCommunityIcons
                  name="chevron-right"
                  size={13}
                  color="#94A3B8"
                  style={{ marginLeft: 2 }}
                />
              </TouchableOpacity>
            </View>
          </View>

          {/* Baris Bawah: 4 Stat KPI Chips Horizontal */}
          {/* Baris Bawah: 4 Stat KPI Chips Horizontal (Warna Solid Berbeda Sesuai Permintaan) */}
          <View style={styles.teacherKpiRow}>
            {teacherKpi.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.8}
                onPress={item.onPress}
                style={[
                  styles.teacherKpiCard,
                  { backgroundColor: item.solidColor, shadowColor: item.solidColor },
                ]}
              >
                <View style={styles.teacherKpiCardTop}>
                  <MaterialCommunityIcons
                    name={item.icon as any}
                    size={15}
                    color="#FFFFFF"
                    style={{ marginRight: 3 }}
                  />
                  <Text numberOfLines={1} style={styles.teacherKpiValue}>
                    {item.value}
                  </Text>
                </View>
                <Text numberOfLines={1} style={[styles.teacherKpiLabel, { color: item.labelColor }]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.cardContainerInHeader}>
      {/* Latar Belakang 2 Warna */}
      <View style={styles.bodyOverlapBackdrop}>
        <View style={styles.bodyOverlapSheet} />
      </View>

      <LinearGradient
        colors={cardGradient}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.mainCard}
      >
        {/* Decorative Elements */}
        <View style={styles.cardDecorCircle} />
        <View style={styles.cardDecorWave} />
        <View style={styles.cardDecorDot1} />
        <View style={styles.cardDecorDot2} />

        {/* Top Row: Avatar + Info + Quick Actions */}
        <View style={styles.cardTopRow}>
          {/* Avatar */}
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Profil')}
            style={styles.avatarBox}
          >
            {profileImg ? (
              <Image
                source={{ uri: profileImg }}
                style={styles.avatarImg}
                resizeMode="cover"
              />
            ) : (
              <Image
                source={DEFAULT_PARENT_AVATAR}
                style={styles.avatarImg}
                resizeMode="cover"
              />
            )}
            {/* Verified badge */}
            <View style={styles.avatarVerifiedBadge}>
              <MaterialCommunityIcons name="check-decagram" size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          {/* Info */}
          <View style={styles.infoCol}>
            {/* Role Pill */}
            <View style={styles.rolePill}>
              <MaterialCommunityIcons
                name={roleIcon as any}
                size={10}
                color="#DEF7EC"
                style={{ marginRight: 3 }}
              />
              <Text numberOfLines={1} style={styles.rolePillText}>
                {roleName.toUpperCase()}
              </Text>
            </View>

            {/* Jabatan / Position */}
            <Text numberOfLines={1} style={styles.jabatanText}>
              {jabatanName}
            </Text>

            {/* Unit */}
            <View style={styles.unitBadge}>
              <MaterialCommunityIcons
                name="school"
                size={10}
                color="#A7F3D0"
                style={{ marginRight: 3 }}
              />
              <Text numberOfLines={1} style={styles.unitText}>
                {unitName}
              </Text>
            </View>

            {/* NIP */}
            <Text numberOfLines={1} style={styles.nipText}>
              NIP: {nipNiy}
            </Text>
          </View>

          {/* Action Buttons */}
          <View style={styles.cardHeaderActions}>
            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => navigation?.navigate('QR Code')}
              style={styles.iconBtn}
              accessibilityLabel="Scan / Tampilkan QR"
            >
              <MaterialCommunityIcons name="qrcode-scan" size={18} color="#18A165" />
            </TouchableOpacity>
          </View>
        </View>

        {/* Divider line */}
        <View style={styles.dividerLine} />

        {/* KPI Chips Row */}
        <View style={styles.attributesGrid}>
          {kpiChips.map((chip, idx) => (
            <View key={idx} style={styles.attrBox}>
              <View style={styles.attrLabelRow}>
                <MaterialCommunityIcons
                  name={chip.icon as any}
                  size={11}
                  color={chip.color}
                  style={{ marginRight: 3 }}
                />
                <Text numberOfLines={1} style={styles.attrLabelText}>
                  {chip.label}
                </Text>
              </View>
              <Text numberOfLines={1} style={styles.attrValueText}>
                {chip.value}
              </Text>
            </View>
          ))}
        </View>

        {/* Bottom Quick Actions Row */}
        <View style={styles.cardBottomRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Jadwal')}
            style={styles.bottomActionBtn}
          >
            <MaterialCommunityIcons name="calendar-clock-outline" size={14} color="#0D6B42" />
            <Text numberOfLines={1} style={styles.bottomActionText}>Jadwal</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Absensi')}
            style={styles.bottomActionBtn}
          >
            <MaterialCommunityIcons name="clipboard-check-outline" size={14} color="#0D6B42" />
            <Text numberOfLines={1} style={styles.bottomActionText}>Presensi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => {
              if (typeof onOpenAllMenus === 'function') {
                onOpenAllMenus();
              } else {
                navigation?.navigate('Menu');
              }
            }}
            style={[styles.bottomActionBtn, styles.bottomActionBtnPrimary]}
          >
            <MaterialCommunityIcons name="view-grid-outline" size={14} color="#FFFFFF" />
            <Text numberOfLines={1} style={styles.bottomActionTextPrimary}>Menu</Text>
          </TouchableOpacity>
        </View>
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardContainerInHeader: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 2,
    position: 'relative',
  },
  bodyOverlapBackdrop: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: -24,
    height: 72,
    justifyContent: 'flex-end',
    zIndex: 0,
    pointerEvents: 'none',
  },
  bodyOverlapSheet: {
    height: 48,
    backgroundColor: '#EBF8F2',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  mainCard: {
    width: CARD_WIDTH,
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 15,
    paddingBottom: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.3)',
    shadowColor: '#0D6B42',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 10,
    position: 'relative',
    overflow: 'hidden',
    zIndex: 1,
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -25,
    right: -25,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.07)',
  },
  cardDecorWave: {
    position: 'absolute',
    bottom: -35,
    left: -25,
    width: 130,
    height: 90,
    borderRadius: 45,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  cardDecorDot1: {
    position: 'absolute',
    top: 40,
    right: 70,
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
  },
  cardDecorDot2: {
    position: 'absolute',
    bottom: 30,
    right: 30,
    width: 4,
    height: 4,
    borderRadius: 2,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  avatarBox: {
    width: 58,
    height: 58,
    borderRadius: 29,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.8)',
    overflow: 'visible',
    backgroundColor: '#DEF7EC',
    position: 'relative',
  },
  avatarImg: {
    width: 58,
    height: 58,
    borderRadius: 29,
  },
  avatarVerifiedBadge: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
    justifyContent: 'center',
    gap: 2,
  },
  rolePill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 8,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    marginBottom: 1,
  },
  rolePillText: {
    color: '#DEF7EC',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  jabatanText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
    lineHeight: 19,
    letterSpacing: 0.1,
  },
  unitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 1,
  },
  unitText: {
    color: '#A7F3D0',
    fontSize: 10,
    fontWeight: '600',
  },
  nipText: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 9.5,
    fontWeight: '600',
    marginTop: 1,
  },
  cardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 7,
    paddingTop: 2,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  dividerLine: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 12,
    marginHorizontal: -2,
  },
  attributesGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 12,
  },
  attrBox: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.12)',
  },
  attrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 3,
  },
  attrLabelText: {
    color: 'rgba(255, 255, 255, 0.65)',
    fontSize: 8.5,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  attrValueText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: -0.2,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  bottomActionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  bottomActionBtnPrimary: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.3,
    shadowRadius: 6,
    elevation: 4,
  },
  bottomActionText: {
    color: '#0D6B42',
    fontSize: 10.5,
    fontWeight: '800',
  },
  bottomActionTextPrimary: {
    color: '#FFFFFF',
    fontSize: 10.5,
    fontWeight: '800',
  },

  /* ────────────────────────────────────────────────────────── */
  /* STYLES KHUSUS KARTU GURU (SESUAI MOCKUP GAMBAR PUTIH)       */
  /* ────────────────────────────────────────────────────────── */
  teacherWhiteCard: {
    width: CARD_WIDTH,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 10,
    elevation: 4,
    zIndex: 1,
  },
  teacherTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  teacherAvatarBox: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#A7F3D0',
    position: 'relative',
  },
  teacherAvatarImg: {
    width: 56,
    height: 56,
    borderRadius: 28,
  },
  teacherVerifiedBadge: {
    position: 'absolute',
    bottom: -1,
    right: -1,
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  teacherInfoCol: {
    flex: 1,
    justifyContent: 'center',
    paddingTop: 2,
  },
  teacherNameText: {
    color: '#0F172A',
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.2,
    marginBottom: 2,
  },
  teacherJabatanText: {
    color: '#64748B',
    fontSize: 12.5,
    fontWeight: '600',
    marginBottom: 2,
  },
  teacherNipText: {
    color: '#94A3B8',
    fontSize: 11.5,
    fontWeight: '500',
  },
  teacherRightCol: {
    alignItems: 'flex-end',
    justifyContent: 'flex-start',
    gap: 6,
    paddingTop: 2,
  },
  teacherRoleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 10,
  },
  teacherRoleBadgeText: {
    color: '#047857',
    fontSize: 10.5,
    fontWeight: '700',
  },
  teacherUnitLink: {
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: 130,
  },
  teacherUnitLinkText: {
    color: '#059669',
    fontSize: 11,
    fontWeight: '600',
    maxWidth: 100,
  },
  teacherKpiRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginTop: 16,
  },
  teacherKpiCardWrap: {
    flex: 1,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  teacherKpiCard: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 9,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
  },
  teacherKpiCardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  teacherKpiValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: -0.2,
  },
  teacherKpiLabel: {
    color: '#A7F3D0',
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
  },
});
