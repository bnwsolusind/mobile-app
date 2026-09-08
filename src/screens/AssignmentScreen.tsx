import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Modal,
  Platform,
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
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;
type AssignmentItem = Record<string, any>;

const formatDeadline = (dateStr?: string): string => {
  if (!dateStr) return '-';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return String(dateStr);
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  const day = d.getDate();
  const month = months[d.getMonth()];
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}.${minutes}`;
};

const getAssignmentStatus = (item: any): { key: string; label: string; color: string; bg: string; icon: any } => {
  const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
    ? item.pengumpulan_tugas[0]
    : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
    ? item.pengumpulanTugas[0]
    : item.submission;

  const isGraded = sub && (sub.status === 'dinilai' || sub.status === 'graded' || (sub.nilai_guru !== null && sub.nilai_guru !== undefined));
  const isSubmitted = sub && (sub.status === 'dikumpulkan' || sub.status === 'submitted' || sub.status === 'revisi');
  const isLate = (sub && sub.status === 'terlambat') || (!sub && item.deadline && new Date(item.deadline) < new Date());

  if (isGraded) {
    return { key: 'graded', label: 'Dinilai', color: '#059669', bg: '#ECFDF5', icon: 'check-circle' };
  }
  if (isLate) {
    return { key: 'late', label: 'Terlambat', color: '#DC2626', bg: '#FEF2F2', icon: 'alert-circle' };
  }
  if (isSubmitted) {
    return { key: 'submitted', label: 'Sudah Dikumpulkan', color: '#2563EB', bg: '#EFF6FF', icon: 'clock-check-outline' };
  }
  return { key: 'pending', label: 'Belum Dikumpulkan', color: '#D97706', bg: '#FFFBEB', icon: 'clock-outline' };
};

const getSubjectTheme = (subjectName: string = ''): { bgIcon: string; iconColor: string; icon: any; badgeBg: string; badgeBorder: string; badgeText: string } => {
  const norm = (subjectName || '').toLowerCase();
  if (norm.includes('agama') || norm.includes('islam') || norm.includes('pai') || norm.includes('fiqih') || norm.includes('tahfiz') || norm.includes('quran') || norm.includes('hadits') || norm.includes('akidah')) {
    return {
      bgIcon: '#E6F8F0',
      iconColor: '#10B981',
      icon: 'book-open-page-variant-outline',
      badgeBg: '#ECFDF5',
      badgeBorder: '#A7F3D0',
      badgeText: '#059669',
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bgIcon: '#F3E8FF',
      iconColor: '#9333EA',
      icon: 'flask-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
    };
  }
  if (norm.includes('matematika') || norm.includes('math') || norm.includes('hitung') || norm.includes('aljabar')) {
    return {
      bgIcon: '#EFF6FF',
      iconColor: '#2563EB',
      icon: 'calculator-variant-outline',
      badgeBg: '#EFF6FF',
      badgeBorder: '#BFDBFE',
      badgeText: '#2563EB',
    };
  }
  if (norm.includes('bahasa') || norm.includes('indonesia') || norm.includes('inggris') || norm.includes('arab') || norm.includes('literasi')) {
    return {
      bgIcon: '#FFE4E6',
      iconColor: '#E11D48',
      icon: 'book-open-variant',
      badgeBg: '#FFF1F2',
      badgeBorder: '#FECDD3',
      badgeText: '#E11D48',
    };
  }
  if (norm.includes('ips') || norm.includes('sosial') || norm.includes('sejarah') || norm.includes('geografi') || norm.includes('ekonomi')) {
    return {
      bgIcon: '#FEF3C7',
      iconColor: '#D97706',
      icon: 'earth',
      badgeBg: '#FFFBEB',
      badgeBorder: '#FDE68A',
      badgeText: '#D97706',
    };
  }
  return {
    bgIcon: '#E6F8F0',
    iconColor: '#10B981',
    icon: 'book-open-page-variant-outline',
    badgeBg: '#ECFDF5',
    badgeBorder: '#A7F3D0',
    badgeText: '#059669',
  };
};

export default function AssignmentScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const studentScrollRef = useRef<ScrollView>(null);

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [assignments, setAssignments] = useState<AssignmentItem[]>([]);
  const [backendKpi, setBackendKpi] = useState<any>(null);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'all' | 'pending' | 'submitted' | 'late' | 'graded'>('all');
  const defaultAcademicYear = useMemo(() => {
    const now = new Date();
    const year = now.getFullYear();
    return now.getMonth() >= 6 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
  }, []);
  const [selectedSemester, setSelectedSemester] = useState<string>(() => {
    const now = new Date();
    const isSem1 = now.getMonth() >= 6;
    const year = now.getFullYear();
    const ay = isSem1 ? `${year}/${year + 1}` : `${year - 1}/${year}`;
    return isSem1 ? `Semester 1 (${ay})` : `Semester 2 (${ay})`;
  });
  const [sortOrder, setSortOrder] = useState<'latest' | 'deadline'>('latest');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [submissionText, setSubmissionText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 1. Fetch children if parent with offline cache (Pertahankan seluruh anak)
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    const targetChildId = route?.params?.child_id || useActiveChildStore.getState().activeChildId;
    const childCacheKey = offlineCache.buildKey('assignments_children', user?.id);
    const cached = await offlineCache.get<Child[]>(childCacheKey);
    if (cached && cached.length > 0) {
      setChildren(cached);
      useActiveChildStore.getState().setChildren(cached);
      const activeId = targetChildId || useActiveChildStore.getState().activeChildId || String(cached[0].id);
      setSelectedChildId(activeId);
    }

    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      if (list.length > 0) {
        setChildren(list);
        useActiveChildStore.getState().setChildren(list);
        const activeId = targetChildId || useActiveChildStore.getState().activeChildId || String(list[0].id);
        setSelectedChildId(activeId);
        void offlineCache.set(childCacheKey, list);
      }
    } catch {
      // safe fallback
    }
  }, [isParent, user?.id, route?.params?.child_id]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch assignments list & summary
  const loadAssignments = useCallback(async () => {
    if (isParent && !selectedChildId) return;
    try {
      setLoading(true);
      const cacheKey = offlineCache.buildKey('assignments', user?.id, selectedChildId);
      const cached = await offlineCache.get<{ list: AssignmentItem[]; summary?: any }>(cacheKey);
      if (cached) {
        setAssignments(cached.list || []);
        if (cached.summary) setBackendKpi(cached.summary);
      }

      const res = await mobileApiService.getPortalAssignments({
        child_id: selectedChildId,
        semester: selectedSemester,
        per_page: 50,
      });

      const raw = res?.data?.data || res?.data || res;
      const list = Array.isArray(raw) ? raw : raw?.items || [];
      setAssignments(list);

      const kpi = res?.summary || res?.data?.summary || null;
      if (kpi) setBackendKpi(kpi);

      void offlineCache.set(cacheKey, { list, summary: kpi });
    } catch {
      // safe fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, selectedChildId, selectedSemester, user?.id]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadChildren(), loadAssignments()]);
  };

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        const sid = String(targetChild.id);
        setSelectedChildId(sid);
        useActiveChildStore.getState().setActiveChildId(sid);
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    useActiveChildStore.getState().setActiveChildId(childId);
    studentScrollRef.current?.scrollTo({
      x: index * (SCREEN_WIDTH - 50 + 12),
      animated: true,
    });
  };

  // KPI Calculation from database response
  const kpi = useMemo(() => {
    let tugas_aktif = 0;
    let belum_dikumpulkan = 0;
    let terlambat = 0;
    let sudah_dinilai = 0;

    assignments.forEach((item) => {
      const status = getAssignmentStatus(item).key;
      if (status === 'graded') {
        sudah_dinilai++;
      } else if (status === 'late') {
        terlambat++;
      } else if (status === 'submitted') {
        // submitted waiting grade
      } else {
        belum_dikumpulkan++;
        tugas_aktif++;
      }
    });

    return {
      tugas_aktif: backendKpi?.tugas_aktif ?? tugas_aktif,
      belum_dikumpulkan: backendKpi?.belum_dikumpulkan ?? belum_dikumpulkan,
      terlambat: backendKpi?.terlambat ?? terlambat,
      sudah_dinilai: backendKpi?.sudah_dinilai ?? sudah_dinilai,
    };
  }, [backendKpi, assignments]);

  // Filtered assignments
  const filteredAssignments = useMemo(() => {
    let result = assignments.filter((item) => {
      const statusObj = getAssignmentStatus(item);
      if (activeTab !== 'all' && statusObj.key !== activeTab) {
        return false;
      }
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase();
        const title = (item.judul_tugas || item.judul || '').toLowerCase();
        const subject = (item.subject?.name || item.subject?.nama_mapel || '').toLowerCase();
        const teacher = (item.teacher?.name || item.guru?.nama_lengkap || '').toLowerCase();
        return title.includes(query) || subject.includes(query) || teacher.includes(query);
      }
      return true;
    });

    if (sortOrder === 'latest') {
      result = [...result].sort((a, b) => new Date(b.created_at || b.deadline || 0).getTime() - new Date(a.created_at || a.deadline || 0).getTime());
    } else {
      result = [...result].sort((a, b) => new Date(a.deadline || 0).getTime() - new Date(b.deadline || 0).getTime());
    }

    return result;
  }, [assignments, activeTab, searchQuery, sortOrder]);

  // Cek apakah ananda yang dipilih bersekolah di unit SD
  const activeChild = useMemo(() => {
    return children.find((c) => String(c.id) === selectedChildId) || children[0] || null;
  }, [children, selectedChildId]);

  const isChildSD = useMemo(() => {
    if (!activeChild) return false;
    const unitName = (
      activeChild.education_unit?.name ||
      activeChild.unit_pendidikan?.nama ||
      activeChild.kelas?.unit_pendidikan?.nama ||
      activeChild.kelas?.unitPendidikan?.name ||
      activeChild.unit_name ||
      ''
    ).toLowerCase();
    const jenjang = (
      activeChild.kelas?.jenjang ||
      activeChild.education_unit?.level ||
      activeChild.jenjang ||
      ''
    ).toLowerCase();

    return (
      jenjang.includes('sd') ||
      jenjang.includes('mi') ||
      unitName.includes('sd') ||
      unitName.includes('mi') ||
      unitName.includes('sekolah dasar') ||
      unitName.includes('ibtidaiyah')
    );
  }, [activeChild]);

  // Siswa selalu bisa mengerjakan tugasnya sendiri; Orang tua HANYA bisa jika ananda unit SD
  const canSubmit = !isParent || isChildSD;

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment?.id) return;
    if (!submissionText.trim()) {
      Alert.alert('Perhatian', 'Mohon tuliskan teks jawaban tugas Anda.');
      return;
    }

    try {
      setSubmitting(true);
      await mobileApiService.submitPortalAssignment(
        selectedAssignment.id,
        submissionText.trim(),
        isParent ? selectedChildId : undefined
      );
      Alert.alert('Alhamdulillah', 'Tugas berhasil dikumpulkan.');
      setSelectedAssignment(null);
      setSubmissionText('');
      void loadAssignments();
    } catch (err: any) {
      Alert.alert('Gagal', err?.message || 'Pengumpulan tugas belum berhasil disimpan.');
    } finally {
      setSubmitting(false);
    }
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
        >
          {/* 1. CONTAINER DATA SISWA & UNIT PENDIDIKAN */}
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
                onMomentumScrollEnd={handleStudentScrollEnd}
                style={styles.heroCardScrollContainer}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const unitTitle = child.education_unit?.name || child.unit_name || 'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || child.class_name || 'Kelas Belum Ditentukan';
                  const jenjang = child.kelas?.jenjang || child.education_unit?.level || 'Terpadu';
                  const avatarUri = getProfileImageUrl(child);

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
                        style={[styles.childCardHeroSize, !isSelected && { opacity: 0.9 }]}
                      >
                        <View style={styles.cardDecorCircle} />

                        {/* Top Row: Avatar + Info (Name, NIS, Unit Pill) + Right Selection Button */}
                        <View style={styles.childHeroTopRow}>
                          <View style={styles.avatarBorderWrapHero}>
                            {avatarUri ? (
                              <Image
                                source={{ uri: avatarUri }}
                                style={styles.childAvatarImgHero}
                                resizeMode="cover"
                              />
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

                          {/* Right Action Button (Preserves Selection Functionality) */}
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

              {/* DOT INDIKATOR SCROLL SISWA */}
              {children.length > 1 && (
                <View style={styles.paginationDotsRow}>
                  {children.map((c, i) => {
                    const isDotActive = String(c.id) === selectedChildId;
                    return (
                      <TouchableOpacity
                        key={String(c.id || i)}
                        onPress={() => selectChildWithScroll(String(c.id), i)}
                        style={[
                          styles.paginationDot,
                          isDotActive && styles.paginationDotActive,
                        ]}
                      />
                    );
                  })}
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

              {(() => {
                const s = studentInfo;
                const studentName = s.name || s.full_name || s.nama_lengkap || 'Siswa Aktif';
                const studentClass = s.class || s.class_name || s.kelas?.nama_kelas || 'Kelas Belum Ditentukan';
                const studentUnit = s.unit || s.unit_name || s.education_unit?.name || 'Unit Pendidikan';
                const jenjang = s.kelas?.jenjang || s.education_unit?.level || 'Terpadu';
                const avatarUri = getProfileImageUrl(s);

                return (
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
                        {avatarUri ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        ) : (
                          <Image
                            source={
                              s?.gender === 'female' ||
                              s?.jenis_kelamin === 'P' ||
                              s?.jenis_kelamin === 'female' ||
                              s?.gender === 'P'
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
                            {studentName}
                          </Text>
                        </View>
                        <Text style={styles.studentNisText}>
                          NIS: {s.nis || '-'} {s.nisn ? `· NISN: ${s.nisn}` : ''}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {studentUnit}
                          </Text>
                        </View>
                      </View>

                      <View style={styles.selectedActionBtnRight}>
                        <MaterialCommunityIcons name="check-circle" size={16} color="#18A165" />
                        <Text style={styles.selectedActionBtnText}>Siswa</Text>
                      </View>
                    </View>

                    <View style={styles.studentAttributesGrid}>
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="school" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Kelas</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{studentClass}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Jenjang</Text>
                        </View>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{jenjang}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <View style={styles.studentAttrLabelRow}>
                          <MaterialCommunityIcons name="account-group" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                          <Text style={styles.studentAttrLabel}>Presensi</Text>
                        </View>
                        <View style={styles.studentPresensiValueRow}>
                          <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
                          <View style={styles.presensiGreenDot} />
                        </View>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Pengguna & Unit</Text>
                </View>
              </View>

              {(() => {
                const userName = String(user?.name || user?.full_name || user?.nama_lengkap || 'Pengguna');
                const userRole = typeof user?.role === 'string' ? user.role : (Array.isArray(user?.roles) && user.roles[0] ? String(user.roles[0]) : 'Pengguna');
                const userUnit = String((user as any)?.unit_name || (user as any)?.education_unit?.name || 'Mahad Abu Ja\'far');
                const avatarUri = getProfileImageUrl(user);

                return (
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
                        {avatarUri ? (
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
                        ) : (
                          <Text style={styles.avatarInitialText}>{userName.charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <Text numberOfLines={1} style={styles.childNameHero}>
                          {userName}
                        </Text>
                        <Text style={styles.childSubInfoHero}>
                          Status: {userRole}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {userUnit}
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
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{userRole}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Akses</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>Resmi</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Presensi</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Hadir</Text>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </View>
          ) : null}

          {/* 2. RINGKASAN TUGAS (4 KPI HORIZONTAL ROW) */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderBetween}>
              <View style={styles.sectionHeaderLeft}>
                <View style={styles.sectionIconBadge}>
                  <MaterialCommunityIcons name="poll" size={18} color="#059669" />
                </View>
                <Text style={styles.sectionTitleBold}>Ringkasan Tugas</Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => {
                  setSelectedSemester((prev) =>
                    prev.startsWith('Semester 1')
                      ? `Semester 2 (${defaultAcademicYear})`
                      : `Semester 1 (${defaultAcademicYear})`
                  );
                }}
                style={styles.semesterDropdownPill}
              >
                <Text style={styles.semesterDropdownText}>{selectedSemester}</Text>
                <MaterialCommunityIcons name="chevron-down" size={16} color="#64748B" />
              </TouchableOpacity>
            </View>

            <View style={styles.kpiRowContainer}>
              {/* CARD 1: TUGAS AKTIF */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#E6FBF2', borderColor: '#D1FAE5' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#10B981' }]}>
                    <MaterialCommunityIcons name="calendar-check" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#065F46' }]}>{kpi.tugas_aktif}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.kpiCardLabel, { color: '#065F46' }]}>
                  Tugas Aktif
                </Text>
              </View>

              {/* CARD 2: BELUM DIKUMPULKAN */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#FFF9E6', borderColor: '#FEF3C7' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#F59E0B' }]}>
                    <MaterialCommunityIcons name="clock-outline" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#92400E' }]}>{kpi.belum_dikumpulkan}</Text>
                </View>
                <Text numberOfLines={2} style={[styles.kpiCardLabel, { color: '#92400E' }]}>
                  Belum Dikumpulkan
                </Text>
              </View>

              {/* CARD 3: TERLAMBAT */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#FEECEB', borderColor: '#FEE2E2' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#EF4444' }]}>
                    <MaterialCommunityIcons name="alert-circle" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#B91C1C' }]}>{kpi.terlambat}</Text>
                </View>
                <Text numberOfLines={1} style={[styles.kpiCardLabel, { color: '#B91C1C' }]}>
                  Terlambat
                </Text>
              </View>

              {/* CARD 4: SUDAH DINILAI */}
              <View style={[styles.kpiPillCard, { backgroundColor: '#F3E8FF', borderColor: '#E9D5FF' }]}>
                <View style={styles.kpiCardTopRow}>
                  <View style={[styles.kpiBadgeIcon, { backgroundColor: '#8B5CF6' }]}>
                    <MaterialCommunityIcons name="check-circle" size={13} color="#FFFFFF" />
                  </View>
                  <Text style={[styles.kpiCardNumber, { color: '#6D28D9' }]}>{kpi.sudah_dinilai}</Text>
                </View>
                <Text numberOfLines={2} style={[styles.kpiCardLabel, { color: '#6D28D9' }]}>
                  Sudah Dinilai
                </Text>
              </View>
            </View>
          </View>

          {/* 3. FILTER TABS & SEARCH / FILTER BUTTON */}
          <View style={styles.filterSectionBlock}>
            {/* Filter Pills Scroll */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.filterPillsScroll}
            >
              {[
                { key: 'all', label: 'Semua' },
                { key: 'pending', label: 'Belum Dikerjakan' },
                { key: 'submitted', label: 'Sudah Dikumpulkan' },
                { key: 'late', label: 'Terlambat' },
                { key: 'graded', label: 'Dinilai' },
              ].map((tabItem) => {
                const isActive = activeTab === tabItem.key;
                return (
                  <TouchableOpacity
                    key={tabItem.key}
                    activeOpacity={0.8}
                    onPress={() => setActiveTab(tabItem.key as any)}
                    style={[styles.filterCapsuleBtn, isActive && styles.filterCapsuleBtnActive]}
                  >
                    <Text style={[styles.filterCapsuleText, isActive && styles.filterCapsuleTextActive]}>
                      {tabItem.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* Search Box & Filter Button Row */}
            <View style={styles.searchAndFilterRow}>
              <View style={styles.searchBarContainer}>
                <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Cari tugas, mapel, atau guru..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInputField}
                />
                {searchQuery.length > 0 && (
                  <TouchableOpacity onPress={() => setSearchQuery('')}>
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => {
                  Alert.alert('Filter Tugas', 'Menampilkan penugasan terkini sesuai kategori pilihan Anda.');
                }}
                style={styles.filterActionButton}
              >
                <MaterialCommunityIcons name="filter-variant" size={18} color="#334155" style={{ marginRight: 6 }} />
                <Text style={styles.filterActionButtonText}>Filter</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 4. DAFTAR TUGAS LIST SECTION */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderBetween}>
              <View style={styles.sectionHeaderLeft}>
                <MaterialCommunityIcons name="clipboard-text" size={20} color="#059669" style={{ marginRight: 8 }} />
                <Text style={styles.sectionTitleBold}>
                  Daftar Tugas Siswa ({filteredAssignments.length})
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSortOrder((prev) => (prev === 'latest' ? 'deadline' : 'latest'))}
                style={styles.sortPillButton}
              >
                <MaterialCommunityIcons name="swap-vertical" size={16} color="#475569" style={{ marginRight: 4 }} />
                <Text style={styles.sortPillText}>{sortOrder === 'latest' ? 'Terbaru' : 'Tenggat'}</Text>
              </TouchableOpacity>
            </View>

            {loading ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator color="#18A165" size="large" />
                <Text style={styles.loadingText}>Memuat tugas dari sistem...</Text>
              </View>
            ) : filteredAssignments.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="clipboard-check-outline" size={46} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Tidak Ada Tugas</Text>
                <Text style={styles.emptySubtitle}>
                  {activeTab === 'all'
                    ? 'Belum ada tugas yang diterbitkan untuk kelas dan siswa ini.'
                    : `Tidak ada tugas dengan status "${activeTab}".`}
                </Text>
              </View>
            ) : (
              filteredAssignments.map((item, idx) => {
                const sub = Array.isArray(item.pengumpulan_tugas) && item.pengumpulan_tugas.length > 0
                  ? item.pengumpulan_tugas[0]
                  : Array.isArray(item.pengumpulanTugas) && item.pengumpulanTugas.length > 0
                  ? item.pengumpulanTugas[0]
                  : item.submission;

                const statusObj = getAssignmentStatus(item);
                const subjectName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || '';
                const subjectTheme = getSubjectTheme(subjectName);
                const teacherName = item.teacher?.name || item.teacher?.nama_lengkap || item.guru?.nama_lengkap || item.guru?.nama || item.teacher_name || '';
                const taskTitle = item.judul_tugas || item.judul || item.title || 'Penugasan';
                const taskDesc = item.deskripsi || item.instruksi || '';
                const deadlineFormatted = formatDeadline(item.deadline);
                const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);
                const attachmentCount = item.attachments_count ?? (Array.isArray(item.attachments) ? item.attachments.length : (Array.isArray(item.files) ? item.files.length : (item.file_url || item.lampiran ? 1 : 0)));

                return (
                  <View key={String(item.id || idx)} style={styles.assignmentCardModern}>
                    {/* Top Row: Left Subject Icon Box & Right Info */}
                    <View style={styles.cardHeaderFlex}>
                      <View style={[styles.subjectIconBoxLarge, { backgroundColor: subjectTheme.bgIcon }]}>
                        <MaterialCommunityIcons name={subjectTheme.icon} size={28} color={subjectTheme.iconColor} />
                      </View>

                      <View style={styles.cardInfoCol}>
                        <View style={styles.cardBadgesRow}>
                          {subjectName ? (
                            <View
                              style={[
                                styles.subjectPillBadge,
                                { backgroundColor: subjectTheme.badgeBg, borderColor: subjectTheme.badgeBorder },
                              ]}
                            >
                              <MaterialCommunityIcons
                                name="book-outline"
                                size={11}
                                color={subjectTheme.badgeText}
                                style={{ marginRight: 4 }}
                              />
                              <Text numberOfLines={1} style={[styles.subjectPillText, { color: subjectTheme.badgeText }]}>
                                {subjectName}
                              </Text>
                            </View>
                          ) : null}

                          <View style={[styles.statusPillBadge, { backgroundColor: statusObj.bg }]}>
                            <MaterialCommunityIcons
                              name={statusObj.icon}
                              size={12}
                              color={statusObj.color}
                              style={{ marginRight: 3 }}
                            />
                            <Text style={[styles.statusPillText, { color: statusObj.color }]}>
                              {statusObj.label}
                            </Text>
                          </View>
                        </View>

                        <Text style={styles.cardTaskTitle} numberOfLines={2}>
                          {taskTitle}
                        </Text>

                        {taskDesc ? (
                          <Text style={styles.cardTaskDesc} numberOfLines={2}>
                            {taskDesc}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    {/* Metadata 3-Column Box */}
                    <View style={styles.metadataContainerBox}>
                      {/* Col 1: Deadline */}
                      <View style={styles.metaColumnItem}>
                        <MaterialCommunityIcons name="calendar-blank-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                        <View style={{ flex: 1 }}>
                          <Text style={styles.metaLabelText}>Deadline</Text>
                          <Text numberOfLines={1} style={styles.metaValueText}>{deadlineFormatted}</Text>
                        </View>
                      </View>

                      {teacherName ? (
                        <>
                          <View style={styles.metaVerticalDivider} />
                          {/* Col 2: Guru */}
                          <View style={styles.metaColumnItem}>
                            <MaterialCommunityIcons name="account-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.metaLabelText}>Guru</Text>
                              <Text numberOfLines={1} style={styles.metaValueText}>{teacherName}</Text>
                            </View>
                          </View>
                        </>
                      ) : null}

                      {attachmentCount > 0 ? (
                        <>
                          <View style={styles.metaVerticalDivider} />
                          {/* Col 3: Lampiran */}
                          <View style={[styles.metaColumnItem, { flex: 0.85 }]}>
                            <MaterialCommunityIcons name="file-document-outline" size={16} color="#64748B" style={{ marginRight: 6 }} />
                            <View style={{ flex: 1 }}>
                              <Text style={styles.metaLabelText}>Lampiran</Text>
                              <Text numberOfLines={1} style={styles.metaValueText}>{attachmentCount} file</Text>
                            </View>
                          </View>
                        </>
                      ) : null}
                    </View>

                    {/* Footer: Graded frame vs Pending reminder & button */}
                    {isGraded ? (
                      <View style={styles.gradedCardFrameModern}>
                        <View style={styles.gradedTopRow}>
                          <View style={styles.scorePillBadge}>
                            <MaterialCommunityIcons name="star" size={13} color="#FFFFFF" style={{ marginRight: 4 }} />
                            <Text style={styles.scorePillLabel}>Nilai</Text>
                            <Text style={styles.scorePillValue}>{sub?.nilai_guru ?? sub?.nilai ?? '-'}</Text>
                          </View>
                          <Text style={styles.gradedCheckText}>Sudah Diperiksa</Text>
                        </View>

                        {sub?.catatan_guru || sub?.catatan ? (
                          <View style={styles.teacherNoteBoxModern}>
                            <MaterialCommunityIcons name="message-text" size={14} color="#059669" style={{ marginTop: 2, marginRight: 6 }} />
                            <Text style={styles.teacherNoteTextModern}>
                              <Text style={{ fontWeight: '800', color: '#065F46' }}>Catatan: </Text>
                              {sub?.catatan_guru || sub?.catatan}
                            </Text>
                          </View>
                        ) : null}
                      </View>
                    ) : (
                      <View style={styles.pendingActionRow}>
                        <View style={styles.pendingAlertBoxModern}>
                          <MaterialCommunityIcons
                            name={canSubmit ? 'information-outline' : 'shield-account'}
                            size={16}
                            color="#D97706"
                            style={{ marginRight: 6 }}
                          />
                          <Text numberOfLines={1} style={styles.pendingAlertTextModern}>
                            {canSubmit
                              ? isParent
                                ? 'Kumpulkan tugas ananda sebelum batas waktu.'
                                : 'Segera kumpulkan sebelum batas waktu berakhir.'
                              : 'Tugas jenjang SMP/SMA dikerjakan di portal siswa.'}
                          </Text>
                        </View>

                        {canSubmit && (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => {
                              setSelectedAssignment(item);
                              setSubmissionText(sub?.jawaban_teks || '');
                            }}
                            style={styles.kumpulkanBtnModern}
                          >
                            <MaterialCommunityIcons name="tray-arrow-up" size={15} color="#FFFFFF" style={{ marginRight: 5 }} />
                            <Text style={styles.kumpulkanBtnTextModern}>
                              {statusObj.key === 'submitted' ? 'Kirim Ulang' : 'Kumpulkan'}
                            </Text>
                          </TouchableOpacity>
                        )}
                      </View>
                    )}
                  </View>
                );
              })
            )}
          </View>
        </ScrollView>

        {/* MODAL PENGUMPULAN TUGAS */}
        <Modal
          visible={!!selectedAssignment}
          transparent
          animationType="fade"
          onRequestClose={() => setSelectedAssignment(null)}
        >
          <View style={styles.modalOverlay}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Kumpulkan Tugas</Text>
                  <Text numberOfLines={1} style={styles.modalSubtitle}>
                    {selectedAssignment?.judul_tugas || selectedAssignment?.judul}
                  </Text>
                </View>
                <TouchableOpacity onPress={() => setSelectedAssignment(null)} style={styles.modalCloseBtn}>
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              <ScrollView style={styles.modalBody}>
                <Text style={styles.inputLabel}>Teks Jawaban / Ringkasan Pekerjaan:</Text>
                <TextInput
                  value={submissionText}
                  onChangeText={setSubmissionText}
                  multiline
                  numberOfLines={5}
                  placeholder="Tuliskan jawaban atau link dokumen tugas Anda di sini..."
                  placeholderTextColor="#94A3B8"
                  style={styles.modalTextInput}
                />
              </ScrollView>

              <View style={styles.modalFooter}>
                <TouchableOpacity
                  onPress={() => setSelectedAssignment(null)}
                  style={styles.modalCancelBtn}
                  disabled={submitting}
                >
                  <Text style={styles.modalCancelBtnText}>Batal</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={handleSubmitAssignment}
                  style={styles.modalSubmitBtn}
                  disabled={submitting}
                >
                  {submitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="check" size={16} color="#FFFFFF" />
                      <Text style={styles.modalSubmitBtnText}>Kirim Tugas</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </Modal>
      </View>
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
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 20 : 16 },

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
  childCardHeroSizeSingle: {
    width: '100%',
    minHeight: 148,
    justifyContent: 'space-between',
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
  childCardHeroSizeInactive: {
    opacity: 0.9,
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
    shadowColor: '#000000',
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 4,
  },
  avatarBorderWrapHeroInactive: {
    borderColor: 'rgba(255, 255, 255, 0.8)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  avatarInitialText: {
    fontSize: 24,
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
  },
  studentNisText: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    fontWeight: '600',
    marginTop: 1,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 1,
    fontWeight: '600',
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
  studentUnitBadgeInactive: {
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentUnitText: {
    fontSize: 9,
    fontWeight: '800',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
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
  studentAttributesGridInactive: {
    backgroundColor: 'rgba(4, 47, 30, 0.35)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
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

  // Section Header Between
  sectionHeaderBetween: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  sectionHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  sectionIconBadge: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sectionTitleBold: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  semesterDropdownPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  semesterDropdownText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },

  // 4 KPI Horizontal Row
  kpiRowContainer: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 2,
  },
  kpiPillCard: {
    flex: 1,
    borderRadius: 14,
    padding: 8,
    borderWidth: 1,
    justifyContent: 'space-between',
    minHeight: 68,
  },
  kpiCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 4,
  },
  kpiBadgeIcon: {
    width: 22,
    height: 22,
    borderRadius: 7,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiCardNumber: {
    fontSize: 15,
    fontWeight: '900',
  },
  kpiCardLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    lineHeight: 12,
  },

  // Filter Tabs & Search
  filterSectionBlock: {
    marginBottom: 16,
    gap: 10,
  },
  filterPillsScroll: {
    gap: 8,
    paddingVertical: 2,
  },
  filterCapsuleBtn: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterCapsuleBtnActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterCapsuleText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#475569',
  },
  filterCapsuleTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  searchAndFilterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchBarContainer: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    height: 42,
  },
  searchInputField: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  filterActionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 12,
    paddingHorizontal: 14,
    height: 42,
    gap: 4,
  },
  filterActionButtonText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#334155',
  },
  sortPillButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
    gap: 4,
  },
  sortPillText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },

  // Loading & Empty States
  loadingBox: {
    padding: 30,
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 12,
    color: '#64748B',
    marginTop: 8,
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 28,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderStyle: 'dashed',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#475569',
    marginTop: 8,
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },

  // Modern Assignment Card
  assignmentCardModern: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeaderFlex: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  subjectIconBoxLarge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardInfoCol: {
    flex: 1,
  },
  cardBadgesRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 5,
  },
  subjectPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 1,
  },
  subjectPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  cardTaskTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 3,
  },
  cardTaskDesc: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 2,
  },

  // Metadata 3-Column Box
  metadataContainerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 10,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  metaColumnItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
  },
  metaLabelText: {
    fontSize: 9.5,
    color: '#64748B',
    fontWeight: '500',
  },
  metaValueText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  metaVerticalDivider: {
    width: 1,
    height: 24,
    backgroundColor: '#E2E8F0',
    marginHorizontal: 6,
  },

  // Graded Card Frame
  gradedCardFrameModern: {
    backgroundColor: '#F0FDF4',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#86EFAC',
    gap: 6,
  },
  gradedTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  scorePillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 3,
  },
  scorePillLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#DCFCE7',
  },
  scorePillValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  gradedCheckText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  teacherNoteBoxModern: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  teacherNoteTextModern: {
    fontSize: 11,
    color: '#334155',
    lineHeight: 16,
    flex: 1,
  },

  // Pending Action Row
  pendingActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 2,
  },
  pendingAlertBoxModern: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FEF3C7',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  pendingAlertTextModern: {
    fontSize: 10,
    color: '#92400E',
    fontWeight: '600',
    flex: 1,
  },
  kumpulkanBtnModern: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 8,
    paddingHorizontal: 13,
    borderRadius: 10,
  },
  kumpulkanBtnTextModern: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },

  // Modal
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 18,
  },
  modalCard: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    overflow: 'hidden',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: {
    padding: 16,
  },
  inputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  modalTextInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    fontSize: 12.5,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 120,
  },
  modalFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: 12,
    backgroundColor: '#18A165',
  },
  modalSubmitBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
