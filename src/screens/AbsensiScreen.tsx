import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../services/api';
import { AttendancePayload, mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { canUseQrAttendance } from '../utils/accessControl';
import { isParentRole, isStudentRole, isTeacherRole, roleLabel } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Child = Record<string, any>;
type AttendanceItem = Record<string, any>;
type PermissionItem = Record<string, any>;

const formatTanggalIndo = (val: unknown): string => {
  if (!val) return '-';
  const str = String(val);
  const d = new Date(str.includes('T') ? str : `${str}T00:00:00`);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'short', year: 'numeric' });
};

const formatJamIndo = (val: unknown): string => {
  if (!val) return '-';
  const str = String(val);
  if (str.length === 5 || str.length === 8) return str.slice(0, 5) + ' WIB';
  const d = new Date(str);
  if (Number.isNaN(d.getTime())) return str;
  return d.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' }) + ' WIB';
};

export default function AbsensiScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16;

  const user = useAuthStore((state) => state.user);
  const employeeId = useAuthStore((state) => state.scope?.employee_id);
  const config = useMobileConfigStore((state) => state.config);
  const qrEnabled = canUseQrAttendance(user, config);

  const isParent = isParentRole(user?.roles || []);
  const isStudent = isStudentRole(user?.roles || []);
  const isStaff = !isParent && !isStudent;

  // Children & Student Context
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

  // Core Data States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');

  // Attendance & Permissions Data (100% Real Database)
  const [attendanceLogs, setAttendanceLogs] = useState<AttendanceItem[]>([]);
  const [permissionsHistory, setPermissionsHistory] = useState<PermissionItem[]>([]);

  // Employee Specific Data
  const [employeeHistory, setEmployeeHistory] = useState<any[]>([]);
  const [employeeStats, setEmployeeStats] = useState<any>(null);
  const [savingAttendance, setSavingAttendance] = useState<boolean>(false);

  // UI Filtering & Search
  const [activeTab, setActiveTab] = useState<'all' | 'attendance' | 'permissions'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // Modals
  const [selectedDetail, setSelectedDetail] = useState<any | null>(null);
  const [isDetailModalOpen, setIsDetailModalOpen] = useState<boolean>(false);
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState<boolean>(false);

  // Permission Form State
  const [permType, setPermType] = useState<string>('Izin');
  const [permStartDate, setPermStartDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [permEndDate, setPermEndDate] = useState<string>(new Date().toISOString().slice(0, 10));
  const [permReason, setPermReason] = useState<string>('');
  const [permSubmitting, setPermSubmitting] = useState<boolean>(false);

  // ── 1. Load Children if Parent (Isolasi data 1 anak terpilih jika ada child_id) ──
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      const targetChildId = route?.params?.child_id;
      const filteredList = targetChildId
        ? list.filter((c) => String(c.id) === String(targetChildId))
        : list;
      setChildren(filteredList.length > 0 ? filteredList : list);
      if (filteredList.length > 0) {
        setSelectedChildId(String(filteredList[0].id));
      } else if (list.length > 0) {
        setSelectedChildId((prev) => prev || String(list[0].id));
      }
    } catch (err) {
      console.warn('Failed to load portal children:', err);
    }
  }, [isParent, route?.params?.child_id]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // Handle student carousel scroll
  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50;
    const gap = 12;
    const index = Math.round(offsetX / (cardWidth + gap));
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        setSelectedChildId(String(targetChild.id));
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    const cardWidth = SCREEN_WIDTH - 50;
    const gap = 12;
    studentScrollRef.current?.scrollTo({
      x: index * (cardWidth + gap),
      animated: true,
    });
  };

  // ── 2. Load Attendance & Permissions Data ──
  const loadAttendanceData = useCallback(async () => {
    setError('');
    const cacheKey = offlineCache.buildKey('absensi', user?.id, selectedChildId || 'staff');
    // 1. Baca cache dulu
    const cached = await offlineCache.get<{ logs: AttendanceItem[]; perms: PermissionItem[]; empHistory: any[]; empStats: any }>(cacheKey);
    if (cached) {
      if (cached.logs?.length > 0) setAttendanceLogs(cached.logs);
      if (cached.perms?.length > 0) setPermissionsHistory(cached.perms);
      if (cached.empHistory?.length > 0) setEmployeeHistory(cached.empHistory);
      if (cached.empStats) setEmployeeStats(cached.empStats);
    }
    // 2. Fetch dari backend
    try {
      if (isParent || isStudent) {
        const targetId = isParent ? selectedChildId : undefined;
        const [attRes, permRes] = await Promise.allSettled([
          mobileApiService.getPortalAttendance(targetId),
          mobileApiService.getPortalPermissions(targetId),
        ]);

        let logs: AttendanceItem[] = [];
        let perms: PermissionItem[] = [];

        if (attRes.status === 'fulfilled') {
          const raw = attRes.value?.data || attRes.value || [];
          logs = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
          setAttendanceLogs(logs);
        }
        if (permRes.status === 'fulfilled') {
          const rawP = permRes.value?.data || permRes.value || [];
          perms = Array.isArray(rawP?.data) ? rawP.data : (Array.isArray(rawP) ? rawP : []);
          setPermissionsHistory(perms);
        }
        if (isStudent) {
          setStudentInfo((prev: any) => prev || user?.student || user);
        }
        // 3. Simpan ke cache
        if (logs.length > 0 || perms.length > 0) {
          void offlineCache.set(cacheKey, { logs, perms, empHistory: [], empStats: null });
        }
      } else if (isStaff) {
        if (employeeId) {
          const [repRes, statsRes] = await Promise.allSettled([
            mobileApiService.getAttendanceReport({ employee_id: employeeId, per_page: 50 }),
            mobileApiService.getAttendanceStats({ employee_id: employeeId }),
          ]);

          let empHistory: any[] = [];
          let empStats: any = null;

          if (repRes.status === 'fulfilled') {
            const res = repRes.value;
            empHistory = Array.isArray(res?.records)
              ? res.records
              : Array.isArray(res?.data)
                ? res.data
                : Array.isArray(res?.data?.data)
                  ? res.data.data
                  : [];
            setEmployeeHistory(empHistory);
          }
          if (statsRes.status === 'fulfilled') {
            empStats = statsRes.value?.data || statsRes.value || null;
            setEmployeeStats(empStats);
          }
          // 3. Simpan ke cache
          if (empHistory.length > 0 || empStats) {
            void offlineCache.set(cacheKey, { logs: [], perms: [], empHistory, empStats });
          }
        }
      }
    } catch (err: any) {
      // Offline: data cache sudah tampil dari step 1
      setError(getApiErrorMessage(err, 'Data presensi belum dapat dimuat.'));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, isStudent, isStaff, selectedChildId, employeeId, user]);


  useEffect(() => {
    setLoading(true);
    void loadAttendanceData();
  }, [loadAttendanceData]);

  const onRefresh = () => {
    setRefreshing(true);
    void loadAttendanceData();
  };

  // ── 3. Calculate Stats for Student / Parent ──
  const studentStats = useMemo(() => {
    let hadir = 0;
    let terlambat = 0;
    let izin = 0;
    let sakit = 0;
    let alpa = 0;

    attendanceLogs.forEach((item) => {
      const st = (item.status_hadir || item.status_label || item.status || '').toLowerCase();
      if (st.includes('hadir') || st.includes('present')) hadir++;
      else if (st.includes('terlambat') || st.includes('late')) terlambat++;
      else if (st.includes('izin')) izin++;
      else if (st.includes('sakit')) sakit++;
      else if (st.includes('alpa') || st.includes('alpha')) alpa++;
    });

    const total = attendanceLogs.length;
    const percentage = total > 0 ? Math.round(((hadir + terlambat) / total) * 100) : 100;

    return { hadir, terlambat, izin, sakit, alpa, total, percentage };
  }, [attendanceLogs]);

  // ── 4. Unified List Items ──
  const unifiedItems = useMemo(() => {
    if (isStaff) {
      return employeeHistory.map((item, idx) => ({
        id: item.id || `emp-${idx}`,
        category: 'employee',
        title: 'Presensi Kerja Pegawai',
        subtitle: item.location || item.keterangan || 'Presensi Mandiri Mobile',
        date: item.attendance_date || item.created_at,
        time: item.check_in_time ? `Masuk: ${formatJamIndo(item.check_in_time)}` : '-',
        timeOut: item.check_out_time ? `Pulang: ${formatJamIndo(item.check_out_time)}` : '-',
        status: item.status || 'HADIR',
        statusKey: String(item.status || '').toLowerCase(),
        raw: item,
      }));
    }

    const list: any[] = [];

    // Presensi Pembelajaran (LMS)
    if (activeTab === 'all' || activeTab === 'attendance') {
      attendanceLogs.forEach((item, idx) => {
        const subjectName =
          item.jadwal_pelajaran?.subject?.name ||
          item.jadwalPelajaran?.subject?.name ||
          item.session?.subject?.name ||
          item.session?.schedule?.subject?.name ||
          item.subject_name ||
          'Presensi Pembelajaran';
        const teacherName =
          item.jadwal_pelajaran?.employee?.nama_lengkap ||
          item.session?.schedule?.employee?.nama_lengkap ||
          item.teacher_name ||
          'Guru Pengampu';
        const rawStatus = item.status_hadir || item.status || 'hadir';
        const statusLabel =
          item.status_label ||
          (rawStatus ? rawStatus.charAt(0).toUpperCase() + rawStatus.slice(1) : 'Hadir');

        list.push({
          id: item.id || `att-${idx}`,
          category: 'attendance',
          title: subjectName,
          subtitle: teacherName,
          date: item.tanggal || item.created_at || item.date,
          time: item.arrival_time || item.waktu_presensi || 'Tepat Waktu',
          status: statusLabel,
          statusKey: String(rawStatus).toLowerCase(),
          notes: item.catatan || item.keterangan || '',
          raw: item,
        });
      });
    }

    // Perizinan
    if (activeTab === 'all' || activeTab === 'permissions') {
      permissionsHistory.forEach((perm, idx) => {
        const rawStatus = perm.status || 'pending';
        const statusLabel =
          rawStatus === 'approved'
            ? 'Disetujui'
            : rawStatus === 'rejected'
              ? 'Ditolak'
              : 'Menunggu Verifikasi';

        list.push({
          id: perm.id || `perm-${idx}`,
          category: 'permission',
          title: `Pengajuan ${perm.type || 'Izin/Sakit'}`,
          subtitle: `${formatTanggalIndo(perm.start_date)} s/d ${formatTanggalIndo(perm.end_date)}`,
          date: perm.submitted_at || perm.created_at || perm.start_date,
          time: 'Surat Izin',
          status: statusLabel,
          statusKey: String(rawStatus).toLowerCase(),
          notes: perm.reason || 'Keterangan izin/sakit',
          raw: perm,
        });
      });
    }

    // Filter by search
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      return list.filter((it) =>
        it.title.toLowerCase().includes(q) ||
        it.subtitle.toLowerCase().includes(q) ||
        it.status.toLowerCase().includes(q) ||
        (it.notes && it.notes.toLowerCase().includes(q))
      );
    }

    return list;
  }, [isStaff, employeeHistory, activeTab, attendanceLogs, permissionsHistory, searchQuery]);

  // ── 5. Employee Actions (Check In / Out) ──
  const todayRecord = employeeHistory[0];
  const checkedIn = Boolean(todayRecord?.check_in_time && !todayRecord?.check_out_time);

  const handleEmployeeCheckIn = async () => {
    if (!employeeId) return;
    setSavingAttendance(true);
    try {
      const payload: AttendancePayload = {
        tipe_presensi: 'Pegawai',
        employee_id: String(employeeId),
        status: 'HADIR',
        attendance_method: 'MOBILE',
        location: 'SIMS Mobile Android',
        keterangan: 'Presensi masuk melalui aplikasi mobile.',
      };
      await mobileApiService.checkIn(payload);
      Alert.alert('Presensi Berhasil', 'Presensi masuk sudah tercatat di server.');
      await loadAttendanceData();
    } catch (err) {
      Alert.alert('Presensi Gagal', getApiErrorMessage(err, 'Presensi masuk belum berhasil dicatat.'));
    } finally {
      setSavingAttendance(false);
    }
  };

  const handleEmployeeCheckOut = async () => {
    if (!employeeId) return;
    setSavingAttendance(true);
    try {
      await mobileApiService.checkOut({ employee_id: String(employeeId), location: 'SIMS Mobile Android' });
      Alert.alert('Presensi Berhasil', 'Presensi pulang sudah tercatat di server.');
      await loadAttendanceData();
    } catch (err) {
      Alert.alert('Presensi Gagal', getApiErrorMessage(err, 'Presensi pulang belum berhasil dicatat.'));
    } finally {
      setSavingAttendance(false);
    }
  };

  // ── 6. Submit Permission Form ──
  const handleSubmitPermission = async () => {
    if (!permReason.trim()) {
      Alert.alert('Perhatian', 'Mohon tuliskan alasan atau keterangan izin.');
      return;
    }

    setPermSubmitting(true);
    try {
      const payload = {
        type: permType as any,
        start_date: permStartDate,
        end_date: permEndDate,
        reason: permReason.trim(),
        child_id: selectedChildId,
      };
      await mobileApiService.submitPortalPermission(payload);
      Alert.alert('Berhasil', 'Pengajuan izin/sakit berhasil dikirim dan menunggu verifikasi wali kelas.');
      setIsPermissionModalOpen(false);
      setPermReason('');
      void loadAttendanceData();
    } catch (err) {
      Alert.alert('Pengajuan Gagal', getApiErrorMessage(err, 'Gagal mengirim pengajuan perizinan.'));
    } finally {
      setPermSubmitting(false);
    }
  };

  const getStatusColor = (statusKey: string) => {
    if (statusKey.includes('hadir') || statusKey.includes('approved') || statusKey.includes('disetujui')) {
      return { bg: '#ECFDF5', text: '#059669', border: '#A7F3D0', icon: 'check-circle' };
    }
    if (statusKey.includes('terlambat') || statusKey.includes('late')) {
      return { bg: '#FFFBEB', text: '#D97706', border: '#FDE68A', icon: 'clock-alert-outline' };
    }
    if (statusKey.includes('izin')) {
      return { bg: '#EFF6FF', text: '#2563EB', border: '#BFDBFE', icon: 'file-document-outline' };
    }
    if (statusKey.includes('sakit')) {
      return { bg: '#FAF5FF', text: '#7C3AED', border: '#E9D5FF', icon: 'medical-bag' };
    }
    if (statusKey.includes('pending') || statusKey.includes('menunggu')) {
      return { bg: '#FFF7ED', text: '#EA580C', border: '#FFEDD5', icon: 'timer-sand' };
    }
    return { bg: '#FEF2F2', text: '#DC2626', border: '#FECACA', icon: 'close-circle' };
  };

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F2FAF6', '#DDF5EB']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
          showsVerticalScrollIndicator={false}
        >
          {/* ══════════════════════════════════════════════════════════════
              SECTION 1: DATA SISWA & UNIT PENDIDIKAN (HERO CARD STANDAR)
             ══════════════════════════════════════════════════════════════ */}
          {children.length > 0 ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
                {children.length > 1 && (
                  <View style={styles.studentCardCountBadge}>
                    <Text style={styles.studentCardCountBadgeText}>
                      {Math.max(1, children.findIndex((c) => String(c.id) === selectedChildId) + 1)} dari {children.length} Ananda
                    </Text>
                  </View>
                )}
              </View>

              <ScrollView
                ref={studentScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_WIDTH - 50 + 12}
                decelerationRate="fast"
                snapToAlignment="start"
                onMomentumScrollEnd={handleStudentScrollEnd}
                style={styles.heroCardScrollContainer}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const unitTitle = child.education_unit?.name || child.unit_name || 'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || 'Kelas Belum Ditentukan';
                  const jenjang = child.kelas?.jenjang || child.education_unit?.level || 'Terpadu';
                  const avatarUri = getProfileImageUrl(child);
                  const cardStyle = children.length === 1 ? styles.childCardHeroSizeSingle : styles.childCardHeroSize;

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => selectChildWithScroll(String(child.id), idx)}
                    >
                      <LinearGradient
                        colors={['#0D6B42', '#18A165', '#2BD988']}
                        locations={[0, 0.55, 1]}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 1 }}
                        style={[cardStyle, !isSelected && { opacity: 0.9 }]}
                      >
                        <View style={styles.cardDecorCircle} />

                        {/* Top Row: Avatar + Info (Name, NIS, Unit Pill) + Right Selection Button */}
                        <View style={styles.childHeroTopRow}>
                          <View style={styles.avatarBorderWrapHero}>
                            {avatarUri ? (
                              <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                            ) : (
                              <Image
                                source={
                                  child?.gender === 'female' ||
                                  child?.jenis_kelamin === 'P' ||
                                  child?.jenis_kelamin === 'female' ||
                                  child?.gender === 'P'
                                    ? DEFAULT_STUDENT_GIRL_AVATAR
                                    : DEFAULT_STUDENT_BOY_AVATAR
                                }
                                style={styles.childAvatarImgHero}
                                resizeMode="cover"
                              />
                            )}
                          </View>
                          <View style={styles.childInfoCol}>
                            <View style={styles.studentNameBadgeRow}>
                              <Text numberOfLines={1} style={styles.studentFullName}>
                                {childFullName}
                              </Text>
                            </View>
                            <Text style={styles.studentNisText}>
                              NIS: {child.nis || '-'} {child.nisn ? `· NISN: ${child.nisn}` : ''}
                            </Text>
                            <View style={styles.studentUnitBadge}>
                              <MaterialCommunityIcons
                                name="school"
                                size={11}
                                color="#FFFFFF"
                                style={{ marginRight: 4 }}
                              />
                              <Text numberOfLines={1} style={styles.studentUnitText}>
                                {unitTitle}
                              </Text>
                            </View>
                          </View>

                          {/* Right Action Button */}
                          <View style={[styles.selectedActionBtnRight, !isSelected && styles.selectedActionBtnRightInactive]}>
                            <MaterialCommunityIcons
                              name={isSelected ? 'check-circle' : 'gesture-tap'}
                              size={16}
                              color={isSelected ? '#18A165' : '#FFFFFF'}
                            />
                            <Text style={[styles.selectedActionBtnText, !isSelected && styles.selectedActionBtnTextInactive]}>
                              {isSelected ? 'Terpilih' : 'Pilih'}
                            </Text>
                          </View>
                        </View>

                        {/* Middle Attributes Bar: Kelas | Jenjang | Presensi */}
                        <View style={styles.studentAttributesGrid}>
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Kelas</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.studentAttrValue}>
                              {className}
                            </Text>
                          </View>
                          <View style={styles.studentAttrDivider} />
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Jenjang</Text>
                            </View>
                            <Text numberOfLines={1} style={styles.studentAttrValue}>
                              {jenjang}
                            </Text>
                          </View>
                          <View style={styles.studentAttrDivider} />
                          <View style={styles.studentAttrBox}>
                            <View style={styles.studentAttrLabelRow}>
                              <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                              <Text style={styles.studentAttrLabel}>Presensi</Text>
                            </View>
                            <View style={styles.studentPresensiValueRow}>
                              <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                                Hadir
                              </Text>
                              <View style={styles.presensiGreenDot} />
                            </View>
                          </View>
                        </View>
                      </LinearGradient>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {children.length > 1 && (
                <View style={styles.paginationDotsRow}>
                  {children.map((c, i) => (
                    <TouchableOpacity
                      key={String(c.id || i)}
                      onPress={() => selectChildWithScroll(String(c.id), i)}
                      style={[styles.paginationDot, String(c.id) === selectedChildId && styles.paginationDotActive]}
                    />
                  ))}
                </View>
              )}
            </View>
          ) : studentInfo ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
              </View>
              <LinearGradient
                colors={['#0D6B42', '#18A165', '#2BD988']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.childCardHeroSizeSingle}
              >
                <View style={styles.cardDecorCircle} />
                <View style={styles.childHeroTopRow}>
                  <View style={styles.avatarBorderWrapHero}>
                    {getProfileImageUrl(studentInfo) ? (
                      <Image
                        source={{ uri: getProfileImageUrl(studentInfo) || undefined }}
                        style={styles.childAvatarImgHero}
                        resizeMode="cover"
                      />
                    ) : (
                      <Image
                        source={
                          studentInfo?.gender === 'female' ||
                          studentInfo?.jenis_kelamin === 'P' ||
                          studentInfo?.jenis_kelamin === 'female' ||
                          studentInfo?.gender === 'P'
                            ? DEFAULT_STUDENT_GIRL_AVATAR
                            : DEFAULT_STUDENT_BOY_AVATAR
                        }
                        style={styles.childAvatarImgHero}
                        resizeMode="cover"
                      />
                    )}
                  </View>
                  <View style={styles.childInfoCol}>
                    <View style={styles.studentNameBadgeRow}>
                      <Text numberOfLines={1} style={styles.studentFullName}>
                        {studentInfo.name || 'Siswa Aktif'}
                      </Text>
                    </View>
                    <Text style={styles.studentNisText}>
                      NIS: {studentInfo.nis || '-'} {studentInfo.nisn ? `· NISN: ${studentInfo.nisn}` : ''}
                    </Text>
                    <View style={styles.studentUnitBadge}>
                      <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentUnitText}>
                        {studentInfo.unit || 'Unit Sekolah'}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.selectedActionBtnRight}>
                    <MaterialCommunityIcons name="check-circle" size={16} color="#18A165" />
                    <Text style={styles.selectedActionBtnText}>Aktif</Text>
                  </View>
                </View>
                <View style={styles.studentAttributesGrid}>
                  <View style={styles.studentAttrBox}>
                    <View style={styles.studentAttrLabelRow}>
                      <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                      <Text style={styles.studentAttrLabel}>Kelas</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>
                      {studentInfo.class || '—'}
                    </Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <View style={styles.studentAttrLabelRow}>
                      <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                      <Text style={styles.studentAttrLabel}>Jenjang</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>
                      {studentInfo.unit || 'Terpadu'}
                    </Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <View style={styles.studentAttrLabelRow}>
                      <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                      <Text style={styles.studentAttrLabel}>Presensi</Text>
                    </View>
                    <View style={styles.studentPresensiValueRow}>
                      <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                        Hadir
                      </Text>
                      <View style={styles.presensiGreenDot} />
                    </View>
                  </View>
                </View>
              </LinearGradient>
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-tie" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Pegawai & Pengguna</Text>
                </View>
              </View>
              <LinearGradient
                colors={['#0D6B42', '#18A165', '#2BD988']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.childCardHeroSizeSingle}
              >
                <View style={styles.cardDecorCircle} />
                <View style={styles.childHeroTopRow}>
                  <View style={styles.avatarBorderWrapHero}>
                    {getProfileImageUrl(user) ? (
                      <Image
                        source={{ uri: getProfileImageUrl(user) || undefined }}
                        style={styles.childAvatarImgHero}
                        resizeMode="cover"
                      />
                    ) : (
                      <Text style={styles.avatarInitialText}>{(user.name || 'P').charAt(0).toUpperCase()}</Text>
                    )}
                  </View>
                  <View style={styles.childInfoCol}>
                    <Text numberOfLines={1} style={styles.childNameHero}>
                      {user.name || 'Pengguna'}
                    </Text>
                    <Text style={styles.childSubInfoHero}>
                      {employeeId ? `ID Pegawai: ${employeeId}` : 'Akun Terverifikasi'}
                    </Text>
                    <View style={styles.studentUnitBadge}>
                      <MaterialCommunityIcons name="briefcase-outline" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentUnitText}>
                        {roleLabel(user?.roles || [], 'Pegawai')}
                      </Text>
                    </View>
                  </View>
                  <View style={styles.selectedActionBtnRight}>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#18A165" />
                    <Text style={styles.selectedActionBtnText}>Aktif</Text>
                  </View>
                </View>
                <View style={styles.studentAttributesGrid}>
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Peran</Text>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>
                      {roleLabel(user?.roles || [], 'Pegawai')}
                    </Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Status</Text>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>
                      Aktif
                    </Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <Text style={styles.studentAttrLabel}>Mode</Text>
                    <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                      {qrEnabled ? 'QR Scan' : 'Mandiri'}
                    </Text>
                  </View>
                </View>
              </LinearGradient>
            </View>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2: RINGKASAN & STATISTIK PRESENSI (KPI GRID)
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="chart-box-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Ringkasan & Statistik Presensi</Text>
            </View>

            {isStaff ? (
              // Staff KPI
              <View style={styles.kpiGrid}>
                <View style={[styles.kpiCard, styles.kpiCardEmerald]}>
                  <View style={styles.kpiTopRow}>
                    <Text style={[styles.kpiLabel, { color: '#059669' }]}>KEHADIRAN</Text>
                    <MaterialCommunityIcons name="check-decagram" size={18} color="#059669" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#059669' }]}>
                    {employeeStats?.hadir ?? employeeHistory.filter((i) => String(i.status).toUpperCase().includes('HADIR')).length}
                  </Text>
                  <Text style={styles.kpiSub}>Presensi Terekam</Text>
                </View>

                <View style={[styles.kpiCard, styles.kpiCardAmber]}>
                  <View style={styles.kpiTopRow}>
                    <Text style={[styles.kpiLabel, { color: '#D97706' }]}>TERLAMBAT</Text>
                    <MaterialCommunityIcons name="clock-alert-outline" size={18} color="#D97706" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#D97706' }]}>{employeeStats?.terlambat ?? 0}</Text>
                  <Text style={styles.kpiSub}>Bulan Berjalan</Text>
                </View>

                <View style={[styles.kpiCard, styles.kpiCardBlue]}>
                  <View style={styles.kpiTopRow}>
                    <Text style={[styles.kpiLabel, { color: '#2563EB' }]}>IZIN / SAKIT</Text>
                    <MaterialCommunityIcons name="file-document-outline" size={18} color="#2563EB" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#2563EB' }]}>{employeeStats?.izin ?? 0}</Text>
                  <Text style={styles.kpiSub}>Surat Resmi</Text>
                </View>

                <View style={[styles.kpiCard, styles.kpiCardRose]}>
                  <View style={styles.kpiTopRow}>
                    <Text style={[styles.kpiLabel, { color: '#DC2626' }]}>ALPHA</Text>
                    <MaterialCommunityIcons name="close-circle-outline" size={18} color="#DC2626" />
                  </View>
                  <Text style={[styles.kpiValue, { color: '#DC2626' }]}>{employeeStats?.alpa ?? 0}</Text>
                  <Text style={styles.kpiSub}>Tanpa Keterangan</Text>
                </View>
              </View>
            ) : (
              // Student / Parent KPI
              <View>
                <View style={styles.rateHighlightCard}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.rateHighlightEyebrow}>TINGKAT KEHADIRAN SISWA</Text>
                    <Text style={styles.rateHighlightVal}>{studentStats.percentage}%</Text>
                    <Text style={styles.rateHighlightSub}>
                      Total {studentStats.total} sesi pembelajaran terdata di server
                    </Text>
                  </View>
                  <View style={styles.rateBadgeCircle}>
                    <MaterialCommunityIcons name="school" size={28} color="#18A165" />
                  </View>
                </View>

                <View style={[styles.kpiGrid, { marginTop: 10 }]}>
                  <View style={[styles.kpiCard, styles.kpiCardEmerald]}>
                    <View style={styles.kpiTopRow}>
                      <Text style={[styles.kpiLabel, { color: '#059669' }]}>HADIR</Text>
                      <MaterialCommunityIcons name="check-circle-outline" size={16} color="#059669" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#059669' }]}>{studentStats.hadir}</Text>
                    <Text style={styles.kpiSub}>Tepat Waktu</Text>
                  </View>

                  <View style={[styles.kpiCard, styles.kpiCardAmber]}>
                    <View style={styles.kpiTopRow}>
                      <Text style={[styles.kpiLabel, { color: '#D97706' }]}>TERLAMBAT</Text>
                      <MaterialCommunityIcons name="clock-outline" size={16} color="#D97706" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#D97706' }]}>{studentStats.terlambat}</Text>
                    <Text style={styles.kpiSub}>Terlambat</Text>
                  </View>

                  <View style={[styles.kpiCard, styles.kpiCardBlue]}>
                    <View style={styles.kpiTopRow}>
                      <Text style={[styles.kpiLabel, { color: '#2563EB' }]}>IZIN</Text>
                      <MaterialCommunityIcons name="file-document-outline" size={16} color="#2563EB" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#2563EB' }]}>{studentStats.izin}</Text>
                    <Text style={styles.kpiSub}>Disetujui</Text>
                  </View>

                  <View style={[styles.kpiCard, styles.kpiCardPurple]}>
                    <View style={styles.kpiTopRow}>
                      <Text style={[styles.kpiLabel, { color: '#7C3AED' }]}>SAKIT</Text>
                      <MaterialCommunityIcons name="medical-bag" size={16} color="#7C3AED" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#7C3AED' }]}>{studentStats.sakit}</Text>
                    <Text style={styles.kpiSub}>Surat Sakit</Text>
                  </View>

                  <View style={[styles.kpiCard, styles.kpiCardRose]}>
                    <View style={styles.kpiTopRow}>
                      <Text style={[styles.kpiLabel, { color: '#DC2626' }]}>ALPHA</Text>
                      <MaterialCommunityIcons name="alert-circle-outline" size={16} color="#DC2626" />
                    </View>
                    <Text style={[styles.kpiValue, { color: '#DC2626' }]}>{studentStats.alpa}</Text>
                    <Text style={styles.kpiSub}>Tanpa Kabar</Text>
                  </View>
                </View>
              </View>
            )}
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3: AKSI UTAMA / PENGAJUAN IZIN / PRESENSI MANDIRI
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons
                name={isStaff ? 'map-marker-check-outline' : 'calendar-edit'}
                size={18}
                color="#18A165"
              />
              <Text style={styles.sectionTitle}>
                {isStaff ? 'Presensi Mandiri Hari Ini' : 'Pengajuan Izin & Sakit'}
              </Text>
            </View>

            {isStaff ? (
              // Staff Check-In / Check-Out Action Card
              <View style={styles.actionBannerCard}>
                <View style={styles.actionBannerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionBannerTitle}>Status Presensi Pegawai</Text>
                    <Text style={styles.actionBannerDate}>{formatTanggalIndo(new Date().toISOString())}</Text>
                  </View>
                  <View
                    style={[
                      styles.statusPillBadge,
                      {
                        backgroundColor: checkedIn ? '#ECFDF5' : todayRecord?.check_out_time ? '#F1F5F9' : '#FFF7ED',
                        borderColor: checkedIn ? '#A7F3D0' : todayRecord?.check_out_time ? '#E2E8F0' : '#FFEDD5',
                      },
                    ]}
                  >
                    <Text
                      style={[
                        styles.statusPillText,
                        { color: checkedIn ? '#059669' : todayRecord?.check_out_time ? '#64748B' : '#EA580C' },
                      ]}
                    >
                      {checkedIn ? 'Sedang Bekerja' : todayRecord?.check_out_time ? 'Selesai' : 'Belum Presensi'}
                    </Text>
                  </View>
                </View>

                <View style={styles.employeeTimeRow}>
                  <View style={styles.employeeTimeBox}>
                    <Text style={styles.employeeTimeLabel}>Jam Masuk</Text>
                    <Text style={styles.employeeTimeVal}>
                      {todayRecord?.check_in_time ? formatJamIndo(todayRecord.check_in_time) : '--:--'}
                    </Text>
                  </View>
                  <View style={styles.employeeTimeBox}>
                    <Text style={styles.employeeTimeLabel}>Jam Pulang</Text>
                    <Text style={styles.employeeTimeVal}>
                      {todayRecord?.check_out_time ? formatJamIndo(todayRecord.check_out_time) : '--:--'}
                    </Text>
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.88}
                  disabled={savingAttendance || !employeeId || Boolean(todayRecord?.check_out_time)}
                  onPress={() => void (checkedIn ? handleEmployeeCheckOut() : handleEmployeeCheckIn())}
                  style={[
                    styles.primaryActionBtn,
                    checkedIn ? styles.primaryActionBtnOrange : styles.primaryActionBtnGreen,
                    (savingAttendance || !employeeId || Boolean(todayRecord?.check_out_time)) && { opacity: 0.6 },
                  ]}
                >
                  {savingAttendance ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name={checkedIn ? 'logout-variant' : 'login-variant'}
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.primaryActionBtnText}>
                        {checkedIn ? 'Presensi Pulang' : todayRecord?.check_out_time ? 'Presensi Hari Ini Selesai' : 'Presensi Masuk Sekarang'}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              // Student / Parent Permission Action Card
              <View style={styles.actionBannerCard}>
                <View style={styles.actionBannerHeader}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.actionBannerTitle}>Perlu Mengajukan Izin atau Sakit?</Text>
                    <Text style={styles.actionBannerSub}>
                      Kirim pemberitahuan permohonan izin atau surat sakit langsung ke wali kelas dan guru pengampu.
                    </Text>
                  </View>
                  <View style={styles.actionIconCircle}>
                    <MaterialCommunityIcons name="file-document-edit-outline" size={24} color="#18A165" />
                  </View>
                </View>

                <TouchableOpacity
                  activeOpacity={0.88}
                  onPress={() => setIsPermissionModalOpen(true)}
                  style={[styles.primaryActionBtn, styles.primaryActionBtnGreen, { marginTop: 14 }]}
                >
                  <MaterialCommunityIcons name="plus-circle" size={18} color="#FFFFFF" />
                  <Text style={styles.primaryActionBtnText}>Buat Pengajuan Izin / Sakit</Text>
                </TouchableOpacity>
              </View>
            )}
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4: RIWAYAT & LOG KEHADIRAN
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>
                {isStaff ? 'Riwayat Kehadiran Pegawai' : 'Riwayat & Log Kehadiran'}
              </Text>
            </View>

            {/* Filter Tabs for Student / Parent */}
            {!isStaff && (
              <View style={styles.filterTabsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveTab('all')}
                  style={[styles.filterTabPill, activeTab === 'all' && styles.filterTabPillActive]}
                >
                  <Text style={[styles.filterTabPillText, activeTab === 'all' && styles.filterTabPillTextActive]}>
                    Semua ({attendanceLogs.length + permissionsHistory.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveTab('attendance')}
                  style={[styles.filterTabPill, activeTab === 'attendance' && styles.filterTabPillActive]}
                >
                  <Text style={[styles.filterTabPillText, activeTab === 'attendance' && styles.filterTabPillTextActive]}>
                    Presensi Kelas ({attendanceLogs.length})
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setActiveTab('permissions')}
                  style={[styles.filterTabPill, activeTab === 'permissions' && styles.filterTabPillActive]}
                >
                  <Text style={[styles.filterTabPillText, activeTab === 'permissions' && styles.filterTabPillTextActive]}>
                    Izin / Sakit ({permissionsHistory.length})
                  </Text>
                </TouchableOpacity>
              </View>
            )}

            {/* Search Input */}
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
              <TextInput
                placeholder="Cari mata pelajaran, tanggal, status..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* List Items */}
            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="small" color="#18A165" />
                <Text style={styles.loadingText}>Memuat riwayat presensi dari database...</Text>
              </View>
            ) : unifiedItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={44} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Belum Ada Riwayat Presensi</Text>
                <Text style={styles.emptySub}>
                  Riwayat presensi kelas dan catatan kehadiran akan tampil otomatis di sini setelah dicatat guru.
                </Text>
              </View>
            ) : (
              <View style={styles.itemsListWrap}>
                {unifiedItems.map((item) => {
                  const tone = getStatusColor(item.statusKey);
                  return (
                    <TouchableOpacity
                      key={item.id}
                      activeOpacity={0.85}
                      onPress={() => {
                        setSelectedDetail(item);
                        setIsDetailModalOpen(true);
                      }}
                      style={styles.historyItemCard}
                    >
                      <View style={styles.historyItemTop}>
                        <View style={[styles.itemCategoryIconBox, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                          <MaterialCommunityIcons name={tone.icon as any} size={18} color={tone.text} />
                        </View>
                        <View style={{ flex: 1, marginLeft: 12 }}>
                          <Text numberOfLines={1} style={styles.itemTitle}>
                            {item.title}
                          </Text>
                          <Text numberOfLines={1} style={styles.itemSubtitle}>
                            {item.subtitle}
                          </Text>
                        </View>
                        <View style={[styles.statusBadgePill, { backgroundColor: tone.bg, borderColor: tone.border }]}>
                          <Text style={[styles.statusBadgeText, { color: tone.text }]}>{item.status}</Text>
                        </View>
                      </View>

                      <View style={styles.historyItemBottom}>
                        <View style={styles.infoMetaPill}>
                          <MaterialCommunityIcons name="calendar-month-outline" size={12} color="#64748B" />
                          <Text style={styles.infoMetaText}>{formatTanggalIndo(item.date)}</Text>
                        </View>
                        <View style={styles.infoMetaPill}>
                          <MaterialCommunityIcons name="clock-outline" size={12} color="#64748B" />
                          <Text style={styles.infoMetaText}>{item.time}</Text>
                        </View>
                      </View>

                      {item.notes ? (
                        <View style={styles.notesBox}>
                          <Text numberOfLines={2} style={styles.notesText}>
                            Catatan: {item.notes}
                          </Text>
                        </View>
                      ) : null}
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 1: DETAIL INFORMASI PRESENSI / PERIZINAN
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(isDetailModalOpen && selectedDetail)}
        animationType="slide"
        transparent
        onRequestClose={() => setIsDetailModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsDetailModalOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Detail Catatan Presensi</Text>
              <TouchableOpacity onPress={() => setIsDetailModalOpen(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            {selectedDetail && (
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
                <View style={styles.modalDetailBody}>
                  <View style={styles.detailHeaderBox}>
                    <Text style={styles.detailTitle}>{selectedDetail.title}</Text>
                    <Text style={styles.detailSubtitle}>{selectedDetail.subtitle}</Text>
                    <View style={{ marginTop: 10, flexDirection: 'row' }}>
                      {(() => {
                        const tone = getStatusColor(selectedDetail.statusKey);
                        return (
                          <View
                            style={[
                              styles.statusBadgePill,
                              { backgroundColor: tone.bg, borderColor: tone.border, paddingVertical: 5, paddingHorizontal: 12 },
                            ]}
                          >
                            <MaterialCommunityIcons name={tone.icon as any} size={14} color={tone.text} />
                            <Text style={[styles.statusBadgeText, { color: tone.text, fontSize: 12, marginLeft: 4 }]}>
                              {selectedDetail.status}
                            </Text>
                          </View>
                        );
                      })()}
                    </View>
                  </View>

                  <View style={styles.detailFieldsGrid}>
                    <View style={styles.detailFieldRow}>
                      <Text style={styles.detailFieldLabel}>Tanggal:</Text>
                      <Text style={styles.detailFieldVal}>{formatTanggalIndo(selectedDetail.date)}</Text>
                    </View>

                    <View style={styles.detailFieldRow}>
                      <Text style={styles.detailFieldLabel}>Waktu Kehadiran:</Text>
                      <Text style={styles.detailFieldVal}>{selectedDetail.time}</Text>
                    </View>

                    {selectedDetail.category === 'attendance' && (
                      <>
                        <View style={styles.detailFieldRow}>
                          <Text style={styles.detailFieldLabel}>Guru Pengampu:</Text>
                          <Text style={styles.detailFieldVal}>{selectedDetail.subtitle || '-'}</Text>
                        </View>
                        <View style={styles.detailFieldRow}>
                          <Text style={styles.detailFieldLabel}>Metode Presensi:</Text>
                          <Text style={styles.detailFieldVal}>
                            {selectedDetail.raw?.recorded_method || 'Aplikasi / LMS'}
                          </Text>
                        </View>
                      </>
                    )}

                    {selectedDetail.category === 'permission' && (
                      <>
                        <View style={styles.detailFieldRow}>
                          <Text style={styles.detailFieldLabel}>Rentang Waktu:</Text>
                          <Text style={styles.detailFieldVal}>{selectedDetail.subtitle}</Text>
                        </View>
                        <View style={styles.detailFieldRow}>
                          <Text style={styles.detailFieldLabel}>Alasan / Keterangan:</Text>
                          <Text style={styles.detailFieldVal}>{selectedDetail.notes || '-'}</Text>
                        </View>
                      </>
                    )}

                    {selectedDetail.notes ? (
                      <View style={[styles.detailFieldRow, { flexDirection: 'column', alignItems: 'flex-start' }]}>
                        <Text style={[styles.detailFieldLabel, { marginBottom: 4 }]}>Catatan Tambahan:</Text>
                        <Text style={[styles.detailFieldVal, { textAlign: 'left', lineHeight: 18 }]}>
                          {selectedDetail.notes}
                        </Text>
                      </View>
                    ) : null}
                  </View>
                </View>
              </ScrollView>
            )}

            <TouchableOpacity
              activeOpacity={0.88}
              onPress={() => setIsDetailModalOpen(false)}
              style={styles.modalActionBtn}
            >
              <Text style={styles.modalActionBtnText}>Tutup</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ══════════════════════════════════════════════════════════════
          MODAL 2: FORM PENGAJUAN IZIN / SAKIT (PORTAL WALI & SISWA)
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(isPermissionModalOpen)}
        animationType="slide"
        transparent
        onRequestClose={() => setIsPermissionModalOpen(false)}
        statusBarTranslucent
      >
        <View style={styles.modalBackdrop}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setIsPermissionModalOpen(false)} />
          <View style={[styles.modalCard, { paddingBottom: modalBottomInset }]}>
            <View style={styles.modalDragHandle} />
            <View style={styles.modalHeaderRow}>
              <Text style={styles.modalHeaderTitle}>Form Pengajuan Izin / Sakit</Text>
              <TouchableOpacity onPress={() => setIsPermissionModalOpen(false)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={18} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: SCREEN_HEIGHT * 0.62 }}>
              <View style={styles.formContainer}>
                {/* Jenis Izin Selector */}
                <Text style={styles.formFieldLabel}>Jenis Permohonan</Text>
                <View style={styles.typeSelectorRow}>
                  {['Izin', 'Sakit', 'Keperluan keluarga', 'Lainnya'].map((t) => {
                    const isPicked = permType === t;
                    return (
                      <TouchableOpacity
                        key={t}
                        activeOpacity={0.8}
                        onPress={() => setPermType(t)}
                        style={[styles.typePill, isPicked && styles.typePillActive]}
                      >
                        <Text style={[styles.typePillText, isPicked && styles.typePillTextActive]}>{t}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Tanggal Mulai */}
                <Text style={[styles.formFieldLabel, { marginTop: 14 }]}>Tanggal Mulai (YYYY-MM-DD)</Text>
                <TextInput
                  value={permStartDate}
                  onChangeText={setPermStartDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.formInput}
                />

                {/* Tanggal Selesai */}
                <Text style={[styles.formFieldLabel, { marginTop: 12 }]}>Tanggal Selesai (YYYY-MM-DD)</Text>
                <TextInput
                  value={permEndDate}
                  onChangeText={setPermEndDate}
                  placeholder="YYYY-MM-DD"
                  style={styles.formInput}
                />

                {/* Alasan */}
                <Text style={[styles.formFieldLabel, { marginTop: 12 }]}>Alasan / Keterangan Lengkap</Text>
                <TextInput
                  value={permReason}
                  onChangeText={setPermReason}
                  placeholder="Tuliskan keterangan permohonan izin secara lengkap..."
                  placeholderTextColor="#94A3B8"
                  multiline
                  numberOfLines={4}
                  style={[styles.formInput, styles.formInputArea]}
                />

                <Text style={styles.formHelpNote}>
                  Pengajuan akan diteruskan langsung ke sistem Wali Kelas dan tercatat otomatis pada database presensi.
                </Text>
              </View>
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.88}
              disabled={permSubmitting}
              onPress={() => void handleSubmitPermission()}
              style={[styles.modalActionBtn, permSubmitting && { opacity: 0.7 }]}
            >
              {permSubmitting ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.modalActionBtnText}>Kirim Pengajuan Izin</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: {
    flex: 1,
    backgroundColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  content: {
    padding: 16,
    paddingTop: Platform.OS === 'android' ? 20 : 16,
  },
  containerBlock: {
    marginBottom: 16,
  },
  studentContainerBlock: {
    marginBottom: 8,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  studentCardCountBadge: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  studentCardCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  heroCardScrollContainer: {
    marginHorizontal: -16,
  },
  heroCardScroll: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 4,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 50,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
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
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
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
  childCardHeroSizeInactive: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    shadowOpacity: 0.06,
    elevation: 2,
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
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  avatarBorderWrapHeroInactive: {
    borderColor: '#A7F3D0',
    backgroundColor: '#EBF8F2',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  avatarInitialText: {
    fontSize: 22,
    fontWeight: '900',
    color: '#084835',
  },
  childInfoCol: {
    flex: 1,
    justifyContent: 'center',
  },
  studentNameBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentFullName: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    fontWeight: '600',
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
    fontWeight: '600',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginTop: 4,
    borderWidth: 0.5,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitBadgeInactive: {
    backgroundColor: '#E7F7EF',
    borderColor: '#A7F3D0',
  },
  studentUnitText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 12,
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
    backgroundColor: '#F1F5F9',
    elevation: 1,
  },
  selectedActionBtnText: {
    fontSize: 8.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  selectedActionBtnTextInactive: {
    color: '#64748B',
  },
  studentAttributesGrid: {
    flexDirection: 'row',
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 6,
    marginTop: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    zIndex: 1,
  },
  studentAttributesGridInactive: {
    backgroundColor: '#F1F8F4',
    borderColor: '#D1E8DC',
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
    fontSize: 9,
    color: '#A7F3D0',
    fontWeight: '700',
  },
  studentAttrValue: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentPresensiValueRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  presensiGreenDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#34D399',
    marginLeft: 4,
  },
  studentAttrDivider: {
    width: 1,
    height: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  inactiveText: {
    color: '#0F172A',
  },
  inactiveSubText: {
    color: '#64748B',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 8,
  },
  paginationDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 16,
    backgroundColor: '#18A165',
  },

  // KPI Cards & Rate Card
  rateHighlightCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  rateHighlightEyebrow: {
    fontSize: 10,
    fontWeight: '800',
    letterSpacing: 0.8,
    color: '#64748B',
  },
  rateHighlightVal: {
    fontSize: 32,
    fontWeight: '900',
    color: '#18A165',
    marginVertical: 2,
  },
  rateHighlightSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#475569',
  },
  rateBadgeCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  kpiCard: {
    flex: 1,
    minWidth: (SCREEN_WIDTH - 32 - 16) / 3,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    backgroundColor: '#FFFFFF',
  },
  kpiCardEmerald: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' },
  kpiCardAmber: { borderColor: '#FDE68A', backgroundColor: '#FFFBEB' },
  kpiCardBlue: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  kpiCardPurple: { borderColor: '#E9D5FF', backgroundColor: '#FAF5FF' },
  kpiCardRose: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  kpiTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  kpiLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '900',
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#64748B',
  },

  // Action Banner Card
  actionBannerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  actionBannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  actionBannerTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  actionBannerSub: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 4,
  },
  actionBannerDate: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  actionIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 20,
    borderWidth: 1,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  employeeTimeRow: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 12,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
  },
  employeeTimeBox: {
    flex: 1,
  },
  employeeTimeLabel: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  employeeTimeVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  primaryActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 12,
  },
  primaryActionBtnGreen: {
    backgroundColor: '#18A165',
  },
  primaryActionBtnOrange: {
    backgroundColor: '#D97706',
  },
  primaryActionBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Filter Tabs & Search
  filterTabsRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  filterTabPill: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterTabPillActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterTabPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  filterTabPillTextActive: {
    color: '#FFFFFF',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'android' ? 6 : 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    padding: 0,
  },

  // History List Items
  loadingBox: {
    paddingVertical: 32,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 4,
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySub: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    lineHeight: 16,
    marginTop: 4,
    maxWidth: 280,
  },
  itemsListWrap: {
    gap: 10,
  },
  historyItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1.5,
  },
  historyItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  itemCategoryIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemTitle: {
    fontSize: 13,
    fontWeight: '900',
    color: '#0F172A',
  },
  itemSubtitle: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  statusBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 10,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  historyItemBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  infoMetaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  infoMetaText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  notesBox: {
    marginTop: 8,
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
  },
  notesText: {
    fontSize: 10.5,
    color: '#475569',
    lineHeight: 14,
  },

  // Modal Bottom-Sheet Styles (Strictly from Section 6)
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.45)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 12,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 16,
    elevation: 20,
  },
  modalDragHandle: {
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CBD5E1',
    alignSelf: 'center',
    marginBottom: 12,
  },
  modalHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalActionBtn: {
    backgroundColor: '#18A165',
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 13,
    marginTop: 14,
  },
  modalActionBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  // Modal Detail Styles
  modalDetailBody: {
    gap: 14,
  },
  detailHeaderBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  detailSubtitle: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  detailFieldsGrid: {
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailFieldRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  detailFieldLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  detailFieldVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'right',
  },

  // Permission Form Styles
  formContainer: {
    paddingVertical: 4,
  },
  formFieldLabel: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  typeSelectorRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  typePill: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  typePillActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#18A165',
  },
  typePillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  typePillTextActive: {
    color: '#059669',
  },
  formInput: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 12,
    color: '#0F172A',
  },
  formInputArea: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
  formHelpNote: {
    fontSize: 10.5,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 12,
  },
});
