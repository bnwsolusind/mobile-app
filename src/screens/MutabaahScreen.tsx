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
import { getApiErrorMessage } from '../services/api';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: string }> = {
  good: { label: 'Baik / Rutin', color: '#059669', bg: '#D1FAE5', icon: 'check-circle-outline' },
  less: { label: 'Kurang', color: '#D97706', bg: '#FEF3C7', icon: 'alert-circle-outline' },
  not_done: { label: 'Belum', color: '#E11D48', bg: '#FFE4E6', icon: 'close-circle-outline' },
  na: { label: 'Uzur / NA', color: '#64748B', bg: '#F1F5F9', icon: 'minus-circle-outline' },
};

const formatDateIndo = (dateStr: string) => {
  try {
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return dateStr;
    return new Intl.DateTimeFormat('id-ID', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d);
  } catch {
    return dateStr;
  }
};

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function MutabaahScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [mainTab, setMainTab] = useState<'today' | 'history'>('today');
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const studentScrollRef = useRef<ScrollView>(null);

  // Date selection
  const [selectedDate, setSelectedDate] = useState<string>(getLocalDateString());
  const [dateMode, setDateMode] = useState<'today' | 'yesterday'>('today');

  // Overview Data
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [overview, setOverview] = useState<any>(null);
  const [historyRows, setHistoryRows] = useState<any[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [error, setError] = useState('');

  // Category filter
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Parent Home Worship Input Modal
  const [isWorshipModalVisible, setIsWorshipModalVisible] = useState(false);
  const [worshipContext, setWorshipContext] = useState<any>(null);
  const [worshipValues, setWorshipValues] = useState<Record<string, string>>({});
  const [worshipNotes, setWorshipNotes] = useState<Record<string, string>>({});
  const [worshipSubmitting, setWorshipSubmitting] = useState(false);
  const [worshipLoading, setWorshipLoading] = useState(false);

  // Parent Signature Modal
  const [isSignModalVisible, setIsSignModalVisible] = useState(false);
  const [signStatus, setSignStatus] = useState<'approved' | 'clarification_requested' | 'unable_to_verify'>('approved');
  const [signComment, setSignComment] = useState('');
  const [signSubmitting, setSignSubmitting] = useState(false);

  // 1. Load Children if Parent with offline cache (Isolasi data 1 anak terpilih jika ada child_id)
  useEffect(() => {
    if (!isParent) return;
    const targetChildId = route?.params?.child_id;
    const childCacheKey = offlineCache.buildKey('mutabaah_children', user?.id);
    void (async () => {
      const cached = await offlineCache.get<any[]>(childCacheKey);
      if (cached && cached.length > 0) {
        const filteredCached = targetChildId
          ? cached.filter((c) => String(c.id) === String(targetChildId))
          : cached;
        setChildren(filteredCached.length > 0 ? filteredCached : cached);
        if (!selectedChildId) {
          setSelectedChildId(targetChildId ? String(targetChildId) : String(cached[0].id));
        }
      }
    })();

    mobileApiService.getPortalChildren()
      .then((res) => {
        const list = unwrapApiData<any[]>(res) || [];
        if (Array.isArray(list) && list.length > 0) {
          const filteredList = targetChildId
            ? list.filter((c) => String(c.id) === String(targetChildId))
            : list;
          setChildren(filteredList.length > 0 ? filteredList : list);
          if (targetChildId) {
            setSelectedChildId(String(targetChildId));
          } else if (!selectedChildId) {
            setSelectedChildId(String(list[0].id));
          }
          void offlineCache.set(childCacheKey, list);
        }
      })
      .catch(() => {});
  }, [isParent, user?.id, route?.params?.child_id]);

  // Handle selectedChildId sync with route
  useEffect(() => {
    if (route?.params?.child_id) {
      setSelectedChildId(String(route.params.child_id));
    }
  }, [route?.params?.child_id]);

  // Scroll sync for children carousel
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

  // 2. Load Mutabaah Overview with offline cache
  const loadMutabaah = useCallback(async () => {
    setError('');
    const targetChildId = selectedChildId || (children.length > 0 ? String(children[0].id) : 'self');
    const cacheKey = offlineCache.buildKey('mutabaah_overview', user?.id, `${targetChildId}_${selectedDate}`);

    // Baca cache dulu
    const cached = await offlineCache.get<any>(cacheKey);
    if (cached) {
      setOverview(cached);
    }

    try {
      if (isParent) {
        let childId = selectedChildId;
        if (!childId && children.length > 0) {
          childId = String(children[0].id);
        }
        if (!childId) {
          const res = await mobileApiService.getPortalChildren();
          const list = unwrapApiData<any[]>(res) || [];
          if (list.length > 0) {
            childId = String(list[0].id);
            setChildren(list);
            setSelectedChildId(childId);
          }
        }
        if (!childId) {
          setLoading(false);
          setRefreshing(false);
          return;
        }

        const res = await mobileApiService.getParentMutabaahOverview(childId, selectedDate);
        const payload = unwrapApiData<any>(res);
        setOverview(payload);
        void offlineCache.set(cacheKey, payload);
      } else {
        // Student view
        const res = await mobileApiService.getPortalMutabaah(undefined, selectedDate);
        const payload = unwrapApiData<any>(res);
        const dataToSet = payload?.overview || payload;
        setOverview(dataToSet);
        void offlineCache.set(cacheKey, dataToSet);
      }
    } catch (e: any) {
      if (!cached) {
        setError(getApiErrorMessage(e, 'Data Mutaba’ah belum dapat dimuat dari server.'));
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [isParent, selectedChildId, selectedDate, children, user?.id]);

  useEffect(() => {
    setLoading(true);
    void loadMutabaah();
  }, [loadMutabaah]);

  // 3. Load History with offline cache
  const loadHistory = useCallback(async () => {
    if (!isParent || !selectedChildId) return;
    const histKey = offlineCache.buildKey('mutabaah_history', user?.id, selectedChildId);

    const cachedHist = await offlineCache.get<any[]>(histKey);
    if (cachedHist && cachedHist.length > 0) {
      setHistoryRows(cachedHist);
    } else {
      setHistoryLoading(true);
    }

    try {
      const res = await mobileApiService.getParentMutabaahHistory(selectedChildId);
      const payload = unwrapApiData<any>(res);
      const rows = payload?.rows?.data || payload?.rows || [];
      const list = Array.isArray(rows) ? rows : [];
      setHistoryRows(list);
      void offlineCache.set(histKey, list);
    } catch {
      if (!cachedHist) {
        setHistoryRows([]);
      }
    } finally {
      setHistoryLoading(false);
    }
  }, [isParent, selectedChildId, user?.id]);

  useEffect(() => {
    if (mainTab === 'history') {
      void loadHistory();
    }
  }, [mainTab, loadHistory]);

  // 4. Load Worship Input Context for Home Modal
  const openWorshipModal = async () => {
    if (!selectedChildId) return;
    setIsWorshipModalVisible(true);
    setWorshipLoading(true);
    try {
      const res = await mobileApiService.getParentWorshipInputContext(selectedChildId, selectedDate);
      const data = unwrapApiData<any>(res);
      setWorshipContext(data);

      const initialVals: Record<string, string> = {};
      const initialNotes: Record<string, string> = {};
      if (data?.items && Array.isArray(data.items)) {
        data.items.forEach((item: any) => {
          if (item.status_value) initialVals[item.agenda_item_id] = item.status_value;
          if (item.notes) initialNotes[item.agenda_item_id] = item.notes;
        });
      }
      setWorshipValues(initialVals);
      setWorshipNotes(initialNotes);
    } catch (e: any) {
      Alert.alert('Gagal Memuat Form', getApiErrorMessage(e, 'Agenda rumah belum dapat dibuka.'));
      setIsWorshipModalVisible(false);
    } finally {
      setWorshipLoading(false);
    }
  };

  // 5. Submit Worship Input
  const handleSaveWorship = async () => {
    if (!selectedChildId) return;
    const items = Object.entries(worshipValues).map(([agenda_item_id, status_value]) => ({
      agenda_item_id,
      status_value,
      notes: worshipNotes[agenda_item_id] || null,
    }));

    if (items.length === 0) {
      Alert.alert('Peringatan', 'Silakan pilih minimal satu aktivitas ibadah rumah.');
      return;
    }

    setWorshipSubmitting(true);
    try {
      await mobileApiService.submitParentWorshipInput(selectedChildId, {
        date: selectedDate,
        items,
      });
      Alert.alert('Berhasil', 'Mutaba’ah ibadah di rumah berhasil disimpan.');
      setIsWorshipModalVisible(false);
      void loadMutabaah();
    } catch (e: any) {
      Alert.alert('Gagal Menyimpan', getApiErrorMessage(e, 'Mutaba’ah rumah tidak dapat disimpan.'));
    } finally {
      setWorshipSubmitting(false);
    }
  };

  // 6. Submit Parent Signature / Paraf
  const handleSaveSignature = async () => {
    const dailyHeaderId = overview?.today?.id;
    if (!dailyHeaderId) {
      Alert.alert('Perhatian', 'Data Mutaba’ah belum memiliki header untuk diparaf.');
      return;
    }

    setSignSubmitting(true);
    try {
      await mobileApiService.submitParentMutabaahSignature(dailyHeaderId, {
        signature_status: signStatus,
        comment: signComment.trim() || undefined,
      });
      Alert.alert('Paraf Tersimpan', 'Paraf & catatan orang tua berhasil dicatat oleh sistem.');
      setIsSignModalVisible(false);
      setSignComment('');
      void loadMutabaah();
    } catch (e: any) {
      Alert.alert('Gagal Memaraf', getApiErrorMessage(e, 'Paraf Mutaba’ah belum dapat disimpan.'));
    } finally {
      setSignSubmitting(false);
    }
  };

  // Filter Categories
  const details = useMemo(() => {
    return overview?.today?.details || [];
  }, [overview]);

  const categories = useMemo(() => {
    const set = new Set<string>();
    details.forEach((d: any) => {
      if (d.category) set.add(d.category);
    });
    return ['all', ...Array.from(set)];
  }, [details]);

  const filteredDetails = useMemo(() => {
    if (selectedCategory === 'all') return details;
    return details.filter((d: any) => d.category === selectedCategory);
  }, [details, selectedCategory]);

  // Program & Care Location
  const programType = overview?.program || 'fullday';
  const careLocation = overview?.care_location || (programType === 'boarding' ? 'boarding' : 'home');

  // Change date handler
  const selectDatePreset = (mode: 'today' | 'yesterday') => {
    setDateMode(mode);
    const d = new Date();
    if (mode === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    setSelectedDate(getLocalDateString(d));
  };

  const studentData = overview?.student;

  return (
    <View style={styles.rootContainer}>
      <View style={styles.sheetContainer}>
        <LinearGradient
          colors={['#FFFFFF', '#F4FBF8', '#ECFDF5']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFill}
        />

        <ScrollView
          style={styles.screen}
          contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 40 }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => {
                setRefreshing(true);
                void loadMutabaah();
              }}
              colors={['#18A165']}
            />
          }
        >
          {/* ============================================================ */}
          {/* SECTION 1: DATA SISWA & UNIT PENDIDIKAN (HERO CARD STANDAR) */}
          {/* ============================================================ */}
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
                  const unitTitle = child.education_unit?.name || child.unit_name || child.unit || 'Unit Sekolah';
                  const className = child.kelas?.name || child.kelas?.nama_kelas || child.class_name || child.classroom?.name || 'Kelas Belum Ditentukan';
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
                        colors={['#047857', '#059669', '#10B981']}
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

              {/* DOT INDIKATOR SCROLL SISWA */}
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
          ) : studentData ? (
            <View style={[styles.containerBlock, styles.studentContainerBlock]}>
              <View style={styles.sectionHeaderRow}>
                <View style={styles.sectionHeaderTitleWrap}>
                  <MaterialCommunityIcons name="account-school" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Data Ananda</Text>
                </View>
              </View>
              {/* Single Hero Card */}
              <LinearGradient
                colors={['#047857', '#059669', '#10B981']}
                locations={[0, 0.55, 1]}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.childCardHeroSizeSingle}
              >
                <View style={styles.cardDecorCircle} />
                <View style={styles.childHeroTopRow}>
                  <View style={styles.avatarBorderWrapHero}>
                    {getProfileImageUrl(studentData) ? (
                      <Image
                        source={{ uri: getProfileImageUrl(studentData) || undefined }}
                        style={styles.childAvatarImgHero}
                        resizeMode="cover"
                      />
                    ) : (
                      <Image
                        source={
                          studentData?.gender === 'female' ||
                          studentData?.jenis_kelamin === 'P' ||
                          studentData?.jenis_kelamin === 'female' ||
                          studentData?.gender === 'P'
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
                        {studentData.name || 'Siswa Aktif'}
                      </Text>
                    </View>
                    <Text style={styles.studentNisText}>
                      NIS: {studentData.nis || '-'} {studentData.nisn ? `· NISN: ${studentData.nisn}` : ''}
                    </Text>
                    <View style={styles.studentUnitBadge}>
                      <MaterialCommunityIcons name="school" size={11} color="#FFFFFF" style={{ marginRight: 4 }} />
                      <Text numberOfLines={1} style={styles.studentUnitText}>
                        {studentData.unit || 'Unit Sekolah'}
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
                      {studentData.class_name || '—'}
                    </Text>
                  </View>
                  <View style={styles.studentAttrDivider} />
                  <View style={styles.studentAttrBox}>
                    <View style={styles.studentAttrLabelRow}>
                      <MaterialCommunityIcons name="domain" size={13} color="#A7F3D0" style={{ marginRight: 3 }} />
                      <Text style={styles.studentAttrLabel}>Jenjang</Text>
                    </View>
                    <Text numberOfLines={1} style={styles.studentAttrValue}>
                      {studentData.unit || 'Terpadu'}
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
          ) : null}

          {/* ============================================================ */}
          {/* SECTION 2: KONTROL TANGGAL & MODE MUTABAAH */}
          {/* ============================================================ */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="calendar-clock-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Tanggal & Mode Mutaba’ah</Text>
            </View>

            <View style={styles.dateControlCard}>
              {/* Tab Mode: Hari Ini vs Riwayat */}
              <View style={styles.tabToggleRow}>
                <TouchableOpacity
                  style={[styles.tabToggleBtn, mainTab === 'today' && styles.tabToggleBtnActive]}
                  onPress={() => setMainTab('today')}
                >
                  <MaterialCommunityIcons
                    name="calendar-check-outline"
                    size={16}
                    color={mainTab === 'today' ? '#FFFFFF' : '#64748B'}
                  />
                  <Text style={[styles.tabToggleText, mainTab === 'today' && styles.tabToggleTextActive]}>
                    Amalan Hari Ini
                  </Text>
                </TouchableOpacity>

                {isParent && (
                  <TouchableOpacity
                    style={[styles.tabToggleBtn, mainTab === 'history' && styles.tabToggleBtnActive]}
                    onPress={() => setMainTab('history')}
                  >
                    <MaterialCommunityIcons
                      name="history"
                      size={16}
                      color={mainTab === 'history' ? '#FFFFFF' : '#64748B'}
                    />
                    <Text style={[styles.tabToggleText, mainTab === 'history' && styles.tabToggleTextActive]}>
                      Riwayat & Paraf
                    </Text>
                  </TouchableOpacity>
                )}
              </View>

              {/* Date Presets Strip (Hanya di mode Hari Ini) */}
              {mainTab === 'today' && (
                <View style={styles.datePresetRow}>
                  <TouchableOpacity
                    style={[styles.dateChip, dateMode === 'today' && styles.dateChipActive]}
                    onPress={() => selectDatePreset('today')}
                  >
                    <Text style={[styles.dateChipText, dateMode === 'today' && styles.dateChipTextActive]}>
                      Hari Ini
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[styles.dateChip, dateMode === 'yesterday' && styles.dateChipActive]}
                    onPress={() => selectDatePreset('yesterday')}
                  >
                    <Text style={[styles.dateChipText, dateMode === 'yesterday' && styles.dateChipTextActive]}>
                      Kemarin
                    </Text>
                  </TouchableOpacity>

                  <View style={styles.dateDisplayBadge}>
                    <MaterialCommunityIcons name="calendar-month-outline" size={14} color="#18A165" />
                    <Text style={styles.dateDisplayText}>{formatDateIndo(selectedDate)}</Text>
                  </View>
                </View>
              )}
            </View>
          </View>

          {/* Loading Indicator */}
          {loading ? (
            <View style={styles.centerLoading}>
              <ActivityIndicator size="large" color="#18A165" />
              <Text style={styles.loadingText}>Memuat lembar Mutaba’ah...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#E11D48" />
              <Text style={styles.errorTitle}>Gagal Memuat Data</Text>
              <Text style={styles.errorDesc}>{error}</Text>
              <TouchableOpacity style={styles.errorRetryBtn} onPress={loadMutabaah}>
                <Text style={styles.errorRetryText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          ) : mainTab === 'history' ? (
            /* ============================================================ */
            /* MODE RIWAYAT MUTABAAH */
            /* ============================================================ */
            <View style={styles.containerBlock}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="format-list-bulleted" size={18} color="#18A165" />
                <Text style={styles.sectionTitle}>Riwayat Evaluasi (30 Hari Terakhir)</Text>
              </View>

              {historyLoading ? (
                <ActivityIndicator color="#18A165" style={{ marginVertical: 32 }} />
              ) : historyRows.length === 0 ? (
                <View style={styles.emptyCard}>
                  <MaterialCommunityIcons name="clipboard-text-off-outline" size={44} color="#94A3B8" />
                  <Text style={styles.emptyTitle}>Belum Ada Riwayat</Text>
                  <Text style={styles.emptyDesc}>
                    Riwayat checklist dan hasil evaluasi harian ananda akan tercatat rapi di sini.
                  </Text>
                </View>
              ) : (
                historyRows.map((row: any) => {
                  const score = row.score != null ? Math.round(Number(row.score)) : null;
                  const isSigned = row.signed_at != null;
                  return (
                    <View key={row.id} style={styles.historyCard}>
                      <View style={styles.historyTop}>
                        <View>
                          <Text style={styles.historyDate}>{formatDateIndo(row.activity_date)}</Text>
                          <Text style={styles.historySub}>
                            Status: <Text style={{ fontWeight: '800', color: '#0F172A' }}>{row.status || 'Draft'}</Text>
                          </Text>
                        </View>
                        <View style={styles.historyScoreBox}>
                          <Text style={styles.historyScoreVal}>{score != null ? `${score}%` : '-'}</Text>
                          <Text style={styles.historyScoreLabel}>Skor</Text>
                        </View>
                      </View>

                      <View style={styles.historyStatsRow}>
                        <View style={[styles.historyStatPill, { backgroundColor: '#D1FAE5' }]}>
                          <Text style={[styles.historyStatText, { color: '#059669' }]}>
                            {row.good_count || 0} Baik
                          </Text>
                        </View>
                        <View style={[styles.historyStatPill, { backgroundColor: '#FEF3C7' }]}>
                          <Text style={[styles.historyStatText, { color: '#D97706' }]}>
                            {row.less_count || 0} Kurang
                          </Text>
                        </View>
                        <View style={[styles.historyStatPill, { backgroundColor: '#FFE4E6' }]}>
                          <Text style={[styles.historyStatText, { color: '#E11D48' }]}>
                            {row.not_done_count || 0} Belum
                          </Text>
                        </View>
                        <View style={[styles.historyStatPill, { backgroundColor: '#F1F5F9' }]}>
                          <Text style={[styles.historyStatText, { color: '#64748B' }]}>
                            {row.na_count || 0} Uzur
                          </Text>
                        </View>
                      </View>

                      <View style={styles.historyFooter}>
                        <View style={styles.historySignStatus}>
                          <MaterialCommunityIcons
                            name={isSigned ? 'draw' : 'draw-pen'}
                            size={16}
                            color={isSigned ? '#059669' : '#94A3B8'}
                          />
                          <Text style={[styles.historySignText, isSigned && { color: '#059669', fontWeight: '800' }]}>
                            {isSigned
                              ? `Diparaf (${row.signature_status === 'approved' ? 'Setuju' : 'Klarifikasi'})`
                              : 'Belum diparaf'}
                          </Text>
                        </View>
                        <TouchableOpacity
                          style={styles.historyDetailBtn}
                          onPress={() => {
                            setSelectedDate(row.activity_date);
                            setMainTab('today');
                          }}
                        >
                          <Text style={styles.historyDetailBtnText}>Buka Lembar</Text>
                          <MaterialCommunityIcons name="chevron-right" size={16} color="#18A165" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  );
                })
              )}
            </View>
          ) : (
            /* ============================================================ */
            /* MODE HARI INI */
            /* ============================================================ */
            <>
              {/* SECTION 3: RINGKASAN & SKOR MUTABAAH */}
              <View style={styles.containerBlock}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="chart-box-outline" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Capaian & Evaluasi Ibadah</Text>
                </View>

                <View style={styles.evaluationCard}>
                  {/* Header Program & Lokasi */}
                  <View style={styles.evalTopBar}>
                    <View style={styles.evalBadgeRow}>
                      <View style={[styles.programPill, { backgroundColor: programType === 'boarding' ? '#EDE9FE' : '#D1FAE5' }]}>
                        <MaterialCommunityIcons
                          name={programType === 'boarding' ? 'home-city-outline' : 'school-outline'}
                          size={13}
                          color={programType === 'boarding' ? '#7C3AED' : '#059669'}
                        />
                        <Text style={[styles.programPillText, { color: programType === 'boarding' ? '#7C3AED' : '#059669' }]}>
                          Program {programType === 'boarding' ? 'Boarding' : 'Fullday'}
                        </Text>
                      </View>

                      <View style={styles.locationPill}>
                        <MaterialCommunityIcons name="map-marker-outline" size={13} color="#64748B" />
                        <Text style={styles.locationPillText}>
                          Lokasi: {careLocation === 'home' ? 'Di Rumah' : careLocation === 'school' ? 'Di Sekolah' : 'Di Asrama'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Skor & Metrik Utama */}
                  <View style={styles.kpiMainGrid}>
                    <View style={styles.scoreHeroBox}>
                      <Text style={styles.scoreHeroVal}>
                        {overview?.today?.score != null ? `${Math.round(Number(overview.today.score))}%` : '-'}
                      </Text>
                      <Text style={styles.scoreHeroLabel}>Skor Harian</Text>
                    </View>

                    <View style={styles.kpiCountersWrap}>
                      <View style={styles.kpiCounterRow}>
                        <View style={[styles.kpiCounterItem, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                          <Text style={[styles.kpiCounterVal, { color: '#059669' }]}>
                            {overview?.today?.good_count ?? '-'}
                          </Text>
                          <Text style={styles.kpiCounterLabel}>Baik</Text>
                        </View>
                        <View style={[styles.kpiCounterItem, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                          <Text style={[styles.kpiCounterVal, { color: '#D97706' }]}>
                            {overview?.today?.less_count ?? '-'}
                          </Text>
                          <Text style={styles.kpiCounterLabel}>Kurang</Text>
                        </View>
                      </View>
                      <View style={[styles.kpiCounterRow, { marginTop: 6 }]}>
                        <View style={[styles.kpiCounterItem, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
                          <Text style={[styles.kpiCounterVal, { color: '#E11D48' }]}>
                            {overview?.today?.not_done_count ?? '-'}
                          </Text>
                          <Text style={styles.kpiCounterLabel}>Belum</Text>
                        </View>
                        <View style={[styles.kpiCounterItem, { backgroundColor: '#F8FAFC', borderColor: '#E2E8F0' }]}>
                          <Text style={[styles.kpiCounterVal, { color: '#64748B' }]}>
                            {overview?.today?.na_count ?? '-'}
                          </Text>
                          <Text style={styles.kpiCounterLabel}>Uzur</Text>
                        </View>
                      </View>
                    </View>
                  </View>

                  {/* Pekanan & Bulanan Progress */}
                  <View style={styles.averagesRow}>
                    <View style={styles.averageCol}>
                      <View style={styles.averageMeta}>
                        <Text style={styles.averageLabel}>Rata-rata Pekanan</Text>
                        <Text style={styles.averageVal}>
                          {overview?.weekly?.score ? `${Math.round(Number(overview.weekly.score))}%` : '-'}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${Math.min(100, Number(overview?.weekly?.score || 0))}%` },
                          ]}
                        />
                      </View>
                    </View>

                    <View style={styles.averageCol}>
                      <View style={styles.averageMeta}>
                        <Text style={styles.averageLabel}>Rata-rata Bulanan</Text>
                        <Text style={styles.averageVal}>
                          {overview?.monthly?.score ? `${Math.round(Number(overview.monthly.score))}%` : '-'}
                        </Text>
                      </View>
                      <View style={styles.barTrack}>
                        <View
                          style={[
                            styles.barFill,
                            { width: `${Math.min(100, Number(overview?.monthly?.score || 0))}%`, backgroundColor: '#0D9488' },
                          ]}
                        />
                      </View>
                    </View>
                  </View>
                </View>
              </View>

              {/* SECTION 4: INPUT IBADAH DI RUMAH (Bagi Orang Tua) */}
              {isParent && (
                <View style={styles.containerBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <MaterialCommunityIcons name="home-heart" size={18} color="#18A165" />
                    <Text style={styles.sectionTitle}>Input Pembiasaan di Rumah</Text>
                  </View>

                  <View style={styles.homeActionCard}>
                    <View style={styles.homeActionLeft}>
                      <View style={styles.homeActionIconBox}>
                        <MaterialCommunityIcons name="clipboard-edit-outline" size={24} color="#18A165" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.homeActionTitle}>Amalan & Ibadah Rumah</Text>
                        <Text style={styles.homeActionDesc}>
                          Catat shalat fardhu di rumah, tilawah mandiri, dan adab harian ananda.
                        </Text>
                      </View>
                    </View>
                    <TouchableOpacity
                      style={styles.homeActionBtn}
                      onPress={openWorshipModal}
                      activeOpacity={0.88}
                    >
                      <LinearGradient
                        colors={['#047857', '#059669']}
                        start={{ x: 0, y: 0 }}
                        end={{ x: 1, y: 0 }}
                        style={styles.homeActionBtnGradient}
                      >
                        <MaterialCommunityIcons name="pencil-plus-outline" size={16} color="#FFFFFF" />
                        <Text style={styles.homeActionBtnText}>Isi Amalan</Text>
                      </LinearGradient>
                    </TouchableOpacity>
                  </View>
                </View>
              )}

              {/* SECTION 5: CATATAN PEMBIMBING (JIKA ADA) */}
              {overview?.today?.notes && (
                <View style={styles.containerBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <MaterialCommunityIcons name="comment-text-outline" size={18} color="#D97706" />
                    <Text style={styles.sectionTitle}>Catatan Pembimbing / Musyrif</Text>
                  </View>

                  <View style={styles.notesBox}>
                    <Text style={styles.notesText}>{overview.today.notes}</Text>
                  </View>
                </View>
              )}

              {/* SECTION 6: PARAF & PENGESAHAN ORANG TUA */}
              {isParent && overview?.today && (
                <View style={styles.containerBlock}>
                  <View style={styles.sectionHeaderRow}>
                    <MaterialCommunityIcons name="draw" size={18} color="#059669" />
                    <Text style={styles.sectionTitle}>Paraf & Pengesahan Orang Tua</Text>
                  </View>

                  <View style={styles.signatureCardBox}>
                    {overview.today.signature ? (
                      <View style={styles.signedRow}>
                        <MaterialCommunityIcons
                          name={overview.today.signature.signature_status === 'approved' ? 'check-decagram' : 'alert-circle'}
                          size={24}
                          color={overview.today.signature.signature_status === 'approved' ? '#059669' : '#D97706'}
                        />
                        <View style={{ flex: 1, marginLeft: 10 }}>
                          <Text style={styles.signedStatusTitle}>
                            {overview.today.signature.signature_status === 'approved'
                              ? 'Telah Diparaf (Setuju & Terverifikasi)'
                              : 'Klarifikasi Diajukan'}
                          </Text>
                          <Text style={styles.signedMetaText}>
                            {overview.today.signature.signed_at
                              ? new Date(overview.today.signature.signed_at).toLocaleString('id-ID')
                              : 'Waktu tercatat'}
                          </Text>
                          {overview.today.signature.comment && (
                            <Text style={styles.signedNotesText}>
                              "{overview.today.signature.comment}"
                            </Text>
                          )}
                        </View>
                        <TouchableOpacity
                          style={styles.reSignButton}
                          onPress={() => setIsSignModalVisible(true)}
                        >
                          <Text style={styles.reSignButtonText}>Ubah</Text>
                        </TouchableOpacity>
                      </View>
                    ) : (
                      <View style={styles.unsignedContainer}>
                        <Text style={styles.unsignedDesc}>
                          Mohon periksa checklist amalan di atas, kemudian berikan paraf pengesahan atau ajukan klarifikasi kepada pihak sekolah.
                        </Text>
                        <TouchableOpacity
                          style={styles.signButton}
                          onPress={() => setIsSignModalVisible(true)}
                          activeOpacity={0.88}
                        >
                          <LinearGradient
                            colors={['#047857', '#059669']}
                            start={{ x: 0, y: 0 }}
                            end={{ x: 1, y: 0 }}
                            style={styles.signButtonGradient}
                          >
                            <MaterialCommunityIcons name="draw-pen" size={18} color="#FFFFFF" />
                            <Text style={styles.signButtonText}>Beri Paraf Orang Tua</Text>
                          </LinearGradient>
                        </TouchableOpacity>
                      </View>
                    )}
                  </View>
                </View>
              )}

              {/* SECTION 7: CHECKLIST AMALAN & AKTIVITAS */}
              <View style={styles.containerBlock}>
                <View style={styles.sectionHeaderRow}>
                  <MaterialCommunityIcons name="format-list-checks" size={18} color="#18A165" />
                  <Text style={styles.sectionTitle}>Checklist Amalan & Aktivitas</Text>
                  <Text style={styles.itemCountText}>({filteredDetails.length} Butir)</Text>
                </View>

                {/* Filter Kategori Strip */}
                {categories.length > 2 && (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoryChipsScroll}
                  >
                    {categories.map((cat) => {
                      const isActive = selectedCategory === cat;
                      return (
                        <TouchableOpacity
                          key={cat}
                          onPress={() => setSelectedCategory(cat)}
                          style={[
                            styles.categoryChipItem,
                            isActive && styles.categoryChipItemActive,
                          ]}
                        >
                          <Text
                            style={[
                              styles.categoryChipItemText,
                              isActive && styles.categoryChipItemTextActive,
                            ]}
                          >
                            {cat === 'all' ? 'Semua Agenda' : cat}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </ScrollView>
                )}

                {/* Daftar Butir Agenda */}
                {filteredDetails.length === 0 ? (
                  <View style={styles.emptyCard}>
                    <MaterialCommunityIcons name="calendar-blank-outline" size={44} color="#94A3B8" />
                    <Text style={styles.emptyTitle}>Belum Ada Hasil Mutaba’ah</Text>
                    <Text style={styles.emptyDesc}>
                      Hasil checklist akan tampil setelah pembimbing melakukan finalisasi atau menetapkan agenda aktif pada tanggal ini.
                    </Text>
                    {isParent && (
                      <TouchableOpacity style={styles.emptyActionBtn} onPress={openWorshipModal}>
                        <MaterialCommunityIcons name="plus-circle-outline" size={18} color="#18A165" />
                        <Text style={styles.emptyActionBtnText}>Input Amalan Rumah Sekarang</Text>
                      </TouchableOpacity>
                    )}
                  </View>
                ) : (
                  filteredDetails.map((item: any) => {
                    const statusInfo = STATUS_CONFIG[item.status_value] || STATUS_CONFIG.na;
                    return (
                      <View key={item.id} style={styles.agendaItemCard}>
                        <View style={styles.agendaItemTop}>
                          <View style={[styles.agendaStatusIconBox, { backgroundColor: statusInfo.bg }]}>
                            <MaterialCommunityIcons
                              name={statusInfo.icon as any}
                              size={20}
                              color={statusInfo.color}
                            />
                          </View>
                          <View style={{ flex: 1, marginLeft: 12 }}>
                            <View style={styles.agendaCatRow}>
                              <Text style={styles.agendaCatText}>{item.category || 'Amalan'}</Text>
                              {item.input_location && (
                                <Text style={styles.agendaLocText}>
                                  · {item.input_location === 'home' ? 'Rumah' : item.input_location === 'school' ? 'Sekolah' : 'Asrama'}
                                </Text>
                              )}
                            </View>
                            <Text style={styles.agendaTitleText}>{item.name}</Text>
                            {item.notes && <Text style={styles.agendaNotesText}>{item.notes}</Text>}
                          </View>
                          <View style={[styles.agendaBadgePill, { backgroundColor: statusInfo.bg }]}>
                            <Text style={[styles.agendaBadgePillText, { color: statusInfo.color }]}>
                              {statusInfo.label}
                            </Text>
                          </View>
                        </View>

                        {/* Status Verifikasi Pembimbing */}
                        {item.verification_status && (
                          <View style={styles.agendaItemFooter}>
                            <MaterialCommunityIcons
                              name={item.verification_status === 'verified' ? 'shield-check' : 'clock-outline'}
                              size={13}
                              color={item.verification_status === 'verified' ? '#059669' : '#64748B'}
                            />
                            <Text style={styles.agendaItemFooterText}>
                              {item.verification_status === 'verified'
                                ? 'Terverifikasi Pembimbing'
                                : 'Menunggu Verifikasi'}
                            </Text>
                          </View>
                        )}
                      </View>
                    );
                  })
                )}
              </View>
            </>
          )}
        </ScrollView>
      </View>

      {/* ============================================================ */}
      {/* MODAL INPUT IBADAH RUMAH (BOTTOM SHEET) */}
      {/* ============================================================ */}
      <Modal
        visible={isWorshipModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsWorshipModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Input Ibadah di Rumah</Text>
                <Text style={styles.modalSubtitle}>
                  {formatDateIndo(selectedDate)} · {worshipContext?.student?.name || 'Ananda'}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsWorshipModalVisible(false)}
              >
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            {worshipLoading ? (
              <ActivityIndicator color="#18A165" style={{ marginVertical: 40 }} />
            ) : (
              <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
                {worshipContext?.can_edit === false ? (
                  <View style={styles.warningBox}>
                    <MaterialCommunityIcons name="lock-outline" size={20} color="#D97706" />
                    <Text style={styles.warningText}>
                      Data pada tanggal ini telah difinalisasi oleh pembimbing dan tidak dapat diubah lagi.
                    </Text>
                  </View>
                ) : null}

                {(!worshipContext?.items || worshipContext.items.length === 0) ? (
                  <View style={styles.emptyCard}>
                    <MaterialCommunityIcons name="clipboard-check-outline" size={38} color="#94A3B8" />
                    <Text style={styles.emptyTitle}>Tidak Ada Tugas Rumah</Text>
                    <Text style={styles.emptyDesc}>
                      Tidak ada agenda ibadah rumah yang ditugaskan kepada orang tua pada tanggal ini.
                    </Text>
                  </View>
                ) : (
                  worshipContext.items.map((item: any) => {
                    const currentVal = worshipValues[item.agenda_item_id];
                    return (
                      <View key={item.agenda_item_id} style={styles.formItemCard}>
                        <Text style={styles.formItemTitle}>{item.name}</Text>
                        <Text style={styles.formItemSub}>
                          Lokasi: {item.location || 'rumah'} {item.requires_verification ? '· Perlu verifikasi pembimbing' : ''}
                        </Text>

                        {/* Pilihan Baik, Kurang, Belum, Uzur */}
                        <View style={styles.formOptionsRow}>
                          {[
                            { key: 'good', label: 'Terlaksana', color: '#059669', bg: '#D1FAE5' },
                            { key: 'less', label: 'Kurang', color: '#D97706', bg: '#FEF3C7' },
                            { key: 'not_done', label: 'Belum', color: '#E11D48', bg: '#FFE4E6' },
                            { key: 'na', label: 'Uzur / NA', color: '#64748B', bg: '#F1F5F9' },
                          ].map((opt) => {
                            const isSelected = currentVal === opt.key;
                            return (
                              <TouchableOpacity
                                key={opt.key}
                                onPress={() =>
                                  setWorshipValues((prev) => ({
                                    ...prev,
                                    [item.agenda_item_id]: opt.key,
                                  }))
                                }
                                style={[
                                  styles.formOptBtn,
                                  isSelected && { backgroundColor: opt.color, borderColor: opt.color },
                                ]}
                              >
                                <Text
                                  style={[
                                    styles.formOptBtnText,
                                    isSelected && { color: '#FFFFFF', fontWeight: '800' },
                                  ]}
                                >
                                  {opt.label}
                                </Text>
                              </TouchableOpacity>
                            );
                          })}
                        </View>

                        {/* Catatan Tambahan */}
                        <TextInput
                          style={styles.formNotesInput}
                          placeholder="Catatan tambahan (opsional)..."
                          placeholderTextColor="#94A3B8"
                          value={worshipNotes[item.agenda_item_id] || ''}
                          onChangeText={(text) =>
                            setWorshipNotes((prev) => ({
                              ...prev,
                              [item.agenda_item_id]: text,
                            }))
                          }
                        />
                      </View>
                    );
                  })
                )}

                {worshipContext?.items?.length > 0 && worshipContext?.can_edit !== false && (
                  <TouchableOpacity
                    style={styles.modalSaveBtn}
                    onPress={handleSaveWorship}
                    disabled={worshipSubmitting}
                    activeOpacity={0.88}
                  >
                    <LinearGradient
                      colors={['#0D6B42', '#18A165']}
                      style={styles.modalSaveGradient}
                    >
                      {worshipSubmitting ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="content-save-outline" size={20} color="#FFFFFF" />
                          <Text style={styles.modalSaveText}>Simpan Mutaba’ah Rumah</Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                )}
              </ScrollView>
            )}
          </View>
        </View>
      </Modal>

      {/* ============================================================ */}
      {/* MODAL PARAF & PENGESAHAN ORANG TUA */}
      {/* ============================================================ */}
      <Modal
        visible={isSignModalVisible}
        animationType="slide"
        transparent
        onRequestClose={() => setIsSignModalVisible(false)}
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalSheet, { paddingBottom: Math.max(insets.bottom, 20) }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <Text style={styles.modalTitle}>Paraf & Tanda Tangan Orang Tua</Text>
                <Text style={styles.modalSubtitle}>
                  Konfirmasi pengawasan ibadah ananda untuk tanggal {formatDateIndo(selectedDate)}
                </Text>
              </View>
              <TouchableOpacity
                style={styles.modalCloseBtn}
                onPress={() => setIsSignModalVisible(false)}
              >
                <MaterialCommunityIcons name="close" size={22} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody}>
              <Text style={styles.signPrompt}>Pilih status konfirmasi paraf:</Text>
              <View style={styles.signChoiceCol}>
                {[
                  {
                    key: 'approved',
                    label: 'Paraf Setuju & Terverifikasi',
                    desc: 'Saya telah memeriksa dan menyetujui seluruh laporan amalan ananda.',
                    color: '#059669',
                    icon: 'check-decagram-outline',
                  },
                  {
                    key: 'clarification_requested',
                    label: 'Minta Klarifikasi Pembimbing',
                    desc: 'Ada butir aktivitas yang ingin saya tanyakan atau diskusikan dengan ustadz/pembimbing.',
                    color: '#D97706',
                    icon: 'comment-question-outline',
                  },
                  {
                    key: 'unable_to_verify',
                    label: 'Belum Dapat Memverifikasi',
                    desc: 'Santri sedang berada di luar jangkauan pengawasan wali murid pada tanggal ini.',
                    color: '#64748B',
                    icon: 'eye-off-outline',
                  },
                ].map((choice) => {
                  const isSelected = signStatus === choice.key;
                  return (
                    <TouchableOpacity
                      key={choice.key}
                      onPress={() => setSignStatus(choice.key as any)}
                      style={[
                        styles.signChoiceCard,
                        isSelected && { borderColor: choice.color, backgroundColor: `${choice.color}10` },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={choice.icon as any}
                        size={24}
                        color={isSelected ? choice.color : '#94A3B8'}
                      />
                      <View style={{ flex: 1, marginLeft: 10 }}>
                        <Text style={[styles.signChoiceTitle, isSelected && { color: choice.color, fontWeight: '800' }]}>
                          {choice.label}
                        </Text>
                        <Text style={styles.signChoiceDesc}>{choice.desc}</Text>
                      </View>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.signPrompt, { marginTop: 16 }]}>Catatan atau Pesan untuk Sekolah (Opsional):</Text>
              <TextInput
                style={styles.signCommentInput}
                placeholder="Tuliskan catatan, klarifikasi, atau evaluasi pembinaan ananda..."
                placeholderTextColor="#94A3B8"
                multiline
                numberOfLines={3}
                value={signComment}
                onChangeText={setSignComment}
              />

              <TouchableOpacity
                style={styles.modalSaveBtn}
                onPress={handleSaveSignature}
                disabled={signSubmitting}
                activeOpacity={0.88}
              >
                <LinearGradient
                  colors={['#0D6B42', '#18A165']}
                  style={styles.modalSaveGradient}
                >
                  {signSubmitting ? (
                    <ActivityIndicator color="#FFFFFF" size="small" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="draw" size={20} color="#FFFFFF" />
                      <Text style={styles.modalSaveText}>Kirim Paraf Resmi</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </ScrollView>
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
    marginBottom: 8, // Jarak rapat, proporsional, dan rapi ke kontainer/ringkasan berikutnya
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
  itemCountText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '700',
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
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    shadowColor: '#059669',
    shadowOpacity: 0.18,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
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
    width: 60,
    height: 60,
    borderRadius: 20,
    borderWidth: 2.5,
    borderColor: 'rgba(255, 255, 255, 0.95)',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.15,
    shadowRadius: 6,
    elevation: 4,
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
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  childNameHero: {
    fontSize: 15,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#FFFFFF',
  },
  childSubInfoHero: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 2,
    fontFamily: 'Nunito_600SemiBold',
  },
  studentNisText: {
    fontSize: 10.5,
    color: 'rgba(255, 255, 255, 0.88)',
    marginTop: 2,
    fontFamily: 'Nunito_600SemiBold',
  },
  studentUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.16)',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 10,
    alignSelf: 'flex-start',
    marginTop: 4,
  },
  studentUnitBadgeInactive: {
    backgroundColor: '#E7F7EF',
    borderColor: '#A7F3D0',
  },
  studentUnitText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Nunito_700Bold',
    color: '#FFFFFF',
    maxWidth: SCREEN_WIDTH - 220,
  },
  selectedActionBtnRight: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
    marginLeft: 8,
    minWidth: 48,
  },
  selectedActionBtnRightInactive: {
    backgroundColor: '#F1F5F9',
    elevation: 1,
  },
  selectedActionBtnText: {
    fontSize: 9.5,
    fontWeight: '700',
    fontFamily: 'Poppins_700Bold',
    color: '#059669',
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

  /* ============================================================ */
  /* KONTROL TANGGAL & TAB TOGGLE */
  /* ============================================================ */
  dateControlCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
    gap: 12,
  },
  tabToggleRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 14,
    padding: 4,
    gap: 4,
  },
  tabToggleBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 9,
    borderRadius: 11,
    gap: 6,
  },
  tabToggleBtnActive: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  tabToggleText: {
    fontSize: 12,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  tabToggleTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  datePresetRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingTop: 4,
  },
  dateChip: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  dateChipActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  dateChipText: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  dateChipTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
  dateDisplayBadge: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 5,
  },
  dateDisplayText: {
    fontSize: 11.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#047857',
  },

  /* ============================================================ */
  /* CAPAIAN & EVALUASI CARD */
  /* ============================================================ */
  evaluationCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  evalTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  evalBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flexWrap: 'wrap',
  },
  programPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  programPillText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  locationPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  locationPillText: {
    fontSize: 10.5,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
  },
  kpiMainGrid: {
    flexDirection: 'row',
    marginTop: 14,
    gap: 12,
  },
  scoreHeroBox: {
    width: 96,
    backgroundColor: '#ECFDF5',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 10,
  },
  scoreHeroVal: {
    fontSize: 26,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#047857',
  },
  scoreHeroLabel: {
    fontSize: 10,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },
  kpiCountersWrap: {
    flex: 1,
  },
  kpiCounterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  kpiCounterItem: {
    flex: 1,
    borderRadius: 14,
    paddingVertical: 7,
    paddingHorizontal: 10,
    alignItems: 'center',
    borderWidth: 1,
  },
  kpiCounterVal: {
    fontSize: 15,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
  },
  kpiCounterLabel: {
    fontSize: 9.5,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
    marginTop: 1,
  },
  averagesRow: {
    flexDirection: 'row',
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    gap: 12,
  },
  averageCol: {
    flex: 1,
  },
  averageMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 5,
  },
  averageLabel: {
    fontSize: 10.5,
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
    color: '#64748B',
  },
  averageVal: {
    fontSize: 11.5,
    fontFamily: 'Poppins_700Bold',
    fontWeight: '700',
    color: '#0F172A',
  },
  barTrack: {
    height: 6,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  barFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 4,
  },

  /* ============================================================ */
  /* INPUT RUMAH CALLOUT */
  /* ============================================================ */
  homeActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
    gap: 12,
    shadowColor: '#059669',
    shadowOpacity: 0.06,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  homeActionLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  homeActionIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  homeActionTitle: {
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
  },
  homeActionDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14.5,
    fontFamily: 'Nunito_600SemiBold',
  },
  homeActionBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  homeActionBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 9,
    paddingHorizontal: 14,
    borderRadius: 12,
    gap: 5,
  },
  homeActionBtnText: {
    color: '#FFFFFF',
    fontSize: 11.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },

  /* ============================================================ */
  /* NOTES BOX */
  /* ============================================================ */
  notesBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  notesText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 17,
    fontFamily: 'Nunito_600SemiBold',
  },

  /* ============================================================ */
  /* PARAF ORANG TUA BOX */
  /* ============================================================ */
  signatureCardBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  signedRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  signedStatusTitle: {
    fontSize: 12,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#065F46',
  },
  signedMetaText: {
    fontSize: 10,
    color: '#059669',
    marginTop: 1,
    fontFamily: 'Nunito_600SemiBold',
  },
  signedNotesText: {
    fontSize: 11,
    fontStyle: 'italic',
    color: '#334155',
    marginTop: 3,
    fontFamily: 'Nunito_600SemiBold',
  },
  reSignButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  reSignButtonText: {
    fontSize: 11,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#475569',
  },
  unsignedContainer: {
    gap: 12,
  },
  unsignedDesc: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    fontFamily: 'Nunito_600SemiBold',
  },
  signButton: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  signButtonGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 8,
  },
  signButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },

  /* ============================================================ */
  /* DAFTAR CHECKLIST & KATEGORI */
  /* ============================================================ */
  categoryChipsScroll: {
    gap: 8,
    paddingBottom: 10,
  },
  categoryChipItem: {
    paddingHorizontal: 13,
    paddingVertical: 6.5,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipItemActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  categoryChipItemText: {
    fontSize: 11,
    fontFamily: 'Nunito_700Bold',
    fontWeight: '700',
    color: '#64748B',
  },
  categoryChipItemTextActive: {
    color: '#FFFFFF',
    fontFamily: 'Poppins_600SemiBold',
  },
  agendaItemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  agendaItemTop: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agendaStatusIconBox: {
    width: 40,
    height: 40,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  agendaCatRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  agendaCatText: {
    fontSize: 9.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  agendaLocText: {
    fontSize: 9.5,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
    fontWeight: '600',
  },
  agendaTitleText: {
    fontSize: 13.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
    color: '#0F172A',
    marginTop: 2,
  },
  agendaNotesText: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    fontFamily: 'Nunito_600SemiBold',
  },
  agendaBadgePill: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 10,
    marginLeft: 8,
  },
  agendaBadgePillText: {
    fontSize: 10.5,
    fontFamily: 'Poppins_600SemiBold',
    fontWeight: '700',
  },
  agendaItemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
    gap: 4,
  },
  agendaItemFooterText: {
    fontSize: 10,
    color: '#64748B',
    fontFamily: 'Nunito_600SemiBold',
  },

  /* ============================================================ */
  /* EMPTY & ERROR STATES */
  /* ============================================================ */
  centerLoading: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderStyle: 'dashed',
    marginVertical: 6,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
    marginTop: 10,
  },
  emptyDesc: {
    fontSize: 11,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },
  emptyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 14,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: '#E6F4EA',
    gap: 6,
  },
  emptyActionBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0D6B42',
  },
  errorCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  errorTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#E11D48',
    marginTop: 10,
  },
  errorDesc: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
  errorRetryBtn: {
    marginTop: 14,
    backgroundColor: '#E11D48',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  errorRetryText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12,
  },

  /* ============================================================ */
  /* RIWAYAT CARDS */
  /* ============================================================ */
  historyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  historyTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyDate: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  historySub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  historyScoreBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 4,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  historyScoreVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#059669',
  },
  historyScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#0D6B42',
  },
  historyStatsRow: {
    flexDirection: 'row',
    gap: 6,
    marginTop: 10,
  },
  historyStatPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  historyStatText: {
    fontSize: 10,
    fontWeight: '700',
  },
  historyFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  historySignStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  historySignText: {
    fontSize: 11,
    color: '#64748B',
  },
  historyDetailBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  historyDetailBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },

  /* ============================================================ */
  /* MODAL STYLES */
  /* ============================================================ */
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.45)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '88%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 18,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
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
  warningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFBEB',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#FDE68A',
    gap: 8,
    marginBottom: 14,
  },
  warningText: {
    flex: 1,
    fontSize: 11,
    color: '#92400E',
    lineHeight: 16,
  },
  formItemCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  formItemTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  formItemSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    marginBottom: 10,
  },
  formOptionsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  formOptBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  formOptBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  formNotesInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 11,
    color: '#0F172A',
    marginTop: 10,
  },
  modalSaveBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 8,
    marginBottom: 16,
    shadowColor: '#0D6B42',
    shadowOpacity: 0.25,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  modalSaveGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    gap: 8,
  },
  modalSaveText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '800',
  },
  signPrompt: {
    fontSize: 12,
    fontWeight: '800',
    color: '#334155',
    marginBottom: 8,
  },
  signChoiceCol: {
    gap: 8,
  },
  signChoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  signChoiceTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  signChoiceDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 14,
  },
  signCommentInput: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: 12,
    fontSize: 12,
    color: '#0F172A',
    textAlignVertical: 'top',
    minHeight: 70,
    marginBottom: 16,
  },
});
