import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Linking,
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

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type Child = Record<string, any>;
type MaterialItem = Record<string, any>;

const formatDate = (dateStr?: string): string => {
  if (!dateStr) return 'Terbaru';
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return 'Terbaru';
    return d.toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return 'Terbaru';
  }
};

const formatMetaText = (item: any): string => {
  const media = Array.isArray(item.media) ? item.media : [];
  if (media.length > 0) {
    const first = media[0];
    const type = String(first.tipe_file || '').toLowerCase();
    const sizeBytes = Number(first.file_size || first.size || 0);
    const sizeStr = sizeBytes > 0
      ? sizeBytes >= 1048576
        ? `${(sizeBytes / 1048576).toFixed(1)} MB`
        : `${Math.round(sizeBytes / 1024)} KB`
      : '';
    const duration = first.durasi || first.duration;

    if (type === 'pdf') {
      return sizeStr ? `File PDF - ${sizeStr}` : 'File PDF';
    }
    if (type === 'video') {
      return duration ? `Video Pembelajaran - ${duration}` : 'Video Pembelajaran';
    }
    if (type === 'audio') {
      return duration ? `Audio Pembelajaran - ${duration}` : 'Audio Pembelajaran';
    }
    const ext = (first.nama_file || first.file_name || '').split('.').pop()?.toUpperCase();
    return ext ? `File ${ext}${sizeStr ? ' - ' + sizeStr : ''}` : 'Lampiran Berkas';
  }
  if (item.tipe) {
    return `Materi ${item.tipe}`;
  }
  if (item.konten || item.isi || item.deskripsi) {
    return 'Ringkasan Materi';
  }
  return 'Materi Pembelajaran';
};

const getSubjectStyle = (name?: string, media?: any[]) => {
  const norm = (name || '').toLowerCase();
  if (norm.includes('matematik') || norm.includes('math') || norm.includes('hitung')) {
    return {
      bg: '#E0F2FE',
      color: '#2563EB',
      icon: 'file-document-edit-outline',
    };
  }
  if (norm.includes('indonesia') || norm.includes('bahasa') || norm.includes('inggris') || norm.includes('arab') || norm.includes('literasi')) {
    return {
      bg: '#DCFCE7',
      color: '#16A34A',
      icon: 'book-open-page-variant-outline',
    };
  }
  if (norm.includes('pai') || norm.includes('agama') || norm.includes('islam') || norm.includes('fiqih') || norm.includes('aqidah') || norm.includes('quran') || norm.includes('hadits') || norm.includes('tahfizh')) {
    return {
      bg: '#F3E8FF',
      color: '#9333EA',
      icon: 'video-outline',
    };
  }
  if (norm.includes('ipa') || norm.includes('alam') || norm.includes('fisika') || norm.includes('biologi') || norm.includes('kimia') || norm.includes('sains')) {
    return {
      bg: '#FEF3C7',
      color: '#EA580C',
      icon: 'weather-sunny',
    };
  }
  if (norm.includes('ips') || norm.includes('sosial') || norm.includes('sejarah') || norm.includes('geografi') || norm.includes('ekonomi')) {
    return {
      bg: '#E0E7FF',
      color: '#4F46E5',
      icon: 'earth',
    };
  }
  if (norm.includes('seni') || norm.includes('sbk') || norm.includes('budaya') || norm.includes('musik')) {
    return {
      bg: '#FFE4E6',
      color: '#E11D48',
      icon: 'palette-outline',
    };
  }
  if (norm.includes('penjas') || norm.includes('olahraga') || norm.includes('pjok')) {
    return {
      bg: '#CCFBF1',
      color: '#0D9488',
      icon: 'soccer',
    };
  }
  if (Array.isArray(media) && media.length > 0) {
    const t = String(media[0]?.tipe_file || '').toLowerCase();
    if (t === 'video') return { bg: '#F3E8FF', color: '#9333EA', icon: 'video-outline' };
    if (t === 'pdf') return { bg: '#E0F2FE', color: '#2563EB', icon: 'file-document-outline' };
    if (t === 'audio') return { bg: '#F3E8FF', color: '#7C3AED', icon: 'headphones' };
  }
  return {
    bg: '#E6F4EA',
    color: '#059669',
    icon: 'book-open-variant',
  };
};

