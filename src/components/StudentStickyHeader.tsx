import React, { useMemo, useRef } from 'react';
import {
  Animated,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import {
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  getProfileImageUrl,
  getStudentAvatarSource,
  isGirlStudent,
} from '../utils/profile';
import { isParentRole, isStudentRole } from '../utils/roles';

/**
 * Header lengket bersama untuk halaman portal siswa
 * (Tugas, Jadwal, Materi): baris atas + kartu siswa + chips anak.
 * Seluruh warna, ikon, dan teks fallback terpusat di DEFAULTS bawah —
 * layar pemanggil hanya mengirim data mentah + aksi spesifik halaman,
 * sehingga tidak ada nilai hardcode yang tersebar di tiap screen.
 */

export const STICKY_SCROLL_THRESHOLDS = {
  fadeStart: 60,
  fadeEnd: 125,
  hiddenOffset: -320,
  peekOffset: -20,
  shownOffset: 0,
} as const;

export const STICKY_HEADER_PALETTE = {
  gradient: ['#0D6B42', '#18A165', '#2BD988'],
  titleText: '#FFFFFF',
  squircleIcon: '#059669',
  miniActionIcon: '#059669',
  cardButtonText: '#059669',
  secondaryButtonText: '#2563EB',
  primaryButtonBg: '#FFFFFF',
  primaryButtonText: '#7C3AED',
  chipIconSelected: '#064E3B',
  chipIconIdle: '#FFFFFF',
  bellDot: '#EF4444',
} as const;

export const STICKY_HEADER_TEXTS = {
  fallbackName: 'Siswa',
  fallbackChildShortName: 'Ananda',
  fallbackUnit: 'Unit Pendidikan',
  fallbackDash: '-',
  nisPrefix: 'NIS:',
  nisnSeparator: '· NISN:',
  cardButton: 'Kartu Siswa',
  menuButton: 'Menu',
  backAccessibility: 'Kembali',
  notificationAccessibility: 'Notifikasi',
  weeklyReportAccessibility: 'Laporan Perkembangan',
  qrAccessibility: 'QR Code Siswa',
} as const;

export const STICKY_HEADER_ICONS = {
  back: 'arrow-left',
  bell: 'bell-outline',
  bellRing: 'bell-ring-outline',
  weeklyReport: 'clipboard-text-outline',
  qr: 'qrcode-scan',
  school: 'school',
  idCard: 'card-account-details',
  menu: 'view-grid',
  chipSelected: 'check-circle',
  chipIdle: 'account-circle-outline',
} as const;

export interface ResolvedStudentDisplay {
  displayName: string;
  firstName: string;
  nis: string;
  nisn: string;
  kelas: string;
  unit: string;
  avatarUri: string | null;
  defaultAvatar: any;
}

/** Turunan tampilan kartu siswa dari data mentah (satu-satunya tempat fallback). */
export function resolveStudentDisplay(student: any, user?: any): ResolvedStudentDisplay {
  const displayName =
    student?.name ||
    student?.full_name ||
    student?.nama_lengkap ||
    user?.name ||
    STICKY_HEADER_TEXTS.fallbackName;
  const firstName =
    String(student?.name || student?.full_name || student?.nama_lengkap || '')
      .trim()
      .split(' ')[0] || STICKY_HEADER_TEXTS.fallbackChildShortName;
  const isGirl = isGirlStudent(student);
  const kelas =
    typeof student?.kelas === 'object'
      ? String(student?.kelas?.nama_kelas || student?.kelas?.name || STICKY_HEADER_TEXTS.fallbackDash)
      : String(student?.class_name || (typeof student?.kelas === 'string' ? student.kelas : '') || STICKY_HEADER_TEXTS.fallbackDash);
  const unit = String(
    (student?.education_unit && typeof student.education_unit === 'object'
      ? student.education_unit?.name || student.education_unit?.nama
      : '') ||
    student?.kelas?.unit_pendidikan?.name ||
    student?.kelas?.unit_pendidikan?.nama ||
    student?.kelas?.unitPendidikan?.name ||
    student?.kelas?.unitPendidikan?.nama ||
    student?.unit_name ||
    (student?.unit && typeof student.unit === 'object'
      ? student.unit?.name || student.unit?.nama
      : (typeof student?.unit === 'string' ? student.unit : '')) ||
    user?.unit_name ||
    (user as any)?.unit?.name ||
    STICKY_HEADER_TEXTS.fallbackUnit
  );
  return {
    displayName: String(displayName),
    firstName,
    nis: String(student?.nis || student?.student_nis || STICKY_HEADER_TEXTS.fallbackDash),
    nisn: String(student?.nisn || student?.student_nisn || ''),
    kelas: String(kelas),
    unit: String(unit),
    avatarUri: getProfileImageUrl(student),
    defaultAvatar: getStudentAvatarSource(student),
  };
}

/** State scroll 60fps bersama: hubungkan scrollY ke onScroll ScrollView utama. */
export function useStickyScroll() {
  const scrollY = useRef(new Animated.Value(0)).current;
  const handleMainScroll = useMemo(
    () =>
      Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], {
        useNativeDriver: true,
      }),
    [scrollY]
  );
  return { scrollY, handleMainScroll };
}

