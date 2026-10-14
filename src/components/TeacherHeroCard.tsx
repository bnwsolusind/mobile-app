import React from 'react';
import {
  Animated,
  Image,
  Platform,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useAuthStore } from '../stores/authStore';
import { DEFAULT_PARENT_AVATAR, getProfileImageUrl } from '../utils/profile';
import { isTuRole } from '../utils/roles';

export interface TeacherHeroStat {
  label: string;
  value: string | number;
  icon?: keyof typeof MaterialCommunityIcons.glyphMap;
  color?: string;
  bg?: string;
}

export interface TeacherHeroAction {
  label: string;
  icon: keyof typeof MaterialCommunityIcons.glyphMap;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'outline';
}

export interface TeacherHeroCardProps {
  title?: string;
  subtitle?: string;
  badgeText?: string;
  badgeIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  stats?: TeacherHeroStat[];
  actions?: TeacherHeroAction[];
  style?: any;
  // Extended props for compatibility (user is read from store internally)
  user?: any;
  showActionButtons?: boolean;
  actionLabel?: string;
  actionIcon?: keyof typeof MaterialCommunityIcons.glyphMap;
  onPressAction?: () => void;
}

export function TeacherHeroCard({
  title,
  subtitle,
  badgeText = 'Tenaga Pendidik',
  badgeIcon = 'account-tie',
  stats,
  actions,
  style,
}: TeacherHeroCardProps) {
  const user = useAuthStore((state) => state.user);
  const isTu = isTuRole(user?.roles || []);
  const resolvedBadgeText = badgeText !== 'Tenaga Pendidik' ? badgeText : (isTu ? 'Tata Usaha & Staf' : 'Tenaga Pendidik');
  const resolvedBadgeIcon: any = badgeIcon !== 'account-tie' ? badgeIcon : (isTu ? 'card-account-details-outline' : 'account-tie');

  const teacherPhoto =
    getProfileImageUrl(user) ||
    (user as any)?.avatar ||
    (user as any)?.photo ||
    (user?.metadata as any)?.photo ||
    (user?.metadata as any)?.avatar;

  const teacherName =
    title ||
    user?.name ||
    user?.full_name ||
    (user as any)?.nama_lengkap ||
    'Ustadz Pengajar';

  const teacherNip =
    (user as any)?.nip ||
    (user?.metadata as any)?.nip ||
    (user as any)?.nuptk ||
    (user as any)?.employee_number ||
    'NIP. 19880512 201503 1 002';

  const teacherUnit =
    subtitle ||
    (user as any)?.unit_name ||
    (user?.metadata as any)?.unit ||
    (user?.metadata as any)?.unit_name ||
    'Pondok Pesantren';

  const teacherSpecialty =
    (user as any)?.position ||
    (user as any)?.jabatan ||
    (user?.metadata as any)?.specialty ||
    (user?.metadata as any)?.mapel ||
    (isTu ? 'Administrasi Sekolah' : 'Guru Pengampu SIT');

  return (
    <View style={[styles.cardOuterContainer, style]}>
      <LinearGradient
        colors={['#064E3B', '#0D6B42', '#18A165']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.heroCardGradient}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        {/* Top Identity Block */}
        <View style={styles.identityRow}>
          <View style={styles.avatarWrap}>
            {teacherPhoto ? (
              <Image
                source={{ uri: teacherPhoto }}
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
            <View style={styles.statusDot} />
          </View>

          <View style={styles.infoCol}>
            <View style={styles.badgeRow}>
              <View style={styles.roleBadge}>
                <MaterialCommunityIcons
                  name={resolvedBadgeIcon}
                  size={11}
                  color="#10B981"
                  style={{ marginRight: 4 }}
                />
                <Text style={styles.roleBadgeText}>{resolvedBadgeText}</Text>
              </View>
              <View style={styles.unitBadge}>
                <Text numberOfLines={1} style={styles.unitBadgeText}>
                  {teacherUnit}
                </Text>
              </View>
            </View>

            <Text numberOfLines={1} style={styles.teacherNameText}>
              {teacherName}
            </Text>
            <Text numberOfLines={1} style={styles.teacherSubText}>
              {teacherSpecialty} • {teacherNip}
            </Text>
          </View>
        </View>

        {/* KPI Metrik Stats Row */}
        {stats && stats.length > 0 && (
          <View style={styles.statsRow}>
            {stats.map((stat, idx) => (
              <View key={`stat-${idx}`} style={styles.statCol}>
                <View style={styles.statLabelRow}>
                  {stat.icon && (
                    <MaterialCommunityIcons
                      name={stat.icon}
                      size={12}
                      color={stat.color || '#A7F3D0'}
                      style={{ marginRight: 4 }}
                    />
                  )}
                  <Text numberOfLines={1} style={styles.statLabelText}>
                    {stat.label}
                  </Text>
                </View>
                <Text numberOfLines={1} style={styles.statValueText}>
                  {stat.value}
                </Text>
              </View>
            ))}
          </View>
        )}

        {/* Action Buttons Row */}
        {actions && actions.length > 0 && (
          <View style={styles.actionsRow}>
            {actions.map((act, idx) => {
              const isPrimary = act.variant === 'primary' || !act.variant;
              return (
                <TouchableOpacity
                  key={`act-${idx}`}
                  activeOpacity={0.82}
                  onPress={act.onPress}
                  style={[
                    styles.actionBtn,
                    isPrimary ? styles.actionBtnPrimary : styles.actionBtnSecondary,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={act.icon}
                    size={15}
                    color={isPrimary ? '#065F46' : '#FFFFFF'}
                    style={{ marginRight: 6 }}
                  />
                  <Text
                    style={[
                      styles.actionBtnText,
                      isPrimary
                        ? styles.actionBtnTextPrimary
                        : styles.actionBtnTextSecondary,
                    ]}
                  >
                    {act.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  cardOuterContainer: {
    marginHorizontal: 16,
    marginTop: 8,
    marginBottom: 12,
    borderRadius: 22,
    overflow: 'hidden',
    ...Platform.select({
      ios: {
        shadowColor: '#064E3B',
        shadowOffset: { width: 0, height: 6 },
        shadowOpacity: 0.18,
        shadowRadius: 12,
      },
      android: { elevation: 5 },
    }),
  },
  heroCardGradient: {
    padding: 16,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    width: 200,
    height: 200,
    borderRadius: 100,
    backgroundColor: 'rgba(255,255,255,0.06)',
    top: -60,
    right: -40,
  },
  decorCircle2: {
    position: 'absolute',
    width: 120,
    height: 120,
    borderRadius: 60,
    backgroundColor: 'rgba(255,255,255,0.04)',
    bottom: -30,
    left: 10,
  },
  identityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  avatarWrap: {
    width: 52,
    height: 52,
    borderRadius: 17,
    borderWidth: 2,
    borderColor: '#FFFFFF',
    overflow: 'hidden',
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  avatarImg: {
    width: '100%',
    height: '100%',
  },
  statusDot: {
    position: 'absolute',
    bottom: 2,
    right: 2,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#10B981',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  infoCol: {
    flex: 1,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  roleBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  roleBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  unitBadge: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    maxWidth: '50%',
  },
  unitBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  teacherNameText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  teacherSubText: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
    marginTop: 2,
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.18)',
    gap: 10,
  },
  statCol: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.18)',
  },
  statLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  statLabelText: {
    fontSize: 10,
    fontWeight: '600',
    color: 'rgba(255,255,255,0.85)',
  },
  statValueText: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
  },
  actionBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 12,
  },
  actionBtnPrimary: {
    backgroundColor: '#FFFFFF',
    ...Platform.select({
      ios: {
        shadowColor: '#000000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 3,
      },
      android: { elevation: 2 },
    }),
  },
  actionBtnSecondary: {
    backgroundColor: 'rgba(255,255,255,0.2)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.3)',
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '800',
  },
  actionBtnTextPrimary: {
    color: '#065F46',
  },
  actionBtnTextSecondary: {
    color: '#FFFFFF',
  },
});
