import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Image,
  Modal,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getProfileImageUrl } from '../utils/profile';
import { useMobileConfigStore } from '../stores/mobileConfigStore';

const CARD_THEMES: Record<string, { primary: string; dark: string; secondary: string; soft: string; accent: string }> = {
  green: { primary: '#004D32', dark: '#003822', secondary: '#0E5C44', soft: '#ecfdf5', accent: '#E5A93C' },
  blue: { primary: '#1D4ED8', dark: '#1e40af', secondary: '#3B82F6', soft: '#eff6ff', accent: '#93C5FD' },
  purple: { primary: '#6D28D9', dark: '#5b21b6', secondary: '#8B5CF6', soft: '#f5f3ff', accent: '#C4B5FD' },
  orange: { primary: '#EA580C', dark: '#c2410c', secondary: '#F97316', soft: '#fff7ed', accent: '#FDBA74' },
  teal: { primary: '#0F766E', dark: '#115e59', secondary: '#14B8A6', soft: '#f0fdfa', accent: '#99F6E4' },
  navy: { primary: '#172554', dark: '#0f172a', secondary: '#1E3A8A', soft: '#eff6ff', accent: '#60A5FA' },
};

interface StudentIdCardModalProps {
  visible: boolean;
  student: any;
  onClose: () => void;
}