export interface StickyMiddleAction {
  label: string;
  icon: string;
  onPress: () => void;
}

export interface StudentStickyHeaderProps {
  scrollY: Animated.Value;
  topInset: number;
  title: string;
  navigation: any;
  route?: any;
  /** Siswa aktif (objek mentah); fallback tampilan dihitung di dalam. */
  student: any;
  user?: any;
  childrenList?: any[];
  selectedChildId?: string;
  onSelectChild: (childId: string, index: number) => void;
  /** Tombol tengah — satu-satunya yang boleh beda per halaman. */
  middleAction: StickyMiddleAction;
  onOpenIdCard: (student: any) => void;
  onOpenWeeklyReport: (student: any) => void;
  onOpenMenu: (student: any) => void;
  onOpenNotifications?: (student: any) => void;
  /** Aksi khusus tombol QR (default: sama dengan onOpenIdCard). */
  onOpenQr?: (student: any) => void;
  palette?: Partial<typeof STICKY_HEADER_PALETTE>;
  texts?: Partial<typeof STICKY_HEADER_TEXTS>;
  icons?: Partial<typeof STICKY_HEADER_ICONS>;
}

export const StudentStickyHeader: React.FC<StudentStickyHeaderProps> = ({
  scrollY,
  topInset,
  title,
  navigation,
  route,
  student,
  user,
  childrenList = [],
  selectedChildId,
  onSelectChild,
  middleAction,
  onOpenIdCard,
  onOpenWeeklyReport,
  onOpenMenu,
  onOpenNotifications,
  onOpenQr,
  palette: paletteOverride,
  texts: textsOverride,
  icons: iconsOverride,
}) => {
  const palette = { ...STICKY_HEADER_PALETTE, ...paletteOverride };
  const texts = { ...STICKY_HEADER_TEXTS, ...textsOverride };
  const icons = { ...STICKY_HEADER_ICONS, ...iconsOverride };
  const unreadNotificationCount = useNotificationBadgeStore(
    (state) => state.unreadNotificationCount
  );

  const userRoles = user?.roles || [];
  const isParent = isParentRole(userRoles);
  const isStudent = isStudentRole(userRoles);

  // Jika akun adalah Guru / Pegawai dan bukan wali murid / siswa, jangan tampilkan header kartu siswa
  if (userRoles.length > 0 && !isParent && !isStudent && !student) {
    return null;
  }

  const display = useMemo(() => resolveStudentDisplay(student, user), [student, user]);

  const stickyOpacity = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [STICKY_SCROLL_THRESHOLDS.fadeStart, STICKY_SCROLL_THRESHOLDS.fadeEnd],
        outputRange: [0, 1],
        extrapolate: 'clamp',
      }),
    [scrollY]
  );
  const stickyTranslateY = useMemo(
    () =>
      scrollY.interpolate({
        inputRange: [
          0,
          STICKY_SCROLL_THRESHOLDS.fadeStart - 0.1,
          STICKY_SCROLL_THRESHOLDS.fadeStart,
          STICKY_SCROLL_THRESHOLDS.fadeEnd,
        ],
        outputRange: [
          STICKY_SCROLL_THRESHOLDS.hiddenOffset,
          STICKY_SCROLL_THRESHOLDS.hiddenOffset,
          STICKY_SCROLL_THRESHOLDS.peekOffset,
          STICKY_SCROLL_THRESHOLDS.shownOffset,
        ],
        extrapolate: 'clamp',
      }),
    [scrollY]
  );

  const handleBack = () => {
    const currentActiveChildId = (student as any)?.id || (student as any)?.student_id || selectedChildId || useActiveChildStore.getState().activeChildId || route?.params?.child_id || route?.params?.student_id;
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation, {
      ...route?.params,
      child_id: currentActiveChildId,
      student_id: currentActiveChildId,
    });
    if (handled) return;
    if (currentActiveChildId) {
      navigation?.navigate('Beranda', {
        reopen_child_portal_id: String(currentActiveChildId),
        reopen_timestamp: Date.now(),
      });
      return;
    }
    if (navigation?.canGoBack?.()) {
      navigation.goBack();
    } else {
      navigation?.navigate('Beranda');
    }
  };

  const showNisn = display.nisn && display.nisn !== texts.fallbackDash;

  return (
    <Animated.View
      style={[
        styles.stickyHeaderBar,
        {
          paddingTop: topInset + 6,
          opacity: stickyOpacity,
          transform: [{ translateY: stickyTranslateY }],
          pointerEvents: 'box-none',
        },
      ]}
    >
      {/* Background disamakan card siswa, bawah dipotong agar melayang */}
      <View style={[StyleSheet.absoluteFill, { bottom: 40, overflow: 'hidden', pointerEvents: 'none' }]}>
        <LinearGradient
          colors={[palette.gradient[0], palette.gradient[1], palette.gradient[2]]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.stickyDecorCircle1} />
        <View style={styles.stickyDecorCircle2} />
      </View>

      {/* Baris Atas Sticky Header */}
      <View style={styles.stickyHeaderTopRow}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleBack}
          style={styles.stickySquircleBtn}
          accessibilityRole="button"
          accessibilityLabel={texts.backAccessibility}
        >
          <MaterialCommunityIcons name={icons.back as never} size={20} color={palette.squircleIcon} />
        </TouchableOpacity>

        <View style={styles.stickyLeftIdentity}>
          <View style={styles.stickyTextCol}>
            <Text numberOfLines={1} style={styles.stickyTitleText}>
              {title}
            </Text>
          </View>
        </View>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={onOpenNotifications ? () => onOpenNotifications(student) : () => navigation?.navigate('Notifikasi')}
          style={styles.stickySquircleBtn}
          accessibilityRole="button"
          accessibilityLabel={texts.notificationAccessibility}
        >
          <MaterialCommunityIcons name={icons.bell as never} size={20} color={palette.squircleIcon} />
          {unreadNotificationCount > 0 && (
            <View style={[styles.heroBellDot, { backgroundColor: palette.bellDot }]} />
          )}
        </TouchableOpacity>
      </View>

      {/* Card Siswa di dalam Sticky Header */}
      <View style={styles.stickyStudentCardOuter}>
        <LinearGradient
          colors={[palette.gradient[0], palette.gradient[1], palette.gradient[2]]}
          locations={[0, 0.55, 1]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.stickyStudentCardGradient}
        >
          <View style={styles.stickyCardDecorCircle} />

          <View style={styles.stickyCardTopRow}>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={() => onOpenIdCard(student)}
              style={styles.stickyAvatarBorderWrap}
            >
              <Image
                source={display.avatarUri ? { uri: display.avatarUri } : display.defaultAvatar}
                style={styles.stickyAvatarImgLarge}
                resizeMode="cover"
              />
            </TouchableOpacity>

            <View style={styles.stickyStudentInfoCol}>
              <Text numberOfLines={1} style={styles.stickyStudentFullName}>
                {display.displayName}
              </Text>
              <Text numberOfLines={1} style={styles.stickyStudentNisText}>
                {texts.nisPrefix} {display.nis}{' '}
                {showNisn ? `${texts.nisnSeparator} ${display.nisn}` : ''}
              </Text>
              <View style={styles.stickyStudentUnitBadge}>
                <MaterialCommunityIcons
                  name={icons.school as never}
                  size={10}
                  color="#FFFFFF"
                  style={{ marginRight: 3 }}
                />
                <Text numberOfLines={1} style={styles.stickyStudentUnitText}>
                  {display.kelas} • {display.unit}
                </Text>
              </View>
            </View>

            {/* 3 Tombol Aksi Mini (Persis HomeScreen: Notifikasi, Laporan, QR) */}
            <View style={styles.stickyRichMiniActions}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onOpenNotifications ? () => onOpenNotifications(student) : () => navigation?.navigate('Notifikasi')}
                style={styles.stickyMiniBtn}
                accessibilityLabel={texts.notificationAccessibility}
              >
                <MaterialCommunityIcons name={icons.bellRing as never} size={16} color={palette.miniActionIcon} />
                {unreadNotificationCount > 0 && (
                  <View
                    style={{
                      position: 'absolute',
                      top: -2,
                      right: -2,
                      width: 8,
                      height: 8,
                      borderRadius: 4,
                      backgroundColor: palette.bellDot,
                      borderWidth: 1.5,
                      borderColor: '#FFFFFF',
                    }}
                  />
                )}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => onOpenWeeklyReport(student)}
                style={styles.stickyMiniBtn}
                accessibilityLabel={texts.weeklyReportAccessibility}
              >
                <MaterialCommunityIcons name={icons.weeklyReport as never} size={16} color={palette.miniActionIcon} />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => (onOpenQr || onOpenIdCard)(student)}
                style={styles.stickyMiniBtn}
                accessibilityLabel={texts.qrAccessibility}
              >
                <MaterialCommunityIcons name={icons.qr as never} size={16} color={palette.miniActionIcon} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Quick Action Chips (HANYA 1 BARIS RAMPING Persis HomeScreen) */}
          <View style={styles.stickyQuickChipRow}>
            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => onOpenIdCard(student)}
              style={styles.stickyQuickChip}
            >
              <MaterialCommunityIcons
                name={icons.idCard as never}
                size={14}
                color={palette.cardButtonText}
              />
              <Text numberOfLines={1} style={[styles.stickyQuickChipText, { color: palette.cardButtonText }]}>
                {texts.cardButton}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.78}
              onPress={middleAction.onPress}
              style={styles.stickyQuickChipSecondary}
            >
              <MaterialCommunityIcons
                name={middleAction.icon as never}
                size={14}
                color={palette.secondaryButtonText}
              />
              <Text
                numberOfLines={1}
                style={[styles.stickyQuickChipSecondaryText, { color: palette.secondaryButtonText }]}
              >
                {middleAction.label}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.78}
              onPress={() => onOpenMenu(student)}
              style={styles.stickyQuickChipPrimary}
            >
              <MaterialCommunityIcons
                name={icons.menu as never}
                size={14}
                color={palette.primaryButtonText}
              />
              <Text numberOfLines={1} style={[styles.stickyQuickChipPrimaryText, { color: palette.primaryButtonText }]}>
                {texts.menuButton}
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </Animated.View>
  );
};

