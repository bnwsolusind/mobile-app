import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Dimensions,
  Image,
  Linking,
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
import { offlineCache } from '../utils/offlineCache';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export interface FaqItem {
  id: string;
  category: string;
  question: string;
  answer: string;
  tags?: string[];
  actionUrl?: string | null;
  actionLabel?: string | null;
}

export const INITIAL_FAQS: FaqItem[] = [
  {
    id: 'faq-1',
    category: 'Keamanan & Akun',
    question: 'Bagaimana cara mengganti kata sandi (password) akun SIMSIT saya?',
    answer: `Anda dapat mengubah kata sandi kapan saja demi keamanan akun:
1. Buka menu Profil & Pengaturan Akun di halaman Layanan Lainnya.
2. Pilih tab Keamanan & Kata Sandi.
3. Masukkan kata sandi lama, lalu ketikkan kata sandi baru minimal 8 karakter.
4. Klik Simpan Perubahan Kata Sandi.

*Jika Anda lupa kata sandi lama, silakan hubungi Administrator TU Sekolah untuk mengajukan reset kata sandi.*`,
    tags: ['password', 'ganti password', 'lupa password', 'profil', 'keamanan', 'akun'],
    actionUrl: 'Profil',
    actionLabel: 'Buka Profil Akun',
  },
  {
    id: 'faq-2',
    category: 'Absensi Digital',
    question: 'Bagaimana prosedur penanganan siswa yang tidak melakukan tap kartu di gerbang?',
    answer: `Jika siswa lupa membawa kartu NFC/QR atau gerbang sedang dalam perawatan:
1. Wali Kelas atau staf TU dapat membuka menu Absensi > Presensi KBM & Kelas.
2. Pilih nama siswa yang bersangkutan pada tanggal dan jam berjalan.
3. Ubah status kehadiran secara manual menjadi Hadir (Koreksi TU/Walas) atau masukkan keterangan Izin/Sakit.
4. Simpan data agar sistem merekap kehadiran secara akurat pada laporan harian dan portal orang tua.`,
    tags: ['absensi', 'gerbang', 'kartu nfc', 'qr code', 'koreksi', 'walas', 'tu'],
    actionUrl: 'Absensi',
    actionLabel: 'Buka Menu Presensi',
  },
  {
    id: 'faq-3',
    category: 'Tahfizh & Mutabaah',
    question: 'Bagaimana cara melihat dan memantau setoran hafalan Al-Qur’an santri?',
    answer: `Orang tua dan guru dapat memantau perkembangan hafalan santri:
1. Buka menu Tahfizh Al-Qur’an pada kartu siswa di beranda atau dari daftar layanan lainnya.
2. Anda akan melihat rekap jumlah juz, nilai kelancaran (Mumtaz, Jayyid, dll), dan catatan tajwid musyrif.
3. Data disinkronkan secara real-time setiap kali guru tahfizh mencatat setoran baru di halaqah.`,
    tags: ['tahfizh', 'setoran', 'ziyadah', 'murajaah', 'quran', 'halaqah', 'musyrif'],
    actionUrl: 'Tahfizh',
    actionLabel: 'Lihat Catatan Tahfizh',
  },
  {
    id: 'faq-4',
    category: 'Akademik & LMS',
    question: 'Bagaimana cara mengunggah jawaban tugas sekolah / LMS santri?',
    answer: `Untuk siswa dan santri yang ingin mengumpulkan tugas:
1. Buka menu Tugas & LMS melalui beranda atau tab navigasi.
2. Pilih mata pelajaran dan tugas yang berstatus Aktif.
3. Baca instruksi dari dewan guru, kemudian ketik jawaban tugas pada kolom yang tersedia.
4. Klik tombol "Kirim Jawaban Tugas". Status tugas akan langsung diperbarui menjadi Terkumpul.`,
    tags: ['tugas', 'lms', 'unggah tugas', 'pr', 'jawaban', 'kbm', 'akademik'],
    actionUrl: 'Tugas',
    actionLabel: 'Buka Menu Tugas LMS',
  },
  {
    id: 'faq-5',
    category: 'Kesiswaan',
    question: 'Bagaimana cara melihat Kartu Tanda Siswa (KTS) Digital?',
    answer: `Kartu Tanda Siswa (KTS) Digital dengan QR Code resmi dapat diakses secara instan:
1. Di halaman Beranda atau Jadwal, klik tombol "Kartu Siswa" pada Hero Card santri.
2. Modal kartu identitas siswa akan tampil lengkap dengan foto, NIS/NISN, unit sekolah, dan barcode/QR.
3. Kartu ini dapat digunakan untuk verifikasi di gerbang maupun keperluan administrasi internal yayasan.`,
    tags: ['kts', 'kartu siswa', 'qr code', 'identitas', 'kesiswaan', 'nis'],
    actionUrl: null,
    actionLabel: null,
  },
  {
    id: 'faq-6',
    category: 'Absensi Digital',
    question: 'Bagaimana mengajukan surat izin atau sakit santri dari orang tua?',
    answer: `Wali murid dapat mengajukan izin ketidakhadiran langsung dari aplikasi:
1. Buka menu Perizinan Santri pada kartu anak di beranda.
2. Pilih jenis permohonan (Izin Keperluan Keluarga / Sakit).
3. Tentukan rentang tanggal izin dan lampirkan surat keterangan dokter jika sakit.
4. Setelah diajukan, wali kelas akan memeriksa dan menyetujui surat izin tersebut secara online.`,
    tags: ['izin', 'sakit', 'surat permohonan', 'walas', 'absensi', 'orang tua'],
    actionUrl: 'Perizinan',
    actionLabel: 'Formulir Permohonan Izin',
  },
  {
    id: 'faq-7',
    category: 'Keamanan & Akun',
    question: 'Saya memiliki pesan peringatan "Akses Ditolak / Forbidden", apa penyebabnya?',
    answer: `Pesan "Akses Ditolak" muncul apabila akun Anda tidak memiliki izin untuk modul yang dipilih:
• Aplikasi menerapkan keamanan ketat berdasarkan peran (Yayasan, Kepala Sekolah, Guru, TU, Musyrif, Orang Tua, Siswa).
• Akun siswa hanya memiliki akses ke modul belajar, tugas, dan ibadah.
• Jika Anda merasa memerlukan akses ke fitur tertentu, silakan koordinasikan dengan Administrator IT atau Tata Usaha Sekolah.`,
    tags: ['akses ditolak', 'forbidden', 'hak akses', 'role', 'keamanan', 'admin'],
    actionUrl: null,
    actionLabel: null,
  },
  {
    id: 'faq-8',
    category: 'Kepegawaian',
    question: 'Bagaimana guru dan staf melakukan presensi mandiri harian?',
    answer: `Dewan guru dan staf sekolah dapat melakukan presensi kehadiran:
1. Buka menu Presensi & Kehadiran di halaman Layanan Lainnya.
2. Pastikan izin lokasi (GPS) pada smartphone Anda aktif dan berada di radius area sekolah.
3. Klik tombol "Presensi Masuk" atau "Presensi Pulang" sesuai jadwal jam kerja.
4. Sistem akan memvalidasi koordinat lokasi dan mencatat waktu presensi secara otomatis.`,
    tags: ['pegawai', 'guru', 'staf', 'presensi mandiri', 'gps', 'absensi'],
    actionUrl: 'Absensi',
    actionLabel: 'Menu Presensi Pegawai',
  },
];

