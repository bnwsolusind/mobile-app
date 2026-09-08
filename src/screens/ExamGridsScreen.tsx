import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';

import { isParentRole, isStudentRole } from '../utils/roles';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type ExamGridItem = {
  id: string;
  judul_kisi?: string;
  jenis_ujian?: string;
  mata_pelajaran_id?: string;
  jumlah_soal?: number;
  alokasi_waktu_menit?: number;
  kompetensi_dasar?: string;
  level_kognitif?: string;
  distribusi_bobot?: Record<string, any> | Array<any>;
  status?: boolean;
  subject?: { id?: string; name?: string; code?: string };
  kelas?: { id?: string; name?: string; nama_kelas?: string };
  guru?: { id?: string; name?: string; full_name?: string; nama_lengkap?: string };
};

const childName = (child: any) => child?.full_name || child?.nama_lengkap || child?.name || 'Siswa';
const childClass = (child: any) => child?.kelas?.nama_kelas || child?.kelas?.name || child?.class_name || 'Kelas belum ditentukan';
const childUnit = (child: any) => child?.education_unit?.name || child?.kelas?.unit_pendidikan?.name || child?.unit_name || 'Unit Sekolah';

export default function ExamGridsScreen({ route }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const roles = useAuthStore((state) => state.roles);
  const userRoles = useMemo(() => (roles?.length ? roles : user?.roles || []), [roles, user?.roles]);
  const isParent = isParentRole(userRoles);
  const isStudent = isStudentRole(userRoles);

  const studentScrollRef = useRef<ScrollView>(null);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [grids, setGrids] = useState<ExamGridItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedSubject, setSelectedSubject] = useState('Semua');
  const [activeModalItem, setActiveModalItem] = useState<ExamGridItem | null>(null);

  // 1. Load Children if parent with offline cache
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id;
      const childCacheKey = offlineCache.buildKey('exam_grids_children', user?.id);
      void (async () => {
        const cached = await offlineCache.get<any[]>(childCacheKey);
        if (cached && isMounted && cached.length > 0) {
          const filteredCached = targetChildId
            ? cached.filter((c) => String(c.id) === String(targetChildId))
            : cached;
          setChildren(filteredCached.length > 0 ? filteredCached : cached);
          setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || (cached[0]?.id ? String(cached[0].id) : undefined)));
        }
      })();

      mobileApiService.getPortalChildren()
        .then((res) => {
          const list = unwrapApiData<any[]>(res) || [];
          if (isMounted && list.length > 0) {
            const filteredList = targetChildId
              ? list.filter((c) => String(c.id) === String(targetChildId))
              : list;
            setChildren(filteredList.length > 0 ? filteredList : list);
            setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || (list[0]?.id ? String(list[0].id) : undefined)));
            void offlineCache.set(childCacheKey, list);
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, user?.id, route?.params?.child_id]);

  // 2. Load Real Exam Grids from Backend Database with offline cache
  const loadExamGrids = useCallback(async () => {
    setError('');
    const targetChildId = isParent ? selectedChildId : undefined;
    const cacheKey = offlineCache.buildKey('exam_grids', user?.id, targetChildId || 'self');

    // Baca cache dulu
    const cached = await offlineCache.get<{ grids: ExamGridItem[]; student: any }>(cacheKey);
    if (cached) {
      if (cached.grids) setGrids(cached.grids);
      if (cached.student) setStudentInfo(cached.student);
    }

    try {
      const response = await mobileApiService.getPortalExamGrids(targetChildId);
      const raw = unwrapApiData<any>(response);
      const records = Array.isArray(raw?.data) ? raw.data : (Array.isArray(raw) ? raw : []);
      setGrids(records);

      const resolvedStudent = response?.student || raw?.student || response?.data?.student;
      let finalStudent = studentInfo;
      if (resolvedStudent) {
        finalStudent = resolvedStudent;
        setStudentInfo(resolvedStudent);
      } else if (isStudent) {
        const currentUser = useAuthStore.getState().user;
        finalStudent = currentUser?.student || currentUser;
        setStudentInfo((prev: any) => prev || finalStudent);
      }

      void offlineCache.set(cacheKey, { grids: records, student: finalStudent });
    } catch (err) {
      if (!cached) {
        setError(getApiErrorMessage(err, 'Daftar kisi-kisi ujian belum berhasil dimuat.'));
        setGrids([]);
      }
    }
  }, [isParent, isStudent, selectedChildId, studentInfo, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      if (isStudent) {
        try {
          const profRes = await mobileApiService.getPortalProfile();
          const profData = unwrapApiData<any>(profRes) || profRes?.data || profRes;
          if (profData) setStudentInfo(profData);
        } catch {
          const currentUser = useAuthStore.getState().user;
          setStudentInfo((prev: any) => prev || currentUser?.student || currentUser);
        }
      }
      await loadExamGrids();
    } finally {
      setLoading(false);
    }
  }, [isStudent, loadExamGrids]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      if (isParent) {
        const res = await mobileApiService.getPortalChildren();
        const list = unwrapApiData<any[]>(res) || [];
        setChildren(list);
      }
      await loadExamGrids();
    } finally {
      setRefreshing(false);
    }
  };

  // Handle Child Carousel Interaction
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


  // Dynamic Subjects from real DB data
  const subjectOptions = useMemo(() => {
    const set = new Set<string>();
    grids.forEach((g) => {
      const name = g.subject?.name;
      if (name) set.add(name);
    });
    return ['Semua', ...Array.from(set)];
  }, [grids]);

  // Filtered Grids
  const filteredGrids = useMemo(() => {
    return grids.filter((g) => {
      const title = g.judul_kisi || '';
      const subjectName = g.subject?.name || '';
      const teacherName = g.guru?.nama_lengkap || g.guru?.full_name || g.guru?.name || '';
      const matchesSearch =
        !search.trim() ||
        title.toLowerCase().includes(search.trim().toLowerCase()) ||
        subjectName.toLowerCase().includes(search.trim().toLowerCase()) ||
        teacherName.toLowerCase().includes(search.trim().toLowerCase());
      const matchesSubject =
        selectedSubject === 'Semua' ||
        subjectName.toLowerCase() === selectedSubject.toLowerCase();

      return matchesSearch && matchesSubject;
    });
  }, [grids, search, selectedSubject]);

  const selectedChildObj = children.find((c) => String(c.id) === selectedChildId);

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        {/* Soft emerald aesthetic background */}
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
                  const childFullName = childName(child);
                  const unitTitle = childUnit(child);
                  const className = childClass(child);
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

                        {/* Top Row: Avatar + Info (Name, NIS, Unit Pill) + Right Button */}
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
                  {children.map((child, idx) => {
                    const isSelected = String(child.id) === selectedChildId;
                    return (
                      <TouchableOpacity
                        key={String(child.id)}
                        onPress={() => selectChildWithScroll(String(child.id), idx)}
                        style={[styles.paginationDot, isSelected && styles.paginationDotActive]}
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
                const studentFullName = s.full_name || s.nama_lengkap || s.name || 'Siswa Aktif';
                const className = s.kelas?.nama_kelas || s.kelas?.name || s.class || s.class_name || 'Kelas Belum Ditentukan';
                const unitTitle = s.education_unit?.name || s.kelas?.unit_pendidikan?.name || s.unit || s.unit_name || 'Unit Sekolah';
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
                          <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
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
                            {studentFullName}
                          </Text>
                        </View>
                        <Text style={styles.studentNisText}>
                          NIS: {s.nis || '-'} {s.nisn ? `· NISN: ${s.nisn}` : ''}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {unitTitle}
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
                );
              })()}
            </View>
          ) : user ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-tie" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Pengguna & Unit Pendidikan</Text>
                </View>
              </View>

              {(() => {
                const u = user as any;
                const userName = String(u?.name || u?.full_name || u?.nama_lengkap || 'Pengguna');
                const userRole = String(typeof u?.role === 'string' ? user.role : Array.isArray(u?.roles) && u.roles[0] ? u.roles[0] : 'Pengguna');
                const unitTitle = String(u?.unit_name || u?.education_unit?.name || 'Sistem Sekolah Terpadu');
                const avatarUri = getProfileImageUrl(u);

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
                          <Image source={{ uri: avatarUri }} style={styles.childAvatarImgHero} resizeMode="cover" />
                        ) : (
                          <Text style={styles.avatarInitialText}>{userName.charAt(0).toUpperCase()}</Text>
                        )}
                      </View>
                      <View style={styles.childInfoCol}>
                        <Text numberOfLines={1} style={styles.childNameHero}>
                          {userName}
                        </Text>
                        <Text style={styles.childSubInfoHero}>
                          {u.nis ? `NIS: ${u.nis}` : 'Akun Terverifikasi'}
                        </Text>
                        <View style={styles.studentUnitBadge}>
                          <MaterialCommunityIcons name="briefcase-outline" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                          <Text numberOfLines={1} style={styles.studentUnitText}>
                            {userRole}
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
                          {userRole}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Unit</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>
                          {unitTitle}
                        </Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Status</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>
                          Aktif
                        </Text>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </View>
          ) : null}

          {/* ══════════════════════════════════════════════════════════════
              SECTION 2: SEARCH & FILTER BAR
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.containerBlock}>
            <View style={styles.searchContainer}>
              <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" style={{ marginRight: 8 }} />
              <TextInput
                style={styles.searchInput}
                placeholder="Cari judul kisi-kisi atau mapel..."
                placeholderTextColor="#94A3B8"
                value={search}
                onChangeText={setSearch}
              />
              {search.trim().length > 0 && (
                <TouchableOpacity onPress={() => setSearch('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* Subject Filter Chips */}
            {subjectOptions.length > 1 && (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.subjectFilterScroll}>
                {subjectOptions.map((subj) => {
                  const isSelected = selectedSubject === subj;
                  return (
                    <TouchableOpacity
                      key={subj}
                      activeOpacity={0.75}
                      onPress={() => setSelectedSubject(subj)}
                      style={[styles.filterChip, isSelected && styles.filterChipActive]}
                    >
                      <Text style={[styles.filterChipText, isSelected && styles.filterChipTextActive]}>
                        {subj}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            )}
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 3: SUMMARY BANNER
             ══════════════════════════════════════════════════════════════ */}
          <View style={styles.summaryBanner}>
            <View style={styles.summaryIconBox}>
              <MaterialCommunityIcons name="file-document-outline" size={22} color="#18A165" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.summaryTitle}>Panduan Materi & Kisi-Kisi</Text>
              <Text style={styles.summarySubtitle}>
                Tersedia {filteredGrids.length} dokumen kisi-kisi resmi yang dipublikasikan oleh dewan guru.
              </Text>
            </View>
          </View>

          {/* ══════════════════════════════════════════════════════════════
              SECTION 4: KISI-KISI CARDS LIST (100% REAL DATA DARI DB)
             ══════════════════════════════════════════════════════════════ */}
          {loading && !refreshing ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#18A165" />
              <Text style={styles.loadingText}>Memuat kisi-kisi ujian dari database...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={28} color="#DC2626" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity onPress={() => void loadAll()} style={styles.retryBtn}>
                <Text style={styles.retryBtnText}>Muat Ulang</Text>
              </TouchableOpacity>
            </View>
          ) : filteredGrids.length === 0 ? (
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="book-open-blank-variant" size={48} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Belum Ada Kisi-Kisi</Text>
              <Text style={styles.emptySubtitle}>
                {search || selectedSubject !== 'Semua'
                  ? 'Tidak ditemukan kisi-kisi yang sesuai dengan kata kunci atau filter yang dipilih.'
                  : 'Dewan guru belum mempublikasikan kisi-kisi ujian untuk kelas ini.'}
              </Text>
            </View>
          ) : (
            <View style={styles.gridsList}>
              {filteredGrids.map((item) => {
                const subjectName = item.subject?.name || 'Mata Pelajaran';
                const teacherName = item.guru?.nama_lengkap || item.guru?.full_name || item.guru?.name || 'Dewan Guru';
                const examType = item.jenis_ujian || 'Ujian';

                return (
                  <View key={item.id} style={styles.gridCard}>
                    {/* Top Row: Subject & Exam Type Badge */}
                    <View style={styles.cardHeaderRow}>
                      <View style={styles.subjectBadge}>
                        <MaterialCommunityIcons name="book-open-page-variant" size={12} color="#059669" />
                        <Text numberOfLines={1} style={styles.subjectBadgeText}>
                          {subjectName}
                        </Text>
                      </View>
                      <View style={styles.examTypeBadge}>
                        <Text style={styles.examTypeBadgeText}>{examType}</Text>
                      </View>
                    </View>

                    {/* Title */}
                    <Text style={styles.gridTitle} numberOfLines={2}>
                      {item.judul_kisi || 'Kisi-Kisi Evaluasi Belajar'}
                    </Text>

                    {/* Teacher & Class Info */}
                    <View style={styles.infoMetaRow}>
                      <MaterialCommunityIcons name="account-tie-outline" size={14} color="#64748B" />
                      <Text numberOfLines={1} style={styles.infoMetaText}>
                        Guru: {teacherName}
                      </Text>
                    </View>

                    {/* Key Attributes Pills */}
                    <View style={styles.attributePillsRow}>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color="#059669" />
                        <Text style={styles.attrPillText}>
                          {item.alokasi_waktu_menit ? `${item.alokasi_waktu_menit} Menit` : '60 Menit'}
                        </Text>
                      </View>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="format-list-numbered" size={13} color="#2563EB" />
                        <Text style={styles.attrPillText}>
                          {item.jumlah_soal ? `${item.jumlah_soal} Soal` : '- Soal'}
                        </Text>
                      </View>
                      <View style={styles.attrPill}>
                        <MaterialCommunityIcons name="brain" size={13} color="#7C3AED" />
                        <Text style={styles.attrPillText}>
                          {item.level_kognitif || 'L1 - L3'}
                        </Text>
                      </View>
                    </View>

                    {/* Action Button: Detail Modal */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setActiveModalItem(item)}
                      style={styles.detailBtn}
                    >
                      <Text style={styles.detailBtnText}>Lihat Rincian Kisi-Kisi</Text>
                      <MaterialCommunityIcons name="arrow-right" size={16} color="#18A165" />
                    </TouchableOpacity>
                  </View>
                );
              })}
            </View>
          )}
        </ScrollView>
      </View>

      {/* ══════════════════════════════════════════════════════════════
          MODAL RINCIAN KISI-KISI
         ══════════════════════════════════════════════════════════════ */}
      <Modal
        visible={Boolean(activeModalItem)}
        transparent
        animationType="fade"
        onRequestClose={() => setActiveModalItem(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalContainer}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={styles.modalSubjectBadge}>
                  <Text style={styles.modalSubjectBadgeText}>
                    {activeModalItem?.subject?.name || 'Mata Pelajaran'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>{activeModalItem?.judul_kisi}</Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveModalItem(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* Meta Grid */}
              <View style={styles.modalMetaGrid}>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>JENIS UJIAN</Text>
                  <Text style={styles.modalMetaValue}>{activeModalItem?.jenis_ujian || '-'}</Text>
                </View>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>DURASI WAKTU</Text>
                  <Text style={styles.modalMetaValue}>
                    {activeModalItem?.alokasi_waktu_menit ? `${activeModalItem.alokasi_waktu_menit} Menit` : '-'}
                  </Text>
                </View>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>JUMLAH SOAL</Text>
                  <Text style={styles.modalMetaValue}>
                    {activeModalItem?.jumlah_soal ? `${activeModalItem.jumlah_soal} Butir` : '-'}
                  </Text>
                </View>
                <View style={styles.modalMetaItem}>
                  <Text style={styles.modalMetaLabel}>LEVEL KOGNITIF</Text>
                  <Text style={styles.modalMetaValue}>{activeModalItem?.level_kognitif || 'L1 - L3'}</Text>
                </View>
              </View>

              {/* Teacher Info */}
              <View style={styles.modalSectionBox}>
                <Text style={styles.modalSectionHeader}>Guru Pengampu</Text>
                <Text style={styles.modalSectionContent}>
                  {activeModalItem?.guru?.nama_lengkap ||
                    activeModalItem?.guru?.full_name ||
                    activeModalItem?.guru?.name ||
                    'Dewan Guru'}
                </Text>
              </View>

              {/* Kompetensi Dasar / Capaian Pembelajaran */}
              <View style={styles.modalSectionBox}>
                <Text style={styles.modalSectionHeader}>Kompetensi Dasar & Capaian Materi</Text>
                <Text style={styles.modalSectionContent}>
                  {activeModalItem?.kompetensi_dasar ||
                    'Sesuai dengan silabus kurikulum dan tujuan pembelajaran yang telah ditetapkan.'}
                </Text>
              </View>

              {/* Distribusi Bobot (Jika Ada) */}
              {activeModalItem?.distribusi_bobot && (
                <View style={styles.modalSectionBox}>
                  <Text style={styles.modalSectionHeader}>Distribusi Bobot Soal</Text>
                  <Text style={styles.modalSectionContent}>
                    {typeof activeModalItem.distribusi_bobot === 'object'
                      ? JSON.stringify(activeModalItem.distribusi_bobot, null, 2)
                      : String(activeModalItem.distribusi_bobot)}
                  </Text>
                </View>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                onPress={() => setActiveModalItem(null)}
                style={styles.modalDoneBtn}
              >
                <Text style={styles.modalDoneBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
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
    marginBottom: 12,
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

  // Search & Filter
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  subjectFilterScroll: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  filterChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },

  // Summary Banner
  summaryBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    marginBottom: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#18A165',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  summaryIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  summarySubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },

  // Grids List
  gridsList: {
    gap: 12,
  },
  gridCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  examTypeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#FEF9C3',
    borderWidth: 1,
    borderColor: '#FDE047',
  },
  examTypeBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#854D0E',
  },
  gridTitle: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
    marginBottom: 6,
  },
  infoMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    marginBottom: 10,
  },
  infoMetaText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  attributePillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 14,
  },
  attrPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  attrPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  detailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  detailBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#18A165',
  },

  // State Views
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    fontSize: 12,
    color: '#64748B',
    fontWeight: '600',
  },
  errorBox: {
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 20,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FCA5A5',
  },
  errorText: {
    fontSize: 12,
    color: '#991B1B',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#DC2626',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },
  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 18,
  },

  // Modal
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalContainer: {
    width: '100%',
    maxHeight: '80%',
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    elevation: 8,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalSubjectBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 4,
  },
  modalSubjectBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    textTransform: 'uppercase',
  },
  modalTitle: {
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
  modalBody: {
    marginVertical: 12,
  },
  modalMetaGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  modalMetaItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  modalMetaLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#94A3B8',
  },
  modalMetaValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  modalSectionBox: {
    marginBottom: 14,
  },
  modalSectionHeader: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  modalSectionContent: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 18,
  },
  modalFooter: {
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  modalDoneBtn: {
    backgroundColor: '#18A165',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalDoneBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
