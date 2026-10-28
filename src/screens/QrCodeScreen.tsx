import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole, isStudentRole, isTeacherRole, isStaffRole } from '../utils/roles';
import TeacherQrAttendanceHub from '../components/attendance/TeacherQrAttendanceHub';
import {
  getProfileImageUrl,
  getStudentAvatarSource,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { useActiveChildStore } from '../stores/activeChildStore';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');
const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function QrCodeScreen(props: any) {
  const user = useAuthStore((state) => state.user);
  const roles = user?.roles || [];
  const isParent = isParentRole(roles);
  const isStudent = isStudentRole(roles);
  const isTeacher = isTeacherRole(roles);
  const isStaff = isStaffRole(roles);
  const isEducator = isTeacher || (!isParent && !isStudent && isStaff);

  if (isEducator) {
    return <TeacherQrAttendanceHub {...props} user={user} />;
  }

  return <StudentQrCodeScreenContent {...props} />;
}

function StudentQrCodeScreenContent({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const user = useAuthStore((state) => state.user);
  const config = useMobileConfigStore((state) => state.config);
  const roles = user?.roles || [];
  const isParent = isParentRole(roles);
  const isStudent = isStudentRole(roles);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const globalChildren = useActiveChildStore((state) => state.children);

  // Parent & Student Data State
  const [children, setChildren] = useState<any[]>(() => {
    return Array.isArray(globalChildren) && globalChildren.length > 0 ? globalChildren : [];
  });
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    if (fromStore) return String(fromStore);
    if (Array.isArray(globalChildren) && globalChildren[0]) {
      return String(globalChildren[0].id || globalChildren[0].student_id);
    }
    return undefined;
  });
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [qrToken, setQrToken] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshingQr, setRefreshingQr] = useState<boolean>(false);

  // Modals
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [showChildSelectorModal, setShowChildSelectorModal] = useState<boolean>(false);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  // Synchronize with global active child store
  useEffect(() => {
    if (globalActiveChildId && String(globalActiveChildId) !== String(selectedChildId)) {
      setSelectedChildId(String(globalActiveChildId));
    }
  }, [globalActiveChildId]);

  useEffect(() => {
    if (Array.isArray(globalChildren) && globalChildren.length > 0) {
      setChildren(globalChildren);
    }
  }, [globalChildren]);

  // 1. Initial Load: Fetch children if parent or portal profile if student with offline cache
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
      const childCacheKey = offlineCache.buildKey('qr_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          setChildren(cached);
          if (targetChildId) {
            setSelectedChildId(String(targetChildId));
          } else {
            setSelectedChildId((prev) => prev || String(cached[0].id || cached[0].student_id));
          }
          setLoading(false);
        }
      })();

      mobileApiService
        .getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && list.length > 0) {
            setChildren(list);
            useActiveChildStore.getState().setChildren(list);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
            } else {
              setSelectedChildId((prev) => prev || String(list[0].id || list[0].student_id));
            }
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else if (isStudent) {
      const profCacheKey = offlineCache.buildKey('qr_profile', user?.id);
      void (async () => {
        const cachedProf = await offlineCache.get<any>(profCacheKey);
        if (cachedProf && isMounted) {
          setStudentInfo(cachedProf);
          setLoading(false);
        }
      })();

      mobileApiService
        .getPortalProfile()
        .then((res) => {
          const profData = unwrapApiData<any>(res) || res?.data || res;
          if (isMounted && profData) {
            setStudentInfo(profData);
            void offlineCache.set(profCacheKey, profData);
          }
        })
        .catch(() => {})
        .finally(() => {
          if (isMounted) setLoading(false);
        });
    } else {
      setLoading(false);
    }

    return () => {
      isMounted = false;
    };
  }, [isParent, isStudent, user?.id]);

  // Handle selectedChildId sync with route params
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id;
    if (incomingId && String(incomingId) !== String(selectedChildId)) {
      setSelectedChildId(String(incomingId));
    }
  }, [route?.params?.child_id, route?.params?.student_id]);

  // 2. Fetch authoritative attendance QR token when selected child changes with offline cache
  useEffect(() => {
    let isMounted = true;
    const fetchQr = async () => {
      const targetId = isParent ? selectedChildId : undefined;
      if (isParent && !targetId) return;
      const qrCacheKey = offlineCache.buildKey('qr_token', user?.id, targetId || 'self');

      // Baca cache dulu
      const cachedToken = await offlineCache.get<string>(qrCacheKey);
      if (cachedToken && isMounted) {
        setQrToken(cachedToken);
      }

      try {
        const res = await mobileApiService.getPortalAttendanceQr(targetId);
        const data = unwrapApiData<any>(res) || res?.data || res;
        if (isMounted && data?.qr_token) {
          setQrToken(data.qr_token);
          void offlineCache.set(qrCacheKey, data.qr_token);
        }
      } catch {
        // Fallback to cached token or NIS/ID gracefully handled in render
      }
    };

    void fetchQr();

    return () => {
      isMounted = false;
    };
  }, [isParent, selectedChildId, user?.id]);

  // Active child resolution
  const activeChild = useMemo(() => {
    if (isParent) {
      if (selectedChildId) {
        const found = children.find((c) => String(c.id || c.student_id) === String(selectedChildId));
        if (found) return found;
      }
      return children[0] || null;
    }
    if (isStudent) {
      return studentInfo || user?.student || user || null;
    }
    return user || null;
  }, [isParent, isStudent, children, selectedChildId, studentInfo, user]);

  // Profile data resolution
  const isSantri = Boolean(
    activeChild?.is_santri ||
    activeChild?.asrama ||
    activeChild?.education_unit?.name?.toLowerCase().includes('ponpes') ||
    activeChild?.education_unit?.name?.toLowerCase().includes('pesantren')
  );
  const studentRoleLabel = isSantri ? 'Santri' : 'Siswa';

  const childFullName =
    activeChild?.full_name ||
    activeChild?.nama_lengkap ||
    activeChild?.name ||
    user?.name ||
    studentRoleLabel;

  const childNis = activeChild?.nis || activeChild?.nisn || activeChild?.nomor_induk || '-';
  const childClass =
    activeChild?.kelas?.nama_kelas ||
    activeChild?.kelas?.name ||
    activeChild?.classroom?.name ||
    activeChild?.rombel ||
    '-';
  const childUnit =
    activeChild?.educationUnit?.name ||
    activeChild?.education_unit?.name ||
    activeChild?.unit_name ||
    activeChild?.education_unit_name ||
    activeChild?.kelas?.unitPendidikan?.name ||
    config?.branding?.school_name ||
    'Unit Pendidikan';

  const childAvatarSource = useMemo(() => {
    return getStudentAvatarSource(activeChild);
  }, [activeChild]);

  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(activeChild);
  }, [activeChild]);

  // QR Code payload: Official backend token stuqr:v1:... (verified for gate & lesson attendance), fallback to NIS
  const qrCodeData = qrToken || (childNis !== '-' ? childNis : String(activeChild?.id || 'SIMSIT-STUDENT'));

  // Refresh all data
  const handleRefreshAll = async () => {
    setLoading(true);
    try {
      if (isParent) {
        const res = await mobileApiService.getPortalChildren();
        const list = unwrapApiData<any[]>(res) || [];
        setChildren(list);
        if (list.length > 0) {
          const currentValid = list.some((c) => String(c.id) === String(selectedChildId));
          const targetId = currentValid ? selectedChildId : String(list[0].id);
          setSelectedChildId(targetId);

          const qrRes = await mobileApiService.getPortalAttendanceQr(targetId);
          const qrData = unwrapApiData<any>(qrRes) || qrRes?.data || qrRes;
          if (qrData?.qr_token) setQrToken(qrData.qr_token);
        }
      } else if (isStudent) {
        const qrRes = await mobileApiService.getPortalAttendanceQr();
        const qrData = unwrapApiData<any>(qrRes) || qrRes?.data || qrRes;
        if (qrData?.qr_token) setQrToken(qrData.qr_token);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleManualRefreshQr = async () => {
    setRefreshingQr(true);
    try {
      const targetId = isParent ? selectedChildId : undefined;
      const qrRes = await mobileApiService.getPortalAttendanceQr(targetId);
      const qrData = unwrapApiData<any>(qrRes) || qrRes?.data || qrRes;
      if (qrData?.qr_token) {
        setQrToken(qrData.qr_token);
        setFeedbackModal({
          visible: true,
          type: 'success',
          title: 'QR Diperbarui',
          message: 'Kode QR presensi berhasil diperbarui dari server sekolah.',
        });
      } else {
        setFeedbackModal({
          visible: true,
          type: 'info',
          title: 'Kode QR Siap',
          message: 'Kode QR presensi aktif dan siap digunakan untuk pemindaian.',
        });
      }
    } catch {
      setFeedbackModal({
        visible: true,
        type: 'info',
        title: 'Kode QR Siap Digunakan',
        message: 'Kode QR presensi aktif dari penyimpanan perangkat dan siap digunakan.',
      });
    } finally {
      setRefreshingQr(false);
    }
  };

  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation);
    if (!handled) {
      navigation?.navigate('Beranda');
    }
  };

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH DENGAN GRADASI EMERALD BERSIH ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image source={PARENT_HOME_BG} style={styles.topFoliageBgImage} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN UTAMA & TAGIHAN ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={handleBack}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={22} color="#004D32" />
        </TouchableOpacity>

        <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
          QR Code Presensi
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.cleanBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── MAIN SCROLL SHEET CONTAINER ── */}
      <View style={styles.sheetContainer}>
        <ScrollView
          style={styles.screenScroll}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: bottomInset + 80 },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={loading}
              onRefresh={handleRefreshAll}
              colors={['#059669', '#10B981']}
              tintColor="#059669"
            />
          }
        >
          {/* ── 0. OPEN PROFILE ROW TERPADU ── */}
          <View style={styles.studentProfileRow}>
            {/* 60x60 Avatar with Mint Ring (Klik untuk Buka KTS Siswa) */}
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => setSelectedIdCardStudent(activeChild)}
              style={styles.studentAvatarRing}
              accessibilityRole="button"
              accessibilityLabel="Lihat Kartu Pelajar"
            >
              <Image
                source={childAvatarSource}
                style={styles.studentAvatarImg}
                resizeMode="cover"
              />
            </TouchableOpacity>

            {/* 3-tier identity & action */}
            <View style={styles.studentProfileInfoCol}>
              <TouchableOpacity
                activeOpacity={isParent && children && children.length > 1 ? 0.75 : 1}
                onPress={isParent && children && children.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
                style={styles.studentNameRow}
              >
                <Text numberOfLines={1} style={styles.studentProfileName}>
                  {childFullName}
                </Text>
              </TouchableOpacity>

              {/* Baris 2: Unit Pendidikan Dinamis */}
              {childUnit ? (
                <View style={styles.studentMetaRow}>
                  <MaterialCommunityIcons
                    name="school-outline"
                    size={12}
                    color="#047857"
                    style={{ marginRight: 4 }}
                  />
                  <Text numberOfLines={1} style={styles.studentProfileUnitText}>
                    {childUnit}
                  </Text>
                </View>
              ) : null}

              {/* Baris 3: Kelas Siswa Dinamis */}
              {childClass && childClass !== '-' ? (
                <View style={styles.studentMetaRow}>
                  <MaterialCommunityIcons
                    name="door-open"
                    size={12}
                    color="#065F46"
                    style={{ marginRight: 4 }}
                  />
                  <Text numberOfLines={1} style={styles.studentProfileClassText}>
                    {childClass}
                  </Text>
                </View>
              ) : null}

              {/* Baris Aksi Terpadu */}
              <View style={styles.studentActionBadgeRow}>
                {isParent && children && children.length > 1 && (
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setShowChildSelectorModal(true)}
                    style={styles.parentGantiAnakBtn}
                    accessibilityRole="button"
                    accessibilityLabel="Ganti Siswa"
                  >
                    <Text style={styles.parentGantiAnakBtnText}>Ganti Siswa</Text>
                    <MaterialCommunityIcons name="chevron-down" size={15} color="#FFFFFF" />
                  </TouchableOpacity>
                )}

                <View
                  style={[
                    styles.studentStatusBadge,
                    { backgroundColor: attendanceStatus.bg, borderColor: attendanceStatus.border },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={attendanceStatus.icon}
                    size={12}
                    color={attendanceStatus.color}
                    style={{ marginRight: 4 }}
                  />
                  <Text style={[styles.studentStatusBadgeText, { color: attendanceStatus.color }]}>
                    {attendanceStatus.label}
                  </Text>
                </View>
              </View>
            </View>
          </View>

          {/* ── 1. MAIN CARD: QR CODE PRESENSI RESMI ── */}
          <View style={styles.mainCardWrapper}>
            {/* Top Identity Tag */}
            <View style={styles.cardTopBadgeRow}>
              <View style={styles.badgePillNis}>
                <MaterialCommunityIcons name="card-account-details-outline" size={13} color="#004D32" />
                <Text style={styles.badgePillNisText}>NIS: {childNis}</Text>
              </View>

              <View style={styles.badgePillRole}>
                <MaterialCommunityIcons name="shield-check-outline" size={12} color="#047857" />
                <Text style={styles.badgePillRoleText}>{studentRoleLabel} Aktif</Text>
              </View>
            </View>

            {/* QR CODE CONTAINER BOX */}
            <View style={styles.qrContainerBox}>
              <View style={styles.qrFrameCard}>
                <Image
                  source={{
                    uri: `https://api.qrserver.com/v1/create-qr-code/?size=320x320&data=${encodeURIComponent(qrCodeData)}`,
                  }}
                  style={styles.qrCodeImage}
                  resizeMode="contain"
                />
              </View>

              {/* VERIFICATION BADGE */}
              <View style={styles.verifiedBadgeRow}>
                <View style={styles.greenPulseDot} />
                <Text style={styles.verifiedBadgeText}>
                  {`QR Code Presensi ${studentRoleLabel} Terverifikasi`}
                </Text>
              </View>

              {/* DUAL-PURPOSE COMPLIANCE INSTRUCTION */}
              <Text style={styles.qrInstructionText}>
                Kode QR resmi untuk absensi gerbang sekolah (masuk & pulang) serta absensi kehadiran sesi mata pelajaran di kelas.
              </Text>

              {/* REFRESH TOKEN BUTTON */}
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={handleManualRefreshQr}
                disabled={refreshingQr}
                style={styles.refreshQrBtn}
                accessibilityRole="button"
                accessibilityLabel="Perbarui Kode QR"
              >
                {refreshingQr ? (
                  <ActivityIndicator size="small" color="#004D32" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="refresh" size={16} color="#004D32" />
                    <Text style={styles.refreshQrBtnText}>Perbarui Kode QR</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>

          {/* ── 2. KARTU PANDUAN PENGGUNAAN (SQUIRCLE MINT) ── */}
          <View style={styles.guidanceCard}>
            <View style={styles.guidanceIconBoxGreen}>
              <MaterialCommunityIcons name="gate" size={20} color="#004D32" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.guidanceTitle}>Absensi Gerbang Sekolah</Text>
              <Text style={styles.guidanceText}>
                Arahkan layar ponsel ke pemindai gerbang saat santri datang atau pulang. Sistem otomatis mencatat waktu kedatangan & mengirimkan laporan ke orang tua.
              </Text>
            </View>
          </View>

          <View style={[styles.guidanceCard, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD', marginTop: 10 }]}>
            <View style={styles.guidanceIconBoxBlue}>
              <MaterialCommunityIcons name="book-education-outline" size={20} color="#0284C7" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.guidanceTitle, { color: '#0369A1' }]}>Absensi Pelajaran di Kelas</Text>
              <Text style={[styles.guidanceText, { color: '#0C4A6E' }]}>
                Dapat dipindai langsung oleh ustadz/guru pengampu saat sesi pembelajaran berlangsung untuk memverifikasi presensi KBM secara real-time.
              </Text>
            </View>
          </View>
        </ScrollView>
      </View>

      {/* ── MODAL PILIH ANANDA ── */}
      {isParent && (
        <Modal
          visible={showChildSelectorModal}
          transparent
          animationType="fade"
          onRequestClose={() => setShowChildSelectorModal(false)}
        >
          <View style={styles.childModalBackdrop}>
            <TouchableOpacity
              style={StyleSheet.absoluteFill}
              activeOpacity={1}
              onPress={() => setShowChildSelectorModal(false)}
            />
            <View style={styles.childModalSheet}>
              <View style={styles.childModalHeader}>
                <Text style={styles.childModalTitle}>Pilih Ananda</Text>
                <TouchableOpacity onPress={() => setShowChildSelectorModal(false)}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>
              <ScrollView style={{ maxHeight: 320 }}>
                {children.map((c: any, idx: number) => {
                  const cId = String(c.id || c.student_id);
                  const isSelected = cId === String(selectedChildId);
                  const cName =
                    (typeof c.name === 'string' && c.name) ||
                    (typeof c.nama_lengkap === 'string' && c.nama_lengkap) ||
                    (typeof c.full_name === 'string' && c.full_name) ||
                    'Ananda';
                  const cUnit =
                    c.educationUnit?.name ||
                    c.education_unit?.name ||
                    c.unit_name ||
                    c.education_unit_name ||
                    c.kelas?.unitPendidikan?.name ||
                    '';
                  const cClass =
                    c.kelas?.nama_kelas ||
                    c.kelas?.name ||
                    c.class?.name ||
                    c.class_name ||
                    '';

                  return (
                    <TouchableOpacity
                      key={cId || idx}
                      activeOpacity={0.8}
                      onPress={() => {
                        setShowChildSelectorModal(false);
                        setSelectedChildId(cId);
                        useActiveChildStore.getState().setActiveChildId(cId);
                      }}
                      style={[
                        styles.childModalItem,
                        isSelected && styles.childModalItemActive,
                      ]}
                    >
                      <Image
                        source={getStudentAvatarSource(c)}
                        style={styles.childModalAvatar}
                        resizeMode="cover"
                      />
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text
                          style={[
                            styles.childModalItemName,
                            isSelected && { color: '#004D32', fontWeight: '800' },
                          ]}
                        >
                          {cName}
                        </Text>
                        <Text style={styles.childModalItemSub}>
                          {cUnit ? `${cUnit} • ` : ''}{cClass || 'Siswa'}
                        </Text>
                      </View>
                      {isSelected && (
                        <MaterialCommunityIcons name="check-circle" size={20} color="#004D32" />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>
          </View>
        </Modal>
      )}

      {/* ── MODAL KARTU PELAJAR (KTS) ── */}
      <StudentIdCardModal
        visible={!!selectedIdCardStudent}
        student={selectedIdCardStudent}
        onClose={() => setSelectedIdCardStudent(null)}
      />

      {/* Universal Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  topFoliageWrapper: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
  },
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cleanHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  cleanHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  cleanBellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screenScroll: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  /* 0. Open Profile Row */
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  studentAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: '#10B981',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  studentProfileInfoCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  studentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentProfileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.3,
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  studentProfileUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  studentProfileClassText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#047857',
  },
  studentActionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  parentGantiAnakBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D32',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  parentGantiAnakBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  studentStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  /* 1. Main Card: Student Profile & QR */
  mainCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  cardTopBadgeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  badgePillNis: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 9,
    gap: 5,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgePillNisText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#004D32',
  },
  badgePillRole: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderRadius: 8,
    paddingVertical: 4,
    paddingHorizontal: 8,
    gap: 4,
  },
  badgePillRoleText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },

  /* QR Container */
  qrContainerBox: {
    alignItems: 'center',
  },
  qrFrameCard: {
    width: 230,
    height: 230,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 3,
  },
  qrCodeImage: {
    width: 206,
    height: 206,
  },
  verifiedBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#F0FDF4',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 7,
  },
  greenPulseDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#10B981',
  },
  verifiedBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },
  qrInstructionText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 10,
    lineHeight: 18,
    maxWidth: 290,
  },
  refreshQrBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    backgroundColor: '#ECFDF5',
    paddingVertical: 8,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    gap: 6,
  },
  refreshQrBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#004D32',
  },

  /* 2. Guidance Cards */
  guidanceCard: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    marginTop: 14,
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    gap: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  guidanceIconBoxGreen: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  guidanceIconBoxBlue: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  guidanceTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#004D32',
    marginBottom: 3,
  },
  guidanceText: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 17,
  },

  /* Modal Pilih Ananda */
  childModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  childModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  childModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  childModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  childModalItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#004D32',
  },
  childModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  childModalItemName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalItemSub: {
    fontSize: 11.5,
    color: '#047857',
    marginTop: 2,
  },
});
