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
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { offlineCache } from '../utils/offlineCache';

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

export default function DoaDzikirScreen() {
  const insets = useSafeAreaInsets();
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

  const DOA_CACHE_KEY = offlineCache.buildKey('doa_list', userId);

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
      setError('Kumpulan doa & dzikir belum berhasil dimuat. Pastikan terhubung ke jaringan sekolah.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [DOA_CACHE_KEY]);

  useEffect(() => {
    setLoading(true);
    void loadDoas(searchQuery.trim() || undefined, selectedCategory);
  }, [loadDoas, selectedCategory]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadDoas(searchQuery.trim() || undefined, selectedCategory);
    setRefreshing(false);
  };

  const handleSearchSubmit = () => {
    setLoading(true);
    void loadDoas(searchQuery.trim() || undefined, selectedCategory);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setLoading(true);
    void loadDoas(undefined, selectedCategory);
  };

  const handleShare = async (doa: DoaItem) => {
    try {
      const shareMessage = `*${doa.nama}*\n\n${doa.ar || ''}\n\n_${doa.tr || ''}_\n\nArtinya:\n"${doa.idn || ''}"\n\n${doa.tentang ? `Sumber: ${doa.tentang}` : ''}\n\n— SIMSIT Mobile`;
      await Share.share({
        title: doa.nama,
        message: shareMessage,
      });
    } catch {
      // Ignored
    }
  };

  const toggleExpand = (id: number) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const filteredDoas = useMemo(() => {
    if (!searchQuery.trim()) return doas;
    const q = searchQuery.toLowerCase().trim();
    return doas.filter(
      (d) =>
        d.nama.toLowerCase().includes(q) ||
        (d.idn && d.idn.toLowerCase().includes(q)) ||
        (d.tr && d.tr.toLowerCase().includes(q)) ||
        (d.grup && d.grup.toLowerCase().includes(q))
    );
  }, [doas, searchQuery]);

  return (
    <View style={styles.container}>
      {/* Search Bar */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={22} color="#0D9488" />
          <TextInput
            placeholder="Cari doa (misal: tidur, makan, belajar, perlindungan)..."
            placeholderTextColor="#94A3B8"
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            onSubmitEditing={handleSearchSubmit}
            returnKeyType="search"
          />
          {searchQuery.length > 0 && (
            <TouchableOpacity onPress={handleClearSearch} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* Horizontal Category Group Scroll */}
        {categories.length > 0 && (
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.categoryScrollTrack}
          >
            <TouchableOpacity
              style={[styles.categoryChip, selectedCategory === 'all' && styles.categoryChipActive]}
              onPress={() => setSelectedCategory('all')}
              activeOpacity={0.8}
            >
              <Text style={[styles.categoryChipText, selectedCategory === 'all' && styles.categoryChipTextActive]}>
                Semua Doa ({doas.length})
              </Text>
            </TouchableOpacity>

            {categories.map((cat, idx) => (
              <TouchableOpacity
                key={idx}
                style={[styles.categoryChip, selectedCategory === cat && styles.categoryChipActive]}
                onPress={() => setSelectedCategory(cat)}
                activeOpacity={0.8}
              >
                <Text
                  numberOfLines={1}
                  style={[styles.categoryChipText, selectedCategory === cat && styles.categoryChipTextActive]}
                >
                  {cat}
                </Text>
              </TouchableOpacity>
            ))}
          </ScrollView>
        )}
      </View>

      {/* Doa List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#0D9488" />
          <Text style={styles.loadingText}>Memuat kumpulan doa & dzikir...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void loadDoas(searchQuery, selectedCategory)}>
            <Text style={styles.retryBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : filteredDoas.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="hands-pray" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Doa tidak ditemukan</Text>
          <Text style={styles.emptySubtitle}>Coba gunakan kata kunci pencarian atau kategori lain.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredDoas}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#0D9488" />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item, index }) => {
            return (
              <View style={styles.doaCard}>
                {/* Header Card */}
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

                  <TouchableOpacity
                    onPress={() => handleShare(item)}
                    style={styles.shareIconBtn}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="share-variant-outline" size={19} color="#0D9488" />
                  </TouchableOpacity>
                </TouchableOpacity>

                {/* Arabic Text */}
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

                {/* Riwayat Sumber / Catatan */}
                {Boolean(item.tentang) && (
                  <View style={styles.sourceRow}>
                    <MaterialCommunityIcons name="book-check-outline" size={14} color="#0D9488" />
                    <Text style={styles.sourceText}>{item.tentang}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  searchSection: {
    backgroundColor: '#FFFFFF',
    paddingTop: 12,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 2,
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    marginHorizontal: 16,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
    padding: 0,
  },
  categoryScrollTrack: {
    paddingHorizontal: 16,
    gap: 8,
    marginTop: 10,
  },
  categoryChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  categoryChipActive: {
    backgroundColor: '#E6FFFA',
    borderColor: '#0D9488',
  },
  categoryChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  categoryChipTextActive: {
    color: '#0D9488',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    gap: 14,
  },
  doaCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    marginBottom: 12,
  },
  badgeIndex: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#E6FFFA',
    borderWidth: 1,
    borderColor: '#99F6E4',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  badgeIndexText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0D9488',
  },
  headerInfo: {
    flex: 1,
  },
  grupBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDFA',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    borderWidth: 0.8,
    borderColor: '#CCFBF1',
    marginBottom: 4,
  },
  grupBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0D9488',
  },
  doaTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
  },
  shareIconBtn: {
    width: 32,
    height: 32,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    alignItems: 'center',
    justifyContent: 'center',
  },
  arabicBox: {
    backgroundColor: '#FAFDFB',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E6FFFA',
    marginBottom: 12,
  },
  arabicText: {
    fontSize: 22,
    lineHeight: 42,
    textAlign: 'right',
    color: '#064E3B',
    fontWeight: '600',
  },
  latinText: {
    fontSize: 12.5,
    color: '#0D9488',
    fontWeight: '600',
    lineHeight: 18,
    marginBottom: 8,
  },
  indoText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
    fontStyle: 'italic',
    marginBottom: 10,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  sourceText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  centerContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
  },
  errorText: {
    fontSize: 13,
    color: '#EF4444',
    textAlign: 'center',
    fontWeight: '600',
    lineHeight: 18,
  },
  retryBtn: {
    backgroundColor: '#0D9488',
    paddingHorizontal: 18,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 6,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#334155',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
});
