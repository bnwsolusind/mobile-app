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
  Share,
  Image,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { offlineCache } from '../utils/offlineCache';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

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

interface LastReadRecord {
  surahNumber: number;
  surahName: string;
  ayahNumber?: number;
  timestamp: number;
}

const LAST_READ_KEY = 'quran_last_read_tracker';

export default function QuranScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 8);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const [surahs, setSurahs] = useState<SurahItem[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [filterTempat, setFilterTempat] = useState<'all' | 'mekah' | 'madinah'>('all');
  const [lastRead, setLastRead] = useState<LastReadRecord | null>(null);

  // Reading Modal state
  const [selectedSurah, setSelectedSurah] = useState<SurahItem | null>(null);
  const [ayahs, setAyahs] = useState<AyahItem[]>([]);
  const [readingLoading, setReadingLoading] = useState<boolean>(false);
  const [readingError, setReadingError] = useState<string>('');
  const [arabicFontSize, setArabicFontSize] = useState<number>(26);
  const [showTranslation, setShowTranslation] = useState<boolean>(true);
  const [showLatin, setShowLatin] = useState<boolean>(true);

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

  // Muat Last Read dari cache
  useEffect(() => {
    void (async () => {
      try {
        const stored = await offlineCache.get<LastReadRecord>(LAST_READ_KEY);
        if (stored) {
          setLastRead(stored);
        }
      } catch {}
    })();
  }, []);

  const loadSurahs = useCallback(async (search?: string, tempat?: string) => {
    try {
      setError('');
      const targetTempat = tempat && tempat !== 'all' ? tempat : undefined;
      const res = await mobileApiService.getQuranSurahs(search, targetTempat);
      const list = unwrapApiData<SurahItem[]>(res) || (Array.isArray(res?.data) ? res.data : []);
      const finalList = Array.isArray(list) ? list : [];
      setSurahs(finalList);

      if (!search && (!tempat || tempat === 'all') && finalList.length > 0) {
        void offlineCache.set('quran_surah_list_cache', finalList);
      }
    } catch {
      const cached = await offlineCache.get<SurahItem[]>('quran_surah_list_cache');
      if (cached && Array.isArray(cached) && cached.length > 0) {
        setSurahs(cached);
      } else {
        setError('Daftar surah belum berhasil dimuat. Pastikan terhubung ke jaringan sekolah.');
        setSurahs([]);
      }
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

  const handleClearSearch = () => {
    setSearchQuery('');
    setLoading(true);
    void loadSurahs(undefined, filterTempat);
  };

  const openSurahDetail = async (surah: SurahItem, targetAyah?: number) => {
    setSelectedSurah(surah);
    setAyahs([]);
    setReadingLoading(true);
    setReadingError('');

    const newRecord: LastReadRecord = {
      surahNumber: surah.nomor,
      surahName: surah.nama_latin,
      ayahNumber: targetAyah || 1,
      timestamp: Date.now(),
    };
    setLastRead(newRecord);
    void offlineCache.set(LAST_READ_KEY, newRecord);

    const cacheKey = `quran_surah_detail_${surah.nomor}`;
    try {
      const cachedAyahs = await offlineCache.get<AyahItem[]>(cacheKey);
      if (cachedAyahs && Array.isArray(cachedAyahs) && cachedAyahs.length > 0) {
        setAyahs(cachedAyahs);
        setReadingLoading(false);
      }

      const res = await mobileApiService.getQuranSurahDetail(surah.nomor);
      const ayahsList = res?.ayat || res?.data?.ayat || [];
      const freshAyahs = Array.isArray(ayahsList) ? ayahsList : [];
      setAyahs(freshAyahs);
      if (freshAyahs.length > 0) {
        void offlineCache.set(cacheKey, freshAyahs);
      }
    } catch {
      if (ayahs.length === 0) {
        setReadingError('Ayat-ayat surah belum berhasil dimuat.');
      }
    } finally {
      setReadingLoading(false);
    }
  };

  const closeReadingModal = () => {
    setSelectedSurah(null);
    setAyahs([]);
  };

  const handleShareAyah = async (ayahNumber: number, arabText: string, indoText: string) => {
    try {
      const message = `QS. ${selectedSurah?.nama_latin} : ${ayahNumber}\n\n${arabText}\n\nArtinya:\n"${indoText}"\n\n— SIMSIT Mobile (Al-Qur'an Digital)`;
      await Share.share({
        title: `QS. ${selectedSurah?.nama_latin} : ${ayahNumber}`,
        message,
      });
    } catch {}
  };

  const handleSetLastReadAyah = (ayahNumber: number) => {
    if (!selectedSurah) return;
    const rec: LastReadRecord = {
      surahNumber: selectedSurah.nomor,
      surahName: selectedSurah.nama_latin,
      ayahNumber,
      timestamp: Date.now(),
    };
    setLastRead(rec);
    void offlineCache.set(LAST_READ_KEY, rec);
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
          Al-Qur'an Al-Karim
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
        {/* 1. Group Card: Mushaf Digital & Last Read Tracker (Identik Mutabaah Tahfizh Group Card) */}
        <View style={styles.heroSectionWrap}>
          <View style={[styles.tahfizhGroupCard, styles.tahfizhGroupCardEmerald]}>
            {/* Header Box di dalam Group Card */}
            <View style={[styles.tahfizhGroupCardHeaderRow, styles.tahfizhGroupCardHeaderRowEmerald]}>
              <View style={styles.tahfizhGroupCardHeaderLeft}>
                <View style={[styles.tahfizhGroupHeaderIconBox, styles.tahfizhGroupHeaderIconBoxEmerald]}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#FFFFFF" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardTitle, { color: '#064E3B' }]}>
                    Mushaf Al-Qur'an Digital
                  </Text>
                  <Text numberOfLines={1} style={[styles.tahfizhGroupCardSub, { color: '#059669' }]}>
                    Tilawah 30 juz lengkap dengan tajwid & arti
                  </Text>
                </View>
              </View>
              <View style={[styles.tahfizhGroupActionBadge, styles.tahfizhGroupActionBadgeEmerald]}>
                <Text style={[styles.tahfizhGroupActionBadgeText, { color: '#047857' }]}>
                  114 Surah
                </Text>
              </View>
            </View>

            {/* Last Read Tracker Row (Jika ada riwayat bacaan) */}
            {lastRead && (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  const target = surahs.find((s) => s.nomor === lastRead.surahNumber);
                  if (target) {
                    void openSurahDetail(target, lastRead.ayahNumber);
                  }
                }}
                style={styles.lastReadRowCard}
              >
                <View style={styles.lastReadIconBox}>
                  <MaterialCommunityIcons name="bookmark-check" size={18} color="#059669" />
                </View>
                <View style={styles.lastReadInfoCol}>
                  <Text style={styles.lastReadTag}>Terakhir Dibaca</Text>
                  <Text numberOfLines={1} style={styles.lastReadSurahName}>
                    QS. {lastRead.surahName} {lastRead.ayahNumber ? `• Ayat ${lastRead.ayahNumber}` : ''}
                  </Text>
                </View>
                <View style={styles.lastReadActionBtn}>
                  <Text style={styles.lastReadActionText}>Lanjutkan</Text>
                  <MaterialCommunityIcons name="play-circle" size={14} color="#FFFFFF" />
                </View>
              </TouchableOpacity>
            )}

            {/* Live Search Input Box */}
            <View style={styles.searchBarBox}>
              <MaterialCommunityIcons name="magnify" size={20} color="#059669" />
              <TextInput
                value={searchQuery}
                onChangeText={setSearchQuery}
                placeholder="Cari surah (misal: Al-Kahf, 18, Gua)..."
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

        {/* 2. Filter Pills (Semua, Makkiyah, Madaniyah - Identik Capsule Tabs Mutabaah) */}
        <View style={styles.filterSection}>
          <TouchableOpacity
            style={[styles.filterChip, filterTempat === 'all' && styles.filterChipActive]}
            onPress={() => setFilterTempat('all')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="layers-outline"
              size={14}
              color={filterTempat === 'all' ? '#FFFFFF' : '#047857'}
            />
            <Text style={[styles.filterChipText, filterTempat === 'all' && styles.filterChipTextActive]}>
              Semua (114)
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterTempat === 'mekah' && styles.filterChipActive]}
            onPress={() => setFilterTempat('mekah')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="cube-outline"
              size={14}
              color={filterTempat === 'mekah' ? '#FFFFFF' : '#047857'}
            />
            <Text style={[styles.filterChipText, filterTempat === 'mekah' && styles.filterChipTextActive]}>
              Makkiyah
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.filterChip, filterTempat === 'madinah' && styles.filterChipActive]}
            onPress={() => setFilterTempat('madinah')}
            activeOpacity={0.8}
          >
            <MaterialCommunityIcons
              name="mosque"
              size={14}
              color={filterTempat === 'madinah' ? '#FFFFFF' : '#047857'}
            />
            <Text style={[styles.filterChipText, filterTempat === 'madinah' && styles.filterChipTextActive]}>
              Madaniyah
            </Text>
          </TouchableOpacity>
        </View>

        {/* 3. Surah List */}
        {loading ? (
          <View style={styles.centerContainer}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={styles.loadingText}>Mempersiapkan lembaran mushaf...</Text>
          </View>
        ) : error ? (
          <View style={styles.centerContainer}>
            <MaterialCommunityIcons name="alert-circle-outline" size={48} color="#EF4444" />
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryBtn} onPress={() => void loadSurahs(searchQuery, filterTempat)}>
              <Text style={styles.retryBtnText}>Muat Ulang</Text>
            </TouchableOpacity>
          </View>
        ) : filteredList.length === 0 ? (
          <View style={styles.centerContainer}>
            <MaterialCommunityIcons name="book-open-outline" size={48} color="#94A3B8" />
            <Text style={styles.emptyTitle}>Surah Tidak Ditemukan</Text>
            <Text style={styles.emptySubtitle}>Coba gunakan kata kunci pencarian surah lainnya.</Text>
          </View>
        ) : (
          <FlatList
            data={filteredList}
            keyExtractor={(item) => String(item.nomor)}
            contentContainerStyle={[styles.listContent, { paddingBottom: Math.max(bottomInset + 80, 100) }]}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => {
              const isMakkiyah = item.tempat_turun?.toLowerCase() === 'mekah';
              return (
                <TouchableOpacity
                  style={styles.surahCard}
                  activeOpacity={0.78}
                  onPress={() => openSurahDetail(item)}
                >
                  {/* Ornamen Nomor Surah Segi Delapan Islami (Identik Agenda Icon Box Mutabaah) */}
                  <View style={styles.nomorBadge}>
                    <Text style={styles.nomorBadgeText}>{item.nomor}</Text>
                  </View>

                  {/* Info Surah Latin */}
                  <View style={styles.surahInfo}>
                    <View style={styles.surahHeaderRow}>
                      <Text style={styles.namaLatin}>{item.nama_latin}</Text>
                      <View style={[styles.tempatBadge, isMakkiyah ? styles.tempatBadgeMakkiyah : styles.tempatBadgeMadaniyah]}>
                        <Text style={[styles.tempatBadgeText, isMakkiyah ? styles.tempatTextMakkiyah : styles.tempatTextMadaniyah]}>
                          {isMakkiyah ? 'Makkiyah' : 'Madaniyah'}
                        </Text>
                      </View>
                    </View>
                    <Text style={styles.artiText}>
                      {item.arti} • <Text style={styles.ayatCountText}>{item.jumlah_ayat} Ayat</Text>
                    </Text>
                  </View>

                  {/* Kaligrafi Nama Arab Surah */}
                  <View style={styles.surahArabicCol}>
                    <Text style={styles.namaArab}>{item.nama}</Text>
                    <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
                  </View>
                </TouchableOpacity>
              );
            }}
          />
        )}
      </View>

      {/* ── MODAL BACA SURAH & AYAT (READER EXPERIENCE) ── */}
      <Modal
        visible={Boolean(selectedSurah)}
        animationType="slide"
        transparent={false}
        onRequestClose={closeReadingModal}
      >
        <View style={styles.modalRoot}>
          {/* Header Modal Identik Latar Ilustrasi Mutaba'ah */}
          <View style={styles.modalTopHeaderWrapper}>
            <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
              <TouchableOpacity
                onPress={closeReadingModal}
                style={styles.cleanHeaderIconBtn}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <MaterialCommunityIcons name="arrow-left" size={22} color="#004D32" />
              </TouchableOpacity>

              <View style={styles.modalHeaderTitleBox}>
                <Text numberOfLines={1} style={styles.modalHeaderTitle}>
                  Surah {selectedSurah?.nama_latin}
                </Text>
                <Text style={styles.modalHeaderSub}>
                  {selectedSurah?.arti} • {selectedSurah?.jumlah_ayat} Ayat • {selectedSurah?.tempat_turun}
                </Text>
              </View>

              {/* Quick Action Reader Settings Font & Display */}
              <View style={styles.modalHeaderActions}>
                <TouchableOpacity
                  onPress={() => setArabicFontSize((prev) => Math.max(prev - 2, 20))}
                  style={styles.fontSizeBtn}
                  accessibilityLabel="Kecilkan Font"
                >
                  <Text style={styles.fontSizeBtnText}>A-</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  onPress={() => setArabicFontSize((prev) => Math.min(prev + 2, 36))}
                  style={styles.fontSizeBtn}
                  accessibilityLabel="Besarkan Font"
                >
                  <Text style={styles.fontSizeBtnText}>A+</Text>
                </TouchableOpacity>
              </View>
            </View>

            {/* Reader Sub-Toolbar: Toggle Arti & Latin */}
            <View style={styles.readerToolbar}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowTranslation((prev) => !prev)}
                style={[styles.readerToolChip, showTranslation && styles.readerToolChipActive]}
              >
                <MaterialCommunityIcons
                  name={showTranslation ? 'eye-outline' : 'eye-off-outline'}
                  size={14}
                  color={showTranslation ? '#065F46' : '#64748B'}
                />
                <Text style={[styles.readerToolText, showTranslation && styles.readerToolTextActive]}>
                  Terjemahan
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setShowLatin((prev) => !prev)}
                style={[styles.readerToolChip, showLatin && styles.readerToolChipActive]}
              >
                <MaterialCommunityIcons
                  name={showLatin ? 'format-italic' : 'format-text'}
                  size={14}
                  color={showLatin ? '#065F46' : '#64748B'}
                />
                <Text style={[styles.readerToolText, showLatin && styles.readerToolTextActive]}>
                  Transliterasi
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Body Modal: Ayat-Ayat */}
          {readingLoading ? (
            <View style={styles.centerContainer}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Membuka ayat-ayat suci...</Text>
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
              contentContainerStyle={[styles.modalScrollContent, { paddingBottom: Math.max(bottomInset + 40, 60) }]}
              showsVerticalScrollIndicator={false}
            >
              {/* Bismillah Banner (Kecuali Surah At-Taubah no 9) */}
              {selectedSurah?.nomor !== 9 && (
                <View style={styles.bismillahCard}>
                  <Text style={styles.bismillahArab}>بِسْمِ اللّٰهِ الرَّحْمٰنِ الرَّحِيْمِ</Text>
                  <Text style={styles.bismillahArti}>
                    "Dengan nama Allah Yang Maha Pengasih, Maha Penyayang"
                  </Text>
                </View>
              )}

              {/* Rincian Ayat-ayat */}
              {ayahs.map((ayah, index) => {
                const ayahNumber = ayah.nomorAyat || ayah.nomor_ayat || index + 1;
                const arabText = ayah.teksArab || ayah.teks_arab || '';
                const latinText = ayah.teksLatin || ayah.teks_latin || '';
                const indoText = ayah.teksIndonesia || ayah.teks_indonesia || '';
                const isCurrentLastRead =
                  lastRead?.surahNumber === selectedSurah?.nomor && lastRead?.ayahNumber === ayahNumber;

                return (
                  <View key={index} style={[styles.ayahCard, isCurrentLastRead && styles.ayahCardActiveBookmark]}>
                    {/* Header Baris Ayat */}
                    <View style={styles.ayahHeaderRow}>
                      <View style={styles.ayahNumberBadge}>
                        <Text style={styles.ayahNumberText}>{ayahNumber}</Text>
                      </View>
                      <View style={styles.ayahSurahTag}>
                        <Text style={styles.ayahSurahTagText}>
                          {selectedSurah?.nama_latin} : {ayahNumber}
                        </Text>
                      </View>

                      {/* Tombol Aksi Ayat: Bookmark & Share */}
                      <View style={styles.ayahActionsGroup}>
                        <TouchableOpacity
                          onPress={() => handleSetLastReadAyah(ayahNumber)}
                          style={[styles.ayahActionBtn, isCurrentLastRead && styles.ayahActionBtnActive]}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons
                            name={isCurrentLastRead ? 'bookmark' : 'bookmark-outline'}
                            size={18}
                            color={isCurrentLastRead ? '#059669' : '#94A3B8'}
                          />
                        </TouchableOpacity>

                        <TouchableOpacity
                          onPress={() => handleShareAyah(ayahNumber, arabText, indoText)}
                          style={styles.ayahActionBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                        >
                          <MaterialCommunityIcons name="share-variant-outline" size={17} color="#94A3B8" />
                        </TouchableOpacity>
                      </View>
                    </View>

                    {/* Teks Arab Mushaf */}
                    <View style={styles.ayahArabicBox}>
                      <Text style={[styles.ayahArabText, { fontSize: arabicFontSize, lineHeight: arabicFontSize * 1.85 }]}>
                        {arabText}
                      </Text>
                    </View>

                    {/* Transliterasi Latin */}
                    {showLatin && Boolean(latinText) && (
                      <Text style={styles.ayahLatinText}>{latinText}</Text>
                    )}

                    {/* Terjemahan Indonesia */}
                    {showTranslation && Boolean(indoText) && (
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
  lastReadRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 12,
    paddingVertical: 8,
    marginBottom: 10,
    gap: 9,
  },
  lastReadIconBox: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  lastReadInfoCol: {
    flex: 1,
  },
  lastReadTag: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
  },
  lastReadSurahName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  lastReadActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    gap: 4,
  },
  lastReadActionText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#FFFFFF',
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
  filterSection: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    gap: 8,
  },
  filterChip: {
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
  filterChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 4,
  },
  // Agenda Item Card (Identik Mutabaah)
  surahCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 13,
    marginBottom: 8,
    gap: 12,
    shadowColor: '#000000',
    shadowOpacity: 0.03,
    shadowRadius: 5,
    shadowOffset: { width: 0, height: 2 },
    elevation: 1,
  },
  nomorBadge: {
    width: 38,
    height: 38,
    borderRadius: 13,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  nomorBadgeText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#059669',
  },
  surahInfo: {
    flex: 1,
  },
  surahHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  namaLatin: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  tempatBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tempatBadgeMakkiyah: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  tempatBadgeMadaniyah: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  tempatBadgeText: {
    fontSize: 9.5,
    fontWeight: '700',
  },
  tempatTextMakkiyah: {
    color: '#B45309',
  },
  tempatTextMadaniyah: {
    color: '#1D4ED8',
  },
  artiText: {
    fontSize: 11.5,
    color: '#64748B',
  },
  ayatCountText: {
    fontWeight: '700',
    color: '#059669',
  },
  surahArabicCol: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  namaArab: {
    fontSize: 19,
    fontWeight: 'bold',
    color: '#065F46',
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
  },
  modalRoot: {
    flex: 1,
    backgroundColor: '#ECFDF5',
  },
  modalTopHeaderWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  modalHeaderTitleBox: {
    flex: 1,
    alignItems: 'center',
    marginHorizontal: 8,
  },
  modalHeaderTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#004D32',
  },
  modalHeaderSub: {
    fontSize: 11,
    color: '#059669',
    marginTop: 1,
  },
  modalHeaderActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  fontSizeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  fontSizeBtnText: {
    fontSize: 11.5,
    fontWeight: '900',
    color: '#065F46',
  },
  readerToolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingVertical: 7,
    borderTopWidth: 1,
    borderTopColor: '#ECFDF5',
    gap: 8,
  },
  readerToolChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    gap: 4,
  },
  readerToolChipActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  readerToolText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  readerToolTextActive: {
    color: '#065F46',
    fontWeight: '700',
  },
  modalScroll: {
    flex: 1,
  },
  modalScrollContent: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  bismillahCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 18,
    paddingHorizontal: 16,
    alignItems: 'center',
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  bismillahArab: {
    fontSize: 25,
    fontWeight: 'bold',
    color: '#065F46',
    textAlign: 'center',
    marginBottom: 6,
  },
  bismillahArti: {
    fontSize: 11.5,
    color: '#059669',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  ayahCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.2,
    borderColor: '#E2E8F0',
    padding: 15,
    marginBottom: 10,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  ayahCardActiveBookmark: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
  },
  ayahHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  ayahNumberBadge: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ayahNumberText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#059669',
  },
  ayahSurahTag: {
    flex: 1,
    marginLeft: 8,
  },
  ayahSurahTagText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  ayahActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  ayahActionBtn: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  ayahActionBtnActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  ayahArabicBox: {
    marginBottom: 10,
  },
  ayahArabText: {
    fontWeight: 'bold',
    color: '#0F172A',
    textAlign: 'right',
    letterSpacing: 0.5,
  },
  ayahLatinText: {
    fontSize: 12,
    color: '#0D9488',
    fontStyle: 'italic',
    lineHeight: 18,
    marginBottom: 6,
  },
  ayahIndoText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 18,
  },
});
