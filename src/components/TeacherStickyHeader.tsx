import React, { useMemo, useState, useEffect } from 'react';
import {
  Animated,
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
import { useAuthStore } from '../stores/authStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { DEFAULT_PARENT_AVATAR, getProfileImageUrl } from '../utils/profile';

import { isTuRole } from '../utils/roles';

export interface TeacherQuickChip {
  id: string;
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  iconColor?: string;
  bgColor?: string;
  textColor?: string;
  borderColor?: string;
  flex?: number;
  active?: boolean;
  onPress?: () => void;
}

export interface TeacherStickyTab {
  id: string;
  label: string;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  count?: number | string;
  active?: boolean;
  onPress: () => void;
}

export interface TeacherStickyHeaderProps {
  scrollY: Animated.Value;
  topInset: number;
  title: string;
  subtitle?: string;
  navigation: any;
  route?: any;
  quickChips?: TeacherQuickChip[];
  tabs?: TeacherStickyTab[];
  customTabBar?: React.ReactNode;
  equalColumns?: boolean;
  onBack?: () => void;
  // Extended props for dynamic role and attendance status
  attendanceStatusText?: string;
  attendanceStatusColor?: string;
  roleBadgeText?: string;
  actionRoute?: string;
  actionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  actionLabel?: string;
  user?: any;
  chips?: Array<{ label: string; active?: boolean; onPress?: () => void }>;
  stats?: Array<{ label: string; value: string | number; icon?: keyof typeof MaterialCommunityIcons.glyphMap; color?: string; bg?: string; borderColor?: string }>;
}

export function TeacherStickyHeader({
  scrollY,
  topInset,
  title,
  subtitle,
  navigation,
  route,
  quickChips,
  tabs,
  customTabBar,
  equalColumns,
  onBack,
  attendanceStatusText,
  attendanceStatusColor,
  roleBadgeText,
  actionRoute,
  actionIcon,
  actionLabel,
  stats,
  chips,
}: TeacherStickyHeaderProps) {
  const user = useAuthStore((state) => state.user);
  const unreadNotificationCount = useNotificationBadgeStore(
    (state) => state.unreadNotificationCount
  );

  const teacherPhoto =
    getProfileImageUrl(user) ||
    (user as any)?.avatar ||
    (user as any)?.photo ||
    (user?.metadata as any)?.photo ||
    (user?.metadata as any)?.avatar;

  const teacherName =
    user?.name ||
    user?.full_name ||
    (user as any)?.nama_lengkap ||
    'Ustadz Pengajar';

  const teacherNip =
    (user as any)?.nip ||
    (user?.metadata as any)?.nip ||
    (user as any)?.nuptk ||
    (user as any)?.employee_number ||
    (user?.metadata as any)?.employee_id ||
    '';

  const teacherUnit =
    subtitle ||
    (user as any)?.education_unit?.name ||
    (user as any)?.education_unit?.nama_unit ||
    (user as any)?.unit_name ||
    (user as any)?.unit?.name ||
    (user?.metadata as any)?.unit ||
    (user?.metadata as any)?.unit_name ||
    'Unit Pendidikan';

  const handleBackPress = () => {
    if (onBack) {
      onBack();
      return;
    }
    const handled = useNavigationHistoryStore
      .getState()
      .goBackDynamic(navigation, route?.params);
    if (handled) return;
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda');
    }
  };

  const [isStickyVisible, setIsStickyVisible] = useState(false);

  useEffect(() => {
    const listenerId = scrollY.addListener(({ value }) => {
      const isVisible = value > 45;
      setIsStickyVisible((prev) => (prev !== isVisible ? isVisible : prev));
    });
    return () => {
      scrollY.removeListener(listenerId);
    };
  }, [scrollY]);

  const teacherStickyOpacity = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [45, 95],
      outputRange: [0, 1],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  const teacherStickyTranslateY = useMemo(() => {
    return scrollY.interpolate({
      inputRange: [45, 95],
      outputRange: [-20, 0],
      extrapolate: 'clamp',
    });
  }, [scrollY]);

  return (
    <Animated.View
      pointerEvents={isStickyVisible ? 'box-none' : 'none'}
      style={[
        styles.teacherStickyHeaderWrapper,
        {
          paddingTop: topInset + 4,
          opacity: teacherStickyOpacity,
          transform: [{ translateY: teacherStickyTranslateY }],
        },
      ]}
    >
      <View
        style={[
          StyleSheet.absoluteFill,
          { overflow: 'hidden', pointerEvents: 'none' },
        ]}
      >
        <LinearGradient
          colors={['rgba(240, 253, 244, 0.98)', 'rgba(236, 253, 245, 0.96)', 'rgba(240, 253, 244, 0.98)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.teacherStickyDecorCircle1} />
        <View style={styles.teacherStickyDecorCircle2} />
      </View>

      {/* Top Bar Row: Back, Title, Notification Bell, Avatar */}
      <View style={styles.teacherStickyTopRow}>
        <View style={styles.teacherStickyBrandGroup}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={handleBackPress}
            style={styles.teacherStickySquircleBackBtn}
            accessibilityRole="button"
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={18} color="#059669" />
          </TouchableOpacity>
          <View style={styles.teacherStickyBrandTextCol}>
            <Text numberOfLines={1} style={styles.teacherStickyBrandLabel}>
              {title}
            </Text>
            <Text numberOfLines={1} style={styles.teacherStickyBrandSub}>
              {teacherUnit}
            </Text>
          </View>
        </View>

        <View style={styles.teacherStickyTopRightActions}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Notifikasi')}
            style={styles.teacherStickySquircleActionBtn}
            accessibilityLabel="Notifikasi"
          >
            <MaterialCommunityIcons name="bell-outline" size={18} color="#059669" />
            {unreadNotificationCount > 0 && (
              <View style={styles.teacherStickyBellBadgeDot} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.navigate('Profil')}
            style={styles.teacherStickyAvatarSquircleBtn}
            accessibilityLabel="Profil"
          >
            {teacherPhoto ? (
              <Image
                source={{ uri: teacherPhoto }}
                style={styles.teacherStickyTopAvatarImg}
                resizeMode="cover"
              />
            ) : (
              <Image
                source={DEFAULT_PARENT_AVATAR}
                style={styles.teacherStickyTopAvatarImg}
                resizeMode="cover"
              />
            )}
          </TouchableOpacity>
        </View>
      </View>

      {/* Tab Switcher Sticky: Bahan Ajar & Modul Ajar di sticky header */}
      {tabs && tabs.length > 0 && (
        <View style={styles.teacherStickyTabBarContainer}>
          {tabs.map((tab) => {
            const isActive = Boolean(tab.active);
            return (
              <TouchableOpacity
                key={tab.id}
                activeOpacity={0.85}
                onPress={tab.onPress}
                style={[
                  styles.teacherStickyTabBtn,
                  isActive && styles.teacherStickyTabBtnActive,
                ]}
              >
                {tab.icon && (
                  <MaterialCommunityIcons
                    name={tab.icon}
                    size={14}
                    color={isActive ? '#FFFFFF' : '#065F46'}
                    style={{ marginRight: 5 }}
                  />
                )}
                <Text
                  numberOfLines={1}
                  style={[
                    styles.teacherStickyTabBtnText,
                    isActive && styles.teacherStickyTabBtnTextActive,
                  ]}
                >
                  {tab.label}
                </Text>
                {tab.count !== undefined && tab.count !== null && (
                  <View
                    style={[
                      styles.teacherStickyTabBadge,
                      isActive && styles.teacherStickyTabBadgeActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.teacherStickyTabBadgeText,
                        isActive && styles.teacherStickyTabBadgeTextActive,
                      ]}
                    >
                      {tab.count}
                    </Text>
                  </View>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}

      {customTabBar}

      {/* Rich Teacher Identity Card Inside Sticky Header — Hanya saat ada stats atau chips */}
      {Boolean((stats && stats.length > 0) || (chips && chips.length > 0) || (quickChips && quickChips.length > 0)) && (
        <View style={{ marginHorizontal: 12, marginBottom: 0 }}>
          <LinearGradient
            colors={['rgba(255, 255, 255, 0.95)', 'rgba(236, 253, 245, 0.90)']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.teacherStickyRichCard, { padding: 12, borderRadius: 18 }]}
          >
            <View style={styles.cardDecorCircle} />

            <View style={styles.teacherStickyRichCardTopRow}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={() => navigation?.navigate('Profil')}
                style={styles.teacherStickyRichAvatarWrap}
              >
                {teacherPhoto ? (
                  <Image
                    source={{ uri: teacherPhoto }}
                    style={styles.teacherStickyRichAvatarImg}
                    resizeMode="cover"
                  />
                ) : (
                  <Image
                    source={DEFAULT_PARENT_AVATAR}
                    style={styles.teacherStickyRichAvatarImg}
                    resizeMode="cover"
                  />
                )}
              </TouchableOpacity>

              <View style={styles.teacherStickyRichInfoCol}>
                <Text numberOfLines={1} style={styles.teacherStickyRichTeacherName}>
                  {teacherName}
                </Text>
                {Boolean(teacherNip && !teacherNip.toLowerCase().includes('tes') && !teacherNip.toLowerCase().includes('test') && teacherNip !== '—') && (
                  <Text numberOfLines={1} style={styles.teacherStickyRichNisText}>
                    ID/NIP: {teacherNip}
                  </Text>
                )}
                <View style={styles.teacherStickyRichUnitBadge}>
                  <MaterialCommunityIcons
                    name="school"
                    size={10}
                    color="#059669"
                    style={{ marginRight: 3 }}
                  />
                  <Text numberOfLines={1} style={styles.teacherStickyRichUnitText}>
                    {teacherUnit}
                  </Text>
                </View>
                <View style={styles.teacherStickyRichMetaRow}>
                  <Text numberOfLines={1} style={styles.teacherStickyRichMetaText}>
                    {roleBadgeText || (isTuRole(user?.roles || []) ? 'Tata Usaha & Administrasi' : 'Guru / Pengajar')}
                  </Text>
                  <Text style={styles.teacherStickyRichMetaSep}> • </Text>
                  <View
                    style={[
                      styles.teacherStickyRichPresensiDot,
                      { backgroundColor: attendanceStatusColor || '#10B981', marginRight: 3 },
                    ]}
                  />
                  <Text
                    numberOfLines={1}
                    style={[
                      styles.teacherStickyRichMetaText,
                      { color: attendanceStatusColor ? '#059669' : '#059669', fontSize: 9 },
                    ]}
                  >
                    {attendanceStatusText || 'Aktif'}
                  </Text>
                </View>
              </View>

              <View style={styles.teacherStickyRichMiniActions}>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => navigation?.navigate('Notifikasi')}
                  style={styles.teacherStickyMiniBtn}
                  accessibilityLabel="Notifikasi"
                >
                  <MaterialCommunityIcons
                    name="bell-ring-outline"
                    size={16}
                    color="#059669"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => navigation?.navigate(actionRoute || (isTuRole(user?.roles || []) ? 'Data' : 'Jadwal'))}
                  style={styles.teacherStickyMiniBtn}
                  accessibilityLabel={actionLabel || (isTuRole(user?.roles || []) ? 'Kelola Data' : 'Jadwal')}
                >
                  <MaterialCommunityIcons
                    name={actionIcon || (isTuRole(user?.roles || []) ? 'folder-outline' : 'calendar-clock')}
                    size={16}
                    color="#059669"
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={() => navigation?.navigate('Profil')}
                  style={styles.teacherStickyMiniBtn}
                  accessibilityLabel="Profil"
                >
                  <MaterialCommunityIcons
                    name="account-circle-outline"
                    size={16}
                    color="#059669"
                  />
                </TouchableOpacity>
              </View>
            </View>

          {/* KPI Metrik Stats Row di dalam Sticky Header (Hadir, Dinas Luar, Terlambat, Izin/Sakit) */}
          {stats && stats.length > 0 && (
            <View style={styles.teacherStickyStatsRow}>
              {stats.map((st, idx) => (
                <View
                  key={`sticky-stat-${idx}`}
                  style={[
                    styles.teacherStickyStatCard,
                    st.bg ? { backgroundColor: st.bg } : undefined,
                    st.borderColor ? { borderColor: st.borderColor } : undefined,
                  ]}
                >
                  <View style={styles.teacherStickyStatTop}>
                    {st.icon && (
                      <MaterialCommunityIcons
                        name={st.icon}
                        size={11}
                        color={st.color || '#A7F3D0'}
                        style={{ marginRight: 3 }}
                      />
                    )}
                    <Text numberOfLines={1} style={[styles.teacherStickyStatLabel, st.color ? { color: st.color } : undefined]}>
                      {st.label}
                    </Text>
                  </View>
                  <Text numberOfLines={1} style={[styles.teacherStickyStatValue, st.color ? { color: st.color } : undefined]}>
                    {st.value}
                  </Text>
                </View>
              ))}
            </View>
          )}

          {/* Chips Tab Filter Navigasi */}
          {chips && chips.length > 0 && (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.teacherStickyChipsScroll}
              style={styles.teacherStickyChipsScrollWrapper}
            >
              {chips.map((chip, idx) => (
                <TouchableOpacity
                  key={`sticky-chip-${idx}`}
                  activeOpacity={0.8}
                  onPress={chip.onPress}
                  style={[
                    styles.teacherStickyFilterChip,
                    chip.active && styles.teacherStickyFilterChipActive,
                  ]}
                >
                  <Text
                    style={[
                      styles.teacherStickyFilterChipText,
                      chip.active && styles.teacherStickyFilterChipTextActive,
                    ]}
                  >
                    {chip.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </ScrollView>
          )}

          {/* Quick Action Chips Row (Horizontal Scroll atau Equal Columns) */}
          {quickChips && quickChips.length > 0 && (
            equalColumns ? (
              <View style={styles.teacherStickyQuickChipEqualRow}>
                {quickChips.map((chip) => {
                  const isActive = Boolean(chip.active);
                  return (
                    <TouchableOpacity
                      key={chip.id}
                      activeOpacity={0.78}
                      onPress={chip.onPress}
                      style={[
                        styles.teacherStickyQuickChipEqual,
                        chip.bgColor ? { backgroundColor: chip.bgColor } : undefined,
                        chip.borderColor ? { borderColor: chip.borderColor } : undefined,
                        isActive && {
                          backgroundColor: chip.bgColor || '#065F46',
                          borderColor: 'rgba(255, 255, 255, 0.45)',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={chip.icon}
                        size={14}
                        color={
                          isActive
                            ? (chip.textColor || '#FFFFFF')
                            : (chip.iconColor || '#059669')
                        }
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.teacherStickyQuickChipText,
                          chip.textColor ? { color: chip.textColor } : undefined,
                          isActive && { color: chip.textColor || '#FFFFFF' },
                        ]}
                      >
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            ) : (
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.teacherStickyQuickChipScroll}
                style={styles.teacherStickyQuickChipScrollWrapper}
              >
                {quickChips.map((chip) => {
                  const isActive = Boolean(chip.active);
                  return (
                    <TouchableOpacity
                      key={chip.id}
                      activeOpacity={0.78}
                      onPress={chip.onPress}
                      style={[
                        styles.teacherStickyQuickChip,
                        chip.bgColor ? { backgroundColor: chip.bgColor } : undefined,
                        chip.borderColor ? { borderColor: chip.borderColor } : undefined,
                        isActive && {
                          backgroundColor: chip.bgColor || '#065F46',
                          borderColor: 'rgba(255, 255, 255, 0.45)',
                        },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={chip.icon}
                        size={13}
                        color={
                          isActive
                            ? (chip.textColor || '#FFFFFF')
                            : (chip.iconColor || '#059669')
                        }
                      />
                      <Text
                        numberOfLines={1}
                        style={[
                          styles.teacherStickyQuickChipText,
                          chip.textColor ? { color: chip.textColor } : undefined,
                          isActive && { color: chip.textColor || '#FFFFFF' },
                        ]}
                      >
                        {chip.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )
          )}
        </LinearGradient>
      </View>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  teacherStickyHeaderWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
  },
  teacherStickyDecorCircle1: {
    position: 'absolute',
    width: 220,
    height: 220,
    borderRadius: 110,
    backgroundColor: 'rgba(16, 185, 129, 0.06)',
    top: -80,
    right: -50,
  },
  teacherStickyDecorCircle2: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    bottom: -30,
    left: 20,
  },
  teacherStickyTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  teacherStickyBrandGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 10,
  },
  teacherStickySquircleBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  teacherStickyBrandTextCol: {
    flex: 1,
  },
  teacherStickyBrandLabel: {
    fontSize: 15,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  teacherStickyBrandSub: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  teacherStickyTopRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teacherStickySquircleActionBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  teacherStickyBellBadgeDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  teacherStickyAvatarSquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 13,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    backgroundColor: '#DEF7EC',
  },
  teacherStickyTopAvatarImg: {
    width: '100%',
    height: '100%',
  },
  teacherStickyRichCard: {
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    ...Platform.select({
      ios: {
        shadowColor: '#064E3B',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 6,
      },
      android: { elevation: 3 },
    }),
  },
  cardDecorCircle: {
    position: 'absolute',
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(16, 185, 129, 0.04)',
    top: -40,
    right: -20,
  },
  teacherStickyRichCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  teacherStickyRichAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    borderWidth: 1.8,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#DEF7EC',
  },
  teacherStickyRichAvatarImg: {
    width: '100%',
    height: '100%',
  },
  teacherStickyRichInfoCol: {
    flex: 1,
    minWidth: 0,
  },
  teacherStickyRichTeacherName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: -0.2,
  },
  teacherStickyRichNisText: {
    fontSize: 9.5,
    color: '#059669',
    fontWeight: '600',
    marginTop: 1,
  },
  teacherStickyRichUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#DEF7EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 6,
    paddingHorizontal: 5,
    paddingVertical: 1,
    marginTop: 2,
    maxWidth: '90%',
  },
  teacherStickyRichUnitText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#059669',
  },
  teacherStickyRichMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  teacherStickyRichMetaText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
  },
  teacherStickyRichMetaSep: {
    fontSize: 8,
    color: '#94A3B8',
  },
  teacherStickyRichPresensiDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
  },
  teacherStickyRichMiniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  teacherStickyMiniBtn: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.08,
        shadowRadius: 2,
      },
      android: { elevation: 2 },
    }),
  },
  teacherStickyQuickChipScrollWrapper: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  teacherStickyQuickChipScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingRight: 8,
  },
  teacherStickyQuickChip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingVertical: 6,
    paddingHorizontal: 11,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  teacherStickyQuickChipText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.1,
  },
  teacherStickyQuickChipEqualRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
  },
  teacherStickyQuickChipEqual: {
    flex: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    ...Platform.select({
      ios: {
        shadowColor: '#059669',
        shadowOffset: { width: 0, height: 1.5 },
        shadowOpacity: 0.12,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  teacherStickyStatsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.18)',
  },
  teacherStickyStatCard: {
    flex: 1,
    minWidth: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.16)',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
    paddingVertical: 5,
    paddingHorizontal: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherStickyStatTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  teacherStickyStatLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#E6FFFA',
    letterSpacing: 0.1,
  },
  teacherStickyStatValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
    marginTop: 1,
  },
  teacherStickyChipsScrollWrapper: {
    marginTop: 8,
  },
  teacherStickyChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingRight: 6,
  },
  teacherStickyFilterChip: {
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  teacherStickyFilterChipActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  teacherStickyFilterChipText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  teacherStickyFilterChipTextActive: {
    color: '#059669',
  },
  teacherStickyTabBarContainer: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 3.5,
    marginHorizontal: 16,
    marginBottom: 8,
    marginTop: 4,
    gap: 4,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  teacherStickyTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7,
    paddingHorizontal: 8,
    borderRadius: 10,
  },
  teacherStickyTabBtnActive: {
    backgroundColor: '#059669',
    elevation: 2,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.2,
    shadowRadius: 3,
  },
  teacherStickyTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  teacherStickyTabBtnTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  teacherStickyTabBadge: {
    marginLeft: 5,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 99,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  teacherStickyTabBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  teacherStickyTabBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  teacherStickyTabBadgeTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
