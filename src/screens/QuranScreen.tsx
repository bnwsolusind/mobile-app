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
  Modal,
  ScrollView,
  Platform,
  Dimensions,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SurahItem {
  id?: number;
  nomor: number;
  nama: string;
  nama_latin: string;
  jumlah_ayat: number;
  tempat_turun: string;
  arti: string;
  deskripsi?: string;
  audio_full?: string;
}

interface AyahItem {
  nomorAyat?: number;
  nomor_ayat?: number;
  teksArab?: string;
  teks_arab?: string;
  teksLatin?: string;
  teks_latin?: string;
  teksIndonesia?: string;
  teks_indonesia?: string;
  [key: string]: any;
}

export default function QuranScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTempat, setFilterTempat] = useState<'all' | 'mekah' | 'madinah'>('all');

  // Reading Modal state
  const [selectedSurah, setSelectedSurah] = useState<SurahItem | null>(null);
  const [ayahs, setAyahs] = useState<AyahItem[]>([]);
  const [readingLoading, setReadingLoading] = useState<boolean>(false);
  const [readingError, setReadingError] = useState<string>('');

  const loadSurahs = useCallback(async (search?: string, tempat?: string) => {
    try {
      setError('');
      const targetTempat = tempat && tempat !== 'all' ? tempat : undefined;
      const res = await mobileApiService.getQuranSurahs(search, targetTempat);
      const list = unwrapApiData<SurahItem[]>(res) || (Array.isArray(res?.data) ? res.data : []);
      setSurahs(Array.isArray(list) ? list : []);
    } catch {
      setError('Daftar surah belum berhasil dimuat. Pastikan terhubung ke jaringan sekolah.');
      setSurahs([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    setLoading(true);
    void loadSurahs(searchQuery.trim() || undefined, filterTempat);
  }, [loadSurahs, filterTempat]);

  const onRefresh = async () => {
    setRefreshing(true);
    await loadSurahs(searchQuery.trim() || undefined, filterTempat);
  };

  const handleSearchSubmit = () => {
    setLoading(true);
    void loadSurahs(searchQuery.trim() || undefined, filterTempat);
  };

  const handleClearSearch = () => {
    setSearchQuery('');
    setLoading(true);
    void loadSurahs(undefined, filterTempat);
  };

  // Open Reading Modal
  const openSurahDetail = async (surah: SurahItem) => {
    setSelectedSurah(surah);
    setAyahs([]);
    setReadingLoading(true);
    setReadingError('');
    try {
      const res = await mobileApiService.getQuranSurahDetail(surah.nomor);
      const ayahsList = res?.ayat || res?.data?.ayat || [];
      setAyahs(Array.isArray(ayahsList) ? ayahsList : []);
    } catch {
      setReadingError('Ayat-ayat surah belum berhasil dimuat.');
    } finally {
      setReadingLoading(false);
    }
  };

  const closeReadingModal = () => {
    setSelectedSurah(null);
    setAyahs([]);
  };

  const filteredList = useMemo(() => {
    if (!searchQuery.trim()) return surahs;
    const q = searchQuery.toLowerCase().trim();
    return surahs.filter(
      (s) =>
        s.nama_latin.toLowerCase().includes(q) ||
        s.arti.toLowerCase().includes(q) ||
        String(s.nomor).includes(q)
    );
  }, [surahs, searchQuery]);

  return (
    <View style={styles.container}>
      {/* Search Bar & Filter Strip */}
      <View style={styles.searchSection}>
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={22} color="#059669" />
          <TextInput
            placeholder="Cari surah (misal: Al-Fatihah, 1, Pembukaan)..."
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

        {/* Filter Pills */}
        <View style={styles.filterRow}>
          <TouchableOpacity
            style={[styles.filterChip, filterTempat === 'all' && styles.filterChipActive]}
            onPress={() => setFilterTempat('all')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filterTempat === 'all' && styles.filterChipTextActive]}>
              Semua (114)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterTempat === 'mekah' && styles.filterChipActive]}
            onPress={() => setFilterTempat('mekah')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filterTempat === 'mekah' && styles.filterChipTextActive]}>
              Makkiyah
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterTempat === 'madinah' && styles.filterChipActive]}
            onPress={() => setFilterTempat('madinah')}
            activeOpacity={0.8}
          >
            <Text style={[styles.filterChipText, filterTempat === 'madinah' && styles.filterChipTextActive]}>
              Madaniyah
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Surah List */}
      {loading ? (
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Memuat lembaran Al-Qur'an...</Text>
        </View>
      ) : error ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity style={styles.retryBtn} onPress={() => void loadSurahs(searchQuery, filterTempat)}>
            <Text style={styles.retryBtnText}>Coba Lagi</Text>
          </TouchableOpacity>
        </View>
      ) : filteredList.length === 0 ? (
        <View style={styles.centerContainer}>
          <MaterialCommunityIcons name="book-open-outline" size={48} color="#94A3B8" />
          <Text style={styles.emptyTitle}>Surah tidak ditemukan</Text>
          <Text style={styles.emptySubtitle}>Coba gunakan kata kunci pencarian yang lain.</Text>
        </View>
      ) : (
        <FlatList
          data={filteredList}
          keyExtractor={(item) => String(item.nomor)}
          contentContainerStyle={[styles.listContent, { paddingBottom: insets.bottom + 80 }]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#059669" />}
          showsVerticalScrollIndicator={false}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={styles.surahCard}
              activeOpacity={0.78}
              onPress={() => openSurahDetail(item)}
            >
              {/* Nomor Badge */}
              <View style={styles.nomorBadge}>
                <Text style={styles.nomorBadgeText}>{item.nomor}</Text>
              </View>

              {/* Info Surah */}
              <View style={styles.surahInfo}>
                <View style={styles.surahHeaderRow}>
                  <Text style={styles.namaLatin}>{item.nama_latin}</Text>
                  <View style={styles.tempatBadge}>
                    <Text style={styles.tempatBadgeText}>
                      {item.tempat_turun?.toLowerCase() === 'mekah' ? 'Makkiyah' : 'Madaniyah'}
                    </Text>
                  </View>
                </View>
                <Text style={styles.artiText}>
                  {item.arti} · <Text style={styles.ayatCountText}>{item.jumlah_ayat} Ayat</Text>
                </Text>
              </View>

              {/* Teks Arab Nama Surah */}
              <View style={styles.surahArabicCol}>
                <Text style={styles.namaArab}>{item.nama}</Text>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#94A3B8" />
              </View>
            </TouchableOpacity>
          )}
        />
      )}

      {/* MODAL BACA SURAH & RINCIAN AYAT */}
      <Modal
        visible={Boolean(selectedSurah)}
        animationType="slide"
        transparent={false}
        onRequestClose={closeReadingModal}
      >
        <View style={styles.modalRoot}>
          {/* Header Modal */}
          <LinearGradient
            colors={['#0D6B42', '#18A165', '#2BD988']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={[styles.modalHeader, { paddingTop: Math.max(insets.top, 24) + 6 }]}
          >
            <TouchableOpacity
              onPress={closeReadingModal}
              style={styles.modalHeaderBackBtn}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <MaterialCommunityIcons name="arrow-left" size={22} color="#18A165" />
            </TouchableOpacity>

            <View style={styles.modalHeaderTitleBox}>
              <Text numberOfLines={1} style={styles.modalHeaderTitle}>
                Surah {selectedSurah?.nama_latin}
              </Text>
              <Text style={styles.modalHeaderSub}>
                {selectedSurah?.arti} • {selectedSurah?.jumlah_ayat} Ayat • {selectedSurah?.tempat_turun}
              </Text>
            </View>

            <View style={{ width: 38 }} />
          </LinearGradient>

          {/* Body Modal: Ayat-Ayat */}
          {readingLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Memuat rincian ayat...</Text>
            </View>
          ) : readingError ? (
            <View style={styles.centerContainer}>
              <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
              <Text style={styles.errorText}>{readingError}</Text>
              <TouchableOpacity
                style={styles.retryBtn}
                onPress={() => selectedSurah && openSurahDetail(selectedSurah)}
              >
                <Text style={styles.retryBtnText}>Muat Ulang</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <ScrollView
              style={styles.modalScroll}
              contentContainerStyle={[styles.modalScrollContent, { paddingBottom: insets.bottom + 40 }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Bismillah Banner (Kecuali Surah At-Taubah no 9) */}
              {selectedSurah?.nomor !== 9 && (
                <View style={styles.bismillahCard}>
                  <Text style={styles.bismillahArab}>بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ</Text>
                  <Text style={styles.bismillahArti}>
                    "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang"
                  </Text>
                </View>
              )}

              {/* Rincian Ayat */}
              {ayahs.map((ayah, index) => {
                const ayahNumber = ayah.nomorAyat || ayah.nomor_ayat || index + 1;
                const arabText = ayah.teksArab || ayah.teks_arab || '';
                const latinText = ayah.teksLatin || ayah.teks_latin || '';
                const indoText = ayah.teksIndonesia || ayah.teks_indonesia || '';

                return (
                  <View key={index} style={styles.ayahCard}>
                    {/* Header Baris Ayat */}
                    <View style={styles.ayahHeaderRow}>
                      <View style={styles.ayahNumberBadge}>
                        <Text style={styles.ayahNumberText}>{ayahNumber}</Text>
                      </View>
                      <View style={styles.ayahSurahTag}>
                        <Text style={styles.ayahSurahTagText}>
                          {selectedSurah?.nama_latin}:{ayahNumber}
                        </Text>
                      </View>
                    </View>

                    {/* Teks Arab */}
                    <Text style={styles.ayahArabText}>{arabText}</Text>

                    {/* Transliterasi Latin */}
                    {Boolean(latinText) && (
                      <Text style={styles.ayahLatinText}>{latinText}</Text>
                    )}

                    {/* Terjemahan Indonesia */}
                    {Boolean(indoText) && (
                      <Text style={styles.ayahIndoText}>{indoText}</Text>
                    )}
                  </View>
                );
              })}
            </ScrollView>
          )}
        </View>
      </Modal>
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
    paddingHorizontal: 16,
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
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '500',
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#DEF7EC',
    borderColor: '#10B981',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#059669',
    fontWeight: '800',
  },
  listContent: {
    padding: 16,
    gap: 10,
  },
  surahCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
    gap: 12,
  },
  nomorBadge: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nomorBadgeText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  surahInfo: {
    flex: 1,
  },
  surahHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 3,
  },
  namaLatin: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  tempatBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  tempatBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  artiText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '500',
  },
  ayatCountText: {
    color: '#059669',
    fontWeight: '700',
  },
  surahArabicCol: {
    alignItems: 'flex-end',
    flexDirection: 'row',
    gap: 6,
  },
  namaArab: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#047857',
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
    backgroundColor: '#059669',
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

  // Modal Styles
  modalRoot: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 14,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  modalHeaderBackBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  modalHeaderTitleBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  modalHeaderSub: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    padding: 16,
    gap: 14,
  },
  bismillahCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 20,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
    marginBottom: 6,
  },
  bismillahArab: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#064E3B',
    marginBottom: 8,
    textAlign: 'center',
  },
  bismillahArti: {
    fontSize: 11.5,
    color: '#047857',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  ayahCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 2,
  },
  ayahHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 6,
    marginBottom: 14,
  },
  ayahNumberBadge: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ayahNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  ayahSurahTag: {
    backgroundColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  ayahSurahTagText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
  },
  ayahArabText: {
    fontSize: 24,
    lineHeight: 46,
    textAlign: 'right',
    color: '#0F172A',
    fontWeight: '600',
    marginBottom: 14,
  },
  ayahLatinText: {
    fontSize: 12.5,
    color: '#047857',
    fontWeight: '600',
    marginBottom: 8,
    lineHeight: 18,
  },
  ayahIndoText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
});
