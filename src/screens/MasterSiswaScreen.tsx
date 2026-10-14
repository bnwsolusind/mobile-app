import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapCollection } from '../services/mobileApiService';
import { useAuthStore } from '../stores/authStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { AppFeedbackModal, FeedbackType } from '../components/AppFeedbackModal';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function MasterSiswaScreen({ navigation, route }: any) {
  const insets = useSafeAreaInsets();
  const localNav = useNavigation<any>();
  const nav = navigation || localNav;
  const user = useAuthStore((state) => state.user);

  // ── States ──
  const [students, setStudents] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // ── Filter States ──
  const [filterKelas, setFilterKelas] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>(route?.params?.filterStatus || 'all');
  const [filterGender, setFilterGender] = useState<string>('all');

  // ── Modal Detail State ──
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);

  // ── Feedback State ──
  const [feedback, setFeedback] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  }>({
    visible: false,
    title: '',
  });

  // Debounce search input
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(search.trim().toLowerCase());
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  // Load Data
  const loadData = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const [resStudents, resClasses] = await Promise.all([
        mobileApiService.getStudents({ per_page: 500 }),
        mobileApiService.getClasses({ per_page: 100 }),
      ]);

      const collStudents = unwrapCollection(resStudents);
      const collClasses = unwrapCollection(resClasses);

      setStudents(Array.isArray(collStudents) ? collStudents : []);
      setClasses(Array.isArray(collClasses) ? collClasses : []);

      if (isPull) {
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Data Berhasil Dimuat Ulang',
          message: `Berhasil menyinkronkan ${Array.isArray(collStudents) ? collStudents.length : 0} data buku induk siswa.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Data Siswa',
        message: err?.message || 'Terjadi gangguan jaringan saat memuat buku induk siswa.',
      });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  // Handle Go Back
  const handleGoBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(nav);
    if (!handled) {
      if (nav.canGoBack()) {
        nav.goBack();
      } else {
        nav.navigate('Beranda');
      }
    }
  };

  // WhatsApp Ortu Helper
  const handleOpenWhatsApp = (phone: string, studentName: string) => {
    const cleanPhone = String(phone || '').replace(/\D/g, '').replace(/^0/, '62');
    if (cleanPhone.length < 8) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Kontak Tidak Tersedia',
        message: `Nomor telepon orang tua untuk ${studentName} belum terdaftar atau format tidak valid.`,
      });
      return;
    }
    const message = encodeURIComponent(
      `Assalamu'alaikum Warahmatullahi Wabarakatuh. Menghubungi dari pihak Madrasah terkait ananda ${studentName}.`
    );
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${message}`).catch(() => {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Aplikasi Tidak Ditemukan',
        message: 'Aplikasi WhatsApp tidak terpasang di perangkat ini.',
      });
    });
  };

  // Filtered Students
  const filteredStudents = useMemo(() => {
    return students.filter((item) => {
      // 1. Search Query
      if (debouncedQuery) {
        const name = String(item.name || item.nama_lengkap || item.full_name || '').toLowerCase();
        const nis = String(item.nis || item.nisn || '').toLowerCase();
        const kName = String(item.kelas?.nama_kelas || item.kelas_nama || '').toLowerCase();
        if (!name.includes(debouncedQuery) && !nis.includes(debouncedQuery) && !kName.includes(debouncedQuery)) {
          return false;
        }
      }

      // 2. Filter Kelas
      if (filterKelas !== 'all') {
        const kId = String(item.kelas_id || item.kelas?.id || '');
        if (kId !== filterKelas) return false;
      }

      // 3. Filter Status
      if (filterStatus !== 'all') {
        const rawStatus = String(item.status || item.status_siswa || 'aktif').toLowerCase();
        const isAlumni = rawStatus.includes('lulus') || rawStatus.includes('alumni');
        const isMutasi = rawStatus.includes('mutasi');
        const isNonaktif = rawStatus.includes('berhenti') || rawStatus.includes('nonaktif');
        const isAktif = !isAlumni && !isMutasi && !isNonaktif;

        if (filterStatus === 'aktif' && !isAktif) return false;
        if (filterStatus === 'mutasi' && !isMutasi) return false;
        if (filterStatus === 'lulus' && !isAlumni) return false;
        if (filterStatus === 'berhenti' && !isNonaktif) return false;
      }

      // 4. Filter Gender
      if (filterGender !== 'all') {
        const g = String(item.gender || item.jenis_kelamin || item.jk || '').toLowerCase();
        if (filterGender === 'L' && !g.startsWith('l') && !g.startsWith('m')) return false;
        if (filterGender === 'P' && !g.startsWith('p') && !g.startsWith('f')) return false;
      }

      return true;
    });
  }, [students, debouncedQuery, filterKelas, filterStatus, filterGender]);

  // Statistics KPI
  const stats = useMemo(() => {
    let ikhwan = 0;
    let akhwat = 0;
    let aktif = 0;
    students.forEach((s) => {
      const g = String(s.gender || s.jenis_kelamin || s.jk || '').toLowerCase();
      if (g.startsWith('l') || g.startsWith('m')) ikhwan++;
      else if (g.startsWith('p') || g.startsWith('f')) akhwat++;

      const st = String(s.status || s.status_siswa || 'aktif').toLowerCase();
      if (!st.includes('mutasi') && !st.includes('lulus') && !st.includes('alumni') && !st.includes('berhenti')) {
        aktif++;
      }
    });
    return { total: students.length, ikhwan, akhwat, aktif };
  }, [students]);

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);

  return (
    <View style={styles.container}>
      {/* ── HEADER HALAMAN BUKU INDUK SISWA ── */}
      <LinearGradient
        colors={['#065F46', '#047857', '#059669']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={[styles.headerContainer, { paddingTop: topInset + 6 }]}
      >
        <View style={styles.headerTopRow}>
          <TouchableOpacity activeOpacity={0.7} onPress={handleGoBack} style={styles.backButton}>
            <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
          </TouchableOpacity>

          <View style={styles.headerTitleWrap}>
            <View style={styles.headerBadge}>
              <MaterialCommunityIcons name="book-education-outline" size={12} color="#A7F3D0" />
              <Text style={styles.headerBadgeText}>MASTER DATA POKOK</Text>
            </View>
            <Text style={styles.headerMainTitle}>Buku Induk Siswa</Text>
          </View>

          <TouchableOpacity activeOpacity={0.7} onPress={() => loadData(true)} style={styles.refreshButton}>
            <MaterialCommunityIcons name="refresh" size={20} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        {/* Search Bar */}
        <View style={styles.searchBar}>
          <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
          <TextInput
            style={styles.searchInput}
            placeholder="Cari nama siswa, NIS/NISN, atau kelas..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch('')}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* KPI Mini Strip */}
        <View style={styles.kpiStrip}>
          <View style={styles.kpiItem}>
            <Text style={styles.kpiVal}>{stats.total}</Text>
            <Text style={styles.kpiLbl}>Total Santri</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiVal, { color: '#6EE7B7' }]}>{stats.aktif}</Text>
            <Text style={styles.kpiLbl}>Aktif KBM</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiVal, { color: '#93C5FD' }]}>{stats.ikhwan}</Text>
            <Text style={styles.kpiLbl}>Ikhwan (L)</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiItem}>
            <Text style={[styles.kpiVal, { color: '#FBCFE8' }]}>{stats.akhwat}</Text>
            <Text style={styles.kpiLbl}>Akhwat (P)</Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── FILTER HORIZONTAL BAR ── */}
      <View style={styles.filterBarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* Status Pills */}
          <TouchableOpacity
            style={[styles.filterChip, filterStatus === 'all' && styles.filterChipActive]}
            onPress={() => setFilterStatus('all')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'all' && styles.filterChipTextActive]}>
              Semua Status
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterStatus === 'aktif' && styles.filterChipActive]}
            onPress={() => setFilterStatus('aktif')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'aktif' && styles.filterChipTextActive]}>
              Aktif
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterStatus === 'mutasi' && styles.filterChipActivePurple]}
            onPress={() => setFilterStatus('mutasi')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'mutasi' && styles.filterChipTextActive]}>
              Mutasi
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterStatus === 'lulus' && styles.filterChipActiveAmber]}
            onPress={() => setFilterStatus('lulus')}
          >
            <Text style={[styles.filterChipText, filterStatus === 'lulus' && styles.filterChipTextActive]}>
              Alumni / Lulus
            </Text>
          </TouchableOpacity>

          {/* Gender Pills */}
          <View style={styles.chipDivider} />
          <TouchableOpacity
            style={[styles.filterChip, filterGender === 'L' && styles.filterChipActiveBlue]}
            onPress={() => setFilterGender(filterGender === 'L' ? 'all' : 'L')}
          >
            <MaterialCommunityIcons name="gender-male" size={14} color={filterGender === 'L' ? '#FFF' : '#3B82F6'} />
            <Text style={[styles.filterChipText, filterGender === 'L' && styles.filterChipTextActive]}>Ikhwan</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterGender === 'P' && styles.filterChipActivePink]}
            onPress={() => setFilterGender(filterGender === 'P' ? 'all' : 'P')}
          >
            <MaterialCommunityIcons name="gender-female" size={14} color={filterGender === 'P' ? '#FFF' : '#EC4899'} />
            <Text style={[styles.filterChipText, filterGender === 'P' && styles.filterChipTextActive]}>Akhwat</Text>
          </TouchableOpacity>

          {/* Reset Action */}
          {(filterStatus !== 'all' || filterGender !== 'all' || filterKelas !== 'all' || search !== '') && (
            <TouchableOpacity
              style={styles.resetChip}
              onPress={() => {
                setFilterStatus('all');
                setFilterGender('all');
                setFilterKelas('all');
                setSearch('');
              }}
            >
              <MaterialCommunityIcons name="refresh" size={13} color="#EF4444" />
              <Text style={styles.resetChipText}>Reset Filter</Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* ── LIST SISWA ── */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#059669" />
          <Text style={styles.loadingText}>Memuat buku induk siswa...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredStudents}
          keyExtractor={(item, index) => String(item.id ?? item.nis ?? `student-${index}`)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={['#059669']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="account-search-outline" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Siswa Tidak Ditemukan</Text>
              <Text style={styles.emptySubtitle}>Tidak ada santri yang cocok dengan kriteria pencarian.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const studentName = item.name || item.nama_lengkap || item.full_name || 'Santri';
            const nis = item.nis || item.nisn || '—';
            const kelasName = item.kelas?.nama_kelas || item.kelas_nama || 'Kelas —';
            const unitName = item.education_unit?.name || item.unit_name || '';
            const statusRaw = String(item.status || item.status_siswa || 'aktif').toLowerCase();
            const parentName = item.parent_name || item.nama_ortu || item.wali || 'Wali Murid';
            const parentPhone = item.parent_phone || item.telepon_ortu || item.no_hp_ortu || '';

            const isMutasi = statusRaw.includes('mutasi');
            const isAlumni = statusRaw.includes('lulus') || statusRaw.includes('alumni');
            const isNonaktif = statusRaw.includes('berhenti') || statusRaw.includes('nonaktif');

            const statusLabel = isMutasi ? 'Mutasi' : isAlumni ? 'Alumni' : isNonaktif ? 'Nonaktif' : 'Aktif';
            const badgeBg = isMutasi ? '#FAF5FF' : isAlumni ? '#FEF9EC' : isNonaktif ? '#FFF1F2' : '#ECFDF5';
            const badgeColor = isMutasi ? '#7C3AED' : isAlumni ? '#D97706' : isNonaktif ? '#E11D48' : '#059669';

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedStudent(item)}
                style={styles.studentCard}
              >
                <View style={styles.cardHeaderRow}>
                  {/* Avatar Initial */}
                  <View style={[styles.avatarCircle, { backgroundColor: isMutasi ? '#EDE9FE' : '#D1FAE5' }]}>
                    <Text style={[styles.avatarText, { color: isMutasi ? '#7C3AED' : '#047857' }]}>
                      {studentName.charAt(0).toUpperCase()}
                    </Text>
                  </View>

                  {/* Identity Text */}
                  <View style={styles.cardInfoWrap}>
                    <View style={styles.nameRow}>
                      <Text style={styles.studentNameText} numberOfLines={1}>
                        {studentName}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{statusLabel}</Text>
                      </View>
                    </View>

                    <Text style={styles.nisText}>
                      NIS: {nis} {unitName ? `• ${unitName}` : ''}
                    </Text>

                    <View style={styles.classPillRow}>
                      <View style={styles.classPill}>
                        <MaterialCommunityIcons name="google-classroom" size={12} color="#059669" />
                        <Text style={styles.classPillText}>{kelasName}</Text>
                      </View>
                    </View>
                  </View>
                </View>

                {/* Footer Strip with Ortu & WhatsApp */}
                <View style={styles.cardFooter}>
                  <View style={styles.parentWrap}>
                    <MaterialCommunityIcons name="account-child-outline" size={14} color="#64748B" />
                    <Text style={styles.parentText} numberOfLines={1}>
                      {parentName}
                    </Text>
                  </View>

                  {Boolean(parentPhone) && (
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleOpenWhatsApp(parentPhone, studentName)}
                      style={styles.waBtn}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={14} color="#FFFFFF" />
                      <Text style={styles.waBtnText}>Hubungi</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* ── MODAL DETAIL SANTRI ── */}
      <Modal
        visible={Boolean(selectedStudent)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedStudent(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="card-account-details-outline" size={20} color="#059669" />
                <Text style={styles.modalTitle}>Biodata Santri</Text>
              </View>
              <TouchableOpacity onPress={() => setSelectedStudent(null)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView contentContainerStyle={styles.modalBody}>
              {selectedStudent && (
                <>
                  <View style={styles.modalProfileCenter}>
                    <View style={styles.modalAvatarCircle}>
                      <Text style={styles.modalAvatarText}>
                        {(selectedStudent.name || selectedStudent.nama_lengkap || 'S').charAt(0).toUpperCase()}
                      </Text>
                    </View>
                    <Text style={styles.modalStudentName}>
                      {selectedStudent.name || selectedStudent.nama_lengkap || selectedStudent.full_name}
                    </Text>
                    <Text style={styles.modalStudentSub}>
                      NIS: {selectedStudent.nis || '—'} • NISN: {selectedStudent.nisn || '—'}
                    </Text>
                  </View>

                  <View style={styles.detailGrid}>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Rombel / Kelas</Text>
                      <Text style={styles.detailValue}>
                        {selectedStudent.kelas?.nama_kelas || selectedStudent.kelas_nama || '—'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Jenis Kelamin</Text>
                      <Text style={styles.detailValue}>
                        {String(selectedStudent.gender || selectedStudent.jenis_kelamin || '').startsWith('l')
                          ? 'Laki-laki (Ikhwan)'
                          : 'Perempuan (Akhwat)'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Status Santri</Text>
                      <Text style={styles.detailValue}>{selectedStudent.status || 'Aktif'}</Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Wali / Orang Tua</Text>
                      <Text style={styles.detailValue}>
                        {selectedStudent.parent_name || selectedStudent.nama_ortu || '—'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Nomor WhatsApp</Text>
                      <Text style={styles.detailValue}>
                        {selectedStudent.parent_phone || selectedStudent.telepon_ortu || '—'}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Alamat Lengkap</Text>
                      <Text style={styles.detailValue}>{selectedStudent.address || selectedStudent.alamat || '—'}</Text>
                    </View>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCloseMainBtn}
                onPress={() => setSelectedStudent(null)}
              >
                <Text style={styles.modalCloseMainBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── NOTIFIKASI SUKSES & GAGAL ── */}
      <AppFeedbackModal
        visible={feedback.visible}
        type={feedback.type}
        title={feedback.title}
        message={feedback.message}
        onClose={() => setFeedback({ ...feedback, visible: false })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F8FAFC',
  },
  headerContainer: {
    paddingHorizontal: 16,
    paddingBottom: 16,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
    elevation: 4,
    shadowColor: '#065F46',
    shadowOpacity: 0.15,
    shadowRadius: 8,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  headerBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#A7F3D0',
    letterSpacing: 0.6,
  },
  headerMainTitle: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
    marginTop: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    fontWeight: '600',
  },
  kpiStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 12,
    marginTop: 12,
  },
  kpiItem: {
    alignItems: 'center',
    flex: 1,
  },
  kpiVal: {
    fontSize: 15,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  kpiLbl: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#D1FAE5',
    marginTop: 1,
  },
  kpiDivider: {
    width: 1,
    height: 18,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  filterBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    gap: 4,
  },
  filterChipActive: {
    backgroundColor: '#059669',
  },
  filterChipActivePurple: {
    backgroundColor: '#7C3AED',
  },
  filterChipActiveAmber: {
    backgroundColor: '#D97706',
  },
  filterChipActiveBlue: {
    backgroundColor: '#2563EB',
  },
  filterChipActivePink: {
    backgroundColor: '#DB2777',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  chipDivider: {
    width: 1,
    height: 16,
    backgroundColor: '#CBD5E1',
    marginHorizontal: 2,
  },
  resetChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#FEF2F2',
    gap: 4,
  },
  resetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#EF4444',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  listContent: {
    padding: 14,
    gap: 10,
  },
  studentCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    padding: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  avatarCircle: {
    width: 42,
    height: 42,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    fontSize: 16,
    fontWeight: '900',
  },
  cardInfoWrap: {
    flex: 1,
  },
  nameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  studentNameText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  nisText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  classPillRow: {
    flexDirection: 'row',
    marginTop: 4,
  },
  classPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  classPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
  },
  cardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 10,
    paddingTop: 8,
  },
  parentWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  parentText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  waBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  waBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 8,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#1E293B',
  },
  emptySubtitle: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingBottom: 20,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalCloseBtn: {
    padding: 4,
  },
  modalBody: {
    padding: 16,
  },
  modalProfileCenter: {
    alignItems: 'center',
    paddingVertical: 10,
  },
  modalAvatarCircle: {
    width: 60,
    height: 60,
    borderRadius: 20,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  modalAvatarText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#059669',
  },
  modalStudentName: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalStudentSub: {
    fontSize: 12,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  detailGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginTop: 12,
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailLabel: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  detailValue: {
    fontSize: 12,
    fontWeight: '800',
    color: '#1E293B',
    maxWidth: '55%',
    textAlign: 'right',
  },
  modalFooter: {
    paddingHorizontal: 16,
    paddingTop: 10,
  },
  modalCloseMainBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 12,
    alignItems: 'center',
  },
  modalCloseMainBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#475569',
  },
});
