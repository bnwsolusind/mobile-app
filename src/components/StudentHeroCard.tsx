import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import {
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
  getProfileImageUrl,
} from '../utils/profile';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface StudentHeroCardProps {
  child: any;
  isSelected?: boolean;
  onSelect?: () => void;
  showActionButtons?: boolean; // Jika true: menampilkan Kartu Siswa, Jadwal/Kalender, Menu/Portal
  hideActionButton?: boolean;
  isSingleChild?: boolean;
  cardWidth?: number;
  onPressCard?: () => void;
  cardLabel?: string;
  onPressCalendar?: () => void;
  calendarLabel?: string;
  calendarIcon?: string;
  onPressPortal?: () => void;
  portalLabel?: string;
  portalIcon?: string;
  onPressWeeklyReport?: () => void;
  onPressNotifications?: () => void;
  onPressQr?: () => void;
  containerStyle?: any;
}

export const StudentHeroCard: React.FC<StudentHeroCardProps> = ({
  child,
  isSelected = true,
  onSelect,
  showActionButtons = false,
  hideActionButton,
  isSingleChild = false,
  cardWidth,
  onPressCard,
  cardLabel = 'Kartu Siswa',
  onPressCalendar,
  calendarLabel = 'Jadwal',
  calendarIcon = 'calendar-clock',
  onPressPortal,
  portalLabel = 'Menu',
  portalIcon = 'view-grid-outline',
  onPressWeeklyReport,
  onPressNotifications,
  onPressQr,
  containerStyle,
}) => {
  if (!child) return null;

  const sName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
  const sNis = child.nis || child.student_nis || '-';
  const sNisn = child.nisn || child.student_nisn || '';
  const sUnit =
    child.kelas?.unit_pendidikan?.name ||
    child.kelas?.unitPendidikan?.name ||
    child.education_unit?.name ||
    child.unit_name ||
    child.unit ||
    'Unit Sekolah';
  const sKelas =
    child.kelas?.nama_kelas ||
    child.kelas?.name ||
    child.class_name ||
    child.kelas_name ||
    'Kelas Aktif';
  const sJenjang =
    child.kelas?.jenjang ||
    child.education_unit?.level ||
    child.jenjang ||
    'Terpadu';

  const isGirl =
    child?.gender === 'female' ||
    child?.jenis_kelamin === 'P' ||
    child?.jenis_kelamin === 'female' ||
    child?.gender === 'P';

  const avatarUri = getProfileImageUrl(child);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [avatarUri]);

  // Status Presensi & Warna Semantik persis HomeScreen
  const rawPresensi =
    child.attendance_status ||
    child.presensi_status ||
    child.status_presensi ||
    'Hadir';

  let presensiDotColor = '#34D399';
  let presensiTextColor = '#DEF7EC';
  const lowerPresensi = String(rawPresensi).toLowerCase();
  if (lowerPresensi.includes('hadir') || lowerPresensi.includes('masuk')) {
    presensiDotColor = '#34D399';
    presensiTextColor = '#DEF7EC';
  } else if (lowerPresensi.includes('terlambat')) {
    presensiDotColor = '#FBBF24';
    presensiTextColor = '#FEF3C7';
  } else if (lowerPresensi.includes('sakit') || lowerPresensi.includes('izin')) {
    presensiDotColor = '#60A5FA';
    presensiTextColor = '#DBEAFE';
  } else if (lowerPresensi.includes('alpa') || lowerPresensi.includes('absen') || lowerPresensi.includes('belum')) {
    presensiDotColor = '#F87171';
    presensiTextColor = '#FEE2E2';
  }

  const shouldShowButtons = Boolean(showActionButtons && !hideActionButton);

  const cardWidthStyle = isSingleChild
    ? styles.childCardHeroSizeSingle
    : cardWidth
    ? [styles.childCardHeroSize, { width: cardWidth, marginRight: 0 }]
    : styles.childCardHeroSize;

  return (
    <TouchableOpacity
      activeOpacity={onSelect ? 0.88 : 1}
      onPress={onSelect}
      disabled={!onSelect || isSingleChild}
      style={[
        isSingleChild ? styles.singleTouchable : styles.multiTouchable,
        containerStyle,
      ]}
    >
      <LinearGradient
        colors={['#0D6B42', '#18A165', '#2BD988']}
        locations={[0, 0.55, 1]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[cardWidthStyle, !isSelected && { opacity: 0.88 }]}
      >
        {/* Lingkaran Dekoratif Glassmorphism */}
        <View style={styles.cardDecorCircle} />

        {/* ── Top Row: Avatar + Info (Nama, NIS, Unit) + Right Indicator / Action ── */}
        <View style={styles.childHeroTopRow}>
          <TouchableOpacity
            activeOpacity={onPressCard ? 0.8 : 1}
            disabled={!onPressCard}
            onPress={onPressCard}
            style={[styles.avatarBorderWrapHero, !isSelected && styles.avatarBorderWrapHeroInactive]}
          >
            {avatarUri && !imageError ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.childAvatarImgHero}
                resizeMode="cover"
                onError={() => setImageError(true)}
              />
            ) : (
              <Image
                source={isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR}
                style={styles.childAvatarImgHero}
                resizeMode="cover"
              />
            )}
          </TouchableOpacity>

          <View style={styles.childInfoCol}>
            <View style={styles.studentNameBadgeRow}>
              <Text numberOfLines={1} style={styles.studentFullName}>
                {sName}
              </Text>
            </View>
            <Text style={styles.studentNisText}>
              NIS: {sNis} {sNisn && sNisn !== '-' ? `· NISN: ${sNisn}` : ''}
            </Text>
            <View style={styles.studentUnitBadge}>
              <MaterialCommunityIcons
                name="school"
                size={11}
                color="#FFFFFF"
                style={{ marginRight: 4 }}
              />
              <Text numberOfLines={1} style={styles.studentUnitText}>
                {sUnit}
              </Text>
            </View>
          </View>

          {/* Right Header: Sesuai Mode (Beranda/Modul: Bel, Laporan, & QR | Terpilih/Pilih jika tidak ada action buttons) */}
          {shouldShowButtons ? (
            <View style={styles.studentCardHeaderActions}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onPressNotifications || (() => {})}
                style={[styles.studentQrBtn, { position: 'relative' }]}
                accessibilityLabel="Pengingat & Notifikasi Siswa"
              >
                <MaterialCommunityIcons name="bell-ring-outline" size={19} color="#059669" />
                <View
                  style={{
                    position: 'absolute',
                    top: -2,
                    right: -2,
                    width: 10,
                    height: 10,
                    borderRadius: 5,
                    backgroundColor: '#EF4444',
                    borderWidth: 1.5,
                    borderColor: '#FFFFFF',
                  }}
                />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onPressWeeklyReport || (() => {})}
                style={styles.studentQrBtn}
                accessibilityLabel="Laporan Perkembangan Pekanan Siswa"
              >
                <MaterialCommunityIcons name="clipboard-text-outline" size={19} color="#059669" />
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={onPressQr || onPressCard || (() => {})}
                style={styles.studentQrBtn}
                accessibilityLabel="Tampilkan QR Code Siswa"
              >
                <MaterialCommunityIcons name="qrcode-scan" size={19} color="#059669" />
              </TouchableOpacity>
            </View>
          ) : (
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
                {isSelected ? 'Terpilih' : 'Pilih'}
              </Text>
            </View>
          )}
        </View>

        {/* ── Middle Attributes Grid (Kelas | Jenjang | Presensi) ── */}
        <View style={styles.studentAttributesGrid}>
          <View style={styles.studentAttrBox}>
            <View style={styles.studentAttrLabelRow}>
              <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
              <Text style={styles.studentAttrLabel}>Kelas</Text>
            </View>
            <Text numberOfLines={1} style={styles.studentAttrValue}>{sKelas}</Text>
          </View>

          <View style={styles.studentAttrDivider} />

          <View style={styles.studentAttrBox}>
            <View style={styles.studentAttrLabelRow}>
              <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
              <Text style={styles.studentAttrLabel}>Jenjang</Text>
            </View>
            <Text numberOfLines={1} style={styles.studentAttrValue}>{sJenjang}</Text>
          </View>

          <View style={styles.studentAttrDivider} />

          <View style={styles.studentAttrBox}>
            <View style={styles.studentAttrLabelRow}>
              <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
              <Text style={styles.studentAttrLabel}>Presensi</Text>
            </View>
            <View style={styles.studentPresensiValueRow}>
              <Text numberOfLines={1} style={[styles.studentAttrValue, { color: presensiTextColor }]}>
                {rawPresensi}
              </Text>
              <View style={[styles.presensiGreenDot, { backgroundColor: presensiDotColor }]} />
            </View>
          </View>
        </View>

        {/* ── Bottom Action Row: Kartu Siswa, Jadwal, Menu (HANYA DITAMPILKAN JIKA shouldShowButtons = true) ── */}
        {shouldShowButtons && (
          <View style={styles.studentCardActionsRow}>
            <TouchableOpacity
              activeOpacity={0.82}
              onPress={onPressCard}
              style={styles.studentActionBtnCard}
            >
              <MaterialCommunityIcons name="card-account-details-outline" size={15} color="#059669" style={{ marginRight: 4 }} />
              <Text style={styles.studentActionBtnCardText}>{cardLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.82}
              onPress={onPressCalendar}
              style={styles.studentActionBtnSecondary}
            >
              <MaterialCommunityIcons name={(calendarIcon as any) || 'calendar-clock'} size={15} color="#2563EB" style={{ marginRight: 4 }} />
              <Text style={styles.studentActionBtnSecondaryText}>{calendarLabel}</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onPressPortal}
              style={styles.studentActionBtnPrimary}
            >
              <MaterialCommunityIcons name={(portalIcon as any) || 'view-grid-outline'} size={14} color="#7C3AED" style={{ marginRight: 4 }} />
              <Text style={styles.studentActionBtnPrimaryText}>{portalLabel}</Text>
            </TouchableOpacity>
          </View>
        )}
      </LinearGradient>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  singleTouchable: {
    width: '100%',
    alignSelf: 'stretch',
  },
  multiTouchable: {},
  childCardHeroSize: {
    width: SCREEN_WIDTH - 48,
    borderRadius: 20,
    padding: 14,
    marginRight: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 20,
    padding: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.4)',
    shadowColor: '#0D6B42',
    shadowOpacity: 0.22,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
    overflow: 'hidden',
    position: 'relative',
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -24,
    right: -24,
    width: 96,
    height: 96,
    borderRadius: 48,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    zIndex: 0,
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    zIndex: 1,
  },
  avatarBorderWrapHero: {
    width: 62,
    height: 62,
    borderRadius: 22,
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
  },
  avatarBorderWrapHeroInactive: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  childInfoCol: {
    flex: 1,
  },
  studentNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentFullName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 1,
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 3,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentCardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginLeft: 6,
  },
  studentQrBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
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
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 2,
  },
  studentAttrLabel: {
    fontSize: 9.5,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  studentCardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 12,
    zIndex: 1,
  },
  studentActionBtnCard: {
    flex: 1.1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: 'rgba(5, 150, 105, 0.32)',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnCardText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#059669',
  },
  studentActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1.5,
    borderColor: 'rgba(37, 99, 235, 0.32)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnSecondaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#2563EB',
  },
  studentActionBtnPrimary: {
    flex: 0.85,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#F5F3FF',
    borderWidth: 1.5,
    borderColor: 'rgba(124, 58, 237, 0.32)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  studentActionBtnPrimaryText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#7C3AED',
  },
});

export default StudentHeroCard;