export default function MaterialScreen({ route, navigation }: any) {
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
  const [materials, setMaterials] = useState<MaterialItem[]>([]);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedSubjectId, setSelectedSubjectId] = useState<string>('all');
  const [selectedMaterial, setSelectedMaterial] = useState<MaterialItem | null>(null);
  const [activeAttachment, setActiveAttachment] = useState<any>(null);
  const [isPlayingAudio, setIsPlayingAudio] = useState<boolean>(false);

  // 1. Fetch children with offline cache (Isolasi data 1 anak terpilih jika ada child_id)
  const loadChildren = useCallback(async () => {
    if (!isParent) return;
    const targetChildId = route?.params?.child_id;
    const childCacheKey = offlineCache.buildKey('materials_children', user?.id);
    const cached = await offlineCache.get<Child[]>(childCacheKey);
    if (cached && cached.length > 0) {
      const filteredCached = targetChildId
        ? cached.filter((c) => String(c.id) === String(targetChildId))
        : cached;
      setChildren(filteredCached.length > 0 ? filteredCached : cached);
      setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || String(cached[0].id)));
    }

    try {
      const res = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<Child[]>(res) || [];
      if (list.length > 0) {
        const filteredList = targetChildId
          ? list.filter((c) => String(c.id) === String(targetChildId))
          : list;
        setChildren(filteredList.length > 0 ? filteredList : list);
        setSelectedChildId(targetChildId ? String(targetChildId) : ((prev: any) => prev || String(list[0].id)));
        void offlineCache.set(childCacheKey, list);
      }
    } catch {
      // safe fallback
    }
  }, [isParent, user?.id, route?.params?.child_id]);

  useEffect(() => {
    void loadChildren();
  }, [loadChildren]);

  // 2. Fetch materials with offline cache
  const loadMaterials = useCallback(async () => {
    const isDefaultQuery = !searchQuery.trim() && selectedSubjectId === 'all';
    const cacheKey = offlineCache.buildKey('materials', user?.id, selectedChildId || 'self');

    let cached: { list: MaterialItem[]; student: any } | null = null;
    if (isDefaultQuery) {
      cached = await offlineCache.get<{ list: MaterialItem[]; student: any }>(cacheKey);
      if (cached) {
        setMaterials(cached.list || []);
        if (cached.student) setStudentInfo(cached.student);
      }
    }

    try {
      const params: Record<string, any> = {
        child_id: selectedChildId,
        search: searchQuery.trim() || undefined,
        subject_id: selectedSubjectId === 'all' ? undefined : selectedSubjectId,
      };

      const res = await mobileApiService.getPortalMaterials(params);
      const data = unwrapApiData<any>(res) || {};
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
      setMaterials(list);
      const freshStudent = res?.student || data?.student || null;
      if (freshStudent) {
        setStudentInfo(freshStudent);
      }

      if (isDefaultQuery) {
        void offlineCache.set(cacheKey, { list, student: freshStudent });
      }
    } catch {
      if (!cached) {
        setMaterials([]);
      }
    }
  }, [selectedChildId, searchQuery, selectedSubjectId, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await loadMaterials();
    setLoading(false);
  }, [loadMaterials]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadMaterials();
    setRefreshing(false);
  };

  // Scroll handlers for auto-color swipe
  const handleStudentScrollEnd = (e: any) => {
    const offsetX = e.nativeEvent.contentOffset.x;
    const cardWidth = SCREEN_WIDTH - 50 + 12;
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
      x: index * (SCREEN_WIDTH - 50 + 12),
      animated: true,
    });
  };

  // Extract unique subjects for filtering (preserves list when filtered)
  const [allSubjectsMap, setAllSubjectsMap] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    if (materials.length > 0) {
      setAllSubjectsMap((prev) => {
        const next = new Map(prev);
        materials.forEach((m) => {
          const id = String(m.subject?.id || m.mata_pelajaran_id || '');
          const name = m.subject?.name || m.subject?.nama_mapel || '';
          if (id && name) next.set(id, name);
        });
        return next;
      });
    }
  }, [materials]);

  const subjectsList = useMemo(() => {
    return Array.from(allSubjectsMap.entries()).map(([id, name]) => ({ id, name }));
  }, [allSubjectsMap]);

  // Tampilkan berkas lampiran langsung di dalam aplikasi (In-App Modal Viewer)
  const handleOpenMedia = (mediaItem: any) => {
    if (!mediaItem) {
      Alert.alert('Informasi', 'Tautan berkas lampiran tidak tersedia.');
      return;
    }
    setActiveAttachment(mediaItem);
    setIsPlayingAudio(false);
  };

  const handleOpenExternal = async (url?: string) => {
    if (!url) {
      Alert.alert('Informasi', 'Tautan berkas tidak tersedia.');
      return;
    }
    try {
      const supported = await Linking.canOpenURL(url);
      if (supported) {
        await Linking.openURL(url);
      } else {
        Alert.alert('Gagal', 'Tautan tidak dapat dibuka di perangkat ini.');
      }
    } catch {
      Alert.alert('Gagal', 'Tidak dapat membuka tautan eksternal.');
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
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />
          }
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

          {/* 2. SEARCH BAR & FILTER SUBJECT CHIPS */}
          <View style={styles.searchFilterBlock}>
            <View style={styles.searchBar}>
              <MaterialCommunityIcons name="magnify" size={19} color="#94A3B8" />
              <TextInput
                placeholder="Cari materi pembelajaran..."
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
                style={styles.searchInput}
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={17} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            {/* HORIZONTAL FILTER CHIPS (MATCHING USER MOCKUP) */}
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.subjectChipsRow}
            >
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setSelectedSubjectId('all')}
                style={[
                  styles.subjectChip,
                  selectedSubjectId === 'all' && styles.subjectChipActive,
                ]}
              >
                <Text
                  style={[
                    styles.subjectChipText,
                    selectedSubjectId === 'all' && styles.subjectChipTextActive,
                  ]}
                >
                  Semua
                </Text>
              </TouchableOpacity>
              {subjectsList.map((sub) => {
                const isActive = selectedSubjectId === sub.id;
                return (
                  <TouchableOpacity
                    key={sub.id}
                    activeOpacity={0.8}
                    onPress={() => setSelectedSubjectId(sub.id)}
                    style={[
                      styles.subjectChip,
                      isActive && styles.subjectChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.subjectChipText,
                        isActive && styles.subjectChipTextActive,
                      ]}
                    >
                      {sub.name}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 3. DAFTAR MATERI PEMBELAJARAN (NEW CARD STYLE FROM USER MOCKUP) */}
          <View style={styles.containerBlock}>
            {loading && !refreshing ? (
              <View style={styles.loadingBox}>
                <ActivityIndicator size="large" color="#18A165" />
                <Text style={styles.loadingText}>Memuat materi pembelajaran...</Text>
              </View>
            ) : materials.length === 0 ? (
              <View style={styles.emptyCard}>
                <MaterialCommunityIcons name="book-open-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Belum Ada Materi</Text>
                <Text style={styles.emptyDesc}>
                  Materi pembelajaran untuk kelas dan kurikulum ini belum dipublikasikan oleh dewan guru.
                </Text>
              </View>
            ) : (
              <View style={styles.materialsListContainer}>
                {materials.map((item, idx) => {
                  const subjectName = item.subject?.name || item.subject?.nama_mapel || 'Pelajaran';
                  const subjectStyle = getSubjectStyle(subjectName, item.media);
                  const dateStr = formatDate(item.created_at || item.tanggal);
                  const metaStr = formatMetaText(item);

                  return (
                    <TouchableOpacity
                      key={item.id || idx}
                      activeOpacity={0.85}
                      onPress={() => setSelectedMaterial(item)}
                      style={styles.materialCard}
                    >
                      {/* Left Icon Squircle Box */}
                      <View style={[styles.cardIconBox, { backgroundColor: subjectStyle.bg }]}>
                        <MaterialCommunityIcons
                          name={subjectStyle.icon as any}
                          size={26}
                          color={subjectStyle.color}
                        />
                      </View>

                      {/* Middle & Right Content */}
                      <View style={styles.cardContentCol}>
                        <View style={styles.cardTopRow}>
                          <Text numberOfLines={1} style={[styles.cardSubjectText, { color: subjectStyle.color }]}>
                            {subjectName}
                          </Text>
                          <Text style={styles.cardDateText}>
                            {dateStr}
                          </Text>
                        </View>

                        <Text numberOfLines={1} style={styles.cardTitleText}>
                          {item.judul || item.title || 'Materi Pembelajaran'}
                        </Text>

                        <View style={styles.cardBottomRow}>
                          <Text numberOfLines={1} style={styles.cardMetaText}>
                            {metaStr}
                          </Text>
                          <MaterialCommunityIcons name="chevron-right" size={20} color="#3B82F6" />
                        </View>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}
          </View>
        </ScrollView>

      {/* DETAIL MATERI MODAL */}
      <Modal
        visible={!!selectedMaterial}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedMaterial(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(bottomInset, 36) + 16 }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={styles.subjectBadge}>
                  <Text style={styles.subjectBadgeText}>
                    {selectedMaterial?.subject?.name || selectedMaterial?.subject?.nama_mapel || 'Pelajaran'}
                  </Text>
                </View>
                <Text style={styles.modalTitle}>
                  {selectedMaterial?.judul || selectedMaterial?.title}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setSelectedMaterial(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              <View style={styles.modalTeacherBox}>
                <MaterialCommunityIcons name="account-tie-outline" size={20} color="#18A165" />
                <View style={{ marginLeft: 8 }}>
                  <Text style={styles.modalTeacherTitle}>
                    {selectedMaterial?.guru?.nama_lengkap || selectedMaterial?.teacher?.name || 'Dewan Guru'}
                  </Text>
                  <Text style={styles.modalTeacherSub}>
                    {selectedMaterial?.guru?.jabatan?.nama_jabatan || 'Guru Pengampu'}
                  </Text>
                </View>
              </View>

              <Text style={styles.modalSectionHeading}>Deskripsi / Isi Materi</Text>
              <Text style={styles.modalText}>
                {selectedMaterial?.konten || selectedMaterial?.isi || selectedMaterial?.deskripsi || 'Tidak ada konten deskripsi tertulis.'}
              </Text>

              {Array.isArray(selectedMaterial?.media) && selectedMaterial.media.length > 0 && (
                <View style={{ marginTop: 16 }}>
                  <Text style={styles.modalSectionHeading}>Lampiran Media & Berkas ({selectedMaterial.media.length})</Text>
                  <View style={{ gap: 8, marginTop: 8 }}>
                    {selectedMaterial.media.map((med: any, mIdx: number) => {
                      const isPdf = med.tipe_file === 'pdf';
                      const isVideo = med.tipe_file === 'video';
                      const iconName = isPdf ? 'file-pdf-box' : isVideo ? 'play-circle-outline' : 'headphones';
                      const iconColor = isPdf ? '#EF4444' : isVideo ? '#EA580C' : '#9333EA';

                      return (
                        <TouchableOpacity
                          key={med.id || mIdx}
                          activeOpacity={0.8}
                          onPress={() => handleOpenMedia(med)}
                          style={styles.attachmentItem}
                        >
                          <MaterialCommunityIcons name={iconName} size={24} color={iconColor} />
                          <View style={{ flex: 1, marginLeft: 10 }}>
                            <Text numberOfLines={1} style={styles.attachmentName}>
                              {med.nama_file || 'Lampiran Berkas'}
                            </Text>
                            <Text style={styles.attachmentDesc}>
                              {med.deskripsi || (isPdf ? 'Dokumen PDF' : isVideo ? 'Video Pembelajaran' : 'Audio Podcast')}
                            </Text>
                          </View>
                          <View style={styles.openInAppBadge}>
                            <MaterialCommunityIcons name="eye-outline" size={14} color="#18A165" />
                            <Text style={styles.openInAppText}>Lihat</Text>
                          </View>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setSelectedMaterial(null)}
              style={[styles.modalDismissBtn, { marginBottom: Platform.OS === 'android' ? 10 : 4 }]}
            >
              <Text style={styles.modalDismissBtnText}>Tutup Materi</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* IN-APP ATTACHMENT VIEWER MODAL */}
      <Modal
        visible={!!activeAttachment}
        animationType="slide"
        transparent
        onRequestClose={() => setActiveAttachment(null)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: Math.max(bottomInset, 36) + 16, maxHeight: '90%' }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <View style={[styles.subjectBadge, {
                  backgroundColor: activeAttachment?.tipe_file === 'pdf' ? '#FEE2E2' : activeAttachment?.tipe_file === 'video' ? '#FFEDD5' : '#F3E8FF',
                  borderColor: activeAttachment?.tipe_file === 'pdf' ? '#FECACA' : activeAttachment?.tipe_file === 'video' ? '#FED7AA' : '#E9D5FF'
                }]}>
                  <Text style={[styles.subjectBadgeText, {
                    color: activeAttachment?.tipe_file === 'pdf' ? '#DC2626' : activeAttachment?.tipe_file === 'video' ? '#EA580C' : '#9333EA'
                  }]}>
                    {activeAttachment?.tipe_file === 'pdf' ? 'DOKUMEN PDF LENGKAP' : activeAttachment?.tipe_file === 'video' ? 'VIDEO PEMBELAJARAN' : 'AUDIO KAJIAN & PODCAST'}
                  </Text>
                </View>
                <Text numberOfLines={2} style={styles.modalTitle}>
                  {activeAttachment?.nama_file || 'Lampiran Berkas'}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setActiveAttachment(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {/* JIKA BERKAS PDF */}
              {activeAttachment?.tipe_file === 'pdf' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.pdfHeroBox}>
                    <View style={styles.pdfIconCircle}>
                      <MaterialCommunityIcons name="file-pdf-box" size={42} color="#DC2626" />
                    </View>
                    <Text style={styles.pdfHeroTitle}>{activeAttachment?.nama_file || 'Dokumen Panduan PDF'}</Text>
                    <Text style={styles.pdfHeroSize}>
                      {activeAttachment?.ukuran_bytes ? `Ukuran Berkas: ${(activeAttachment.ukuran_bytes / (1024 * 1024)).toFixed(2)} MB` : 'Format Dokumen Terverifikasi SIT'}
                    </Text>
                  </View>

                  <View style={styles.inAppPreviewCard}>
                    <View style={styles.inAppPreviewHeader}>
                      <MaterialCommunityIcons name="text-box-search-outline" size={18} color="#18A165" />
                      <Text style={styles.inAppPreviewHeading}>Ringkasan Dokumen & Panduan:</Text>
                    </View>
                    <Text style={styles.inAppPreviewText}>
                      {activeAttachment?.deskripsi || 'Dokumen panduan materi lengkap beserta latihan soal terpadu untuk pembelajaran mandiri santri.'}
                    </Text>
                    <View style={styles.inAppGuideBox}>
                      <MaterialCommunityIcons name="check-decagram" size={16} color="#059669" />
                      <Text style={styles.inAppGuideText}>
                        Modul ini telah divalidasi oleh dewan guru dan siap dipelajari santri serta dipantau wali murid.
                      </Text>
                    </View>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={styles.openExternalBtn}
                    >
                      <MaterialCommunityIcons name="file-download-outline" size={18} color="#DC2626" />
                      <Text style={styles.openExternalBtnText}>Buka Dokumen Lengkap di Perangkat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* JIKA BERKAS VIDEO */}
              {activeAttachment?.tipe_file === 'video' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.videoPlayerCard}>
                    <LinearGradient colors={['#1E293B', '#0F172A']} style={styles.videoPlaceholder}>
                      <View style={styles.videoPlayCircle}>
                        <MaterialCommunityIcons name="play" size={32} color="#FFFFFF" />
                      </View>
                      <Text style={styles.videoDurationBadge}>
                        {activeAttachment?.durasi_detik ? `${Math.floor(activeAttachment.durasi_detik / 60)}:${String(activeAttachment.durasi_detik % 60).padStart(2, '0')}` : '10:20 Menit'}
                      </Text>
                    </LinearGradient>
                  </View>

                  <View style={styles.inAppPreviewCard}>
                    <View style={styles.inAppPreviewHeader}>
                      <MaterialCommunityIcons name="movie-open-outline" size={18} color="#EA580C" />
                      <Text style={[styles.inAppPreviewHeading, { color: '#C2410C' }]}>Sinopsis & Pembahasan Video:</Text>
                    </View>
                    <Text style={styles.inAppPreviewText}>
                      {activeAttachment?.deskripsi || 'Video tutorial penjelasan bab 1 oleh tim pengajar SIT.'}
                    </Text>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={[styles.openExternalBtn, { borderColor: '#FED7AA', backgroundColor: '#FFF7ED' }]}
                    >
                      <MaterialCommunityIcons name="youtube" size={20} color="#EA580C" />
                      <Text style={[styles.openExternalBtnText, { color: '#C2410C' }]}>Tonton Video Pembelajaran</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}

              {/* JIKA BERKAS AUDIO / PODCAST */}
              {activeAttachment?.tipe_file === 'audio' && (
                <View style={styles.inAppViewerContainer}>
                  <View style={styles.audioPlayerCard}>
                    <LinearGradient colors={['#7E22CE', '#581C87']} style={styles.audioArtwork}>
                      <MaterialCommunityIcons name="waveform" size={48} color="#E9D5FF" />
                    </LinearGradient>

                    <Text style={styles.audioTrackTitle}>{activeAttachment?.nama_file || 'Audio Podcast Kajian'}</Text>
                    <Text style={styles.audioTrackSub}>
                      {activeAttachment?.deskripsi || 'Rangkuman materi audio singkat'}
                    </Text>

                    <View style={styles.audioProgressBarWrap}>
                      <View style={[styles.audioProgressBarFill, { width: isPlayingAudio ? '45%' : '0%' }]} />
                    </View>
                    <View style={styles.audioTimeRow}>
                      <Text style={styles.audioTimeText}>{isPlayingAudio ? '02:45' : '00:00'}</Text>
                      <Text style={styles.audioTimeText}>
                        {activeAttachment?.durasi_detik ? `${Math.floor(activeAttachment.durasi_detik / 60)}:${String(activeAttachment.durasi_detik % 60).padStart(2, '0')}` : '06:12'}
                      </Text>
                    </View>

                    <View style={styles.audioControlsRow}>
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setIsPlayingAudio(!isPlayingAudio)}
                        style={styles.audioPlayBtn}
                      >
                        <MaterialCommunityIcons name={isPlayingAudio ? 'pause' : 'play'} size={28} color="#FFFFFF" />
                      </TouchableOpacity>
                    </View>
                  </View>

                  {(activeAttachment?.url_eksternal || activeAttachment?.path_file) && (
                    <TouchableOpacity
                      activeOpacity={0.88}
                      onPress={() => handleOpenExternal(activeAttachment?.url_eksternal || activeAttachment?.path_file)}
                      style={[styles.openExternalBtn, { borderColor: '#E9D5FF', backgroundColor: '#FAF5FF', marginTop: 14 }]}
                    >
                      <MaterialCommunityIcons name="headphones" size={18} color="#9333EA" />
                      <Text style={[styles.openExternalBtnText, { color: '#7E22CE' }]}>Buka File Audio di Perangkat</Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.9}
              onPress={() => setActiveAttachment(null)}
              style={[styles.modalDismissBtn, { marginBottom: Platform.OS === 'android' ? 10 : 4 }]}
            >
              <Text style={styles.modalDismissBtnText}>Kembali ke Materi</Text>
            </TouchableOpacity>
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
  centerBox: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 20 },
  loadingBox: {
    paddingVertical: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: { marginTop: 12, fontSize: 13, color: '#64748B', fontWeight: '600' },

  studentContainerBlock: {
    marginBottom: 8,
  },
  containerBlock: { marginBottom: 16 },
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

  searchFilterBlock: {
    marginBottom: 14,
    gap: 10,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    height: 42,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowRadius: 4,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    marginLeft: 8,
    fontSize: 12.5,
    color: '#0F172A',
  },
  subjectChipsRow: {
    gap: 8,
    paddingRight: 10,
    alignItems: 'center',
  },
  subjectChip: {
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 20,
    backgroundColor: '#E8EFF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  subjectChipActive: {
    backgroundColor: '#0D6B42',
  },
  subjectChipText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#475569',
  },
  subjectChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },

  materialsListContainer: {
    gap: 10,
  },
  materialCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#EDF2F7',
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardIconBox: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardContentCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 2,
  },
  cardSubjectText: {
    fontSize: 13,
    fontWeight: '700',
    flex: 1,
    marginRight: 8,
  },
  cardDateText: {
    fontSize: 11.5,
    fontWeight: '500',
    color: '#64748B',
  },
  cardTitleText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 3,
  },
  cardBottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardMetaText: {
    fontSize: 12,
    fontWeight: '500',
    color: '#64748B',
    flex: 1,
    marginRight: 8,
  },
  materialCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  subjectBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    alignSelf: 'flex-start',
  },
  subjectBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#2563EB',
  },
  materialDateText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  materialTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 18,
  },
  materialSnippet: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 4,
  },
  materialFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  teacherInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  teacherNameText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  mediaPillsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  mediaPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 3,
    borderRadius: 6,
  },
  mediaPillText: {
    fontSize: 9.5,
    fontWeight: '800',
  },

  openInAppBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  openInAppText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#059669',
  },

  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 30,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },

  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    padding: 18,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 6,
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
    paddingVertical: 14,
  },
  modalTeacherBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    padding: 10,
    borderRadius: 12,
    marginBottom: 14,
  },
  modalTeacherTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#064E3B',
  },
  modalTeacherSub: {
    fontSize: 10,
    color: '#047857',
  },
  modalSectionHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 6,
  },
  modalText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  attachmentName: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  attachmentDesc: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  modalDismissBtn: {
    backgroundColor: '#18A165',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    marginTop: 10,
  },
  modalDismissBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  inAppViewerContainer: {
    paddingVertical: 6,
  },
  pdfHeroBox: {
    alignItems: 'center',
    backgroundColor: '#FEF2F2',
    borderRadius: 16,
    padding: 18,
    borderWidth: 1.5,
    borderColor: '#FEE2E2',
    marginBottom: 14,
  },
  pdfIconCircle: {
    width: 68,
    height: 68,
    borderRadius: 34,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
    shadowColor: '#DC2626',
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 2,
  },
  pdfHeroTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  pdfHeroSize: {
    fontSize: 11,
    color: '#DC2626',
    fontWeight: '700',
    marginTop: 4,
  },
  inAppPreviewCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  inAppPreviewHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  inAppPreviewHeading: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  inAppPreviewText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  inAppGuideBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  inAppGuideText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
    flex: 1,
  },
  openExternalBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    paddingVertical: 11,
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  openExternalBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#DC2626',
  },

  videoPlayerCard: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  videoPlaceholder: {
    height: 160,
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoPlayCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
  },
  videoDurationBadge: {
    position: 'absolute',
    bottom: 10,
    right: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    color: '#FFFFFF',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },

  audioPlayerCard: {
    backgroundColor: '#FAF5FF',
    borderRadius: 18,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E9D5FF',
    marginBottom: 6,
  },
  audioArtwork: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  audioTrackTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textAlign: 'center',
  },
  audioTrackSub: {
    fontSize: 11,
    color: '#7E22CE',
    fontWeight: '600',
    textAlign: 'center',
    marginTop: 2,
    marginBottom: 14,
  },
  audioProgressBarWrap: {
    width: '100%',
    height: 6,
    borderRadius: 3,
    backgroundColor: '#E9D5FF',
    overflow: 'hidden',
  },
  audioProgressBarFill: {
    height: '100%',
    backgroundColor: '#9333EA',
    borderRadius: 3,
  },
  audioTimeRow: {
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
    marginBottom: 10,
  },
  audioTimeText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
  },
  audioControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  audioPlayBtn: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#9333EA',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
