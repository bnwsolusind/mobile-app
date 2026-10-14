import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
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

export default function PantauKelasScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const localNav = useNavigation<any>();
  const nav = navigation || localNav;
  const user = useAuthStore((state) => state.user);

  // ── States ──
  const [classes, setClasses] = useState<any[]>([]);
  const [allStudents, setAllStudents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');

  // ── Filters ──
  const [filterJenjang, setFilterJenjang] = useState<string>('all');
  const [filterStatusRuang, setFilterStatusRuang] = useState<'all' | 'tersedia' | 'penuh' | 'over'>('all');

  // ── Drill-down Santri Per Rombel Modal ──
  const [selectedClassForDrilldown, setSelectedClassForDrilldown] = useState<any | null>(null);
  const [classStudents, setClassStudents] = useState<any[]>([]);
  const [loadingClassStudents, setLoadingClassStudents] = useState(false);

  // ── Modal Ubah Kuota Rombel ──
  const [editingClass, setEditingClass] = useState<any | null>(null);
  const [newCapacity, setNewCapacity] = useState<string>('30');
  const [savingCapacity, setSavingCapacity] = useState<boolean>(false);

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

  // Debounce search
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
      const [resClasses, resStudents] = await Promise.all([
        mobileApiService.getClasses({ per_page: 100 }),
        mobileApiService.getStudents({ per_page: 500 }),
      ]);

      const collClasses = unwrapCollection(resClasses);
      const collStudents = unwrapCollection(resStudents);

      setClasses(Array.isArray(collClasses) ? collClasses : []);
      setAllStudents(Array.isArray(collStudents) ? collStudents : []);

      if (isPull) {
        setFeedback({
          visible: true,
          type: 'success',
          title: 'Data Rombel Diperbarui',
          message: `Berhasil memuat ${Array.isArray(collClasses) ? collClasses.length : 0} rombel kelas operasional.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memuat Data Kelas',
        message: err?.message || 'Terjadi gangguan jaringan saat memuat daftar rombel.',
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

  // WhatsApp Wali Kelas Helper
  const handleOpenWhatsApp = (phone: string, waliName: string, className: string) => {
    const cleanPhone = String(phone || '').replace(/\D/g, '').replace(/^0/, '62');
    if (cleanPhone.length < 8) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Kontak Tidak Tersedia',
        message: `Nomor telepon untuk Wali Kelas ${waliName} (${className}) belum terdaftar.`,
      });
      return;
    }
    const message = encodeURIComponent(
      `Assalamu'alaikum Warahmatullahi Wabarakatuh Ustadz/Ustadzah ${waliName}. Terkait koordinasi kelas ${className}.`
    );
    Linking.openURL(`https://wa.me/${cleanPhone}?text=${message}`).catch(() => {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Membuka WhatsApp',
        message: 'Aplikasi WhatsApp tidak terpasang di perangkat ini.',
      });
    });
  };

  // Open Drill-Down Santri di Rombel
  const handleOpenClassStudents = async (cls: any) => {
    setSelectedClassForDrilldown(cls);
    setLoadingClassStudents(true);

    try {
      // Coba ambil via API spesifik kelas
      const cId = String(cls.id);
      const res = await mobileApiService.getClassStudents(cId).catch(() => null);
      const coll = unwrapCollection(res);

      if (Array.isArray(coll) && coll.length > 0) {
        setClassStudents(coll);
      } else {
        // Fallback filter dari allStudents
        const localList = allStudents.filter((st) => {
          const sClassId = String(st.kelas_id || st.kelas?.id || '');
          const sClassName = String(st.kelas?.nama_kelas || st.kelas_nama || '').toLowerCase();
          const targetName = String(cls.name || cls.nama_kelas || '').toLowerCase();
          return sClassId === cId || sClassName === targetName;
        });
        setClassStudents(localList);
      }
    } catch {
      // Fallback local
      const localList = allStudents.filter((st) => {
        const sClassId = String(st.kelas_id || st.kelas?.id || '');
        return sClassId === String(cls.id);
      });
      setClassStudents(localList);
    } finally {
      setLoadingClassStudents(false);
    }
  };

  // ── Open Ubah Kuota Modal ──
  const handleOpenEditCapacity = (cls: any) => {
    setEditingClass(cls);
    setNewCapacity(String(cls.kapasitas || 30));
  };

  // ── Simpan Pembaruan Kuota Rombel ──
  const handleSaveCapacity = async () => {
    if (!editingClass) return;
    const parsedCap = parseInt(newCapacity, 10);
    if (isNaN(parsedCap) || parsedCap < 1) {
      setFeedback({
        visible: true,
        type: 'warning',
        title: 'Kapasitas Tidak Valid',
        message: 'Kapasitas rombel minimal harus 1 siswa.',
      });
      return;
    }

    setSavingCapacity(true);
    try {
      const classId = String(editingClass.id);
      const existingCount = Number(
        editingClass.students_count ||
        editingClass.jumlah_siswa ||
        editingClass.total_students ||
        0
      );

      // Kirim pembaruan kapasitas via API
      await mobileApiService.updateClass(classId, {
        kapasitas: parsedCap,
        unit_pendidikan_id: editingClass.unit_pendidikan_id || editingClass.unitPendidikan?.id,
        tahun_ajaran_id: editingClass.tahun_ajaran_id || editingClass.tahunAjaran?.id,
        semester_id: editingClass.semester_id || editingClass.semester?.id,
        jenjang: editingClass.jenjang || editingClass.unitPendidikan?.level || editingClass.unit_name || '',
        tingkat: String(editingClass.tingkat || '1'),
        kode_kelas: editingClass.kode_kelas || editingClass.code,
        nama_kelas: editingClass.nama_kelas || editingClass.name,
        status: editingClass.status || 'Aktif',
        wali_kelas_id: editingClass.wali_kelas_id || editingClass.wali_kelas?.id || null,
        ruangan: editingClass.ruangan || null,
      });

      // Update state classes secara reaktif
      setClasses((prev) =>
        prev.map((c) =>
          String(c.id) === classId ? { ...c, kapasitas: parsedCap } : c
        )
      );

      const className = editingClass.name || editingClass.nama_kelas || 'Rombel';
      const isNowFull = existingCount >= parsedCap;
      const isOver = existingCount > parsedCap;

      setEditingClass(null);

      // Notifikasi Feedback
      if (isOver) {
        setFeedback({
          visible: true,
          type: 'warning',
          title: '⚠️ Peringatan: Kuota Kelas Masih Berlebih',
          message: `Daya tampung ${className} diatur ke ${parsedCap} siswa, namun santri aktif berjumlah ${existingCount} siswa (+${existingCount - parsedCap} santri over kuota).`,
        });
      } else if (isNowFull) {
        setFeedback({
          visible: true,
          type: 'info',
          title: '🔒 Notifikasi: Kuota Kelas Penuh (100%)',
          message: `Daya tampung ${className} berhasil disetel ke ${parsedCap} siswa. Kuota kelas saat ini terisi penuh (${existingCount}/${parsedCap} siswa).`,
        });
      } else {
        setFeedback({
          visible: true,
          type: 'success',
          title: '✅ Kuota Kelas Berhasil Diperbarui',
          message: `Daya tampung ${className} berhasil diubah menjadi ${parsedCap} siswa. Tersedia sisa kuota untuk ${parsedCap - existingCount} santri baru.`,
        });
      }
    } catch (err: any) {
      setFeedback({
        visible: true,
        type: 'error',
        title: 'Gagal Memperbarui Kuota',
        message: err?.response?.data?.message || err?.message || 'Terjadi kesalahan sistem saat memperbarui daya tampung kelas.',
      });
    } finally {
      setSavingCapacity(false);
    }
  };

  // Filtered Classes
  const filteredClasses = useMemo(() => {
    return classes.filter((item) => {
      const className = String(item.name || item.nama_kelas || '').toLowerCase();
      const waliName = String(
        item.wali_kelas?.nama_tampil ||
        item.wali_kelas?.nama_lengkap ||
        item.wali_kelas?.nama ||
        item.wali_kelas?.name ||
        item.waliKelas?.nama_tampil ||
        item.waliKelas?.nama_lengkap ||
        item.waliKelas?.nama ||
        item.wali_name ||
        ''
      ).toLowerCase();
      const jenjang = String(item.jenjang || item.level || '').toLowerCase();

      // Search Query
      if (debouncedQuery) {
        if (!className.includes(debouncedQuery) && !waliName.includes(debouncedQuery)) {
          return false;
        }
      }

      // Filter Jenjang
      if (filterJenjang !== 'all') {
        if (!jenjang.includes(filterJenjang.toLowerCase()) && !className.includes(filterJenjang.toLowerCase())) {
          return false;
        }
      }

      // Filter Status Ruang
      const kap = Number(item.kapasitas || 30);
      const count = Number(item.students_count || item.jumlah_siswa || item.total_students || 0);
      const isFull = count >= kap;
      const isOver = count > kap;

      if (filterStatusRuang === 'over' && !isOver) return false;
      if (filterStatusRuang === 'penuh' && !isFull) return false;
      if (filterStatusRuang === 'tersedia' && isFull) return false;

      return true;
    });
  }, [classes, debouncedQuery, filterJenjang, filterStatusRuang]);

  // Statistics KPI
  const stats = useMemo(() => {
    let totalKapasitas = 0;
    let totalTerisi = 0;
    let kelasPenuh = 0;
    let kelasOver = 0;

    classes.forEach((c) => {
      const kap = Number(c.kapasitas || 30);
      const count = Number(c.students_count || c.jumlah_siswa || c.total_students || 0);
      totalKapasitas += kap;
      totalTerisi += count;
      if (count > kap) {
        kelasOver++;
        kelasPenuh++;
      } else if (count >= kap) {
        kelasPenuh++;
      }
    });

    return {
      totalRombel: classes.length,
      totalKapasitas,
      totalTerisi,
      kelasPenuh,
      kelasOver,
      kelasTersedia: Math.max(0, classes.length - kelasPenuh),
    };
  }, [classes]);

  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);

  return (
    <View style={styles.container}>
      {/* ── HEADER HALAMAN PANTAU KELAS ── */}
      <LinearGradient
        colors={['#9A3412', '#C2410C', '#EA580C']}
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
              <MaterialCommunityIcons name="google-classroom" size={12} color="#FED7AA" />
              <Text style={styles.headerBadgeText}>SUPERVISI KESISWAAN</Text>
            </View>
            <Text style={styles.headerMainTitle}>Pantau Kelas & Rombel</Text>
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
            placeholder="Cari nama rombel / kelas atau nama wali kelas..."
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

        {/* 4 KPI Cards (Sesuai MasterKelasPage.jsx di Web Dashboard) */}
        <View style={styles.kpiCardsRow}>
          <View style={styles.kpiBox}>
            <Text style={styles.kpiVal}>{stats.totalRombel}</Text>
            <Text style={styles.kpiLbl}>Total Rombel</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiBox}>
            <Text style={[styles.kpiVal, { color: '#FED7AA' }]}>{stats.totalTerisi}</Text>
            <Text style={styles.kpiLbl}>Santri Terisi</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiBox}>
            <Text style={[styles.kpiVal, { color: '#BBF7D0' }]}>{stats.totalKapasitas}</Text>
            <Text style={styles.kpiLbl}>Daya Tampung</Text>
          </View>
          <View style={styles.kpiDivider} />
          <View style={styles.kpiBox}>
            <Text style={[styles.kpiVal, { color: stats.kelasOver > 0 ? '#FECDD3' : stats.kelasPenuh > 0 ? '#FED7AA' : '#FFFFFF' }]}>
              {stats.kelasPenuh}
            </Text>
            <Text style={styles.kpiLbl}>
              {stats.kelasOver > 0 ? `${stats.kelasPenuh} Penuh (${stats.kelasOver} Over)` : 'Kelas Penuh'}
            </Text>
          </View>
        </View>
      </LinearGradient>

      {/* ── NOTIFIKASI ALERT KUOTA KELAS PENUH / BERLEBIH ── */}
      {stats.kelasPenuh > 0 && (
        <View
          style={[
            styles.alertBanner,
            stats.kelasOver > 0 ? styles.alertBannerDanger : styles.alertBannerWarning,
          ]}
        >
          <View
            style={[
              styles.alertBannerIconWrap,
              { backgroundColor: stats.kelasOver > 0 ? '#FEE2E2' : '#FEF3C7' },
            ]}
          >
            <MaterialCommunityIcons
              name={stats.kelasOver > 0 ? 'alert-octagon' : 'alert-circle'}
              size={20}
              color={stats.kelasOver > 0 ? '#DC2626' : '#D97706'}
            />
          </View>
          <View style={{ flex: 1 }}>
            <Text
              style={[
                styles.alertBannerTitle,
                { color: stats.kelasOver > 0 ? '#991B1B' : '#92400E' },
              ]}
            >
              {stats.kelasOver > 0
                ? `Perhatian: ${stats.kelasOver} Rombel Melebihi Kuota!`
                : `Notifikasi: ${stats.kelasPenuh} Rombel Kuota Penuh (100%)`}
            </Text>
            <Text
              style={[
                styles.alertBannerText,
                { color: stats.kelasOver > 0 ? '#B91C1C' : '#B45309' },
              ]}
            >
              {stats.kelasOver > 0
                ? 'Terdapat rombel dengan santri melebihi daya tampung. Gunakan tombol "Ubah Kuota" pada kartu kelas untuk menyesuaikan kapasitas.'
                : 'Daya tampung maksimal telah tercapai. Santri baru tidak dapat ditambahkan ke rombel ini hingga kuota dinaikkan.'}
            </Text>
          </View>
        </View>
      )}

      {/* ── FILTER HORIZONTAL STRIP ── */}
      <View style={styles.filterBarWrapper}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterScroll}>
          {/* Jenjang Filters */}
          <TouchableOpacity
            style={[styles.filterChip, filterJenjang === 'all' && styles.filterChipActive]}
            onPress={() => setFilterJenjang('all')}
          >
            <Text style={[styles.filterChipText, filterJenjang === 'all' && styles.filterChipTextActive]}>
              Semua Jenjang
            </Text>
          </TouchableOpacity>
          {['TK', 'SD', 'SMP', 'SMA', 'MIT', 'MA', 'Ponpes'].map((j) => (
            <TouchableOpacity
              key={j}
              style={[styles.filterChip, filterJenjang === j && styles.filterChipActive]}
              onPress={() => setFilterJenjang(filterJenjang === j ? 'all' : j)}
            >
              <Text style={[styles.filterChipText, filterJenjang === j && styles.filterChipTextActive]}>
                {j}
              </Text>
            </TouchableOpacity>
          ))}

          <View style={styles.chipDivider} />

          {/* Kuota Status */}
          <TouchableOpacity
            style={[styles.filterChip, filterStatusRuang === 'tersedia' && styles.filterChipActiveGreen]}
            onPress={() => setFilterStatusRuang(filterStatusRuang === 'tersedia' ? 'all' : 'tersedia')}
          >
            <MaterialCommunityIcons name="check-circle-outline" size={13} color={filterStatusRuang === 'tersedia' ? '#FFF' : '#059669'} />
            <Text style={[styles.filterChipText, filterStatusRuang === 'tersedia' && styles.filterChipTextActive]}>
              Tersedia Kuota
            </Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.filterChip, filterStatusRuang === 'penuh' && styles.filterChipActiveRed]}
            onPress={() => setFilterStatusRuang(filterStatusRuang === 'penuh' ? 'all' : 'penuh')}
          >
            <MaterialCommunityIcons name="alert-circle-outline" size={13} color={filterStatusRuang === 'penuh' ? '#FFF' : '#E11D48'} />
            <Text style={[styles.filterChipText, filterStatusRuang === 'penuh' && styles.filterChipTextActive]}>
              Ruang Penuh
            </Text>
          </TouchableOpacity>
          {stats.kelasOver > 0 && (
            <TouchableOpacity
              style={[styles.filterChip, filterStatusRuang === 'over' && styles.filterChipActiveDarkRed]}
              onPress={() => setFilterStatusRuang(filterStatusRuang === 'over' ? 'all' : 'over')}
            >
              <MaterialCommunityIcons name="alert-octagon" size={13} color={filterStatusRuang === 'over' ? '#FFF' : '#DC2626'} />
              <Text style={[styles.filterChipText, filterStatusRuang === 'over' && styles.filterChipTextActive]}>
                Over Kuota ({stats.kelasOver})
              </Text>
            </TouchableOpacity>
          )}
        </ScrollView>
      </View>

      {/* ── DAFTAR KELAS & ROMBEL ── */}
      {loading ? (
        <View style={styles.loadingBox}>
          <ActivityIndicator size="large" color="#EA580C" />
          <Text style={styles.loadingText}>Memuat data rombel kelas...</Text>
        </View>
      ) : (
        <FlatList
          data={filteredClasses}
          keyExtractor={(item, index) => String(item.id ?? item.kode_kelas ?? `kelas-${index}`)}
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={() => loadData(true)} colors={['#EA580C']} />
          }
          ListEmptyComponent={
            <View style={styles.emptyBox}>
              <MaterialCommunityIcons name="google-classroom" size={54} color="#CBD5E1" />
              <Text style={styles.emptyTitle}>Kelas Tidak Ditemukan</Text>
              <Text style={styles.emptySubtitle}>Tidak ada rombel yang sesuai dengan filter atau kata kunci.</Text>
            </View>
          }
          renderItem={({ item }) => {
            const className = item.name || item.nama_kelas || item.title || 'Rombel';
            const tingkat = item.tingkat ? `Tingkat ${item.tingkat}` : (item.grade || '—');
            const jenjang = item.jenjang || item.level || 'Reguler';
            const wali = item.wali_kelas || item.waliKelas || {};
            const waliName =
              wali.nama_tampil ||
              wali.nama_lengkap ||
              wali.nama ||
              wali.name ||
              item.wali_name ||
              'Belum Ditentukan';
            const waliPhone = wali.no_hp || wali.phone || wali.telepon || '';
            const kapasitas = Number(item.kapasitas || 30);
            const terisi = Number(item.students_count || item.jumlah_siswa || item.total_students || 0);

            const ratio = kapasitas > 0 ? Math.round((terisi / kapasitas) * 100) : 0;
            const isOver = terisi > kapasitas;
            const isExactFull = terisi === kapasitas;
            const isFull = terisi >= kapasitas;
            const isNearFull = !isFull && ratio >= 80;

            const progressColor = isOver
              ? '#DC2626'
              : isExactFull
              ? '#E11D48'
              : isNearFull
              ? '#D97706'
              : '#059669';
            const badgeBg = isOver
              ? '#FEF2F2'
              : isExactFull
              ? '#FFF1F2'
              : isNearFull
              ? '#FFFBEB'
              : '#ECFDF5';
            const badgeColor = isOver
              ? '#DC2626'
              : isExactFull
              ? '#BE123C'
              : isNearFull
              ? '#B45309'
              : '#047857';
            const badgeLabel = isOver
              ? `⚠️ Over Kuota (+${terisi - kapasitas})`
              : isExactFull
              ? '🔒 Kuota Penuh (100%)'
              : isNearFull
              ? 'Hampir Penuh'
              : `Tersedia (${kapasitas - terisi})`;

            return (
              <View style={styles.classCard}>
                <View style={styles.cardHeaderRow}>
                  {/* Icon Box */}
                  <View style={[styles.classIconSquare, { backgroundColor: isOver ? '#FEE2E2' : isFull ? '#FFE4E6' : '#FFEDD5' }]}>
                    <MaterialCommunityIcons
                      name={isOver ? 'alert-octagon' : 'google-classroom'}
                      size={22}
                      color={isOver ? '#DC2626' : isFull ? '#E11D48' : '#C2410C'}
                    />
                  </View>

                  {/* Title & Jenjang */}
                  <View style={{ flex: 1 }}>
                    <View style={styles.titleRow}>
                      <Text style={styles.classTitleText} numberOfLines={1}>
                        {className}
                      </Text>
                      <View style={[styles.statusBadge, { backgroundColor: badgeBg }]}>
                        <Text style={[styles.statusBadgeText, { color: badgeColor }]}>{badgeLabel}</Text>
                      </View>
                    </View>
                    <Text style={styles.classSubText}>{tingkat} • Jenjang {jenjang}</Text>
                  </View>
                </View>

                {/* Progress Bar Keterisian Kuota */}
                <View style={[styles.progressBox, isOver && { backgroundColor: '#FEF2F2' }]}>
                  <View style={styles.progressLabelRow}>
                    <Text style={styles.progressLabelLeft}>
                      Keterisian: <Text style={{ fontWeight: '800', color: progressColor }}>{terisi}</Text> / {kapasitas} Siswa
                    </Text>
                    <Text style={[styles.progressLabelRight, { color: progressColor }]}>{ratio}%</Text>
                  </View>
                  <View style={styles.progressTrack}>
                    <View
                      style={[
                        styles.progressFill,
                        { width: `${Math.min(ratio, 100)}%`, backgroundColor: progressColor },
                      ]}
                    />
                  </View>
                </View>

                {/* Wali Kelas & Action Row */}
                <View style={styles.cardFooterRow}>
                  <View style={styles.waliInfoWrap}>
                    <View style={styles.waliAvatar}>
                      <MaterialCommunityIcons name="account-tie" size={16} color="#C2410C" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.waliNameText} numberOfLines={1}>
                        {waliName}
                      </Text>
                      <Text style={styles.waliLabel}>Wali Kelas</Text>
                    </View>
                  </View>

                  <View style={styles.cardActionGroup}>
                    {Boolean(waliPhone) && (
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={() => handleOpenWhatsApp(waliPhone, waliName, className)}
                        style={styles.waBtn}
                      >
                        <MaterialCommunityIcons name="whatsapp" size={14} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}

                    {/* Tombol Ubah Kuota Rombel */}
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenEditCapacity(item)}
                      style={styles.editCapacityBtn}
                    >
                      <MaterialCommunityIcons name="pencil-outline" size={13} color="#D97706" />
                      <Text style={styles.editCapacityBtnText}>Ubah Kuota</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenClassStudents(item)}
                      style={styles.drilldownBtn}
                    >
                      <MaterialCommunityIcons name="account-group" size={14} color="#C2410C" />
                      <Text style={styles.drilldownBtnText}>Santri ({terisi})</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            );
          }}
        />
      )}

      {/* ── MODAL DRILL-DOWN SANTRI PER ROMBEL ── */}
      <Modal
        visible={Boolean(selectedClassForDrilldown)}
        animationType="slide"
        transparent
        onRequestClose={() => setSelectedClassForDrilldown(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalTitleRow}>
                <MaterialCommunityIcons name="account-group" size={20} color="#EA580C" />
                <View>
                  <Text style={styles.modalTitle}>
                    {selectedClassForDrilldown?.name || selectedClassForDrilldown?.nama_kelas || 'Rombel'}
                  </Text>
                  <Text style={styles.modalSubtitle}>Daftar Santri Terdaftar di Kelas Ini</Text>
                </View>
              </View>
              <TouchableOpacity onPress={() => setSelectedClassForDrilldown(null)} style={styles.modalCloseBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {loadingClassStudents ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 8 }}>
                <ActivityIndicator size="small" color="#EA580C" />
                <Text style={{ fontSize: 12, color: '#64748B', fontWeight: '600' }}>
                  Memuat daftar santri di rombel ini...
                </Text>
              </View>
            ) : classStudents.length === 0 ? (
              <View style={{ padding: 40, alignItems: 'center', gap: 6 }}>
                <MaterialCommunityIcons name="account-off-outline" size={40} color="#CBD5E1" />
                <Text style={{ fontSize: 13, fontWeight: '800', color: '#1E293B' }}>Belum Ada Siswa</Text>
                <Text style={{ fontSize: 11.5, color: '#64748B', textAlign: 'center' }}>
                  Belum ada santri yang dimasukkan ke rombongan belajar ini.
                </Text>
              </View>
            ) : (
              <FlatList
                data={classStudents}
                keyExtractor={(item, index) => String(item.id ?? item.nis ?? `santri-${index}`)}
                contentContainerStyle={{ padding: 14, gap: 8 }}
                renderItem={({ item, index }) => (
                  <View style={styles.drillStudentRow}>
                    <View style={styles.drillStudentNumber}>
                      <Text style={styles.drillStudentNumberText}>{index + 1}</Text>
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.drillStudentName}>{item.name || item.nama_lengkap || 'Santri'}</Text>
                      <Text style={styles.drillStudentNis}>NIS: {item.nis || '—'}</Text>
                    </View>
                    <View style={styles.drillStudentGender}>
                      <Text style={styles.drillStudentGenderText}>
                        {String(item.gender || item.jk || '').toLowerCase().startsWith('p') ? 'Akhwat' : 'Ikhwan'}
                      </Text>
                    </View>
                  </View>
                )}
              />
            )}

            <View style={styles.modalFooter}>
              <TouchableOpacity
                style={styles.modalCloseMainBtn}
                onPress={() => setSelectedClassForDrilldown(null)}
              >
                <Text style={styles.modalCloseMainBtnText}>Tutup</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── MODAL UBAH KUOTA / KAPASITAS ROMBEL ── */}
      <Modal
        visible={Boolean(editingClass)}
        animationType="fade"
        transparent
        onRequestClose={() => !savingCapacity && setEditingClass(null)}
      >
        <View style={styles.modalBackdropCenter}>
          <View style={styles.editCapacityCard}>
            {/* Header Modal */}
            <View style={styles.editModalHeader}>
              <View style={styles.editModalIconSquare}>
                <MaterialCommunityIcons name="seat-passenger" size={22} color="#EA580C" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.editModalTitle}>Ubah Kuota Rombel</Text>
                <Text style={styles.editModalSubtitle} numberOfLines={1}>
                  {editingClass?.name || editingClass?.nama_kelas || 'Kelas'}
                </Text>
              </View>
              <TouchableOpacity
                disabled={savingCapacity}
                onPress={() => setEditingClass(null)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Info Rombel Saat Ini */}
            <View style={styles.editInfoBox}>
              <View style={styles.editInfoItem}>
                <Text style={styles.editInfoLabel}>Santri Terdaftar</Text>
                <Text style={styles.editInfoValPrimary}>
                  {Number(editingClass?.students_count || editingClass?.jumlah_siswa || 0)} Siswa
                </Text>
              </View>
              <View style={styles.editInfoDivider} />
              <View style={styles.editInfoItem}>
                <Text style={styles.editInfoLabel}>Kapasitas Saat Ini</Text>
                <Text style={styles.editInfoValSecondary}>
                  {Number(editingClass?.kapasitas || 30)} Siswa
                </Text>
              </View>
            </View>

            {/* Input Stepper Kuota Baru */}
            <View style={styles.inputSection}>
              <Text style={styles.inputSectionLabel}>Setel Daya Tampung Maksimal:</Text>
              <View style={styles.stepperRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={savingCapacity}
                  onPress={() => {
                    const current = parseInt(newCapacity, 10) || 1;
                    if (current > 1) setNewCapacity(String(current - 1));
                  }}
                  style={styles.stepperBtn}
                >
                  <MaterialCommunityIcons name="minus" size={20} color="#C2410C" />
                </TouchableOpacity>

                <TextInput
                  style={styles.stepperInput}
                  keyboardType="number-pad"
                  value={newCapacity}
                  onChangeText={(val) => setNewCapacity(val.replace(/\D/g, ''))}
                  maxLength={3}
                  editable={!savingCapacity}
                />

                <TouchableOpacity
                  activeOpacity={0.7}
                  disabled={savingCapacity}
                  onPress={() => {
                    const current = parseInt(newCapacity, 10) || 0;
                    setNewCapacity(String(current + 1));
                  }}
                  style={styles.stepperBtn}
                >
                  <MaterialCommunityIcons name="plus" size={20} color="#C2410C" />
                </TouchableOpacity>
              </View>

              {/* Preset Cepat */}
              <View style={styles.presetRow}>
                {[28, 30, 32, 35, 50].map((preset) => (
                  <TouchableOpacity
                    key={preset}
                    activeOpacity={0.7}
                    disabled={savingCapacity}
                    onPress={() => setNewCapacity(String(preset))}
                    style={[
                      styles.presetChip,
                      newCapacity === String(preset) && styles.presetChipActive,
                    ]}
                  >
                    <Text
                      style={[
                        styles.presetChipText,
                        newCapacity === String(preset) && styles.presetChipTextActive,
                      ]}
                    >
                      {preset}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </View>

            {/* Realtime Status Indicator Preview */}
            {(() => {
              const currentCount = Number(
                editingClass?.students_count ||
                editingClass?.jumlah_siswa ||
                0
              );
              const target = parseInt(newCapacity, 10) || 0;
              const isOver = currentCount > target;
              const isExact = currentCount === target;

              if (target <= 0) return null;

              if (isOver) {
                return (
                  <View style={styles.previewOverBox}>
                    <MaterialCommunityIcons name="alert-octagon" size={16} color="#DC2626" />
                    <Text style={styles.previewOverText}>
                      ⚠️ Peringatan: Kuota ({target}) masih kurang dari santri aktif ({currentCount}). Kelebihan kuota +{currentCount - target} santri!
                    </Text>
                  </View>
                );
              }
              if (isExact) {
                return (
                  <View style={styles.previewFullBox}>
                    <MaterialCommunityIcons name="lock-outline" size={16} color="#BE123C" />
                    <Text style={styles.previewFullText}>
                      🔒 Kuota Pas Penuh (100%): Rombel terisi penuh tepat {target} santri.
                    </Text>
                  </View>
                );
              }
              return (
                <View style={styles.previewAvailableBox}>
                  <MaterialCommunityIcons name="check-circle-outline" size={16} color="#059669" />
                  <Text style={styles.previewAvailableText}>
                    ✅ Kuota Tersedia: Tersisa kapasitas untuk {target - currentCount} santri baru.
                  </Text>
                </View>
              );
            })()}

            {/* Action Buttons */}
            <View style={styles.editActionRow}>
              <TouchableOpacity
                disabled={savingCapacity}
                onPress={() => setEditingClass(null)}
                style={styles.editCancelBtn}
              >
                <Text style={styles.editCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={savingCapacity}
                onPress={handleSaveCapacity}
                style={styles.editSaveBtn}
              >
                {savingCapacity ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="content-save-outline" size={16} color="#FFFFFF" />
                    <Text style={styles.editSaveBtnText}>Simpan Kuota</Text>
                  </>
                )}
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
    shadowColor: '#9A3412',
    shadowOpacity: 0.2,
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
    color: '#FED7AA',
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
  kpiCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 14,
    paddingVertical: 8,
    paddingHorizontal: 10,
    marginTop: 12,
  },
  kpiBox: {
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
    color: '#FFEDD5',
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
    backgroundColor: '#EA580C',
  },
  filterChipActiveGreen: {
    backgroundColor: '#059669',
  },
  filterChipActiveRed: {
    backgroundColor: '#E11D48',
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
  classCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#FED7AA',
    padding: 14,
    shadowColor: '#9A3412',
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  classIconSquare: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 6,
  },
  classTitleText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  classSubText: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  progressBox: {
    backgroundColor: '#FFF7ED',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabelLeft: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  progressLabelRight: {
    fontSize: 11.5,
    fontWeight: '800',
  },
  progressTrack: {
    height: 6,
    backgroundColor: '#FED7AA',
    borderRadius: 3,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    borderRadius: 3,
  },
  cardFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    marginTop: 12,
    paddingTop: 10,
  },
  waliInfoWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  waliAvatar: {
    width: 30,
    height: 30,
    borderRadius: 9,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  waliNameText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  waliLabel: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#94A3B8',
  },
  cardActionGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  waBtn: {
    backgroundColor: '#10B981',
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  drilldownBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  drilldownBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C2410C',
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
    maxHeight: '80%',
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
    gap: 10,
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    fontWeight: '600',
  },
  modalCloseBtn: {
    padding: 4,
  },
  drillStudentRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    gap: 10,
  },
  drillStudentNumber: {
    width: 24,
    height: 24,
    borderRadius: 7,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  drillStudentNumberText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#C2410C',
  },
  drillStudentName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#1E293B',
  },
  drillStudentNis: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
  },
  drillStudentGender: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
  },
  drillStudentGenderText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#475569',
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
  filterChipActiveDarkRed: {
    backgroundColor: '#DC2626',
  },
  alertBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 14,
    marginTop: 10,
    marginBottom: 2,
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    gap: 10,
  },
  alertBannerDanger: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FECDD3',
  },
  alertBannerWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  alertBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBannerTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    marginBottom: 2,
  },
  alertBannerText: {
    fontSize: 11,
    lineHeight: 16,
    fontWeight: '500',
  },
  editCapacityBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 9,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  editCapacityBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#B45309',
  },
  modalBackdropCenter: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  editCapacityCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    width: '100%',
    maxWidth: 420,
    padding: 18,
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 6,
  },
  editModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  editModalIconSquare: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editModalTitle: {
    fontSize: 15,
    fontWeight: '900',
    color: '#0F172A',
  },
  editModalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 1,
  },
  editInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  editInfoItem: {
    flex: 1,
    alignItems: 'center',
  },
  editInfoLabel: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    marginBottom: 2,
  },
  editInfoValPrimary: {
    fontSize: 14,
    fontWeight: '900',
    color: '#EA580C',
  },
  editInfoValSecondary: {
    fontSize: 14,
    fontWeight: '900',
    color: '#334155',
  },
  editInfoDivider: {
    width: 1,
    height: 28,
    backgroundColor: '#CBD5E1',
  },
  inputSection: {
    marginTop: 14,
  },
  inputSectionLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 8,
  },
  stepperRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  stepperBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#FFEDD5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#FED7AA',
  },
  stepperInput: {
    width: 90,
    height: 44,
    borderRadius: 12,
    borderWidth: 1.5,
    borderColor: '#EA580C',
    backgroundColor: '#FFFFFF',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: '900',
    color: '#0F172A',
  },
  presetRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 10,
  },
  presetChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  presetChipActive: {
    backgroundColor: '#EA580C',
    borderColor: '#EA580C',
  },
  presetChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  presetChipTextActive: {
    color: '#FFFFFF',
  },
  previewOverBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  previewOverText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#DC2626',
    flex: 1,
    lineHeight: 15,
  },
  previewFullBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    padding: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  previewFullText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#BE123C',
    flex: 1,
    lineHeight: 15,
  },
  previewAvailableBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    padding: 10,
    borderRadius: 10,
    marginTop: 14,
  },
  previewAvailableText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    flex: 1,
    lineHeight: 15,
  },
  editActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 18,
  },
  editCancelBtn: {
    flex: 1,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  editCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#64748B',
  },
  editSaveBtn: {
    flex: 2,
    flexDirection: 'row',
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#EA580C',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    shadowColor: '#EA580C',
    shadowOpacity: 0.25,
    shadowRadius: 6,
    elevation: 3,
  },
  editSaveBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
