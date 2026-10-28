import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Platform,
  Share,
  Clipboard,
  Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { offlineCache } from '../utils/offlineCache';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import AppFeedbackModal, { FeedbackType } from '../components/AppFeedbackModal';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

interface DoaItem {
  id: number;
  nama: string;
  grup?: string;
  ar?: string;
  tr?: string;
  idn?: string;
  tentang?: string;
  tag?: string[] | string;
}

const FAVORITES_STORAGE_KEY = 'doa_dzikir_favorite_ids';

export default function DoaDzikirScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 8);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const user = useAuthStore((state) => state.user);
  const userId = user?.id;

  // Pustaka Doa State
  const [doas, setDoas] = useState<DoaItem[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Digital Tasbih Counter State per Doa Item (id -> count)
  const [tasbihCounts, setTasbihCounts] = useState<Record<number, number>>({});

  // Doa Favorit
  const [favoriteIds, setFavoriteIds] = useState<number[]>([]);

  // Toast / Feedback Modal
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation);
    if (!handled) {
      if (navigation?.canGoBack()) {
        navigation.goBack();
      } else {
        navigation?.navigate('Beranda');
      }
    }
  };

  const DOA_CACHE_KEY = offlineCache.buildKey('doa_list', userId);

  // Muat Favorit
  useEffect(() => {
    void (async () => {
      try {
        const stored = await offlineCache.get<number[]>(FAVORITES_STORAGE_KEY);
        if (stored && Array.isArray(stored)) {
          setFavoriteIds(stored);
        }
      } catch {}
    })();
  }, []);

  // Muat Pustaka Doa
  const loadDoas = useCallback(async (search?: string, grup?: string) => {
    try {
      setError('');
      if (!search && (!grup || grup === 'all')) {
        const cached = await offlineCache.get<{ doas: DoaItem[]; categories: string[] }>(DOA_CACHE_KEY);
        if (cached?.doas && cached.doas.length > 0) {
          setDoas(cached.doas);
          if (cached.categories?.length > 0) setCategories(cached.categories);
        }
      }
      const targetGrup = grup && grup !== 'all' ? grup : undefined;
      const res = await mobileApiService.getDoaList({
        search: search || undefined,
        grup: targetGrup,
      });

      const list = unwrapApiData<DoaItem[]>(res) || (Array.isArray(res?.data) ? res.data : []);
      const freshDoas = Array.isArray(list) ? list : [];
      setDoas(freshDoas);

      const freshCategories = Array.isArray(res?.grup_options) && res.grup_options.length > 0 ? res.grup_options : [];
      if (freshCategories.length > 0) setCategories(freshCategories);

      if (!search && (!grup || grup === 'all') && freshDoas.length > 0) {
        void offlineCache.set(DOA_CACHE_KEY, { doas: freshDoas, categories: freshCategories });
      }
    } catch {
      if (doas.length === 0) {
        setError('Kumpulan doa & dzikir belum berhasil dimuat. Pastikan terhubung ke jaringan sekolah.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [DOA_CACHE_KEY, doas.length]);

  useEffect(() => {
    setLoading(true);
    void loadDoas(searchQuery.trim() || undefined, selectedCategory);
  }, [loadDoas, selectedCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDoas(searchQuery.trim() || undefined, selectedCategory);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setLoading(true);
    void loadDoas(undefined, selectedCategory);
  };

  const handleShare = async (doa: DoaItem) => {
    try {
      const shareMessage = `*${doa.nama}*\n\n${doa.ar || ''}\n\n_${doa.tr || ''}_\n\nArtinya:\n"${doa.idn || ''}"\n\n${doa.tentang ? `Sumber: ${doa.tentang}` : ''}\n\n— SIMSIT Mobile (Doa & Dzikir Harian)`;
      await Share.share({
        title: doa.nama,
        message: shareMessage,
      });
    } catch {}
  };

  const handleCopy = (doa: DoaItem) => {
    const textToCopy = `${doa.nama}\n\n${doa.ar || ''}\n\n${doa.tr || ''}\n\nArtinya:\n"${doa.idn || ''}"\n\nSumber: ${doa.tentang || 'Kumpulan Doa Ma\'tsurat'}`;
    Clipboard.setString(textToCopy);
    setFeedbackModal({
      visible: true,
      type: 'success',
      title: 'Doa Disalin ✨',
      message: 'Lafaz doa dan artinya telah disalin ke papan klip Anda.',
    });
  };

  const toggleFavorite = (id: number) => {
    setFavoriteIds((prev) => {
      const next = prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id];
      void offlineCache.set(FAVORITES_STORAGE_KEY, next);
      return next;
    });
  };

  const incrementTasbih = (id: number) => {
    setTasbihCounts((prev) => ({
      ...prev,
      [id]: (prev[id] || 0) + 1,
    }));
  };

  const resetTasbih = (id: number) => {
    setTasbihCounts((prev) => ({
      ...prev,
      [id]: 0,
    }));
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const filteredDoas = useMemo(() => {
    let result = doas;
    if (selectedCategory === 'favorit') {
      result = result.filter((d) => favoriteIds.includes(d.id));
    }

    if (!searchQuery.trim()) return result;
    const q = searchQuery.toLowerCase().trim();
    return result.filter(
      (d) =>
        d.nama.toLowerCase().includes(q) ||
        (d.idn && d.idn.toLowerCase().includes(q)) ||
        (d.tr && d.tr.toLowerCase().includes(q)) ||
        (d.grup && d.grup.toLowerCase().includes(q))
    );
  }, [doas, selectedCategory, favoriteIds, searchQuery]);

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH (IDENTIK HALAMAN MUTABA’AH & JADWAL) ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image
          source={PARENT_HOME_BG}
          style={styles.topFoliageBgImage}
          resizeMode="cover"
        />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN MUTABA’AH (TOMBOL KARTU PUTIH MINT GREEN SHADOW) ── */}
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
          Doa & Dzikir Harian
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.heroBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── BODY SCROLL CONTAINER ── */}
      <View style={styles.sheetContainer}>
        {/* 1. Group Card: Pustaka Doa Nabawi (Identik Mutabaah Tahfizh Group Card) */}
        <View style={styles.heroSectionWrap}>
          <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald]}>
            {/* Header Box di dalam Group Card */}
            <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowEmerald]}>
              <View style={styles.tahfizhGroupCardHeaderLeft}>
                <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxEmerald]}>
                  <MaterialCommunityIcons name="hands-pray" size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#064E3B' }]}>
                    Pustaka Doa & Dzikir Ma'tsurat
                  </Text>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#059669' }]}>
                    Doa harian & wirid sunnah dilengkapi tasbih counter
                  </Text>
                </View>
              </View>
              <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeEmerald]}>
                <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#047857' }]}>
                  {doas.length} Doa
                </Text>
              </View>
            </View>

            {/* Live Search Input Box */}
            <View style={styles.searchBarBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Cari doa (misal: tidur, makan, wudhu, safar)..."
                placeholderTextColor="#94A3B8"
                style={styles.searchInput}
                returnKeyType="search"
                clearButtonMode="while-editing"
              />
              {searchQuery.trim().length > 0 && (
                <TouchableOpacity
                  onPress={handleClearSearch}
                  hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                >
                  <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                </TouchableOpacity>
              )}
            </View>
          </View>
        </View>

        {/* 2. Category Chips Horizontal (Identik Capsule Tabs Mutabaah) */}
        <View style={styles.categorySection}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScrollTrack}
          >
            {/* Chip Semua Doa */}
            <TouchableOpacity
              style={[styles.categoryChip, selectedCategory === 'all' && styles.categoryChipActive]}
              onPress={() => setSelectedCategory('all')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="layers-outline"
                size={14}
                color={selectedCategory === 'all' ? '#FFFFFF' : '#047857'}
              />
              <Text style={[styles.categoryChipText, selectedCategory === 'all' && styles.categoryChipTextActive]}>
                Semua Doa ({doas.length})
              </Text>
            </TouchableOpacity>

            {/* Chip Favorit */}
            <TouchableOpacity
              style={[styles.categoryChip, selectedCategory === 'favorit' && styles.categoryChipActive]}
              onPress={() => setSelectedCategory('favorit')}
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons
                name="star"
                size={14}
                color={selectedCategory === 'favorit' ? '#FFFFFF' : '#D97706'}
              />
              <Text style={[styles.categoryChipText, selectedCategory === 'favorit' && styles.categoryChipTextActive]}>
                Favorit ({favoriteIds.length})
              </Text>
            </TouchableOpacity>

            {/* Kategori Dinamis */}
            {categories.map((cat, idx) => {
              const isActive = selectedCategory === cat;
              return (
                <TouchableOpacity
                  key={idx}
                  style={[styles.categoryChip, isActive && styles.categoryChipActive]}
                  onPress={() => setSelectedCategory(cat)}
                  activeOpacity={0.8}
                >
                  <MaterialCommunityIcons
                    name="book-open-outline"
                    size={13}
                    color={isActive ? '#FFFFFF' : '#047857'}
                  />
                  <Text numberOfLines={1} style={[styles.categoryChipText, isActive && styles.categoryChipTextActive]}>
                    {cat}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>

        {/* 3. Doa List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Memuat pustaka doa & dzikir...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void loadDoas(searchQuery, selectedCategory)}>
              <Text style={styles.retryBtnText}>Muat Ulang</Text>
            </TouchableOpacity>
          </View>
        ) : filteredDoas.length === 0 ? (
          <View style={styles.centerContainer}>
            <MaterialCommunityIcons name="hands-pray" size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Doa Tidak Ditemukan</Text>
            <Text style={styles.emptySubtitle}>
              {selectedCategory === 'favorit'
                ? 'Belum ada doa yang Anda tandai sebagai favorit. Klik ikon bintang pada doa untuk menambahkannya.'
                : 'Coba gunakan kata kunci pencarian atau pilih kategori lain.'}
            </Text>
          </View>
        ) : (
          <FlatList
            data={filteredDoas}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(bottomInset + 80, 100) }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
            showsVerticalScrollIndicator={false}
            renderItem={({ item, index }) => {
              const isFavorite = favoriteIds.includes(item.id);
              const count = tasbihCounts[item.id] || 0;

              return (
                <View style={styles.doaCard}>
                  {/* Card Header (Identik Agenda Item Header Mutabaah) */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => toggleExpand(item.id)}
                    style={styles.cardHeader}
                  >
                    <View style={styles.badgeIndex}>
                      <Text style={styles.badgeIndexText}>{index + 1}</Text>
                    </View>

                    <View style={styles.headerInfo}>
                      {Boolean(item.grup) && (
                        <View style={styles.grupBadge}>
                          <Text style={styles.grupBadgeText}>{item.grup}</Text>
                        </View>
                      )}
                      <Text style={styles.doaTitle}>{item.nama}</Text>
                    </View>

                    {/* Tombol Favorit & Share */}
                    <View style={styles.headerActions}>
                      <TouchableOpacity
                        onPress={() => toggleFavorite(item.id)}
                        style={styles.actionIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons
                          name={isFavorite ? 'star' : 'star-outline'}
                          size={19}
                          color={isFavorite ? '#D97706' : '#94A3B8'}
                        />
                      </TouchableOpacity>

                      <TouchableOpacity
                        onPress={() => handleShare(item)}
                        style={styles.actionIconBtn}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <MaterialCommunityIcons name="share-variant-outline" size={17} color="#059669" />
                      </TouchableOpacity>
                    </View>
                  </TouchableOpacity>

                  {/* Teks Arab Doa */}
                  {Boolean(item.ar) && (
                    <View style={styles.arabicBox}>
                      <Text style={styles.arabicText}>{item.ar}</Text>
                    </View>
                  )}

                  {/* Transliterasi Latin */}
                  {Boolean(item.tr) && (
                    <Text style={styles.latinText}>{item.tr}</Text>
                  )}

                  {/* Terjemahan Indonesia */}
                  {Boolean(item.idn) && (
                    <Text style={styles.indoText}>"{item.idn}"</Text>
                  )}

                  {/* Dalil / Sumber Riwayat */}
                  {Boolean(item.tentang) && (
                    <View style={styles.dalilRow}>
                      <MaterialCommunityIcons name="book-check-outline" size={13} color="#059669" />
                      <Text style={styles.dalilText}>Sumber: {item.tentang}</Text>
                    </View>
                  )}

                  {/* Interactive Digital Tasbih Counter & Action Bar */}
                  <View style={styles.cardFooterBar}>
                    <View style={styles.tasbihCounterGroup}>
                      <TouchableOpacity
                        activeOpacity={0.75}
                        onPress={() => incrementTasbih(item.id)}
                        style={styles.tasbihTapBtn}
                      >
                        <MaterialCommunityIcons name="counter" size={16} color="#FFFFFF" />
                        <Text style={styles.tasbihTapBtnText}>
                          Hitung Dzikir: <Text style={styles.tasbihCountVal}>{count}x</Text>
                        </Text>
                      </TouchableOpacity>

                      {count > 0 && (
                        <TouchableOpacity
                          onPress={() => resetTasbih(item.id)}
                          style={styles.tasbihResetBtn}
                          hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}
                        >
                          <MaterialCommunityIcons name="refresh" size={15} color="#64748B" />
                        </TouchableOpacity>
                      )}
                    </View>

                    <TouchableOpacity
                      activeOpacity={0.75}
                      onPress={() => handleCopy(item)}
                      style={styles.copyBtn}
                    >
                      <MaterialCommunityIcons name="content-copy" size={14} color="#059669" />
                      <Text style={styles.copyBtnText}>Salin</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              );
            }}
          />
        )}
      </View>

      {/* Feedback Modal Notifikasi */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type}
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
    zIndex: 0,
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    ...(StyleSheet.absoluteFill as any),
    opacity: 1,
  },
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 6,
    backgroundColor: 'transparent',
    zIndex: 10,
  },
  cleanHeaderIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 2,
  },
  cleanHeaderTitle: {
    fontSize: 18,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  heroBellDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  heroSectionWrap: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },
  // Tahfizh-style Hero KPI Group Card (Identik Mutabaah)
  tahfizhGroupCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 13,
    borderWidth: 1.5,
    marginBottom: 6,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  tahfizhGroupCardEmerald: {
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
  },
  tahfizhGroupCardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 10,
    paddingVertical: 9,
    marginBottom: 10,
    borderRadius: 13,
    borderWidth: 1,
  },
  tahfizhGroupCardHeaderRowEmerald: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  tahfizhGroupCardHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 9,
    flex: 1,
    marginRight: 8,
  },
  tahfizhGroupHeaderIconBox: {
    width: 28,
    height: 28,
    borderRadius: 9,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOffset: { width: 0, height: 1.5 },
    shadowOpacity: 0.25,
    shadowRadius: 3,
    elevation: 2,
  },
  tahfizhGroupHeaderIconBoxEmerald: {
    backgroundColor: '#059669',
    shadowColor: '#059669',
  },
  tahfizhGroupCardTitle: {
    fontSize: 13,
    fontWeight: '800',
    lineHeight: 18,
    letterSpacing: -0.2,
  },
  tahfizhGroupCardSub: {
    fontSize: 10.5,
    fontWeight: '600',
    lineHeight: 14,
    marginTop: 2,
  },
  tahfizhGroupActionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
    borderWidth: 1,
    flexShrink: 0,
  },
  tahfizhGroupActionBadgeEmerald: {
    backgroundColor: '#FFFFFF',
    borderColor: '#A7F3D0',
  },
  tahfizhGroupActionBadgeText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 13,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 11,
    paddingVertical: Platform.OS === 'ios' ? 9 : 5,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
    padding: 0,
  },
  categorySection: {
    paddingVertical: 8,
  },
  categoryScrollTrack: {
    paddingHorizontal: 16,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 5,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 1,
  },
  categoryChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  categoryChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  // Agenda Item Card (Identik Mutabaah)
  doaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 14,
    marginBottom: 8,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 10,
  },
  badgeIndex: {
    width: 32,
    height: 32,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  badgeIndexText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#059669',
  },
  headerInfo: {
    flex: 1,
  },
  grupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 3,
  },
  grupBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#047857',
    textTransform: 'uppercase',
  },
  doaTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 19,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  actionIconBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arabicBox: {
    backgroundColor: '#F0FDF4',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#DCFCE7',
    padding: 13,
    marginBottom: 10,
  },
  arabicText: {
    fontSize: 21,
    fontWeight: 'bold',
    color: '#065F46',
    textAlign: 'right',
    lineHeight: 36,
    letterSpacing: 0.5,
  },
  latinText: {
    fontSize: 12,
    color: '#0D9488',
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 6,
  },
  indoText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
    marginBottom: 8,
  },
  dalilRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#F8FAFC',
    alignSelf: 'flex-start',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginBottom: 10,
  },
  dalilText: {
    fontSize: 10,
    fontWeight: '600',
    color: '#059669',
  },
  cardFooterBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 8,
  },
  tasbihCounterGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  tasbihTapBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 11,
    paddingVertical: 5.5,
    borderRadius: 10,
    gap: 5,
  },
  tasbihTapBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tasbihCountVal: {
    fontWeight: '900',
    color: '#FEF08A',
  },
  tasbihResetBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 10,
    gap: 4,
  },
  copyBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#059669',
    marginTop: 12,
  },
  errorText: {
    fontSize: 13,
    color: '#DC2626',
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 18,
  },
  retryBtn: {
    marginTop: 14,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
  },
  retryBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#059669',
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 12,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
});
