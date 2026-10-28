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
  getStudentAvatarSource,
  isGirlStudent,
} from '../utils/profile';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';

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
    child.kelas?.unit_pendidikan?.nama ||
    child.kelas?.unitPendidikan?.name ||
    child.education_unit?.name ||
    child.unit_name ||
    (typeof child.unit === 'string' ? child.unit : (child.unit?.name || child.unit?.nama || '')) ||
    'Unit Sekolah';
  const sKelas =
    (typeof child.kelas === 'object' && child.kelas !== null
      ? child.kelas?.nama_kelas || child.kelas?.name || child.kelas?.kode_kelas
      : '') ||
    (typeof child.kelas === 'string' ? child.kelas : '') ||
    child.class_name ||
    child.kelas_name ||
    'Kelas Aktif';
  const sJenjang =
    (typeof child.kelas?.jenjang === 'string' ? child.kelas.jenjang : '') ||
    (typeof child.education_unit?.level === 'string' ? child.education_unit.level : '') ||
    (typeof child.jenjang === 'string' ? child.jenjang : '') ||
    'Terpadu';

  const isGirl = isGirlStudent(child);

  const avatarUri = getProfileImageUrl(child);
  const [imageError, setImageError] = useState(false);

  useEffect(() => {
    setImageError(false);
  }, [avatarUri]);

  // Status Presensi Dinamis & Bebas Hardcode
  const attendanceObj = child.attendance_today || child.presensi_hari_ini || null;
  const rawStatus = String(
    child.attendance_status ||
    child.presensi_status ||
    child.status_presensi ||
    attendanceObj?.status_label ||
    attendanceObj?.label ||
    attendanceObj?.status ||
    ''
  ).trim();

  const isWeekendToday = (() => {
    const day = new Date().getDay();
    return day === 0 || day === 6; // 0 = Minggu, 6 = Sabtu
  })();

  const isHoliday = Boolean(
    child.is_holiday ||
    attendanceObj?.is_holiday ||
    rawStatus.toLowerCase().includes('libur')
  );

  // Tentukan label presensi yang tampil
  let displayPresensi = rawStatus;
  if (!displayPresensi || displayPresensi === '-') {
    if (isHoliday || isWeekendToday) {
      displayPresensi = 'Libur';
    } else {
      displayPresensi = 'Belum Presensi';
    }
  }

  // Jika teks dari backend "Libur Akhir Pekan", kita ringkas jadi "Libur" agar elegan di kotak kecil
  if (displayPresensi.toLowerCase() === 'libur akhir pekan') {
    displayPresensi = 'Libur';
  }

  // Alias untuk kompatibilitas Fast Refresh / Metro cache
  const rawPresensi = displayPresensi;

  // Mapping Warna Semantik Elegan & Akurat
  let presensiDotColor = '#94A3B8'; // Default Abu-abu netral (Belum Presensi)
  let presensiTextColor = '#E2E8F0';

  const lowerPresensi = displayPresensi.toLowerCase();
  if (lowerPresensi.includes('hadir') || lowerPresensi.includes('masuk') || lowerPresensi.includes('present')) {
    presensiDotColor = '#34D399'; // Emerald Green (Hadir)
    presensiTextColor = '#DEF7EC';
  } else if (lowerPresensi.includes('terlambat') || lowerPresensi.includes('late')) {
    presensiDotColor = '#FBBF24'; // Amber (Terlambat)
    presensiTextColor = '#FEF3C7';
  } else if (lowerPresensi.includes('libur') || lowerPresensi.includes('holiday')) {
    presensiDotColor = '#F59E0B'; // Vivid Amber / Orange (Libur)
    presensiTextColor = '#FEF3C7';
  } else if (lowerPresensi.includes('sakit') || lowerPresensi.includes('sick')) {
    presensiDotColor = '#38BDF8'; // Sky Blue (Sakit)
    presensiTextColor = '#E0F2FE';
  } else if (lowerPresensi.includes('izin') || lowerPresensi.includes('permit')) {
    presensiDotColor = '#60A5FA'; // Soft Blue (Izin)
    presensiTextColor = '#DBEAFE';
  } else if (lowerPresensi.includes('alpa') || lowerPresensi.includes('alpha') || lowerPresensi.includes('tidak hadir') || lowerPresensi.includes('absen') || lowerPresensi.includes('absent')) {
    presensiDotColor = '#F87171'; // Rose Red (Tidak Hadir)
    presensiTextColor = '#FEE2E2';
  } else if (lowerPresensi.includes('belum')) {
    presensiDotColor = '#94A3B8'; // Slate Neutral (Belum Presensi)
    presensiTextColor = '#E2E8F0';
  }

  const shouldShowButtons = Boolean(showActionButtons && !hideActionButton);

  const cardWidthStyle = isSingleChild
    ? styles.childCardHeroSizeSingle
    : cardWidth
      ? [styles.childCardHeroSize, { width: cardWidth, marginRight: 0 }]
      : styles.childCardHeroSize;

  return (
    <View
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
        <View pointerEvents="none" style={styles.cardDecorCircle} />

        {/* Konten Kartu: nonaktifkan pointerEvents anak jika kartu belum terpilih agar seluruh area kartu dapat diklik untuk memilih anak */}
        <View pointerEvents={(!onSelect || isSelected) ? 'auto' : 'none'}>
          {/* 1. Baris Paling Atas: Lencana Unit Pendidikan (Kiri) & 3 Tombol Aksi / Indikator (Kanan) */}
          <View style={styles.studentCardTopBar}>
            <View style={styles.studentUnitBadgeTop}>
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

            {/* Kanan: 3 Tombol Aksi (Notifikasi, Laporan, QR) ATAU Indikator Pilihan Anak */}
            {shouldShowButtons ? (
              <View style={styles.studentCardHeaderActions}>
                {(() => {
                  const globalUnread = useNotificationBadgeStore.getState().unreadNotificationCount;
                  const childUnread = Number(child?.unread_notifications_count ?? child?.unread_count ?? 0);
                  const showBellDot = (globalUnread > 0 && isSelected) || childUnread > 0;

                  return (
                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={onPressNotifications || (() => { })}
                      style={[styles.studentQrBtn, { position: 'relative' }]}
                      accessibilityLabel="Pengingat & Notifikasi Siswa"
                    >
                      <MaterialCommunityIcons name="bell-ring-outline" size={17} color="#059669" />
                      {showBellDot ? (
                        <View
                          style={{
                            position: 'absolute',
                            top: -2,
                            right: -2,
                            width: 9,
                            height: 9,
                            borderRadius: 4.5,
                            backgroundColor: '#EF4444',
                            borderWidth: 1.5,
                            borderColor: '#FFFFFF',
                          }}
                        />
                      ) : null}
                    </TouchableOpacity>
                  );
                })()}

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={onPressWeeklyReport || (() => { })}
                  style={styles.studentQrBtn}
                  accessibilityLabel="Laporan Perkembangan Pekanan Siswa"
                >
                  <MaterialCommunityIcons name="clipboard-text-outline" size={17} color="#059669" />
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.75}
                  onPress={onPressQr || onPressCard || (() => { })}
                  style={styles.studentQrBtn}
                  accessibilityLabel="Tampilkan QR Code Siswa"
                >
                  <MaterialCommunityIcons name="qrcode-scan" size={17} color="#059669" />
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

          {/* 2. Baris Profil Tengah: Avatar + Nama Siswa Penuh (Sangat Lega 2 Baris, Tanpa Terpotong/Terhimpit) */}
          <View style={styles.studentCardProfileRow}>
            <TouchableOpacity
              activeOpacity={onPressCard ? 0.8 : 1}
              disabled={!onPressCard}
              onPress={onPressCard}
              style={[styles.studentAvatarBox, !isSelected && styles.avatarBorderWrapHeroInactive]}
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
                  source={getStudentAvatarSource(child)}
                  style={styles.childAvatarImgHero}
                  resizeMode="cover"
                />
              )}
            </TouchableOpacity>

            <View style={styles.studentInfoCol}>
              <Text numberOfLines={2} style={styles.studentFullName}>
                {sName}
              </Text>
              <Text numberOfLines={1} style={styles.studentNisText}>
                NIS: {sNis} {sNisn && sNisn !== '-' ? `· NISN: ${sNisn}` : ''}
              </Text>
            </View>
          </View>

          {/* 3. Kotak Atribut (Kelas | Jenjang | Presensi) - Jarak Rapat Presisi (Total 10px) */}
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
                  {displayPresensi}
                </Text>
                <View style={[styles.presensiGreenDot, { backgroundColor: presensiDotColor }]} />
              </View>
            </View>
          </View>

          {/* 4. Baris Tombol Aksi Bawah: Kartu Siswa, Jadwal, Menu (HANYA 1 BARIS RAMPING) */}
          {shouldShowButtons && (
            <View style={styles.studentCardActionsRow}>
              <TouchableOpacity
                activeOpacity={0.82}
                onPress={onPressCard}
                style={styles.studentActionBtnCard}
              >
                <MaterialCommunityIcons name="card-account-details" size={15} color="#059669" style={{ marginRight: 4 }} />
                <Text numberOfLines={1} style={styles.studentActionBtnCardText}>{cardLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.82}
                onPress={onPressCalendar}
                style={styles.studentActionBtnSecondary}
              >
                <MaterialCommunityIcons name={(calendarIcon as any) || 'calendar-month'} size={15} color="#2563EB" style={{ marginRight: 4 }} />
                <Text numberOfLines={1} style={styles.studentActionBtnSecondaryText}>{calendarLabel}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.85}
                onPress={onPressPortal}
                style={styles.studentActionBtnPrimary}
              >
                <MaterialCommunityIcons name={portalIcon === 'view-grid-outline' ? 'view-grid' : ((portalIcon as any) || 'view-grid')} size={15} color="#7C3AED" style={{ marginRight: 4 }} />
                <Text numberOfLines={1} style={styles.studentActionBtnPrimaryText}>{portalLabel}</Text>
              </TouchableOpacity>
            </View>
          )}
        </View>
      </LinearGradient>

      {/* Overlay Transparan Khusus Kartu Non-Aktif: Menjamin 100% ketukan di titik mana pun langsung memilih anak */}
      {!isSelected && onSelect && (
        <TouchableOpacity
          activeOpacity={0.85}
          style={StyleSheet.absoluteFill}
          onPress={onSelect}
        />
      )}
    </View>
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
  studentCardTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
    zIndex: 1,
  },
  studentUnitBadgeTop: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 7,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
    flexShrink: 1,
    marginRight: 8,
  },
  studentCardProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
    zIndex: 1,
  },
  studentAvatarBox: {
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
  },
  avatarBorderWrapHeroInactive: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  studentInfoCol: {
    flex: 1,
  },
  studentFullName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 22,
  },
  studentNisText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
    marginTop: 2,
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
    width: 32,
    height: 32,
    borderRadius: 10,
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
    marginTop: 4,
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
  studentCardQuickActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
    zIndex: 1,
  },
  studentCardActionsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 8,
    zIndex: 1,
  },
  studentActionBtnCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7.5,
    paddingHorizontal: 2,
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
  studentActionBtnCardText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },
  studentActionBtnSecondary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7.5,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(37, 99, 235, 0.28)',
    shadowColor: '#2563EB',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  studentActionBtnSecondaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  studentActionBtnPrimary: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 7.5,
    paddingHorizontal: 2,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: 'rgba(124, 58, 237, 0.28)',
    shadowColor: '#7C3AED',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.1,
    shadowRadius: 3,
    elevation: 2,
  },
  studentActionBtnPrimaryText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#7C3AED',
  },
});

export default StudentHeroCard;
