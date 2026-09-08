import React, { useCallback, useEffect, useRef, useState } from 'react';
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
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { isParentRole } from '../utils/roles';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { offlineCache } from '../utils/offlineCache';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type Child = Record<string, any>;
type InfoItem = Record<string, any>;

export default function SchoolInformationScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const modalBottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 48 : 20) + 16;
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

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

  // States
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [items, setItems] = useState<InfoItem[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [selectedTab, setSelectedTab] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [showBookmarkedOnly, setShowBookmarkedOnly] = useState<boolean>(false);
  const [selectedItem, setSelectedItem] = useState<InfoItem | null>(null);
  const [page, setPage] = useState<number>(1);
  const [totalItems, setTotalItems] = useState<number>(0);

  // 1. Load Children if parent (Isolasi data 1 anak terpilih jika ada child_id)
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      const targetChildId = route?.params?.child_id;
      mobileApiService.getPortalChildren()
        .then((res) => {
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted) {
            const filteredArr = targetChildId
              ? arr.filter((c) => String(c.id) === String(targetChildId))
              : arr;
            setChildren(filteredArr.length > 0 ? filteredArr : arr);
            if (targetChildId) {
              setSelectedChildId(String(targetChildId));
            } else if (!selectedChildId && arr.length > 0) {
              setSelectedChildId(String(arr[0].id));
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent, route?.params?.child_id]);

  // 2. Load summary from backend
  const loadSummary = useCallback(async () => {
    try {
      const res = await mobileApiService.getPortalSchoolInformationSummary({
        child_id: selectedChildId,
      });
      const data = unwrapApiData<any>(res) || {};
      setSummary(data);
      if (res?.student || data?.student) {
        setStudentInfo(res?.student || data?.student);
      }
    } catch {
      // safe fallback if offline
    }
  }, [selectedChildId]);

  // 3. Load items from database API
  const loadItems = useCallback(async (targetPage = 1) => {
    const cacheKey = offlineCache.buildKey('school_info', user?.id, selectedChildId);
    // 1. Baca cache dulu saat halaman pertama tanpa filter
    if (targetPage === 1 && !searchQuery.trim() && selectedTab === 'all' && !showBookmarkedOnly) {
      const cached = await offlineCache.get<{ items: InfoItem[]; total: number }>(cacheKey);
      if (cached?.items && cached.items.length > 0) {
        setItems(cached.items);
        setTotalItems(cached.total || cached.items.length);
      }
    }
    // 2. Fetch dari backend
    try {
      const params: Record<string, any> = {
        child_id: selectedChildId,
        type: selectedTab === 'all' ? undefined : selectedTab,
        search: searchQuery.trim() || undefined,
        bookmarked: showBookmarkedOnly ? true : undefined,
        per_page: 15,
        page: targetPage,
      };

      const res = await mobileApiService.getPortalSchoolInformation(params);
      const data = unwrapApiData<any>(res) || {};
      const list = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
      setItems(list);
      const total = data?.total || list.length;
      setTotalItems(total);
      setPage(targetPage);
      if (res?.student || data?.student) {
        setStudentInfo(res?.student || data?.student);
      }
      // 3. Simpan ke cache saat halaman pertama tanpa filter
      if (targetPage === 1 && !searchQuery.trim() && selectedTab === 'all' && !showBookmarkedOnly && list.length > 0) {
        void offlineCache.set(cacheKey, { items: list, total });
      }
    } catch {
      // Offline: data cache sudah tampil dari step 1
    }
  }, [selectedChildId, selectedTab, searchQuery, showBookmarkedOnly, user?.id]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadSummary(), loadItems(1)]);
    setLoading(false);
  }, [loadSummary, loadItems]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const onRefresh = async () => {
    setRefreshing(true);
    await Promise.all([loadSummary(), loadItems(1)]);
    setRefreshing(false);
  };

  // Actions
  const handleMarkAllRead = async () => {
    try {
      await mobileApiService.markAllSchoolInformationRead(selectedChildId);
      Alert.alert('Sukses', 'Seluruh informasi telah ditandai sebagai dibaca.');
      void loadAll();
    } catch {
      Alert.alert('Gagal', 'Terjadi kendala saat menandai dibaca.');
    }
  };

  const handleToggleBookmark = async (item: InfoItem) => {
    const nextAction = item.is_bookmarked ? 'unbookmark' : 'bookmark';
    try {
      await mobileApiService.updateSchoolInformationState(item.id, nextAction, selectedChildId);
      // Update local item
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_bookmarked: !item.is_bookmarked } : i))
      );
      if (selectedItem?.id === item.id) {
        setSelectedItem((prev) => (prev ? { ...prev, is_bookmarked: !item.is_bookmarked } : null));
      }
      void loadSummary();
    } catch {
      // offline silent
    }
  };

  const handleOpenDetail = (item: InfoItem) => {
    setSelectedItem(item);
    if (!item.is_read) {
      void mobileApiService.updateSchoolInformationState(item.id, 'read', selectedChildId);
      setItems((prev) =>
        prev.map((i) => (i.id === item.id ? { ...i, is_read: true } : i))
      );
      void loadSummary();
    }
  };

  const handleResetFilter = () => {
    setSearchQuery('');
    setSelectedTab('all');
    setShowBookmarkedOnly(false);
  };

  const counts = summary?.counts || {};
  const importantItems: InfoItem[] = Array.isArray(summary?.important) ? summary.important : [];
  const unreadCount = summary?.unread_count ?? 0;
  const bookmarkedCount = summary?.bookmarked_count ?? 0;

  const categoryTabs = [
    { key: 'all', label: 'Semua', count: counts.all ?? totalItems },
    { key: 'announcement', label: 'Pengumuman', count: counts.announcement ?? 0 },
    { key: 'event', label: 'Agenda', count: counts.event ?? 0 },
    { key: 'news', label: 'Berita', count: counts.news ?? 0 },
    { key: 'circular', label: 'Surat Edaran', count: counts.circular ?? 0 },
    { key: 'calendar', label: 'Kalender', count: counts.calendar ?? 0 },
    { key: 'gallery', label: 'Galeri', count: counts.gallery ?? 0 },
  ];

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
                const studentName = s.full_name || s.nama_lengkap || s.name || 'Siswa Aktif';
                const studentClass = s.kelas?.nama_kelas || s.kelas?.name || s.class || s.class_name || 'Kelas Belum Ditentukan';
                const studentUnit = s.education_unit?.name || s.unit || s.unit_name || 'Unit Pendidikan';
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
                        <Text style={styles.selectedActionBtnText}>Aktif</Text>
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
                        <Text style={styles.studentAttrLabel}>Unit</Text>
                        <Text numberOfLines={1} style={styles.studentAttrValue}>{userUnit}</Text>
                      </View>
                      <View style={styles.studentAttrDivider} />
                      <View style={styles.studentAttrBox}>
                        <Text style={styles.studentAttrLabel}>Status</Text>
                        <Text numberOfLines={1} style={[styles.studentAttrValue, { color: '#DEF7EC' }]}>Terverifikasi</Text>
                      </View>
                    </View>
                  </LinearGradient>
                );
              })()}
            </View>
          ) : null}

          {/* 2. CATEGORY TABS */}
          <View style={styles.tabsSection}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsScroll}>
              {categoryTabs.map((tab) => {
                const isActive = selectedTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    activeOpacity={0.75}
                    onPress={() => setSelectedTab(tab.key)}
                    style={[styles.categoryTab, isActive && styles.categoryTabActive]}
                  >
                    <Text style={[styles.categoryTabText, isActive && styles.categoryTabTextActive]}>
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 3. SEARCH BAR */}
          <View style={styles.searchSection}>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Cari informasi, pengumuman..."
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
                returnKeyType="search"
              />
              {searchQuery.length > 0 ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              ) : (
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                >
                  <MaterialCommunityIcons
                    name="tune-variant"
                    size={20}
                    color={showBookmarkedOnly ? '#18A165' : '#94A3B8'}
                  />
                </TouchableOpacity>
              )}
            </View>
          </View>

          {/* 4. INFORMATION ITEMS LIST */}
          <View style={styles.listSection}>
            {loading ? (
              <ActivityIndicator color="#18A165" style={{ marginVertical: 36 }} />
            ) : items.length > 0 ? (
              items.map((item, idx) => {
                const isImportant = item.priority === 'penting' || item.priority === 'mendesak';
                const cat = (item.category || item.type || 'announcement').toLowerCase();
                const iconMap: Record<string, { name: string; bg: string; color: string }> = {
                  announcement: { name: 'bullhorn', bg: '#EBF8F2', color: '#18A165' },
                  pengumuman:   { name: 'bullhorn', bg: '#EBF8F2', color: '#18A165' },
                  event:        { name: 'calendar-star', bg: '#EFF6FF', color: '#2563EB' },
                  agenda:       { name: 'calendar-star', bg: '#EFF6FF', color: '#2563EB' },
                  news:         { name: 'newspaper', bg: '#F5F3FF', color: '#7C3AED' },
                  berita:       { name: 'newspaper', bg: '#F5F3FF', color: '#7C3AED' },
                  circular:     { name: 'email-newsletter', bg: '#FFF7ED', color: '#EA580C' },
                  'surat edaran': { name: 'email-newsletter', bg: '#FFF7ED', color: '#EA580C' },
                  achievement:  { name: 'trophy', bg: '#ECFDF5', color: '#059669' },
                  prestasi:     { name: 'trophy', bg: '#ECFDF5', color: '#059669' },
                  payment:      { name: 'cash', bg: '#F0FDF4', color: '#16A34A' },
                  pembayaran:   { name: 'cash', bg: '#F0FDF4', color: '#16A34A' },
                  report:       { name: 'file-document', bg: '#F0F9FF', color: '#0284C7' },
                  rapor:        { name: 'file-document', bg: '#F0F9FF', color: '#0284C7' },
                };
                const iconInfo = iconMap[cat] || { name: 'bell-outline', bg: '#F1F5F9', color: '#64748B' };
                const dateStr = item.published_at
                  ? new Date(item.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                  : 'Terbaru';
                return (
                  <TouchableOpacity
                    key={item.id || idx}
                    activeOpacity={0.85}
                    onPress={() => handleOpenDetail(item)}
                    style={[styles.itemCard, isImportant && styles.itemCardImportant]}
                  >
                    <View style={styles.itemCardRow}>
                      {/* Left Icon */}
                      <View style={[styles.itemIconBox, { backgroundColor: iconInfo.bg }]}>
                        <MaterialCommunityIcons name={iconInfo.name as any} size={22} color={iconInfo.color} />
                      </View>

                      {/* Center Content */}
                      <View style={styles.itemContentCol}>
                        <View style={styles.itemTitleRow}>
                          <Text numberOfLines={2} style={styles.itemTitle}>{item.title}</Text>
                          <Text style={styles.itemDateText}>{dateStr}</Text>
                        </View>
                        <Text numberOfLines={2} style={styles.itemSummary}>
                          {item.summary || item.content || ''}
                        </Text>
                      </View>

                      {/* Right Arrow */}
                      <MaterialCommunityIcons name="chevron-right" size={20} color="#CBD5E1" />
                    </View>
                    {!item.is_read && (
                      <View style={[styles.unreadDot, {
                        position: 'absolute', top: 10, right: 10,
                      }]} />
                    )}
                  </TouchableOpacity>
                );
              })
            ) : (
              <View style={styles.emptyContainer}>
                <MaterialCommunityIcons name="bullhorn-outline" size={48} color="#94A3B8" />
                <Text style={styles.emptyTitle}>Tidak ada informasi</Text>
                <Text style={styles.emptyText}>
                  Tidak ditemukan pengumuman atau agenda untuk kategori ini.
                </Text>
              </View>
            )}
          </View>
        </ScrollView>
      </View>

      {/* 7. FULL DETAIL MODAL */}
      <Modal
        visible={Boolean(selectedItem)}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
        statusBarTranslucent
      >
        <View style={styles.modalOverlay}>
          <Pressable style={StyleSheet.absoluteFill} onPress={() => setSelectedItem(null)} />
          <View style={[styles.modalContent, { paddingBottom: modalBottomInset }]}>
            <View style={styles.modalHeader}>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                  <View style={styles.priorityBadge}>
                    <Text style={styles.priorityBadgeText}>
                      {selectedItem?.priority || 'Informasi'}
                    </Text>
                  </View>
                  <View style={styles.categoryPill}>
                    <Text style={styles.categoryPillText}>
                      {selectedItem?.category || selectedItem?.type}
                    </Text>
                  </View>
                </View>
                <Text style={styles.modalTitle}>{selectedItem?.title}</Text>
              </View>

              <TouchableOpacity
                onPress={() => setSelectedItem(null)}
                style={styles.modalCloseIconBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.modalBody} showsVerticalScrollIndicator={false}>
              {selectedItem?.cover && (
                <Image
                  source={{ uri: selectedItem.cover }}
                  style={styles.modalCoverImage}
                  resizeMode="cover"
                />
              )}

              <View style={styles.modalMetaRow}>
                <View style={styles.modalMetaItem}>
                  <MaterialCommunityIcons name="domain" size={14} color="#18A165" />
                  <Text style={styles.modalMetaText}>{selectedItem?.education_unit || 'Seluruh Yayasan'}</Text>
                </View>
                <View style={styles.modalMetaItem}>
                  <MaterialCommunityIcons name="calendar" size={14} color="#18A165" />
                  <Text style={styles.modalMetaText}>
                    {selectedItem?.published_at ? new Date(selectedItem.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' }) : 'Terbaru'}
                  </Text>
                </View>
              </View>

              <Text style={styles.modalFullContent}>
                {selectedItem?.content || selectedItem?.summary || 'Tidak ada detail teks.'}
              </Text>

              {Array.isArray(selectedItem?.attachments) && selectedItem.attachments.length > 0 && (
                <View style={styles.attachmentBox}>
                  <Text style={styles.attachmentBoxTitle}>Lampiran Dokumen / Berkas:</Text>
                  {selectedItem.attachments.map((att: any, idx: number) => (
                    <View key={idx} style={styles.attachmentItem}>
                      <MaterialCommunityIcons name="paperclip" size={16} color="#18A165" />
                      <Text numberOfLines={1} style={styles.attachmentItemText}>
                        {att.nama || att.name || 'Dokumen Pendukung'}
                      </Text>
                    </View>
                  ))}
                </View>
              )}
            </ScrollView>

            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => setSelectedItem(null)}
              style={styles.modalCloseBtn}
            >
              <Text style={styles.modalCloseBtnText}>Tutup Informasi</Text>
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
  screen: { flex: 1, backgroundColor: 'transparent' },
  content: { padding: 16, paddingTop: Platform.OS === 'android' ? 20 : 16 },
  studentContainerBlock: {
    marginBottom: 10,
  },
  childrenSection: {
    marginBottom: 14,
  },
  childrenLabel: {
    fontSize: 10,
    fontWeight: '900',
    color: '#18A165',
    letterSpacing: 0.8,
    marginBottom: 8,
  },
  childrenScroll: {
    gap: 10,
    paddingRight: 10,
  },
  childCardLarge: {
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
  childCardLargeActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childCardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  avatarBorderWrap: {
    width: 50,
    height: 50,
    borderRadius: 25,
    borderWidth: 2,
    borderColor: '#A7F3D0',
    overflow: 'hidden',
    backgroundColor: '#EBF8F2',
  },
  avatarBorderWrapActive: {
    borderColor: '#FFFFFF',
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childAvatarImgLarge: {
    width: '100%',
    height: '100%',
  },
  childStatusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  childStatusBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    borderColor: 'rgba(255, 255, 255, 0.4)',
  },
  childStatusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
  },
  childStatusBadgeTextActive: {
    color: '#FFFFFF',
  },
  childCardInfo: {
    marginTop: 2,
  },
  childNameTextLarge: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  childUnitTextLarge: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
  },
  childChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  childChipActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  childAvatar: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#EBF8F2',
    alignItems: 'center',
    justifyContent: 'center',
  },
  childAvatarActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  childNameText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
    maxWidth: 130,
  },
  childUnitText: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 1,
  },
  childTextActive: {
    color: '#FFFFFF',
  },
  containerBlock: {
    marginBottom: 16,
  },
  studentCardCountBadge: {
    backgroundColor: '#E8F5E9',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  studentCardCountBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#084835',
  },
  sectionHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
  heroCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 16,
    borderWidth: 1.5,
    borderColor: 'rgba(24, 161, 101, 0.25)',
    shadowColor: '#18A165',
    shadowOpacity: 0.1,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
    elevation: 3,
    marginBottom: 16,
  },
  heroHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    lineHeight: 16,
    marginTop: 4,
  },
  actionBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(24, 161, 101, 0.3)',
  },
  actionBtnActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  actionBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#18A165',
  },
  actionBtnTextActive: {
    color: '#FFFFFF',
  },
  unreadBadge: {
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FCA5A5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    marginLeft: 'auto',
  },
  unreadBadgeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#DC2626',
  },
  importantSection: {
    marginBottom: 16,
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  importantScroll: {
    gap: 12,
    paddingRight: 10,
  },
  importantCard: {
    width: SCREEN_WIDTH * 0.76,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#FCD34D',
    shadowColor: '#D97706',
    shadowOpacity: 0.1,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  importantCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  priorityBadge: {
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  priorityBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#D97706',
    textTransform: 'uppercase',
  },
  cardBookmarkBtn: {
    padding: 2,
  },
  importantTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 6,
  },
  importantSummary: {
    fontSize: 11,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 10,
  },
  importantFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 'auto',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  importantFooterText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '700',
    flex: 1,
  },
  searchSection: {
    marginBottom: 12,
  },
  searchLabel: {
    fontSize: 11,
    fontWeight: '900',
    color: '#18A165',
    textTransform: 'uppercase',
    letterSpacing: 0.6,
    marginBottom: 8,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 50,
    paddingHorizontal: 14,
    paddingVertical: Platform.OS === 'android' ? 6 : 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    marginLeft: 6,
    padding: 0,
  },
  filterActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 10,
  },
  filterTag: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  filterTagText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#18A165',
  },
  resetBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  resetBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  tabsSection: {
    marginBottom: 14,
  },
  tabsScroll: {
    gap: 8,
    paddingRight: 10,
  },
  categoryTab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
  },
  categoryTabActive: {
    backgroundColor: '#18A165',
    borderColor: '#18A165',
  },
  categoryTabText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#475569',
  },
  categoryTabTextActive: {
    color: '#FFFFFF',
  },
  tabCountPill: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  tabCountPillActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.28)',
  },
  tabCountText: {
    fontSize: 10,
    fontWeight: '900',
    color: '#475569',
  },
  tabCountTextActive: {
    color: '#FFFFFF',
  },
  listSection: {
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
    shadowColor: '#64748B',
    shadowOpacity: 0.05,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
    overflow: 'hidden',
  },
  itemCardImportant: {
    borderColor: '#FCD34D',
    borderLeftWidth: 3,
    borderLeftColor: '#F59E0B',
  },
  itemCardRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  itemIconBox: {
    width: 48,
    height: 48,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    flexShrink: 0,
  },
  itemContentCol: {
    flex: 1,
  },
  itemTitleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 8,
    marginBottom: 3,
  },
  categoryPill: {
    backgroundColor: '#EBF8F2',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  categoryPillText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#18A165',
    textTransform: 'uppercase',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  itemTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 17,
    flex: 1,
  },
  itemSummary: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 15,
    marginTop: 1,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F8FAFC',
  },
  itemFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flex: 1,
  },
  itemFooterText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  itemDateText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  emptyContainer: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 36,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 10,
  },
  emptyText: {
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
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    padding: 20,
    maxHeight: '85%',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingBottom: 12,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
    lineHeight: 20,
  },
  modalCloseIconBtn: {
    padding: 4,
  },
  modalBody: {
    maxHeight: Dimensions.get('window').height * 0.55,
    marginBottom: 12,
  },
  modalCoverImage: {
    width: '100%',
    height: 160,
    borderRadius: 14,
    marginBottom: 12,
  },
  modalMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 12,
  },
  modalMetaItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  modalMetaText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#18A165',
  },
  modalFullContent: {
    fontSize: 13,
    color: '#334155',
    lineHeight: 20,
    marginBottom: 14,
  },
  attachmentBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: 6,
  },
  attachmentBoxTitle: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 8,
  },
  attachmentItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
  },
  attachmentItemText: {
    fontSize: 11.5,
    color: '#18A165',
    fontWeight: '700',
  },
  modalCloseBtn: {
    backgroundColor: '#18A165',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
  },
  modalCloseBtnText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#FFFFFF',
  },
});