export const StudentIdCardModal: React.FC<StudentIdCardModalProps> = ({
  visible,
  student,
  onClose,
}) => {
  const [idCardSide, setIdCardSide] = useState<'front' | 'back'>('front');
  const mobileConfig = useMobileConfigStore((state) => state.config);

  if (!student) return null;

  const activeCardTheme = CARD_THEMES.green;
  const sName = student?.full_name || student?.nama_lengkap || student?.name || 'Siswa';
  const sInitial = sName.charAt(0).toUpperCase();
  const sNis = student?.nis || '-';
  const sNisn = student?.nisn || student?.metadata?.nisn || '-';
  const cardBloodType = student?.golongan_darah || student?.metadata?.golongan_darah || student?.blood_type || '-';
  const cardClassName = student?.kelas?.nama_kelas || student?.kelas?.name || student?.class_name || '';
  const cardRombelName = student?.kelas?.rombel || student?.rombel || student?.metadata?.rombel || '';
  const cardClassDisplay = cardRombelName ? `${cardClassName} (${cardRombelName})` : cardClassName;

  let formattedBirthDate = '-';
  const rawDate = student?.birth_date || student?.tanggal_lahir;
  if (rawDate) {
    try {
      formattedBirthDate = new Date(rawDate).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      });
    } catch {
      formattedBirthDate = String(rawDate);
    }
  }

  const qrValue = student?.qr_token || `STUDENT_CARD:${sNis}:${sName}`;
  const qrImageUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(qrValue)}`;
  const studentPhotoUrl = getProfileImageUrl(student);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.idCardModalBackdrop}>
        <View style={styles.idCardModalCard}>
          {/* Header Modal */}
          <View style={styles.idCardModalHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <MaterialCommunityIcons name="card-account-details" size={22} color="#084835" />
              <Text style={styles.idCardModalTitle}>Kartu Tanda Siswa (KTS)</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.qrModalCloseBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Sisi Depan / Belakang Switcher */}
          <View style={styles.idCardTabRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIdCardSide('front')}
              style={[styles.idCardTabBtn, idCardSide === 'front' && styles.idCardTabBtnActive]}
            >
              <Text style={[styles.idCardTabBtnText, idCardSide === 'front' && styles.idCardTabBtnTextActive]}>
                Tampak Depan
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setIdCardSide('back')}
              style={[styles.idCardTabBtn, idCardSide === 'back' && styles.idCardTabBtnActive]}
            >
              <Text style={[styles.idCardTabBtnText, idCardSide === 'back' && styles.idCardTabBtnTextActive]}>
                Tampak Belakang
              </Text>
            </TouchableOpacity>
          </View>

          {/* CARD PREVIEW AREA */}
          <View style={styles.idCardPreviewBox}>
            {idCardSide === 'front' ? (
              // TAMPAK DEPAN
              <View style={styles.webCardFrame}>
                {/* 1. TOP HEADER */}
                <View style={styles.webCardHeaderRow}>
                  <View style={[styles.webCardWaveLeft, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent }]}>
                    <View style={[styles.webCardLogoCircle, { borderColor: activeCardTheme.accent }]}>
                      <Image
                        source={require('../../assets/logo.png')}
                        style={styles.webCardLogoImg}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.webCardBrandCol}>
                      <Text style={styles.webCardYayasanLabel}>
                        {mobileConfig.branding?.school_name?.toUpperCase().includes('YAYASAN') ? 'LEMBAGA' : 'YAYASAN'}
                      </Text>
                      <Text numberOfLines={1} style={styles.webCardBrandName}>
                        {mobileConfig.branding?.school_name || student?.education_unit?.name || 'SEKOLAH'}
                      </Text>
                      <Text style={styles.webCardSchoolSub}>
                        {student?.education_unit?.name || 'Islamic School'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.webCardHeaderRight}>
                    <View style={[styles.webCardPillBadge, { backgroundColor: activeCardTheme.primary }]}>
                      <Text style={styles.webCardPillText}>KARTU PELAJAR</Text>
                    </View>
                    <View style={styles.webCardMottoBox}>
                      <Text style={[styles.webCardMottoText, { color: activeCardTheme.primary }]}>
                        {student?.education_unit?.metadata?.motto || 'Berilmu, Berakhlak, Beramal'}
                      </Text>
                      <MaterialCommunityIcons name="star-four-points" size={10} color={activeCardTheme.accent} style={{ alignSelf: 'flex-end', marginTop: 1 }} />
                    </View>
                  </View>
                </View>

                {/* 2. BODY */}
                <View style={styles.webCardBody}>
                  {/* Photo Column */}
                  <View style={styles.webCardPhotoCol}>
                    <View style={styles.webCardPhotoFrame}>
                      {studentPhotoUrl ? (
                        <Image
                          source={{ uri: studentPhotoUrl }}
                          style={styles.webCardPhotoImg}
                          resizeMode="cover"
                        />
                      ) : (
                        <View style={[styles.webCardPhotoFallback, { backgroundColor: activeCardTheme.primary }]}>
                          <Text style={styles.webCardPhotoFallbackText}>{sInitial}</Text>
                        </View>
                      )}
                    </View>
                    <View style={[styles.webCardUnitPill, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent }]}>
                      <Text numberOfLines={1} style={styles.webCardUnitPillText}>
                        {student?.education_unit?.name || '-'}
                      </Text>
                    </View>
                  </View>

                  {/* Details Column */}
                  <View style={styles.webCardDetailsCol}>
                    <Text numberOfLines={1} style={[styles.webCardStudentName, { color: activeCardTheme.primary }]}>
                      {sName}
                    </Text>

                    <View style={styles.webCardOrnamentRow}>
                      <View style={[styles.webCardOrnamentLine, { backgroundColor: activeCardTheme.accent }]} />
                      <MaterialCommunityIcons name="star-four-points" size={10} color={activeCardTheme.accent} />
                      <View style={[styles.webCardOrnamentLine, { backgroundColor: activeCardTheme.accent }]} />
                    </View>

                    <View style={styles.webCardTable}>
                      <View style={styles.webTableRow}>
                        <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                          <MaterialCommunityIcons name="card-account-details-outline" size={11} color={activeCardTheme.primary} />
                        </View>
                        <Text style={styles.webTableLabel}>NIS</Text>
                        <Text style={styles.webTableColon}>:</Text>
                        <Text numberOfLines={1} style={styles.webTableVal}>{sNis}</Text>
                      </View>

                      <View style={styles.webTableRow}>
                        <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                          <MaterialCommunityIcons name="shield-check-outline" size={11} color={activeCardTheme.primary} />
                        </View>
                        <Text style={styles.webTableLabel}>NISN</Text>
                        <Text style={styles.webTableColon}>:</Text>
                        <Text numberOfLines={1} style={styles.webTableVal}>{sNisn}</Text>
                      </View>

                      <View style={styles.webTableRow}>
                        <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                          <MaterialCommunityIcons name="account-outline" size={11} color={activeCardTheme.primary} />
                        </View>
                        <Text style={styles.webTableLabel}>Kelas</Text>
                        <Text style={styles.webTableColon}>:</Text>
                        <Text numberOfLines={1} style={styles.webTableVal}>{cardClassDisplay || '-'}</Text>
                      </View>

                      <View style={styles.webTableRow}>
                        <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                          <MaterialCommunityIcons name="calendar-month-outline" size={11} color={activeCardTheme.primary} />
                        </View>
                        <Text style={styles.webTableLabel}>Tanggal Lahir</Text>
                        <Text style={styles.webTableColon}>:</Text>
                        <Text numberOfLines={1} style={styles.webTableVal}>{formattedBirthDate}</Text>
                      </View>

                      <View style={styles.webTableRow}>
                        <View style={[styles.webTableIconBox, { backgroundColor: activeCardTheme.soft }]}>
                          <MaterialCommunityIcons name="water-outline" size={11} color={activeCardTheme.primary} />
                        </View>
                        <Text style={styles.webTableLabel}>Gol. Darah</Text>
                        <Text style={styles.webTableColon}>:</Text>
                        <Text numberOfLines={1} style={styles.webTableVal}>{cardBloodType}</Text>
                      </View>
                    </View>
                  </View>

                  {/* QR Code Column */}
                  <View style={styles.webCardQrCol}>
                    <View style={styles.webCardQrBox}>
                      <Image
                        source={{ uri: qrImageUrl }}
                        style={styles.webCardQrImg}
                        resizeMode="contain"
                      />
                    </View>
                  </View>
                </View>

                {/* 3. FOOTER */}
                <View style={[styles.webCardFooter, { backgroundColor: activeCardTheme.primary, borderTopColor: activeCardTheme.accent }]}>
                  <View style={styles.webCardFooterLeft}>
                    <MaterialCommunityIcons name="book-open-outline" size={16} color={activeCardTheme.accent} />
                    <View style={{ marginLeft: 6 }}>
                      <Text style={styles.webCardMottoHeader}>Sekolah Unggulan</Text>
                      <Text style={styles.webCardMottoSub}>Berbasis Al-Qur'an</Text>
                    </View>
                  </View>
                  <View style={styles.webCardFooterDivider} />
                  <View style={styles.webCardFooterRight}>
                    <MaterialCommunityIcons name="web" size={14} color={activeCardTheme.accent} />
                    <Text style={styles.webCardWebText}>www.dareliman.sch.id</Text>
                  </View>
                </View>
              </View>
            ) : (
              // TAMPAK BELAKANG
              <View style={styles.webCardFrame}>
                <View style={styles.webCardHeaderRow}>
                  <View style={[styles.webCardWaveLeft, { backgroundColor: activeCardTheme.primary, borderColor: activeCardTheme.accent, width: '68%' }]}>
                    <View style={[styles.webCardLogoCircle, { borderColor: activeCardTheme.accent }]}>
                      <Image
                        source={require('../../assets/logo.png')}
                        style={styles.webCardLogoImg}
                        resizeMode="contain"
                      />
                    </View>
                    <View style={styles.webCardBrandCol}>
                      <Text style={styles.webCardYayasanLabel}>
                        {mobileConfig.branding?.school_name?.toUpperCase().includes('YAYASAN') ? 'LEMBAGA' : 'YAYASAN'}
                      </Text>
                      <Text numberOfLines={1} style={styles.webCardBrandName}>
                        {mobileConfig.branding?.school_name || student?.education_unit?.name || 'SEKOLAH'}
                      </Text>
                      <Text style={styles.webCardSchoolSub}>
                        {student?.education_unit?.name || mobileConfig.branding?.app_name || 'Sistem Terpadu SIMSIT'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.webCardHeaderRight}>
                    <View style={[styles.webCardPillBadge, { backgroundColor: activeCardTheme.dark }]}>
                      <Text style={styles.webCardPillText}>TATA TERTIB</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.webCardBackContent}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={[styles.webCardBackHeading, { color: activeCardTheme.primary }]}>
                      TATA TERTIB SISWA
                    </Text>
                    <View style={[styles.webCardBackDivider, { backgroundColor: activeCardTheme.accent }]} />
                    <View style={styles.webCardBackList}>
                      <Text style={styles.webCardBackItem}>
                        <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>1. </Text>
                        Kartu ini adalah kartu identitas resmi siswa {mobileConfig.branding?.school_name || student?.education_unit?.name || 'sekolah'}.
                      </Text>
                      <Text style={styles.webCardBackItem}>
                        <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>2. </Text>
                        Wajib dibawa & dikenakan selama jam KBM sekolah.
                      </Text>
                      <Text style={styles.webCardBackItem}>
                        <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>3. </Text>
                        Apabila menemukan kartu ini, harap mengembalikan ke piket sekolah.
                      </Text>
                      <Text style={styles.webCardBackItem}>
                        <Text style={{ fontWeight: '900', color: activeCardTheme.primary }}>4. </Text>
                        QR Code digunakan untuk absensi gerbang & verifikasi SIMSIT.
                      </Text>
                    </View>
                  </View>

                  <View style={styles.webCardBackQrCol}>
                    <View style={styles.webCardBackQrBox}>
                      <Image
                        source={{ uri: qrImageUrl }}
                        style={{ width: '100%', height: '100%' }}
                        resizeMode="contain"
                      />
                    </View>
                    <Text style={styles.webCardBackQrSub}>Scan Verifikasi</Text>
                  </View>
                </View>

                <View style={[styles.webCardFooter, { backgroundColor: activeCardTheme.primary, borderTopColor: activeCardTheme.accent }]}>
                  <View style={{ flex: 1 }}>
                    <Text numberOfLines={1} style={styles.webCardFooterAddress}>
                      Jl. Gajah Mada No. 28 Padang, Sumatera Barat
                    </Text>
                  </View>
                  <Text style={styles.webCardFooterPhone}>
                    Telp: (0751) 123456 · dareliman.or.id
                  </Text>
                </View>
              </View>
            )}
          </View>

          {/* Action Button: Tutup */}
          <TouchableOpacity
            activeOpacity={0.85}
            onPress={onClose}
            style={styles.qrCloseActionBtn}
          >
            <Text style={styles.qrCloseActionBtnText}>Tutup Kartu Siswa</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  idCardModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.7)',
    justifyContent: 'center',
    padding: 18,
  },
  idCardModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 20,
    elevation: 7,
  },
  idCardModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  idCardModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  qrModalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F1F5F9',
  },
  idCardTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 10,
    padding: 3,
    marginBottom: 14,
  },
  idCardTabBtn: {
    flex: 1,
    paddingVertical: 6,
    alignItems: 'center',
    borderRadius: 8,
  },
  idCardTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#000',
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  idCardTabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  idCardTabBtnTextActive: {
    color: '#084835',
    fontWeight: '900',
  },
  idCardPreviewBox: {
    marginBottom: 16,
    alignItems: 'center',
  },
  webCardFrame: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  webCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    height: 58,
    backgroundColor: '#FFFFFF',
  },
  webCardWaveLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    width: '68%',
    height: 56,
    borderBottomRightRadius: 34,
    borderBottomWidth: 3.5,
    borderRightWidth: 3.5,
    paddingLeft: 10,
    paddingRight: 14,
  },
  webCardLogoCircle: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    marginRight: 8,
    padding: 2,
  },
  webCardLogoImg: {
    width: '100%',
    height: '100%',
  },
  webCardBrandCol: {
    flex: 1,
  },
  webCardYayasanLabel: {
    fontSize: 7,
    fontWeight: '900',
    letterSpacing: 1.5,
    color: '#D1FAE5',
  },
  webCardBrandName: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  webCardSchoolSub: {
    fontSize: 7.5,
    fontWeight: '600',
    color: '#A7F3D0',
  },
  webCardHeaderRight: {
    flex: 1,
    alignItems: 'flex-end',
    paddingRight: 10,
  },
  webCardPillBadge: {
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 3.5,
  },
  webCardPillText: {
    fontSize: 8.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.8,
  },
  webCardMottoBox: {
    alignItems: 'flex-end',
    marginTop: 3,
  },
  webCardMottoText: {
    fontSize: 7.5,
    fontStyle: 'italic',
    fontWeight: '800',
  },
  webCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  webCardPhotoCol: {
    alignItems: 'center',
    width: 82,
    marginRight: 6,
  },
  webCardPhotoFrame: {
    width: 80,
    height: 94,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 2.5,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardPhotoImg: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
  },
  webCardPhotoFallback: {
    width: '100%',
    height: '100%',
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardPhotoFallbackText: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardUnitPill: {
    width: 80,
    height: 17,
    borderRadius: 8.5,
    borderWidth: 1.2,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    marginTop: 4,
  },
  webCardUnitPillText: {
    fontSize: 6.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardDetailsCol: {
    flex: 1,
    paddingHorizontal: 4,
  },
  webCardStudentName: {
    fontSize: 14,
    fontWeight: '900',
    letterSpacing: 0.2,
  },
  webCardOrnamentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    marginVertical: 3.5,
    width: '95%',
  },
  webCardOrnamentLine: {
    flex: 1,
    height: 1.2,
  },
  webCardTable: {
    gap: 3,
  },
  webTableRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webTableIconBox: {
    width: 16,
    height: 16,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
  },
  webTableLabel: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#334155',
    width: 68,
  },
  webTableColon: {
    fontSize: 8.5,
    fontWeight: '700',
    color: '#64748B',
    width: 8,
  },
  webTableVal: {
    flex: 1,
    fontSize: 9,
    fontWeight: '800',
    color: '#0F172A',
  },
  webCardQrCol: {
    alignItems: 'center',
    width: 82,
    marginLeft: 4,
  },
  webCardQrBox: {
    width: 80,
    height: 80,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 4,
    shadowColor: '#000',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardQrImg: {
    width: '100%',
    height: '100%',
  },
  webCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderTopWidth: 2.5,
  },
  webCardFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  webCardMottoHeader: {
    fontSize: 7.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  webCardMottoSub: {
    fontSize: 6.8,
    fontWeight: '600',
    color: '#D1FAE5',
  },
  webCardFooterDivider: {
    width: 1,
    height: 16,
    backgroundColor: 'rgba(255,255,255,0.25)',
  },
  webCardFooterRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  webCardWebText: {
    fontSize: 7.8,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  webCardBackContent: {
    flexDirection: 'row',
    padding: 10,
    alignItems: 'center',
  },
  webCardBackHeading: {
    fontSize: 9.5,
    fontWeight: '900',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  webCardBackDivider: {
    height: 1.5,
    width: '100%',
    marginBottom: 6,
  },
  webCardBackList: {
    gap: 4,
  },
  webCardBackItem: {
    fontSize: 7.5,
    color: '#334155',
    lineHeight: 11,
  },
  webCardBackQrCol: {
    alignItems: 'center',
    width: 70,
  },
  webCardBackQrBox: {
    width: 60,
    height: 60,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 3,
    alignItems: 'center',
    justifyContent: 'center',
  },
  webCardBackQrSub: {
    fontSize: 6.5,
    color: '#64748B',
    fontWeight: '700',
    marginTop: 2,
  },
  webCardFooterAddress: {
    fontSize: 7,
    color: '#D1FAE5',
    fontWeight: '700',
  },
  webCardFooterPhone: {
    fontSize: 7,
    color: '#D1FAE5',
    fontWeight: '700',
  },
  qrCloseActionBtn: {
    backgroundColor: '#084835',
    paddingVertical: 10,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  qrCloseActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});

export default StudentIdCardModal;