const CATEGORIES = [
  { id: 'all', label: 'Semua Topik', icon: 'layers-outline' },
  { id: 'Keamanan & Akun', label: 'Keamanan & Akun', icon: 'shield-check-outline' },
  { id: 'Absensi Digital', label: 'Absensi & Gerbang', icon: 'calendar-check-outline' },
  { id: 'Tahfizh & Mutabaah', label: 'Tahfizh & Ibadah', icon: 'book-open-page-variant' },
  { id: 'Akademik & LMS', label: 'Akademik & LMS', icon: 'school-outline' },
  { id: 'Kesiswaan', label: 'Kesiswaan', icon: 'account-group-outline' },
  { id: 'Kepegawaian', label: 'Kepegawaian', icon: 'badge-account-outline' },
];

export default function BantuanScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 8);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);

  const [faqs, setFaqs] = useState<FaqItem[]>(INITIAL_FAQS);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [contactPhone, setContactPhone] = useState<string>('081234567890');
  const [contactEmail, setContactEmail] = useState<string>('bantuan@dareliman.sch.id');

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

  const loadFaqs = useCallback(async (isPull = false) => {
    if (isPull) {
      setRefreshing(true);
    } else {
      setLoading(true);
    }

    const cacheKey = 'portal_faqs_mobile_cache';
    try {
      // 1. Ambil cache offline terlebih dahulu
      const cached = await offlineCache.get<{ faqs: FaqItem[]; phone?: string; email?: string }>(cacheKey);
      if (cached?.faqs && Array.isArray(cached.faqs) && cached.faqs.length > 0) {
        setFaqs(cached.faqs);
        if (cached.phone) setContactPhone(cached.phone);
        if (cached.email) setContactEmail(cached.email);
        if (!isPull) setLoading(false);
      }

      // 2. Fetch fresh data dari backend
      const res = await mobileApiService.getSiteSettings();
      const data = unwrapApiData<any>(res);
      if (data?.custom_faqs && Array.isArray(data.custom_faqs) && data.custom_faqs.length > 0) {
        setFaqs(data.custom_faqs);
      }
      if (data?.phone) setContactPhone(data.phone);
      if (data?.email) setContactEmail(data.email);

      // Simpan ke offline cache
      void offlineCache.set(cacheKey, {
        faqs: (data?.custom_faqs && data.custom_faqs.length > 0) ? data.custom_faqs : INITIAL_FAQS,
        phone: data?.phone || contactPhone,
        email: data?.email || contactEmail,
      });
    } catch {
      // Jika offline, pertahankan faqs dari cache atau initial fallback
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [contactPhone, contactEmail]);

  useEffect(() => {
    void loadFaqs();
  }, [loadFaqs]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  const handleOpenWhatsApp = () => {
    const cleanPhone = contactPhone.replace(/[^0-9]/g, '');
    const phoneWithCountry = cleanPhone.startsWith('0') ? `62${cleanPhone.slice(1)}` : cleanPhone;
    const message = encodeURIComponent('Assalamu’alaikum Admin Bantuan SIMSIT, saya memerlukan panduan/bantuan terkait aplikasi.');
    Linking.openURL(`https://wa.me/${phoneWithCountry}?text=${message}`).catch(() => {
      Linking.openURL(`tel:${cleanPhone}`);
    });
  };

  const handleOpenEmail = () => {
    const subject = encodeURIComponent('Bantuan Aplikasi SIMSIT Terpadu');
    Linking.openURL(`mailto:${contactEmail}?subject=${subject}`).catch(() => {});
  };

  const filteredFaqs = useMemo(() => {
    return faqs.filter((item) => {
      const matchCategory = selectedCategory === 'all' || item.category === selectedCategory;
      if (!matchCategory) return false;

      if (!searchQuery.trim()) return true;
      const q = searchQuery.toLowerCase().trim();
      const inQuestion = item.question?.toLowerCase().includes(q);
      const inAnswer = item.answer?.toLowerCase().includes(q);
      const inTags = item.tags?.some((t) => t.toLowerCase().includes(q));
      const inCat = item.category?.toLowerCase().includes(q);
      return inQuestion || inAnswer || inTags || inCat;
    });
  }, [faqs, selectedCategory, searchQuery]);

  return (
    <View style={styles.container}>
      {/* ── Background Foliage Gradient ── */}
      <View style={styles.foliageContainer}>
        <LinearGradient
          colors={['#065F46', '#047857', '#059669', '#10B981']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── Fixed Clean Top Header ── */}
      <View style={[styles.cleanTopHeader, { paddingTop: topInset + 6 }]}>
        <TouchableOpacity
          activeOpacity={0.8}
          onPress={handleBack}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Kembali"
        >
          <MaterialCommunityIcons name="arrow-left" size={20} color="#065F46" />
        </TouchableOpacity>

        <Text numberOfLines={1} style={styles.cleanHeaderTitle}>
          Pusat Bantuan & FAQ
        </Text>

        <TouchableOpacity
          activeOpacity={0.8}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#065F46" />
          {unreadNotificationCount > 0 && <View style={styles.cleanBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── Main Scrollable Sheet ── */}
      <View style={styles.sheetContainer}>
        <ScrollView
          style={styles.scrollArea}
          contentContainerStyle={[
            styles.scrollContent,
            { paddingBottom: Math.max(bottomInset + 80, 100) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadFaqs(true)}
              colors={['#059669', '#10B981']}
              tintColor="#059669"
            />
          }
        >
          {/* 1. Hero Card Bantuan */}
          <View style={styles.heroCard}>
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroGradient}
            >
              <View style={styles.heroTopRow}>
                <View style={styles.heroIconBadge}>
                  <MaterialCommunityIcons name="help-circle-outline" size={26} color="#FFFFFF" />
                </View>
                <View style={styles.heroPillBadge}>
                  <MaterialCommunityIcons name="shield-check" size={14} color="#D1FAE5" />
                  <Text style={styles.heroPillText}>Panduan Terverifikasi</Text>
                </View>
              </View>

              <Text style={styles.heroTitle}>Pusat Bantuan & Solusi Kendala</Text>
              <Text style={styles.heroSubtitle}>
                Temukan solusi cepat pertanyaan umum seputar fitur SIMSIT Yayasan atau hubungi admin teknis kami.
              </Text>

              {/* Search Bar Input */}
              <View style={styles.searchBarBox}>
                <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
                <TextInput
                  value={searchQuery}
                  onChangeText={setSearchQuery}
                  placeholder="Cari solusi kendala, kata kunci, topik..."
                  placeholderTextColor="#94A3B8"
                  style={styles.searchInput}
                  returnKeyType="search"
                  clearButtonMode="while-editing"
                />
                {searchQuery.trim().length > 0 && (
                  <TouchableOpacity
                    onPress={() => setSearchQuery('')}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                  >
                    <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </LinearGradient>
          </View>

          {/* 2. Category Chips Horizontal */}
          <View style={styles.categorySection}>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryScrollContent}
            >
              {CATEGORIES.map((cat) => {
                const isActive = selectedCategory === cat.id;
                return (
                  <TouchableOpacity
                    key={cat.id}
                    activeOpacity={0.7}
                    onPress={() => setSelectedCategory(cat.id)}
                    style={[
                      styles.categoryChip,
                      isActive && styles.categoryChipActive,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={cat.icon as any}
                      size={15}
                      color={isActive ? '#FFFFFF' : '#047857'}
                    />
                    <Text
                      style={[
                        styles.categoryChipText,
                        isActive && styles.categoryChipTextActive,
                      ]}
                    >
                      {cat.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>

          {/* 3. Section Title & Item Count */}
          <View style={styles.listHeaderRow}>
            <View style={styles.listHeaderLeft}>
              <Text style={styles.listHeaderTitle}>Daftar Pertanyaan & Jawaban</Text>
              <Text style={styles.listHeaderSubtitle}>
                {filteredFaqs.length} topik panduan ditemukan
              </Text>
            </View>
            {loading && !refreshing && (
              <ActivityIndicator size="small" color="#059669" />
            )}
          </View>

          {/* 4. FAQ Accordion Cards */}
          {filteredFaqs.length === 0 ? (
            <View style={styles.emptyCard}>
              <MaterialCommunityIcons name="text-search" size={44} color="#94A3B8" />
              <Text style={styles.emptyTitle}>Tidak Ada Pertanyaan Ditemukan</Text>
              <Text style={styles.emptySubtitle}>
                Coba gunakan kata kunci lain atau pilih kategori topik yang berbeda.
              </Text>
              <TouchableOpacity
                style={styles.emptyResetBtn}
                onPress={() => {
                  setSearchQuery('');
                  setSelectedCategory('all');
                }}
              >
                <Text style={styles.emptyResetBtnText}>Reset Pencarian</Text>
              </TouchableOpacity>
            </View>
          ) : (
            filteredFaqs.map((item, index) => {
              const isExpanded = expandedId === item.id;
              return (
                <View key={item.id || index} style={styles.faqCard}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => toggleExpand(item.id)}
                    style={styles.faqHeaderBtn}
                  >
                    <View style={styles.faqHeaderMain}>
                      <View style={styles.faqCategoryBadge}>
                        <Text style={styles.faqCategoryText}>{item.category}</Text>
                      </View>
                      <Text style={styles.faqQuestionText}>{item.question}</Text>
                    </View>
                    <View
                      style={[
                        styles.faqChevronBox,
                        isExpanded && styles.faqChevronBoxActive,
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={isExpanded ? 'chevron-up' : 'chevron-down'}
                        size={20}
                        color={isExpanded ? '#059669' : '#64748B'}
                      />
                    </View>
                  </TouchableOpacity>

                  {isExpanded && (
                    <View style={styles.faqBody}>
                      <View style={styles.faqDivider} />
                      <Text style={styles.faqAnswerText}>{item.answer}</Text>

                      {item.actionUrl && item.actionLabel && (
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => {
                            if (navigation?.navigate) {
                              navigation.navigate(item.actionUrl);
                            }
                          }}
                          style={styles.faqActionBtn}
                        >
                          <MaterialCommunityIcons name="open-in-new" size={16} color="#FFFFFF" />
                          <Text style={styles.faqActionBtnText}>{item.actionLabel}</Text>
                        </TouchableOpacity>
                      )}

                      {item.tags && item.tags.length > 0 && (
                        <View style={styles.tagsRow}>
                          <MaterialCommunityIcons name="tag-outline" size={13} color="#94A3B8" />
                          {item.tags.slice(0, 4).map((t, idx) => (
                            <View key={idx} style={styles.tagItem}>
                              <Text style={styles.tagItemText}>#{t}</Text>
                            </View>
                          ))}
                        </View>
                      )}
                    </View>
                  )}
                </View>
              );
            })
          )}

          {/* 5. Contact CS / Helpdesk Card */}
          <View style={styles.csCard}>
            <LinearGradient
              colors={['#F0FDF4', '#DCFCE7']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.csGradient}
            >
              <View style={styles.csHeaderRow}>
                <View style={styles.csIconBox}>
                  <MaterialCommunityIcons name="headset" size={24} color="#059669" />
                </View>
                <View style={styles.csHeaderTextWrap}>
                  <Text style={styles.csTitle}>Masih Mengalami Kendala?</Text>
                  <Text style={styles.csSubtitle}>
                    Tim Helpdesk IT Yayasan siap membantu menjawab pertanyaan Anda
                  </Text>
                </View>
              </View>

              <View style={styles.csActionButtonsRow}>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleOpenWhatsApp}
                  style={styles.csWhatsAppBtn}
                >
                  <MaterialCommunityIcons name="whatsapp" size={18} color="#FFFFFF" />
                  <Text style={styles.csWhatsAppBtnText}>Chat WhatsApp</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={handleOpenEmail}
                  style={styles.csEmailBtn}
                >
                  <MaterialCommunityIcons name="email-outline" size={18} color="#065F46" />
                  <Text style={styles.csEmailBtnText}>Kirim Email</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.csFooterInfo}>
                <MaterialCommunityIcons name="clock-outline" size={13} color="#065F46" />
                <Text style={styles.csFooterText}>
                  Jam Layanan: Senin – Sabtu, 07:30 – 16:00 WIB
                </Text>
              </View>
            </LinearGradient>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  foliageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 180,
  },
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 10,
    zIndex: 10,
  },
  cleanHeaderIconBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 4,
    elevation: 3,
  },
  cleanHeaderTitle: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
    marginHorizontal: 8,
  },
  cleanBellDot: {
    position: 'absolute',
    top: 7,
    right: 7,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    overflow: 'hidden',
    marginTop: 6,
  },
  scrollArea: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  heroCard: {
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
    marginBottom: 16,
  },
  heroGradient: {
    padding: 18,
  },
  heroTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  heroIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroPillBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.18)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    gap: 4,
  },
  heroPillText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  heroTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  heroSubtitle: {
    fontSize: 12.5,
    color: '#E6FFFA',
    lineHeight: 18,
    marginBottom: 16,
  },
  searchBarBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    gap: 8,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
    padding: 0,
  },
  categorySection: {
    marginBottom: 14,
  },
  categoryScrollContent: {
    paddingVertical: 2,
    gap: 8,
  },
  categoryChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    gap: 6,
  },
  categoryChipActive: {
    backgroundColor: '#059669',
    borderColor: '#047857',
  },
  categoryChipText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#065F46',
  },
  categoryChipTextActive: {
    color: '#FFFFFF',
  },
  listHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    marginTop: 2,
    paddingHorizontal: 2,
  },
  listHeaderLeft: {
    flex: 1,
  },
  listHeaderTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  listHeaderSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 2,
  },
  faqCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 10,
    overflow: 'hidden',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  faqHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 10,
  },
  faqHeaderMain: {
    flex: 1,
  },
  faqCategoryBadge: {
    alignSelf: 'flex-start',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 6,
  },
  faqCategoryText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  faqQuestionText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1E293B',
    lineHeight: 19,
  },
  faqChevronBox: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  faqChevronBoxActive: {
    backgroundColor: '#ECFDF5',
  },
  faqBody: {
    paddingHorizontal: 14,
    paddingBottom: 14,
  },
  faqDivider: {
    height: 1,
    backgroundColor: '#F1F5F9',
    marginBottom: 10,
  },
  faqAnswerText: {
    fontSize: 12.5,
    color: '#334155',
    lineHeight: 19,
  },
  faqActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    marginTop: 12,
    gap: 6,
  },
  faqActionBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  tagsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    marginTop: 12,
    gap: 6,
  },
  tagItem: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tagItemText: {
    fontSize: 10,
    color: '#64748B',
    fontWeight: '600',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginVertical: 12,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 10,
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 17,
  },
  emptyResetBtn: {
    marginTop: 12,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  emptyResetBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#059669',
  },
  csCard: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginTop: 8,
    marginBottom: 20,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 3,
  },
  csGradient: {
    padding: 16,
  },
  csHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 14,
  },
  csIconBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  csHeaderTextWrap: {
    flex: 1,
  },
  csTitle: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#065F46',
  },
  csSubtitle: {
    fontSize: 11.5,
    color: '#047857',
    marginTop: 2,
    lineHeight: 16,
  },
  csActionButtonsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 10,
  },
  csWhatsAppBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#16A34A',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#16A34A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  csWhatsAppBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  csEmailBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
  },
  csEmailBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#065F46',
  },
  csFooterInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingTop: 4,
    justifyContent: 'center',
  },
  csFooterText: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#065F46',
  },
});
