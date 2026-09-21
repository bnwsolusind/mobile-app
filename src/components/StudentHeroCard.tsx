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
  showActionButtons?: boolean; // Jika true (di Beranda): menampilkan Kartu Siswa, Kalender, Portal
  hideActionButton?: boolean;
  isSingleChild?: boolean;
  cardWidth?: number;
  onPressCard?: () => void;
  onPressCalendar?: () => void;
  onPressPortal?: () => void;
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
  onPressCalendar,
  onPressPortal,
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
    child.classroom?.name ||
    'Kelas Belum Ditentukan';
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

  // Status Presensi
  const rawPresensi =
    child.attendance_status ||
    child.presensi_status ||
    child.status_presensi ||
    'Hadir';

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

          {/* Right Header: Sesuai Mode (Beranda: Bel & QR | Modul: Terpilih / Pilih) */}
          {shouldShowButtons ? (
            <View style={styles.studentCardHeaderActions}>
              {onPressNotifications && (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={onPressNotifications}
                  style={styles.studentQrBtn}
                  accessibilityLabel="Pengingat Siswa"
                >
                  <MaterialCommunityIcons name="bell-ring-outline" size={18} color="#18A165" />
                </TouchableOpacity>
              )}
              {onPressQr && (
                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={onPressQr}
                  style={styles.studentQrBtn}
                  accessibilityLabel="QR Code Siswa"
                >
                  <MaterialCommunityIcons name="qrcode-scan" size={18} color="#18A165" />
                </TouchableOpacity>
              )}
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
              <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                {rawPresensi}
              </Text>
              <View style={styles.presensiGreenDot} />
            </View>
          </View>
        </View>

        {/* ── Bottom Action Row: Kartu Siswa, Kalender, Portal (HANYA DITAMPILKAN JIKA shouldShowButtons = true) ── */}
        {shouldShowButtons && (
          <View style={styles.studentCardActionsRow}>
            {onPressCard && (
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={onPressCard}
                style={styles.studentActionBtnCard}
              >
                <MaterialCommunityIcons name="card-account-details-outline" size={14} color="#084835" style={{ marginRight: 4 }} />
                <Text style={styles.studentActionBtnCardText}>Kartu Siswa</Text>
              </TouchableOpacity>
            )}

            {onPressCalendar && (
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={onPressCalendar}
                style={styles.studentActionBtnSecondary}
              >
                <MaterialCommunityIcons name="calendar-month" size={14} color="#064E3B" style={{ marginRight: 4 }} />
                <Text style={styles.studentActionBtnSecondaryText}>Kalender</Text>
              </TouchableOpacity>
            )}

            {onPressPortal && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onPressPortal}
                style={styles.studentActionBtnPrimary}
              >
                <MaterialCommunityIcons name="view-grid" size={14} color="#FFFFFF" style={{ marginRight: 4 }} />
                <Text style={styles.studentActionBtnPrimaryText}>Portal</Text>
              </TouchableOpacity>
            )}
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
    width: SCREEN_WIDTH - 50,
    borderRadius: 22,
    padding: 16,
    marginRight: 12,
    elevation: 4,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  childCardHeroSizeSingle: {
    width: '100%',
    alignSelf: 'stretch',
    borderRadius: 22,
    padding: 16,
    elevation: 4,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  cardDecorCircle: {
    position: 'absolute',
    top: -30,
    right: -30,
    width: 140,
    height: 140,
    borderRadius: 70,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
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
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
    overflow: 'hidden',
  },
  avatarBorderWrapHeroInactive: {
    borderColor: 'rgba(255, 255, 255, 0.5)',
    opacity: 0.85,
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  childInfoCol: {
    flex: 1,
    marginLeft: 12,
    justifyContent: 'center',
  },
  studentNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentFullName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  studentNisText: {
    fontSize: 11.5,
    color: '#D1FAE5',
    fontWeight: '600',
    marginTop: 2,
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  studentUnitText: {
    fontSize: 10.5,
    color: '#FFFFFF',
    fontWeight: '700',
  },
  studentCardHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  studentQrBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  selectedActionBtnRight: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    gap: 4,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
  },
  selectedActionBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  selectedActionBtnTextInactive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 14,
    paddingVertical: 9,
    paddingHorizontal: 12,
    marginTop: 13,
    justifyContent: 'space-between',
  },
  studentAttrBox: {
    flex: 1,
    alignItems: 'center',
  },
  studentAttrLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 2,
  },
  studentAttrLabel: {
    fontSize: 10.5,
    color: '#A7F3D0',
    fontWeight: '600',
  },
  studentAttrValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentAttrDivider: {
    width: 1,
    height: 22,
    backgroundColor: 'rgba(167, 243, 208, 0.3)',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
  },
  studentCardActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 12,
    gap: 8,
  },
  studentActionBtnCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DEF7EC',
    paddingVertical: 7,
    borderRadius: 10,
  },
  studentActionBtnCardText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#084835',
  },
  studentActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D1FAE5',
    paddingVertical: 7,
    borderRadius: 10,
  },
  studentActionBtnSecondaryText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  studentActionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#047857',
    paddingVertical: 7,
    borderRadius: 10,
  },
  studentActionBtnPrimaryText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default StudentHeroCard;
