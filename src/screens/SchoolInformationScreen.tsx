import React, { useCallback, useEffect, useRef, useState } from 'react';
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
type InfoItem = Record<string, any>;

export default function SchoolInformationScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const user = useAuthStore((state) => state.user);
  const isParent = isParentRole(user?.roles || []);

  const [children, setChildren] = useState<Child[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [studentInfo, setStudentInfo] = useState<any>(null);
  const studentScrollRef = useRef<ScrollView>(null);

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

  // 1. Load Children if parent
  useEffect(() => {
    let isMounted = true;
    if (isParent) {
      mobileApiService.getPortalChildren()
        .then((res) => {
          const arr = unwrapApiData<Child[]>(res) || [];
          if (isMounted) {
            setChildren(arr);
            if (!selectedChildId && arr.length > 0) {
              setSelectedChildId(String(arr[0].id));
            }
          }
        })
        .catch(() => {});
    }
    return () => {
      isMounted = false;
    };
  }, [isParent]);

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
      setTotalItems(data?.total || list.length);
      setPage(targetPage);
      if (res?.student || data?.student) {
        setStudentInfo(res?.student || data?.student);
      }
    } catch {
      setItems([]);
    }
  }, [selectedChildId, selectedTab, searchQuery, showBookmarkedOnly]);

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
                          <Image
                            source={{ uri: avatarUri }}
                            style={styles.childAvatarImgHero}
                            resizeMode="cover"
                          />
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

                      {/* Bottom Info Bar inside Card (Matching Hero Card Action Bar layout & height) */}
                      <View style={[styles.childCardBottomBar, isSelected && styles.childCardBottomBarActive]}>
                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons
                            name="school-outline"
                            size={12}
                            color={isSelected ? '#FFFFFF' : '#18A165'}
                          />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {unitTitle}
                          </Text>
                        </View>

                        <View style={[styles.childInfoPill, isSelected && styles.childInfoPillActive]}>
                          <MaterialCommunityIcons
                            name="badge-account-outline"
                            size={12}
                            color={isSelected ? '#FFFFFF' : '#18A165'}
                          />
                          <Text numberOfLines={1} style={[styles.childInfoPillText, isSelected && styles.childTextActive]}>
                            {child.nis ? `NIS: ${child.nis}` : 'Terdaftar Aktif'}
                          </Text>
                        </View>
                      </View>
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
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.childAvatarImgHero}
                          resizeMode="cover"
                        />
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
                          {studentClass ? `${studentClass} · ${studentUnit}` : (studentUnit || 'Siswa Terdaftar')}
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          {s.nis ? `NIS: ${s.nis} · ` : ''}Informasi & Pengumuman Sekolah
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
                const userName = String(user?.name || user?.full_name || user?.nama_lengkap || 'Pengguna');
                const userRole = typeof user?.role === 'string' ? user.role : (Array.isArray(user?.roles) && user.roles[0] ? String(user.roles[0]) : 'Siswa');
                const avatarUri =
                  getProfileImageUrl(user) ||
                  `https://ui-avatars.com/api/?name=${encodeURIComponent(userName)}&background=FFFFFF&color=18A165&bold=true&size=128`;

                return (
                  <View style={[styles.childCardHeroSize, styles.childCardHeroSizeActive]}>
                    <View style={styles.childHeroTopRow}>
                      <View style={[styles.avatarBorderWrapHero, styles.avatarBorderWrapHeroActive]}>
                        <Image
                          source={{ uri: avatarUri }}
                          style={styles.childAvatarImgHero}
                          resizeMode="cover"
                        />
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
                          Portal Terpadu Mahad Abu Ja'far
                        </Text>
                        <Text style={[styles.childSubInfoHero, styles.childSubInfoHeroActive]}>
                          Informasi & Pengumuman Sekolah
                        </Text>
                      </View>
                    </View>

                    <View style={[styles.childCardBottomBar, styles.childCardBottomBarActive]}>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="school-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          Mahad Abu Ja'far
                        </Text>
                      </View>
                      <View style={[styles.childInfoPill, styles.childInfoPillActive]}>
                        <MaterialCommunityIcons name="badge-account-outline" size={12} color="#FFFFFF" />
                        <Text style={[styles.childInfoPillText, styles.childTextActive]}>
                          Akun Terverifikasi
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })()}
            </View>
          ) : null}

          {/* 2. CONTAINER INFORMASI & PENGUMUMAN SEKOLAH */}
          <View style={styles.containerBlock}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="bullhorn-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>Informasi & Pengumuman Sekolah</Text>
            </View>

            <View style={styles.heroCard}>
            <View style={styles.heroHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.heroTitle}>Informasi & Pengumuman Sekolah</Text>
                <Text style={styles.heroSubtitle}>
                  Pengumuman, agenda, berita, dan surat edaran disesuaikan untuk unit sekolah siswa.
                </Text>
              </View>
            </View>

            {/* Quick Action Badges Bar */}
            <View style={styles.actionBar}>
              <TouchableOpacity
                activeOpacity={0.75}
                onPress={() => setShowBookmarkedOnly(!showBookmarkedOnly)}
                style={[styles.actionBtn, showBookmarkedOnly && styles.actionBtnActive]}
              >
                <MaterialCommunityIcons
                  name={showBookmarkedOnly ? 'bookmark' : 'bookmark-outline'}
                  size={16}
                  color={showBookmarkedOnly ? '#FFFFFF' : '#18A165'}
                />
                <Text style={[styles.actionBtnText, showBookmarkedOnly && styles.actionBtnTextActive]}>
                  Tersimpan ({bookmarkedCount})
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.75}
                onPress={handleMarkAllRead}
                style={styles.actionBtn}
              >
                <MaterialCommunityIcons name="check-all" size={16} color="#18A165" />
                <Text style={styles.actionBtnText}>Tandai Dibaca</Text>
              </TouchableOpacity>

              {unreadCount > 0 && (
                <View style={styles.unreadBadge}>
                  <Text style={styles.unreadBadgeText}>{unreadCount} baru</Text>
                </View>
              )}
            </View>
          </View>
          </View>

          {/* 3. INFORMASI PENTING UNIT (SEKOLAH) */}
          {importantItems.length > 0 && !showBookmarkedOnly && !searchQuery && (
            <View style={styles.importantSection}>
              <View style={styles.sectionHeaderRow}>
                <MaterialCommunityIcons name="alert-decagram" size={18} color="#D97706" />
                <Text style={styles.sectionTitle}>Informasi Penting Unit (Sekolah)</Text>
              </View>

              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.importantScroll}
              >
                {importantItems.map((item, idx) => (
                  <TouchableOpacity
                    key={item.id || idx}
                    activeOpacity={0.85}
                    onPress={() => handleOpenDetail(item)}
                    style={styles.importantCard}
                  >
                    <View style={styles.importantCardHeader}>
                      <View style={styles.priorityBadge}>
                        <Text style={styles.priorityBadgeText}>penting</Text>
                      </View>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleToggleBookmark(item)}
                        style={styles.cardBookmarkBtn}
                      >
                        <MaterialCommunityIcons
                          name={item.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                          size={18}
                          color={item.is_bookmarked ? '#18A165' : '#94A3B8'}
                        />
                      </TouchableOpacity>
                    </View>

                    <Text numberOfLines={2} style={styles.importantTitle}>
                      {item.title}
                    </Text>

                    <Text numberOfLines={3} style={styles.importantSummary}>
                      {item.summary || item.content || ''}
                    </Text>

                    <View style={styles.importantFooter}>
                      <MaterialCommunityIcons name="shield-check" size={12} color="#18A165" />
                      <Text numberOfLines={1} style={styles.importantFooterText}>
                        {item.education_unit || 'Seluruh Yayasan'} ·{' '}
                        {item.published_at ? new Date(item.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Terbaru'}
                      </Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </ScrollView>
            </View>
          )}

          {/* 4. SEARCH BAR & FILTER CONTROLS */}
          <View style={styles.searchSection}>
            <Text style={styles.searchLabel}>Cari informasi</Text>
            <View style={styles.searchBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#94A3B8" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Cari pengumuman, agenda, berita, atau surat edaran..."
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
                returnKeyType="search"
              />
              {searchQuery.length > 0 && (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>

            <View style={styles.filterActionRow}>
              <View style={styles.filterTag}>
                <MaterialCommunityIcons name="filter-variant" size={14} color="#18A165" />
                <Text style={styles.filterTagText}>
                  Filter: {categoryTabs.find((t) => t.key === selectedTab)?.label}
                </Text>
              </View>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={handleResetFilter}
                style={styles.resetBtn}
              >
                <MaterialCommunityIcons name="refresh" size={14} color="#64748B" />
                <Text style={styles.resetBtnText}>Reset</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* 5. CATEGORY TABS WITH LIVE COUNTS */}
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
                    <View style={[styles.tabCountPill, isActive && styles.tabCountPillActive]}>
                      <Text style={[styles.tabCountText, isActive && styles.tabCountTextActive]}>
                        {tab.count}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 6. INFORMATION ITEMS LIST */}
          <View style={styles.listSection}>
            <View style={styles.sectionHeaderRow}>
              <MaterialCommunityIcons name="newspaper-variant-outline" size={18} color="#18A165" />
              <Text style={styles.sectionTitle}>
                Daftar Informasi & Pengumuman ({items.length})
              </Text>
            </View>
            {loading ? (
              <ActivityIndicator color="#18A165" style={{ marginVertical: 36 }} />
            ) : items.length > 0 ? (
              items.map((item, idx) => {
                const isImportant = item.priority === 'penting' || item.priority === 'mendesak';
                return (
                  <TouchableOpacity
                    key={item.id || idx}
                    activeOpacity={0.85}
                    onPress={() => handleOpenDetail(item)}
                    style={[styles.itemCard, isImportant && styles.itemCardImportant]}
                  >
                    <View style={styles.itemCardHeader}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        {isImportant && (
                          <View style={styles.priorityBadge}>
                            <Text style={styles.priorityBadgeText}>penting</Text>
                          </View>
                        )}
                        <View style={styles.categoryPill}>
                          <Text style={styles.categoryPillText}>
                            {item.category || item.type || 'Pengumuman'}
                          </Text>
                        </View>
                      </View>

                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                        {!item.is_read && <View style={styles.unreadDot} />}
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleToggleBookmark(item)}
                        >
                          <MaterialCommunityIcons
                            name={item.is_bookmarked ? 'bookmark' : 'bookmark-outline'}
                            size={18}
                            color={item.is_bookmarked ? '#18A165' : '#94A3B8'}
                          />
                        </TouchableOpacity>
                      </View>
                    </View>

                    <Text style={styles.itemTitle}>{item.title}</Text>

                    <Text numberOfLines={3} style={styles.itemSummary}>
                      {item.summary || item.content || ''}
                    </Text>

                    <View style={styles.itemFooter}>
                      <View style={styles.itemFooterLeft}>
                        <MaterialCommunityIcons name="domain" size={13} color="#64748B" />
                        <Text numberOfLines={1} style={styles.itemFooterText}>
                          {item.education_unit || 'Seluruh Yayasan'}
                        </Text>
                      </View>
                      <Text style={styles.itemDateText}>
                        {item.published_at ? new Date(item.published_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Terbaru'}
                      </Text>
                    </View>
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
      >
        <View style={styles.modalOverlay}>
          <View style={[styles.modalContent, { paddingBottom: bottomInset + 12 }]}>
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
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
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
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === 'android' ? 4 : 8,
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
    borderRadius: 16,
    padding: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#64748B',
    shadowOpacity: 0.06,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  itemCardImportant: {
    borderColor: '#FCD34D',
  },
  itemCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
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
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 6,
  },
  itemSummary: {
    fontSize: 11.5,
    color: '#475569',
    lineHeight: 16,
    marginBottom: 10,
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
