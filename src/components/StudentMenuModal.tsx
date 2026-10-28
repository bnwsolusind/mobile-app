import React, { useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  Dimensions,
  Pressable,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { getProfileImageUrl, DEFAULT_STUDENT_BOY_AVATAR, DEFAULT_STUDENT_GIRL_AVATAR, isGirlStudent } from '../utils/profile';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export interface StudentMenuItem {
  label: string;
  icon: string;
  color: string;
  bg: string;
  route: string;
  tab?: string;
  badge?: string;
}

export interface StudentMenuModalProps {
  visible: boolean;
  student: any;
  onClose: () => void;
  navigation?: any;
}

export const StudentMenuModal: React.FC<StudentMenuModalProps> = ({
  visible,
  student,
  onClose,
  navigation,
}) => {
  if (!student) return null;

  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const sName = student.full_name || student.nama_lengkap || student.name || 'Ananda';
  const sNis = student.nis || student.student_nisn || '-';
  const sNisn = student.nisn || student.student_nisn || '';
  const sUnit =
    student.kelas?.unit_pendidikan?.name ||
    student.kelas?.unitPendidikan?.name ||
    student.education_unit?.name ||
    student.unit_name ||
    student.unit ||
    'Unit Sekolah';
  const sKelas =
    student.kelas?.nama_kelas ||
    student.kelas?.name ||
    student.class_name ||
    student.kelas_name ||
    'Kelas Aktif';

  const isGirl = isGirlStudent(student);

  const avatarUri = getProfileImageUrl(student);

  const menuItems: StudentMenuItem[] = useMemo(() => {
    const list: StudentMenuItem[] = [
      { label: 'Jadwal Pelajaran', icon: 'calendar-clock', color: '#0D9488', bg: '#ECFDF5', route: 'Jadwal' },
      { label: 'Tugas LMS', icon: 'clipboard-text-outline', color: '#10B981', bg: '#ECFDF5', route: 'Tugas' },
      { label: 'Materi Belajar', icon: 'book-open-page-variant', color: '#0284C7', bg: '#EFF6FF', route: 'Materi' },
      { label: 'Penilaian & Rapor', icon: 'chart-box-outline', color: '#8B5CF6', bg: '#F5F3FF', route: 'Nilai' },
      { label: 'Tahfizh Al-Qur\'an', icon: 'book-marker', color: '#059669', bg: '#ECFDF5', route: 'Tahfizh' },
      { label: 'Mutaba\'ah Yaumiyyah', icon: 'clipboard-check-outline', color: '#D97706', bg: '#FFFBEB', route: 'Mutabaah' },
      { label: 'Buku Hubung', icon: 'notebook-edit-outline', color: '#E11D48', bg: '#FFF1F2', route: 'Komentar' },
      { label: 'Bank Soal', icon: 'database-outline', color: '#0D9488', bg: '#E6FFFA', route: 'BankSoal' },
      { label: 'Presensi Siswa', icon: 'account-check-outline', color: '#059669', bg: '#ECFDF5', route: 'Absensi' },
      { label: 'Perizinan Santri', icon: 'file-document-edit-outline', color: '#EF4444', bg: '#FEF2F2', route: 'Perizinan', tab: 'permissions' },
    ];

    // Menu Tagihan & SPP (Eksklusif Wali Murid)
    if (isParent || (user as any)?.roles?.includes('Parent')) {
      list.push({
        label: 'Tagihan SPP',
        icon: 'cash-multiple',
        color: '#059669',
        bg: '#ECFDF5',
        route: 'Tagihan',
      });
    }

    list.push(
      { label: 'Chat Guru', icon: 'chat-processing-outline', color: '#2563EB', bg: '#EFF6FF', route: 'Chat' },
      { label: 'Ujian CBT', icon: 'laptop', color: '#2563EB', bg: '#EFF6FF', route: 'CbtExams' },
      { label: 'Kisi-kisi', icon: 'file-question', color: '#EF4444', bg: '#FEF2F2', route: 'KisiKisi' },
      { label: 'Kalender Akademik', icon: 'calendar-month-outline', color: '#0284C7', bg: '#F0F9FF', route: 'Kalender' },
      { label: 'Informasi', icon: 'bullhorn-outline', color: '#E11D48', bg: '#FFF1F2', route: 'Informasi' },
      { label: 'Al-Qur\'an', icon: 'book-open-variant', color: '#059669', bg: '#F0FDF4', route: 'Quran' },
      { label: 'Doa & Dzikir', icon: 'hands-pray', color: '#F97316', bg: '#FFF7ED', route: 'DoaDzikir' }
    );

    return list;
  }, [isParent, user]);

  const handleMenuPress = (item: StudentMenuItem) => {
    onClose();

    const studentId = student?.id || student?.student_id;
    if (studentId) {
      useActiveChildStore.getState().setActiveChildId(studentId);
    }

    if (!navigation) return;

    const isGeneralIslamic = item.route === 'Quran' || item.route === 'DoaDzikir';
    const navParams: Record<string, any> = {};

    if (item.tab) {
      navParams.tab = item.tab;
    }

    if (studentId && !isGeneralIslamic) {
      navParams.child_id = String(studentId);
      navParams.student_id = String(studentId);
      navParams.single_child_only = true;
      navParams.from_child_portal = true;
    }

    navigation.navigate(
      item.route,
      Object.keys(navParams).length > 0 ? navParams : undefined
    );
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent={true}
      statusBarTranslucent
      onRequestClose={onClose}
    >
      <View style={styles.modalBackdrop}>
        {/* Backdrop dismiss touchable */}
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />

        <View style={styles.sheetContainer}>
          {/* Header Gradient Emerald */}
          <LinearGradient
            colors={['#064E3B', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sheetHeaderGradient}
          >
            {/* Lingkaran Ornamen Dekoratif */}
            <View style={styles.decorCircle1} />
            <View style={styles.decorCircle2} />

            <View style={styles.headerTopRow}>
              <View style={styles.headerTitleCol}>
                <View style={styles.headerTagBadge}>
                  <MaterialCommunityIcons name="view-grid" size={12} color="#A7F3D0" />
                  <Text style={styles.headerTagText}>MENU TERPADU ANANDA</Text>
                </View>
                <Text numberOfLines={1} style={styles.headerStudentName}>
                  {sName}
                </Text>
                <View style={styles.headerSubRow}>
                  <MaterialCommunityIcons name="school" size={13} color="#D1FAE5" />
                  <Text numberOfLines={1} style={styles.headerSubText}>
                    {sKelas} · {sUnit}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                onPress={onClose}
                style={styles.headerCloseBtn}
                accessibilityLabel="Tutup Menu"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="close" size={20} color="#064E3B" />
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Student Identity Mini Bar */}
          <View style={styles.studentInfoBar}>
            <View style={styles.studentAvatarWrap}>
              {avatarUri ? (
                <Image source={{ uri: avatarUri }} style={styles.studentAvatarImg} resizeMode="cover" />
              ) : (
                <Image
                  source={isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR}
                  style={styles.studentAvatarImg}
                  resizeMode="cover"
                />
              )}
            </View>
            <View style={styles.studentInfoCol}>
              <Text style={styles.studentNisBadgeText}>
                NIS: {sNis} {sNisn && sNisn !== '-' ? `· NISN: ${sNisn}` : ''}
              </Text>
              <Text style={styles.studentCalloutText}>
                Akses cepat ke seluruh modul & fasilitas ananda
              </Text>
            </View>
            <View style={styles.activeStatusChip}>
              <View style={styles.activeStatusDot} />
              <Text style={styles.activeStatusText}>Aktif</Text>
            </View>
          </View>

          {/* Grid Menu Content */}
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.menuGridContainer}>
              {menuItems.map((item, idx) => (
                <TouchableOpacity
                  key={`menu-item-${idx}`}
                  activeOpacity={0.72}
                  style={styles.menuGridItem}
                  onPress={() => handleMenuPress(item)}
                >
                  <View style={[styles.menuIconSquircle, { backgroundColor: item.bg }]}>
                    <MaterialCommunityIcons
                      name={item.icon as any}
                      size={26}
                      color={item.color}
                    />
                  </View>
                  <Text numberOfLines={2} style={styles.menuItemLabel}>
                    {item.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    width: '100%',
    maxHeight: SCREEN_HEIGHT * 0.84,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 20,
  },
  sheetHeaderGradient: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -20,
    right: 40,
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -30,
    left: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  headerTitleCol: {
    flex: 1,
    marginRight: 12,
  },
  headerTagBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  headerTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#A7F3D0',
    letterSpacing: 0.8,
  },
  headerStudentName: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 2,
  },
  headerSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerSubText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#D1FAE5',
  },
  headerCloseBtn: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  studentInfoBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderBottomWidth: 1,
    borderBottomColor: '#DCFCE7',
    paddingHorizontal: 20,
    paddingVertical: 10,
    gap: 10,
  },
  studentAvatarWrap: {
    width: 38,
    height: 38,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#10B981',
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  studentInfoCol: {
    flex: 1,
  },
  studentNisBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  studentCalloutText: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '500',
    marginTop: 1,
  },
  activeStatusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  activeStatusDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#065F46',
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
  },
  menuGridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
    rowGap: 14,
  },
  menuGridItem: {
    width: `${100 / 4}%`,
    alignItems: 'center',
    paddingHorizontal: 2,
  },
  menuIconSquircle: {
    width: 58,
    height: 58,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  menuItemLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    marginTop: 6,
    lineHeight: 14,
  },
});

export default StudentMenuModal;
