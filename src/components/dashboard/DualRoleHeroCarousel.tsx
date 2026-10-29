import React, { useCallback, useMemo } from 'react';
import {
  Dimensions,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { GenericCarousel } from '../GenericCarousel';
import { AuthUser } from '../../stores/authStore';
import { getProfileImageUrl, DEFAULT_PARENT_AVATAR } from '../../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface DualRoleHeroCarouselProps {
  user: AuthUser | null;
  dashboard: Record<string, any>;
  roles: string[];
  activeMode: 'teacher' | 'musyrif';
  onSelectMode: (mode: 'teacher' | 'musyrif') => void;
  navigation?: any;
  containerStyle?: any;
}

interface RoleCardItem {
  id: 'teacher' | 'musyrif';
  chipLabel: string;
  roleTitle: string;
  roleBadgeText: string;
  roleBadgeIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  subTitle: string;
  unitName: string;
  unitIcon: keyof typeof MaterialCommunityIcons.glyphMap;
  attr1: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    value: string;
  };
  attr2: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    value: string;
  };
  attr3: {
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    label: string;
    value: string;
    dotColor: string;
  };
  activeActionLabel: string;
  switchActionLabel: string;
}

export const DualRoleHeroCarousel: React.FC<DualRoleHeroCarouselProps> = ({
  user,
  dashboard,
  roles,
  activeMode,
  onSelectMode,
  navigation,
  containerStyle,
}) => {
  // Helper ekstraksi string aman bebas hardcode
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

  // Identifikasi NIP / NIY Dinamis
  const rawNip =
    resolveString(teacherData?.nip_niy) ||
    resolveString(user?.nip) ||
    resolveString(user?.niy) ||
    resolveString((user?.metadata as any)?.nip) ||
    resolveString((user?.metadata as any)?.niy);

  const displayNip = rawNip && rawNip !== '-' ? `NIP. ${rawNip}` : '';

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

  // Statistik KBM Guru
  const kpiData = dashboard?.kpi || dashboard?.data?.kpi || {};
  const schedulesTodayCount = Number(kpiData?.schedules_today_count ?? (dashboard?.schedules_today?.length || 0));
  const totalClassesCount = Number(kpiData?.total_classes ?? 0);
  const teacherJabatan =
    resolveString(teacherData?.jabatan) ||
    resolveString(teacherData?.position) ||
    'Guru Pengajar';

  // Statistik Musyrif Asrama
  const totalSantriAsrama = Number(
    musyrifData?.total_santri ||
    dashboard?.total_santri_asrama ||
    kpiData?.total_students ||
    0
  );
  const musyrifJabatan =
    resolveString(musyrifData?.jabatan) ||
    resolveString((user?.metadata as any)?.jabatan) ||
    'Wali Asrama Santri';

  const profileImg = getProfileImageUrl(user, dashboard);

  // 2 Kartu Peran dengan metadata dinamis tanpa hardcode
  const roleItems: RoleCardItem[] = useMemo(() => [
    {
      id: 'teacher',
      chipLabel: 'Ruang Guru (KBM)',
      roleTitle: 'Ruang Kerja Guru & Akademik',
      roleBadgeText: 'Pendidik KBM',
      roleBadgeIcon: 'school',
      subTitle: displayNip ? `${displayNip} · Pendidik KBM` : 'Pendidik KBM & Akademik',
      unitName: schoolUnitName,
      unitIcon: 'school',
      attr1: {
        icon: 'human-male-board',
        label: 'Peran',
        value: teacherJabatan,
      },
      attr2: {
        icon: 'book-open-page-variant',
        label: 'KBM / Kelas',
        value: `${schedulesTodayCount} KBM · ${totalClassesCount} Kelas`,
      },
      attr3: {
        icon: 'checkbox-marked-circle-outline',
        label: 'Status',
        value: 'KBM Aktif',
        dotColor: '#34D399',
      },
      activeActionLabel: 'Ruang Guru Sedang Aktif',
      switchActionLabel: 'Beralih ke Ruang Guru',
    },
    {
      id: 'musyrif',
      chipLabel: 'Ruang Musyrif (Asrama)',
      roleTitle: 'Ruang Kerja Musyrif Asrama',
      roleBadgeText: 'Pembina Asrama',
      roleBadgeIcon: 'shield-home',
      subTitle: displayNip ? `${displayNip} · Pembina Asrama` : 'Pembina Asrama Santri',
      unitName: asramaUnitName,
      unitIcon: 'home-modern',
      attr1: {
        icon: 'shield-account',
        label: 'Peran',
        value: musyrifJabatan,
      },
      attr2: {
        icon: 'account-group',
        label: 'Wilayah Binaan',
        value: totalSantriAsrama > 0 ? `${totalSantriAsrama} Santri` : 'Binaan Asrama',
      },
      attr3: {
        icon: 'shield-check',
        label: 'Status',
        value: 'Siaga Asrama',
        dotColor: '#34D399',
      },
      activeActionLabel: 'Ruang Musyrif Sedang Aktif',
      switchActionLabel: 'Beralih ke Ruang Musyrif',
    },
  ], [
    displayNip,
    schoolUnitName,
    asramaUnitName,
    teacherJabatan,
    schedulesTodayCount,
    totalClassesCount,
    musyrifJabatan,
    totalSantriAsrama,
  ]);

  const activeIndex = activeMode === 'teacher' ? 0 : 1;

  const handleSelectIndex = useCallback((index: number) => {
    const selected = roleItems[index];
    if (selected && selected.id !== activeMode) {
      onSelectMode(selected.id);
    }
  }, [roleItems, activeMode, onSelectMode]);

  return (
    <View style={[styles.container, containerStyle]}>
      <GenericCarousel
        data={roleItems}
        activeIndex={activeIndex}
        onSelectIndex={handleSelectIndex}
        keyExtractor={(item) => item.id}
        showHeader={true}
        headerTitle="Pilih Ruang Kerja"
        headerIcon="account-switch"
        showChips={true}
        chipLabelExtractor={(item) => item.chipLabel}
        showCounterBadge={false}
        showDots={true}
        itemGap={12}
        peekWidth={18}
        renderItem={(item: RoleCardItem, index: number, isSelected: boolean, cardWidth: number) => {
          const cardWidthStyle = cardWidth ? { width: cardWidth } : { width: '100%' as const };

          return (
            <TouchableOpacity
              activeOpacity={0.92}
              onPress={() => onSelectMode(item.id)}
              style={styles.cardTouchable}
            >
              <LinearGradient
                colors={
                  isSelected
                    ? ['#108A55', '#0E7A4A', '#0B633C']
                    : ['rgba(255,255,255,0.22)', 'rgba(255,255,255,0.12)', 'rgba(255,255,255,0.06)']
                }
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[
                  styles.mainCard,
                  cardWidthStyle,
                  !isSelected && styles.inactiveCardBorder,
                ]}
              >
                {/* Lingkaran Dekoratif Glassmorphism */}
                <View pointerEvents="none" style={styles.cardDecorCircle} />

                {/* 1. Baris Paling Atas: Lencana Unit (Kiri) & Status Terpilih (Kanan) */}
                <View style={styles.topBar}>
                  <View style={styles.unitBadgeTop}>
                    <MaterialCommunityIcons
                      name={item.unitIcon}
                      size={12}
                      color="#FFFFFF"
                      style={{ marginRight: 4 }}
                    />
                    <Text numberOfLines={1} style={styles.unitText}>
                      {item.unitName}
                    </Text>
                  </View>

                  {/* Kanan: Indikator Pilihan Role */}
                  <View
                    style={[
                      styles.selectedActionBtnRight,
                      !isSelected && styles.selectedActionBtnRightInactive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? 'check-circle' : 'gesture-tap'}
                      size={15}
                      color={isSelected ? '#18A165' : '#FFFFFF'}
                    />
                    <Text
                      style={[
                        styles.selectedActionBtnText,
                        !isSelected && styles.selectedActionBtnTextInactive,
                      ]}
                    >
                      {isSelected ? 'Terpilih' : 'Pilih Peran'}
                    </Text>
                  </View>
                </View>

                {/* 2. Baris Profil Tengah: Avatar + Nama Pengguna + NIP/Tugas */}
                <View style={styles.profileRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => navigation?.navigate('Profil')}
                    style={[
                      styles.avatarBox,
                      !isSelected && styles.avatarBoxInactive,
                    ]}
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
                    <View style={styles.avatarVerifiedBadge}>
                      <MaterialCommunityIcons
                        name={item.roleBadgeIcon}
                        size={11}
                        color="#FFFFFF"
                      />
                    </View>
                  </TouchableOpacity>

                  <View style={styles.infoCol}>
                    <Text numberOfLines={2} style={styles.fullName}>
                      {displayName}
                    </Text>
                    <Text numberOfLines={1} style={styles.subTitleText}>
                      {item.subTitle}
                    </Text>
                  </View>
                </View>

                {/* 3. Kotak Atribut 3-Kolom Elegan Glassmorphic (Peran | Wilayah | Status) */}
                <View style={styles.attributesGrid}>
                  <View style={styles.attrBox}>
                    <View style={styles.attrLabelRow}>
                      <MaterialCommunityIcons
                        name={item.attr1.icon}
                        size={13}
                        color="#A7F3D0"
                        style={{ marginRight: 3 }}
                      />
                      <Text style={styles.attrLabel}>{item.attr1.label}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.attrValue}>
                      {item.attr1.value}
                    </Text>
                  </View>

                  <View style={styles.attrDivider} />

                  <View style={styles.attrBox}>
                    <View style={styles.attrLabelRow}>
                      <MaterialCommunityIcons
                        name={item.attr2.icon}
                        size={13}
                        color="#A7F3D0"
                        style={{ marginRight: 3 }}
                      />
                      <Text style={styles.attrLabel}>{item.attr2.label}</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.attrValue}>
                      {item.attr2.value}
                    </Text>
                  </View>

                  <View style={styles.attrDivider} />

                  <View style={styles.attrBox}>
                    <View style={styles.attrLabelRow}>
                      <MaterialCommunityIcons
                        name={item.attr3.icon}
                        size={13}
                        color="#A7F3D0"
                        style={{ marginRight: 3 }}
                      />
                      <Text style={styles.attrLabel}>{item.attr3.label}</Text>
                    </View>
                    <View style={styles.statusValueRow}>
                      <Text numberOfLines={1} style={styles.attrValue}>
                        {item.attr3.value}
                      </Text>
                      <View
                        style={[
                          styles.statusGreenDot,
                          { backgroundColor: item.attr3.dotColor },
                        ]}
                      />
                    </View>
                  </View>
                </View>

                {/* 4. Baris Tombol Aksi Bawah */}
                <View style={styles.actionsRow}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => onSelectMode(item.id)}
                    style={[
                      styles.actionBtn,
                      isSelected ? styles.actionBtnActive : styles.actionBtnInactive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? 'check-decagram' : 'arrow-right-circle'}
                      size={15}
                      color={isSelected ? '#059669' : '#047857'}
                      style={{ marginRight: 6 }}
                    />
                    <Text
                      style={[
                        styles.actionBtnText,
                        isSelected ? styles.actionBtnTextActive : styles.actionBtnTextInactive,
                      ]}
                    >
                      {isSelected ? item.activeActionLabel : item.switchActionLabel}
                    </Text>
                  </TouchableOpacity>
                </View>
              </LinearGradient>
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  cardTouchable: {
    width: '100%',
  },
  mainCard: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 14,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    ...Platform.select({
      ios: {
        shadowColor: '#004D32',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.25,
        shadowRadius: 10,
      },
      android: {
        elevation: 6,
      },
    }),
    overflow: 'hidden',
    position: 'relative',
  },
  inactiveCardBorder: {
    borderColor: 'rgba(255, 255, 255, 0.22)',
    opacity: 0.9,
    ...Platform.select({
      ios: {
        shadowOpacity: 0.1,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -50,
    right: -40,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    zIndex: 1,
  },
  unitBadgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 7,
    borderWidth: 0.6,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    maxWidth: '65%',
  },
  unitText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
    minWidth: 46,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    elevation: 0,
  },
  selectedActionBtnText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#FFFFFF',
  },
  profileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 1,
  },
  avatarBox: {
    width: 58,
    height: 58,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
    position: 'relative',
  },
  avatarBoxInactive: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  avatarVerifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
  },
  fullName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  subTitleText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    marginTop: 2,
  },
  attributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  attrBox: {
    flex: 1,
    alignItems: 'center',
  },
  attrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  attrLabel: {
    fontSize: 9.5,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  attrValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  statusValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  statusGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  attrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  actionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    zIndex: 1,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7.5,
    paddingHorizontal: 6,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(5, 150, 105, 0.28)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  actionBtnActive: {
    backgroundColor: '#FFFFFF',
    borderColor: 'rgba(5, 150, 105, 0.28)',
  },
  actionBtnInactive: {
    backgroundColor: '#F0FDF4',
    borderColor: 'rgba(5, 150, 105, 0.4)',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
  },
  actionBtnTextActive: {
    color: '#059669',
  },
  actionBtnTextInactive: {
    color: '#047857',
  },
});

export default DualRoleHeroCarousel;