const styles = StyleSheet.create({
  stickyHeaderBar: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 100,
    elevation: 0,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0,
    shadowRadius: 0,
    overflow: 'hidden',
    paddingBottom: 0,
  },
  stickyDecorCircle1: {
    position: 'absolute',
    top: -30,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  stickyDecorCircle2: {
    position: 'absolute',
    bottom: -20,
    left: 20,
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  stickyHeaderTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 8,
    width: '100%',
  },
  stickySquircleBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
    position: 'relative',
  },
  heroBellDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  stickyLeftIdentity: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 10,
  },
  stickyTextCol: {
    flex: 1,
    marginLeft: 9,
  },
  stickyTitleText: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  stickyStudentCardOuter: {
    marginHorizontal: 12,
    marginTop: 6,
    marginBottom: 10,
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  stickyStudentCardGradient: {
    paddingHorizontal: 14,
    paddingTop: 12,
    paddingBottom: 10,
    borderRadius: 18,
    position: 'relative',
    overflow: 'hidden',
  },
  stickyCardDecorCircle: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 0,
  },
  stickyCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  stickyAvatarBorderWrap: {
    width: 46,
    height: 46,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    marginRight: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.18,
    shadowRadius: 4,
    elevation: 3,
    overflow: 'hidden',
  },
  stickyAvatarImgLarge: {
    width: '100%',
    height: '100%',
  },
  stickyStudentInfoCol: {
    flex: 1,
  },
  stickyStudentFullName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 2.5,
  },
  stickyStudentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.88)',
    fontWeight: '600',
    marginBottom: 3.5,
  },
  stickyStudentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  stickyStudentUnitText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  stickyRichMiniActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 8,
  },
  stickyMiniBtn: {
    width: 32,
    height: 32,
    borderRadius: 11,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 3,
    position: 'relative',
  },
  stickyQuickChipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
    marginBottom: 2,
    zIndex: 1,
  },
  stickyQuickChip: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.28)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.1,
  },
  stickyQuickChipSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.28)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipSecondaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
    letterSpacing: 0.1,
  },
  stickyQuickChipPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 6.5,
    paddingHorizontal: 4,
    borderRadius: 11,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.28)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.12,
    shadowRadius: 3,
    elevation: 3,
  },
  stickyQuickChipPrimaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#7C3AED',
    letterSpacing: 0.1,
  },
  stickyChildChipsContainer: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.25)',
    zIndex: 1,
  },
  stickyChildChipsScroll: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  stickyChildChipNew: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  stickyChildChipNewActive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#FFFFFF',
  },
  stickyChildChipNewText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  stickyChildChipNewTextActive: {
    color: '#064E3B',
    fontWeight: '900',
  },
});
