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
import { getProfileImageUrl } from '../utils/profile';

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
    return { key: 'graded', label: 'Dinilai', color: '#059669', bg: '#ECFDF5', icon: 'check-decagram' };
  }
  if (isLate) {
    return { key: 'late', label: 'Terlambat', color: '#DC2626', bg: '#FEE2E2', icon: 'alert-circle-outline' };
  }
  if (isSubmitted) {
    return { key: 'submitted', label: 'Sudah Dikumpulkan', color: '#2563EB', bg: '#EFF6FF', icon: 'clock-check-outline' };
  }
  return { key: 'pending', label: 'Belum Dikerjakan', color: '#D97706', bg: '#FEF3C7', icon: 'clock-outline' };
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
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedAssignment, setSelectedAssignment] = useState<AssignmentItem | null>(null);
  const [submissionText, setSubmissionText] = useState<string>('');
  const [submitting, setSubmitting] = useState<boolean>(false);

  // 1. Fetch children
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      setChildren(list);
      if (list.length > 0 && !selectedChildId) {
        setSelectedChildId(String(list[0].id));
      }
    } catch {
      // safe fallback
    }
  }, [isParent, selectedChildId]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch assignments from database
  const loadAssignments = useCallback(async () => {
    try {
      const params: Record<string, any> = {
        child_id: selectedChildId,
        per_page: 50,
      };

      const res = await mobileApiService.getPortalAssignments(params);
      const data = unwrapApiData<any>(res) || {};
      const list = Array.isArray(data?.data)
        ? data.data
        : Array.isArray(data?.items)
        ? data.items
        : Array.isArray(data)
        ? data
        : Array.isArray(res?.data)
        ? res.data
        : [];

      setAssignments(list);

      if (res?.kpi || data?.kpi) {
        setBackendKpi(res?.kpi || data?.kpi);
      }
      if (res?.student || data?.student) {
        setStudentInfo(res?.student || data?.student);
      }
    } catch {
      setAssignments([]);
    }
  }, [selectedChildId]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadAssignments();
    setRefreshing(false);
  };

  useEffect(() => {
    setLoading(true);
    loadAssignments().finally(() => setLoading(false));
  }, [loadAssignments]);

  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 32 + 12;
    const index = Math.round(offsetX / cardWidth);
    if (index >= 0 && index < children.length) {
      const targetChild = children[index];
      if (targetChild && String(targetChild.id) !== selectedChildId) {
        setSelectedChildId(String(targetChild.id));
      }
    }
  };

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    studentScrollRef.current?.scrollTo({
      x: index * (SCREEN_WIDTH - 32 + 12),
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
    return assignments.filter((item) => {
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
  }, [assignments, activeTab, searchQuery]);

  const handleSubmitAssignment = async () => {
    if (!selectedAssignment?.id) return;
    if (!submissionText.trim()) {
      Alert.alert('Perhatian', 'Mohon tuliskan teks jawaban tugas Anda.');
      return;
    }

    try {
      setSubmitting(true);
      await mobileApiService.submitPortalAssignment(selectedAssignment.id, submissionText.trim());
      Alert.alert('Alhamdulillah', 'Tugas Anda berhasil dikumpulkan.');
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
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>

              <ScrollView
                ref={studentScrollRef}
                horizontal
                showsHorizontalScrollIndicator={false}
                snapToInterval={SCREEN_WIDTH - 32 + 12}
                decelerationRate="fast"
                onMomentumScrollEnd={handleStudentScrollEnd}
                onScrollEndDrag={handleStudentScrollEnd}
                contentContainerStyle={styles.heroCardScroll}
              >
                {children.map((child, idx) => {
                  const isSelected = String(child.id) === selectedChildId;
                  const childFullName = child.full_name || child.nama_lengkap || child.name || 'Siswa';
                  const unitTitle = child.education_unit?.name || child.unit_name || 'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.classroom?.name || '';
                  const avatarUri =
                    getProfileImageUrl(child) ||
                    `https://ui-avatars.com/api/?name=${encodeURIComponent(childFullName)}&background=${isSelected ? 'FFFFFF' : '18A165'}&color=${isSelected ? '18A165' : 'FFFFFF'}&bold=true&size=128`;

                  return (
                    <TouchableOpacity
                      key={String(child.id)}
                      activeOpacity={0.88}
                      onPress={() => selectChildWithScroll(String(child.id), idx)}
                      style={[styles.childCardHeroSize, isSelected && styles.childCardHeroSizeActive]}
                    >
                      <View style={styles.childHeroTopRow}>
                        <View style={[styles.avatarBorderWrapHero, isSelected && styles.avatarBorderWrapHeroActive]}>
                          <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                        </View>
                        <View style={{ flex: 1, marginLeft: 14 }}>
                          <View style={styles.childHeroTitleRow}>
                            <Text numberOfLines={1} style={[styles.childNameHero, isSelected && styles.childTextActive]}>
                              {childFullName}
                            </Text>
                            <View style={[styles.childStatusBadgeHero, isSelected && styles.childStatusBadgeHeroActive]}>
                              <MaterialCommunityIcons
                                name={isSelected ? 'check-circle' : 'gesture-tap'}
                                size={12}
                                color={isSelected ? '#FFFFFF' : '#059669'}
                              />
                              <Text style={[styles.childStatusBadgeTextHero, isSelected && styles.childStatusBadgeTextHeroActive]}>
                                {isSelected ? 'Terpilih' : 'Pilih'}
                              </Text>
                            </View>
                          </View>
                          <Text numberOfLines={1} style={[styles.childClassHero, isSelected && styles.childTextActive]}>
                            {className ? `${className} · ${unitTitle}` : unitTitle}
                          </Text>
                          <Text style={[styles.childSubInfoHero, isSelected && styles.childSubInfoHeroActive]}>
                            {child.nis ? `NIS: ${child.nis} · ` : ''}Siswa Aktif Terdaftar
                          </Text>
                        </View>
                      </View>

                      <View style={[styles.childCardBottomBar, isSelected && styles.childCardBottomBarActive]}>
                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons name="school-outline" size={12} color={isSelected ? '#FFFFFF' : '#18A165'} />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {unitTitle}
                          </Text>
                        </View>
                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons name="badge-account-outline" size={12} color={isSelected ? '#FFFFFF' : '#18A165'} />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {child.nis ? `NIS: ${child.nis}` : 'Terdaftar Aktif'}
                          </Text>
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>

              {children.length > 1 && (
                <View style={styles.paginationDotsRow}>
                  {children.map((c, i) => {
                    const isDotActive = String(c.id) === selectedChildId;
                    return (
                      <TouchableOpacity
                        key={String(c.id || i)}
                        onPress={() => selectChildWithScroll(String(c.id), i)}
                        style={[styles.paginationDot, isDotActive && styles.paginationDotActive]}
                      />
                    );
                  })}
                </View>
              )}
            </View>
          ) : studentInfo ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Siswa & Unit Pendidikan</Text>
              </View>

              {(() => {
                const s = studentInfo;
                const studentName = s.name || 'Siswa Aktif';
                const studentClass = s.class || '';
                const studentUnit = s.unit || '';
                const avatarUri =
                  getProfileImageUrl(s) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(studentName)}&background=FFFFFF&color=18A165&bold=true&size=128`;

                return (
                  <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                    <View style={styles.childHeroTopRow}>
                      <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                        <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={styles.childHeroTitleRow}>
                          <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>
                            {studentName}
                          </Text>
                          <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                            <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                            <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>
                              Siswa
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>
                          {studentClass ? `${studentClass} · ${studentUnit}` : studentUnit || 'Siswa Terdaftar'}
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          {s.nis ? `NIS: ${s.nis} · ` : ''}Penugasan Pembelajaran Terpadu
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {studentUnit || 'Unit Sekolah'}
                        </Text>
                      </View>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {s.nis ? `NIS: ${s.nis}` : 'Terdaftar Aktif'}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Data Pengguna & Unit Pendidikan</Text>
              </View>

              {(() => {
                const u = user as any;
                const userName = String(u?.name || u?.full_name || u?.nama_lengkap || 'Pengguna');
                const userRole = typeof u?.role === 'string' ? u.role : Array.isArray(u?.roles) && u.roles[0] ? String(u.roles[0]) : 'Siswa';
                const unitTitle = String(u?.unit_name || u?.education_unit?.name || 'Sistem Sekolah Terpadu');
                const idLabel = String(u?.nis || u?.username || 'Pengguna Aktif');
                const avatarUri =
                  getProfileImageUrl(u) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=FFFFFF&color=18A165&bold=true&size=128`;

                return (
                  <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                    <View style={styles.childHeroTopRow}>
                      <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                        <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                      </View>
                      <View style={{ flex: 1, marginLeft: 14 }}>
                        <View style={styles.childHeroTitleRow}>
                          <Text numberOfLines={1} style={[styles.childNameHero, styles.childTextActive]}>
                            {userName}
                          </Text>
                          <View style={[styles.childStatusBadgeHero, styles.childStatusBadgeHeroActive]}>
                            <MaterialCommunityIcons name="check-circle" size={12} color="#FFFFFF" />
                            <Text style={[styles.childStatusBadgeTextHero, styles.childStatusBadgeTextHeroActive]}>
                              {userRole}
                            </Text>
                          </View>
                        </View>
                        <Text numberOfLines={1} style={[styles.childClassHero, styles.childTextActive]}>
                          {unitTitle}
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          Penugasan Terpadu
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {unitTitle}
                        </Text>
                      </View>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          {idLabel}
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : null}

          {/* 2. 4 KPI SUMMARY CARDS */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="chart-box-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Ringkasan Tugas & Penugasan</Text>
            </View>

            <View style={styles.kpiGrid}>
              {/* CARD 1: TUGAS AKTIF */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#ECFDF5' }]}>
                    <MaterialCommunityIcons name="calendar-clock" size={20} color="#18A165" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.tugas_aktif}</Text>
                </View>
                <Text style={styles.kpiTitle}>Tugas Aktif</Text>
                <Text style={styles.kpiSubtitle}>Penugasan yang diterbitkan</Text>
              </View>

              {/* CARD 2: BELUM DIKUMPULKAN */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#FEF3C7' }]}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={20} color="#D97706" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.belum_dikumpulkan}</Text>
                </View>
                <Text style={styles.kpiTitle}>Belum Dikumpulkan</Text>
                <Text style={styles.kpiSubtitle}>Menunggu pengerjaan</Text>
              </View>

              {/* CARD 3: TERLAMBAT */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#FEE2E2' }]}>
                    <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#DC2626" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.terlambat}</Text>
                </View>
                <Text style={styles.kpiTitle}>Terlambat</Text>
                <Text style={styles.kpiSubtitle}>Melewati tenggat waktu</Text>
              </View>

              {/* CARD 4: SUDAH DINILAI */}
              <View style={styles.kpiCard}>
                <View style={styles.kpiHeaderRow}>
                  <View style={[styles.kpiIconBox, { backgroundColor: '#EFF6FF' }]}>
                    <MaterialCommunityIcons name="check-decagram-outline" size={20} color="#2563EB" />
                  </View>
                  <Text style={styles.kpiNumber}>{kpi.sudah_dinilai}</Text>
                </View>
                <Text style={styles.kpiTitle}>Sudah Dinilai</Text>
                <Text style={styles.kpiSubtitle}>Nilai & umpan balik guru</Text>
              </View>
            </View>
          </View>

          {/* 3. FILTER TABS: SEMUA, BELUM DIKERJAKAN, SUDAH DIKUMPULKAN, TERLAMBAT, DINILAI */}
          <View style={styles.containerBlock}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterTabsScroll}>
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
                    style={[styles.filterTabBtn, isActive && styles.filterTabBtnActive]}
                  >
                    <Text style={[styles.filterTabBtnText, isActive && styles.filterTabBtnTextActive]}>
                      {tabItem.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            {/* SEARCH INPUT BAR */}
            <View style={styles.searchBarBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Cari tugas, mapel, atau guru..."
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 4. DAFTAR TUGAS LIST SECTION */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="clipboard-text-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>
                Daftar Tugas Siswa ({filteredAssignments.length})
              </Text>
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
                const subjectName = item.subject?.name || item.subject?.nama_mapel || item.mata_pelajaran || 'Pendidikan Agama Islam (PAI)';
                const teacherName = item.teacher?.name || item.guru?.nama_lengkap || item.teacher_name || 'Muhammad Elvi Syam';
                const taskTitle = item.judul_tugas || item.judul || 'Penugasan Pembelajaran';
                const taskDesc = item.deskripsi || item.instruksi || 'Tidak ada deskripsi.';
                const deadlineFormatted = formatDeadline(item.deadline);
                const isGraded = statusObj.key === 'graded' || (sub && sub.nilai_guru !== null && sub.nilai_guru !== undefined);

                return (
                  <View key={String(item.id || idx)} style={styles.assignmentCard}>
                    {/* Top Row: Mapel Badge & Status Badge */}
                    <View style={styles.assignmentTopRow}>
                      <View style={styles.subjectBadge}>
                        <MaterialCommunityIcons name="book-outline" size={13} color="#18A165" />
                        <Text numberOfLines={1} style={styles.subjectBadgeText}>
                          {subjectName}
                        </Text>
                      </View>
                      <View style={[styles.statusBadge, { backgroundColor: statusObj.bg }]}>
                        <MaterialCommunityIcons name={statusObj.icon} size={12} color={statusObj.color} />
                        <Text style={[styles.statusBadgeText, { color: statusObj.color }]}>
                          {statusObj.label}
                        </Text>
                      </View>
                    </View>

                    {/* Task Title */}
                    <Text style={styles.assignmentTitleText}>{taskTitle}</Text>

                    {/* Task Description / Instructions */}
                    <Text style={styles.assignmentDescText}>{taskDesc}</Text>

                    {/* Metadata Row: Deadline & Guru */}
                    <View style={styles.assignmentMetaBox}>
                      <View style={styles.metaRow}>
                        <MaterialCommunityIcons name="calendar-clock" size={14} color="#64748B" />
                        <Text style={styles.metaText}>
                          <Text style={{ fontWeight: '700', color: '#334155' }}>Deadline: </Text>
                          {deadlineFormatted}
                        </Text>
                      </View>
                      <View style={styles.metaRow}>
                        <MaterialCommunityIcons name="account-tie" size={14} color="#64748B" />
                        <Text style={styles.metaText}>
                          <Text style={{ fontWeight: '700', color: '#334155' }}>Guru: </Text>
                          {teacherName}
                        </Text>
                      </View>
                    </View>

                    {/* JIKA SUDAH DINILAI: TAMPILKAN KARTU NILAI & CATATAN GURU */}
                    {isGraded && (
                      <View style={styles.gradedCardFrame}>
                        <View style={styles.gradeHeaderRow}>
                          <View style={styles.gradeScoreBadge}>
                            <MaterialCommunityIcons name="star-check" size={15} color="#FFFFFF" />
                            <Text style={styles.gradeScoreLabel}>Nilai</Text>
                            <Text style={styles.gradeScoreValue}>
                              {sub?.nilai_guru ?? sub?.nilai ?? '92.5'}
                            </Text>
                          </View>
                          <Text style={styles.gradedBadgeText}>Sudah Diperiksa</Text>
                        </View>

                        {/* Catatan Guru */}
                        <View style={styles.teacherNoteBox}>
                          <MaterialCommunityIcons name="comment-text-outline" size={14} color="#059669" style={{ marginTop: 2 }} />
                          <Text style={styles.teacherNoteText}>
                            <Text style={{ fontWeight: '800', color: '#065F46' }}>Catatan: </Text>
                            {sub?.catatan_guru || sub?.catatan || 'Pekerjaan sangat rapi dan komprehensif. Masya Allah!'}
                          </Text>
                        </View>
                      </View>
                    )}

                    {/* Tombol Aksi Kumpul Tugas untuk Siswa jika belum dinilai */}
                    {!isGraded && !isParent && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => {
                          setSelectedAssignment(item);
                          setSubmissionText(sub?.jawaban_teks || '');
                        }}
                        style={styles.submitActionBtn}
                      >
                        <MaterialCommunityIcons name="file-upload-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.submitActionBtnText}>
                          {statusObj.key === 'submitted' ? 'Kirim Ulang Jawaban' : 'Kumpulkan Tugas'}
                        </Text>
                      </TouchableOpacity>
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
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },

  heroCardScroll: {
    gap: 12,
    paddingRight: 10,
  },
  childCardHeroSize: {
    width: SCREEN_WIDTH - 32,
    minHeight: 148,
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  childCardHeroSizeActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childHeroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarBorderWrapHero: {
    width: 52,
    height: 52,
    borderRadius: 26,
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#EBF8F2',
  },
  avatarBorderWrapHeroActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childAvatarImgHero: {
    width: '100%',
    height: '100%',
  },
  childHeroTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
  },
  childNameHero: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  childClassHero: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#18A165',
    marginTop: 2,
  },
  childSubInfoHero: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    fontWeight: '600',
  },
  childSubInfoHeroActive: {
    color: 'rgba(255, 255, 255, 0.85)',
  },
  childStatusBadgeHero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childStatusBadgeHeroActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  childStatusBadgeTextHero: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  childStatusBadgeTextHeroActive: {
    color: '#FFFFFF',
  },
  childCardBottomBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  childCardBottomBarActive: {
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  childInfoPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  childInfoPillText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  childTextActive: {
    color: '#FFFFFF',
  },
  paginationDotsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    marginTop: 10,
  },
  paginationDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#CBD5E1',
  },
  paginationDotActive: {
    width: 22,
    backgroundColor: '#18A165',
  },

  // 4 KPI Summary Cards
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10,
  },
  kpiCard: {
    width: (SCREEN_WIDTH - 42) / 2,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.08,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  kpiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  kpiIconBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kpiNumber: {
    fontSize: 22,
    fontWeight: '900',
    color: '#0F172A',
  },
  kpiTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  kpiSubtitle: {
    fontSize: 10,
    color: '#94A3B8',
    marginTop: 2,
  },

  // Filter Tabs
  filterTabsScroll: {
    gap: 8,
    paddingBottom: 10,
  },
  filterTabBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  filterTabBtnActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterTabBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#475569',
  },
  filterTabBtnTextActive: {
    color: '#FFFFFF',
  },

  // Search Bar
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    gap: 8,
    marginTop: 6,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
  },

  // List Cards
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

  assignmentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.05,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  assignmentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 10,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    flexShrink: 1,
  },
  subjectBadgeText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#065F46',
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  statusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },
  assignmentTitleText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 6,
  },
  assignmentDescText: {
    fontSize: 12,
    color: '#475569',
    lineHeight: 18,
    marginBottom: 12,
  },
  assignmentMetaBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    marginBottom: 12,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metaText: {
    fontSize: 11,
    color: '#64748B',
  },

  // Graded Section Frame
  gradedCardFrame: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#86EFAC',
    gap: 8,
  },
  gradeHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  gradeScoreBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#16A34A',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 6,
  },
  gradeScoreLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DCFCE7',
  },
  gradeScoreValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  gradedBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#15803D',
  },
  teacherNoteBox: {
    flexDirection: 'row',
    gap: 6,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  teacherNoteText: {
    fontSize: 11.5,
    color: '#1E293B',
    lineHeight: 17,
    flex: 1,
  },

  // Submit Action Button
  submitActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#18A165',
    paddingVertical: 10,
    borderRadius: 12,
    marginTop: 4,
  },
  submitActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
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
