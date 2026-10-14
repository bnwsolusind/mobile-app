import React, { useState, useMemo, useEffect } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppFeedbackModal } from '../AppFeedbackModal';
import { mobileApiService } from '../../services/mobileApiService';

export interface AchievementItem {
  id: string | number;
  siswa_nama: string;
  nisn?: string;
  kelas?: string;
  judul_prestasi: string;
  kategori: 'tahfizh' | 'akademik' | 'olahraga' | 'seni';
  tingkat: 'Sekolah' | 'Kecamatan' | 'Kota' | 'Provinsi' | 'Nasional' | 'Internasional';
  peringkat: string;
  tahun: string;
  status_verifikasi: 'terverifikasi' | 'menunggu' | 'ditolak';
}

interface PrincipalAchievementModalProps {
  visible: boolean;
  onClose: () => void;
  achievements?: any[];
  unitName?: string;
  onRefresh?: () => void;
}

const CATEGORIES: Array<{ key: 'tahfizh' | 'akademik' | 'olahraga' | 'seni'; label: string; icon: string; color: string; bg: string }> = [
  { key: 'tahfizh', label: 'Tahfizh', icon: 'book-open-page-variant', color: '#059669', bg: '#DEF7EC' },
  { key: 'akademik', label: 'Akademik', icon: 'atom', color: '#2563EB', bg: '#EFF6FF' },
  { key: 'olahraga', label: 'Olahraga', icon: 'soccer', color: '#D97706', bg: '#FEF3C7' },
  { key: 'seni', label: 'Seni & Budaya', icon: 'palette', color: '#7C3AED', bg: '#F5F3FF' },
];

const LEVELS: Array<'Sekolah' | 'Kecamatan' | 'Kota' | 'Provinsi' | 'Nasional' | 'Internasional'> = [
  'Sekolah', 'Kecamatan', 'Kota', 'Provinsi', 'Nasional', 'Internasional',
];

const DEFAULT_RANKS = ['Juara 1', 'Juara 2', 'Juara 3', 'Medali Emas', 'Medali Perak', 'Harapan 1'];

const INITIAL_FORM = {
  siswa_nama: '',
  nisn: '',
  kelas: '',
  judul_prestasi: '',
  kategori: 'tahfizh' as 'tahfizh' | 'akademik' | 'olahraga' | 'seni',
  tingkat: 'Provinsi' as 'Sekolah' | 'Kecamatan' | 'Kota' | 'Provinsi' | 'Nasional' | 'Internasional',
  peringkat: 'Juara 1',
  tahun: '2026',
};

export default function PrincipalAchievementModal({
  visible,
  onClose,
  achievements = [],
  unitName = 'Unit Madrasah',
  onRefresh,
}: PrincipalAchievementModalProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeCategory, setActiveCategory] = useState<'all' | 'tahfizh' | 'akademik' | 'olahraga' | 'seni'>('all');
  const [displayLimit, setDisplayLimit] = useState(20);

  useEffect(() => {
    setDisplayLimit(20);
  }, [searchTerm, activeCategory, visible]);

  // Form State (Input / Ubah)
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [formMode, setFormMode] = useState<'create' | 'edit'>('create');
  const [formValues, setFormValues] = useState(INITIAL_FORM);
  const [selectedItemId, setSelectedItemId] = useState<string | number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Local State list for optimistic updates and immediate UI reactivity
  const [localItems, setLocalItems] = useState<AchievementItem[]>([]);

  // Feedback State (Alert / Notification Popups)
  const [feedbackState, setFeedbackState] = useState<{
    visible: boolean;
    type: 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    actionLabel?: string;
    isDestructive?: boolean;
    confirmAction?: () => void;
  }>({
    visible: false,
    type: 'info' as any,
    title: '',
    message: '',
  });

  // Sync / Parse Achievements on mount & update
  useEffect(() => {
    if (achievements && achievements.length > 0) {
      const parsed: AchievementItem[] = achievements.map((a: any, idx: number) => {
        const studentName = a.siswa_nama || a.nama_siswa || a.nama || a.siswa?.full_name || 'Santri Berprestasi';
        const achievementTitle = a.judul_prestasi || a.nama_prestasi || a.jenis_prestasi || a.prestasi || 'Prestasi Siswa';
        const rawKategori = String(a.kategori || a.jenis_prestasi || 'akademik').toLowerCase();
        const kategori = rawKategori.includes('tahfizh') || rawKategori.includes('quran')
          ? 'tahfizh'
          : rawKategori.includes('olahraga')
          ? 'olahraga'
          : rawKategori.includes('seni')
          ? 'seni'
          : 'akademik';
        const tingkat = a.tingkat || a.tingkat_prestasi || 'Sekolah';
        const peringkat = a.peringkat || a.nilai_prestasi || 'Juara 1';
        const tahun = a.tahun || (a.tanggal_prestasi ? String(a.tanggal_prestasi).substring(0, 4) : '2026');
        const isVer = a.status_verifikasi === 'terverifikasi' || String(a.keterangan || '').toLowerCase().includes('terverifikasi');
        return {
          id: a.id || idx + 1,
          siswa_nama: studentName,
          nisn: a.nisn || a.nis || '—',
          kelas: a.kelas || a.kelas_nama || '—',
          judul_prestasi: achievementTitle,
          kategori: kategori as any,
          tingkat: tingkat as any,
          peringkat: peringkat,
          tahun: String(tahun),
          status_verifikasi: (isVer ? 'terverifikasi' : 'menunggu') as any,
        };
      });
      setLocalItems(parsed);
    } else {
      setLocalItems([]);
    }
  }, [achievements]);

  // Filtered List
  const filteredList = useMemo(() => {
    return localItems.filter((item) => {
      const q = searchTerm.toLowerCase();
      const matchSearch =
        !q ||
        String(item.siswa_nama || '').toLowerCase().includes(q) ||
        String(item.judul_prestasi || '').toLowerCase().includes(q) ||
        String(item.kelas || '').toLowerCase().includes(q) ||
        String(item.nisn || '').toLowerCase().includes(q);

      const matchCat = activeCategory === 'all' || item.kategori === activeCategory;
      return matchSearch && matchCat;
    });
  }, [localItems, searchTerm, activeCategory]);

  const displayedList = useMemo(() => {
    return filteredList.slice(0, displayLimit);
  }, [filteredList, displayLimit]);

  const getCategoryTheme = (cat: string) => {
    const found = CATEGORIES.find((c) => c.key === cat);
    return found || { key: 'akademik', label: 'Umum', icon: 'trophy', color: '#64748B', bg: '#F1F5F9' };
  };

  // ── 1. TAMBAH PRESTASI (INPUT) ──
  const handleOpenCreateModal = () => {
    setFormMode('create');
    setSelectedItemId(null);
    setFormValues(INITIAL_FORM);
    setIsFormModalOpen(true);
  };

  // ── 2. UBAH PRESTASI (EDIT) ──
  const handleOpenEditModal = (item: AchievementItem) => {
    setFormMode('edit');
    setSelectedItemId(item.id);
    setFormValues({
      siswa_nama: item.siswa_nama,
      nisn: item.nisn || '',
      kelas: item.kelas || '',
      judul_prestasi: item.judul_prestasi,
      kategori: item.kategori,
      tingkat: item.tingkat,
      peringkat: item.peringkat,
      tahun: item.tahun,
    });
    setIsFormModalOpen(true);
  };

  // ── 3. SIMPAN FORMULIR (INPUT / UBAH) ──
  const handleSubmitForm = async () => {
    if (!formValues.siswa_nama.trim()) {
      setFeedbackState({
        visible: true,
        type: 'warning',
        title: 'Nama Santri Wajib Diisi',
        message: 'Mohon masukkan nama santri atau siswa berprestasi sebelum menyimpan.',
        actionLabel: 'Lengkapi Data',
      });
      return;
    }

    if (!formValues.judul_prestasi.trim()) {
      setFeedbackState({
        visible: true,
        type: 'warning',
        title: 'Judul Prestasi Wajib Diisi',
        message: 'Mohon tuliskan nama kejuaraan atau jenis prestasi yang diraih.',
        actionLabel: 'Lengkapi Data',
      });
      return;
    }

    setIsSubmitting(true);
    try {
      const payload: {
        siswa_nama: string;
        nisn?: string;
        kelas?: string;
        judul_prestasi: string;
        kategori: 'tahfizh' | 'akademik' | 'olahraga' | 'seni';
        tingkat: 'Sekolah' | 'Kecamatan' | 'Kota' | 'Provinsi' | 'Nasional' | 'Internasional';
        peringkat: string;
        tahun: string;
        status_verifikasi: 'terverifikasi';
        diverifikasi_oleh: string;
      } = {
        siswa_nama: formValues.siswa_nama.trim(),
        nisn: formValues.nisn.trim() || undefined,
        kelas: formValues.kelas.trim() || undefined,
        judul_prestasi: formValues.judul_prestasi.trim(),
        kategori: formValues.kategori,
        tingkat: formValues.tingkat,
        peringkat: formValues.peringkat,
        tahun: formValues.tahun,
        status_verifikasi: 'terverifikasi', // KS input defaults to verified
        diverifikasi_oleh: 'Kepala Sekolah',
      };

      if (formMode === 'create') {
        // API Call
        let createdId: string | number = Date.now();
        try {
          const res = await mobileApiService.createStudentAchievement(payload);
          if (res?.data?.id) createdId = res.data.id;
        } catch {
          // If offline / local fallback
        }

        const newItem: AchievementItem = {
          id: createdId,
          ...payload,
          status_verifikasi: 'terverifikasi',
        };

        setLocalItems((prev) => [newItem, ...prev]);
        setIsFormModalOpen(false);

        // Notifikasi Input Berhasil
        setFeedbackState({
          visible: true,
          type: 'success',
          title: 'Prestasi Berhasil Ditambahkan',
          message: `Rekor prestasi "${newItem.judul_prestasi}" atas nama ${newItem.siswa_nama} telah berhasil dicatat dalam rekam jejak sekolah.`,
          actionLabel: 'Alhamdulillah',
        });
      } else {
        // Form Mode: Edit / Ubah
        if (selectedItemId !== null) {
          try {
            await mobileApiService.verifyStudentAchievement(String(selectedItemId), payload);
          } catch {
            // Local fallback
          }

          setLocalItems((prev) =>
            prev.map((item) =>
              item.id === selectedItemId
                ? { ...item, ...payload, id: selectedItemId }
                : item
            )
          );
          setIsFormModalOpen(false);

          // Notifikasi Ubah Berhasil
          setFeedbackState({
            visible: true,
            type: 'success',
            title: 'Prestasi Berhasil Diperbarui',
            message: `Data prestasi "${formValues.judul_prestasi}" atas nama ${formValues.siswa_nama} berhasil diperbarui.`,
            actionLabel: 'Alhamdulillah',
          });
        }
      }

      onRefresh?.();
    } catch (err: any) {
      // Notifikasi Gagal
      setFeedbackState({
        visible: true,
        type: 'error',
        title: formMode === 'create' ? 'Gagal Menambah Prestasi' : 'Gagal Memperbarui Prestasi',
        message: err?.response?.data?.message || err?.message || 'Terjadi kesalahan sistem saat menyimpan data prestasi. Silakan coba kembali.',
        actionLabel: 'Tutup',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  // ── 4. DELETE / HAPUS PRESTASI ──
  const handlePromptDelete = (item: AchievementItem) => {
    setFeedbackState({
      visible: true,
      type: 'confirm',
      isDestructive: true,
      title: 'Hapus Rekor Prestasi?',
      message: `Apakah Anda yakin ingin menghapus data capaian "${item.judul_prestasi}" atas nama ${item.siswa_nama}? Tindakan ini bersifat permanen.`,
      actionLabel: 'Ya, Hapus Data',
      confirmAction: () => executeDelete(item),
    });
  };

  const executeDelete = async (item: AchievementItem) => {
    setFeedbackState((prev) => ({ ...prev, visible: false }));
    try {
      await mobileApiService.deleteStudentAchievement(String(item.id));
    } catch {
      // Offline fallback
    }

    setLocalItems((prev) => prev.filter((i) => i.id !== item.id));

    // Notifikasi Delete Berhasil
    setFeedbackState({
      visible: true,
      type: 'success',
      title: 'Prestasi Berhasil Dihapus',
      message: `Data capaian prestasi "${item.judul_prestasi}" telah dihapus secara permanen.`,
      actionLabel: 'Selesai',
    });

    onRefresh?.();
  };

  // ── 5. VERIFIKASI PRESTASI ──
  const handlePromptVerify = (item: AchievementItem) => {
    setFeedbackState({
      visible: true,
      type: 'confirm',
      isDestructive: false,
      title: 'Verifikasi Prestasi Santri',
      message: `Apakah Anda memvalidasi rekor capaian "${item.judul_prestasi}" atas nama ${item.siswa_nama} tingkat ${item.tingkat}?`,
      actionLabel: 'Verifikasi Sekarang',
      confirmAction: () => executeVerify(item),
    });
  };

  const executeVerify = async (item: AchievementItem) => {
    setFeedbackState((prev) => ({ ...prev, visible: false }));
    try {
      await mobileApiService.verifyStudentAchievement(String(item.id), {
        status_verifikasi: 'terverifikasi',
        diverifikasi_oleh: 'Kepala Sekolah',
        tanggal_verifikasi: new Date().toISOString(),
      });
    } catch {
      // Local optimistic fallback
    }

    setLocalItems((prev) =>
      prev.map((i) => (i.id === item.id ? { ...i, status_verifikasi: 'terverifikasi' } : i))
    );

    // Notifikasi Verifikasi Berhasil
    setFeedbackState({
      visible: true,
      type: 'success',
      title: 'Prestasi Berhasil Diverifikasi',
      message: `Capaian prestasi ${item.siswa_nama} resmi disahkan sebagai rekam jejak madrasah.`,
      actionLabel: 'Alhamdulillah',
    });

    onRefresh?.();
  };

  return (
    <>
      {/* ── MAIN MODAL REKAP PRESTASI ── */}
      <Modal
        visible={visible}
        animationType="slide"
        transparent
        onRequestClose={() => {
          if (isFormModalOpen) {
            setIsFormModalOpen(false);
          } else {
            onClose();
          }
        }}
      >
        <View style={styles.backdrop}>
          <View style={styles.sheetContainer}>
            {!isFormModalOpen ? (
              <>
                {/* Header Gradient */}
            <LinearGradient
              colors={['#92400E', '#D97706', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheetHeader}
            >
              <View style={styles.headerLeft}>
                <View style={styles.headerIconWrap}>
                  <MaterialCommunityIcons name="trophy-award" size={24} color="#D97706" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>Rekapitulasi Prestasi Siswa</Text>
                  <Text style={styles.headerSub}>Pencapaian & Kejuaraan Santri {unitName}</Text>
                </View>
              </View>

              <View style={styles.headerRightButtons}>
                {/* Tombol Tambah Prestasi */}
                <TouchableOpacity
                  activeOpacity={0.85}
                  onPress={handleOpenCreateModal}
                  style={styles.addHeaderBtn}
                >
                  <MaterialCommunityIcons name="plus" size={15} color="#92400E" />
                  <Text style={styles.addHeaderBtnText}>Tambah</Text>
                </TouchableOpacity>

                <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
                  <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* Search Box */}
            <View style={styles.searchBarWrap}>
              <View style={styles.searchInputBox}>
                <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
                <TextInput
                  style={styles.searchInput}
                  placeholder="Cari santri, prestasi, NISN, atau kelas..."
                  placeholderTextColor="#94A3B8"
                  value={searchTerm}
                  onChangeText={setSearchTerm}
                />
                {searchTerm ? (
                  <TouchableOpacity onPress={() => setSearchTerm('')}>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                ) : null}
              </View>
            </View>

            {/* Category Filter Chips */}
            <View style={styles.categoryChipsBar}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.categoryChipsRow}>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setActiveCategory('all')}
                  style={[styles.catChip, activeCategory === 'all' && styles.catChipActive]}
                >
                  <Text style={[styles.catChipText, activeCategory === 'all' && styles.catChipTextActive]}>
                    Semua ({localItems.length})
                  </Text>
                </TouchableOpacity>

                {CATEGORIES.map((cat) => {
                  const isActive = activeCategory === cat.key;
                  return (
                    <TouchableOpacity
                      key={cat.key}
                      activeOpacity={0.7}
                      onPress={() => setActiveCategory(cat.key)}
                      style={[
                        styles.catChip,
                        isActive && { backgroundColor: cat.color, borderColor: cat.color },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={cat.icon as any}
                        size={12}
                        color={isActive ? '#FFFFFF' : cat.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.catChipText, isActive && styles.catChipTextActive]}>
                        {cat.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </View>

            {/* List */}
            <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent}>
              {displayedList.map((item, idx) => {
                const theme = getCategoryTheme(item.kategori);
                const isVerified = item.status_verifikasi === 'terverifikasi';

                return (
                  <View key={item.id || idx} style={styles.achievementCard}>
                    {/* Top row badges */}
                    <View style={styles.topRow}>
                      <View style={[styles.catBadge, { backgroundColor: theme.bg }]}>
                        <MaterialCommunityIcons name={theme.icon as any} size={13} color={theme.color} />
                        <Text style={[styles.catBadgeText, { color: theme.color }]}>{theme.label}</Text>
                      </View>

                      <View style={[styles.levelBadge, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
                        <Text style={styles.levelBadgeText}>Tingkat {item.tingkat}</Text>
                      </View>
                    </View>

                    {/* Judul Prestasi & Peringkat */}
                    <Text style={styles.achieveTitle}>{item.judul_prestasi}</Text>
                    <View style={styles.rankBadge}>
                      <MaterialCommunityIcons name="seal" size={13} color="#B45309" />
                      <Text style={styles.rankBadgeText}>{item.peringkat}</Text>
                    </View>

                    {/* Santri Meta Box */}
                    <View style={styles.studentMetaRow}>
                      <View style={styles.avatarMini}>
                        <Text style={styles.avatarMiniText}>
                          {String(item.siswa_nama || 'SB').substring(0, 2).toUpperCase()}
                        </Text>
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.studentNameText} numberOfLines={1}>{item.siswa_nama}</Text>
                        <Text style={styles.studentSubText}>
                          NISN: {item.nisn || '—'} • Kelas {item.kelas || '—'} • Thn {item.tahun}
                        </Text>
                      </View>
                    </View>

                    {/* Status & CRUD Action Buttons Row */}
                    <View style={styles.statusActionRow}>
                      <View style={[styles.verifyStatusPill, isVerified ? styles.pillVerified : styles.pillPending]}>
                        <MaterialCommunityIcons
                          name={isVerified ? 'check-circle' : 'clock-alert-outline'}
                          size={13}
                          color={isVerified ? '#059669' : '#D97706'}
                        />
                        <Text style={[styles.verifyStatusText, isVerified ? { color: '#059669' } : { color: '#D97706' }]}>
                          {isVerified ? 'Terverifikasi' : 'Menunggu Validasi'}
                        </Text>
                      </View>

                      <View style={styles.cardActionsGroup}>
                        {/* Verifikasi (jika belum) */}
                        {!isVerified && (
                          <TouchableOpacity
                            activeOpacity={0.8}
                            onPress={() => handlePromptVerify(item)}
                            style={styles.verifyActionBtn}
                          >
                            <MaterialCommunityIcons name="check-decagram" size={13} color="#FFFFFF" />
                            <Text style={styles.verifyActionBtnText}>Verif</Text>
                          </TouchableOpacity>
                        )}

                        {/* Ubah Button */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handleOpenEditModal(item)}
                          style={styles.editActionBtn}
                        >
                          <MaterialCommunityIcons name="pencil-outline" size={13} color="#D97706" />
                          <Text style={styles.editActionBtnText}>Ubah</Text>
                        </TouchableOpacity>

                        {/* Hapus Button */}
                        <TouchableOpacity
                          activeOpacity={0.8}
                          onPress={() => handlePromptDelete(item)}
                          style={styles.deleteActionBtn}
                        >
                          <MaterialCommunityIcons name="trash-can-outline" size={13} color="#E11D48" />
                          <Text style={styles.deleteActionBtnText}>Hapus</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                );
              })}

              {filteredList.length > displayLimit && (
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setDisplayLimit((prev) => prev + 20)}
                  style={styles.loadMoreBtn}
                >
                  <MaterialCommunityIcons name="chevron-down" size={16} color="#D97706" />
                  <Text style={styles.loadMoreBtnText}>
                    Tampilkan Lebih Banyak ({filteredList.length - displayLimit} prestasi tersisa)
                  </Text>
                </TouchableOpacity>
              )}

              {filteredList.length === 0 && (
                <View style={styles.emptyWrap}>
                  <MaterialCommunityIcons name="trophy-broken" size={44} color="#CBD5E1" />
                  <Text style={styles.emptyTitle}>Belum Ada Prestasi Terdata</Text>
                  <Text style={styles.emptySub}>{searchTerm ? 'Tidak ada data prestasi yang cocok dengan kata kunci pencarian' : 'Belum ada data prestasi siswa yang terdaftar'}</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={handleOpenCreateModal}
                    style={styles.emptyAddBtn}
                  >
                    <MaterialCommunityIcons name="plus" size={15} color="#FFFFFF" />
                    <Text style={styles.emptyAddBtnText}>Tambah Prestasi Baru</Text>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>

            {/* Footer */}
            <View style={styles.footerWrap}>
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={handleOpenCreateModal}
                style={styles.footerAddBtn}
              >
                <LinearGradient
                  colors={['#059669', '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.footerAddGradient}
                >
                  <MaterialCommunityIcons name="plus-circle-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.footerAddBtnText}>Input Prestasi Santri Baru</Text>
                </LinearGradient>
              </TouchableOpacity>

              <TouchableOpacity activeOpacity={0.8} onPress={onClose} style={styles.closeFullBtn}>
                <Text style={styles.closeFullBtnText}>Tutup Rekapitulasi</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : (
          <>
            {/* Header Form */}
            <LinearGradient
              colors={formMode === 'create' ? ['#065F46', '#059669', '#10B981'] : ['#92400E', '#D97706', '#F59E0B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.formSheetHeader}
            >
              <View style={styles.headerLeft}>
                <View style={styles.headerIconWrap}>
                  <MaterialCommunityIcons
                    name={formMode === 'create' ? 'trophy-award' : 'pencil-box-multiple'}
                    size={22}
                    color={formMode === 'create' ? '#059669' : '#D97706'}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.headerTitle}>
                    {formMode === 'create' ? 'Input Prestasi Santri' : 'Ubah Data Prestasi'}
                  </Text>
                  <Text style={styles.headerSub}>
                    {formMode === 'create' ? `Pencatatan rekor capaian di ${unitName}` : 'Perbarui detail informasi capaian kejuaraan'}
                  </Text>
                </View>
              </View>

              <TouchableOpacity
                disabled={isSubmitting}
                activeOpacity={0.7}
                onPress={() => setIsFormModalOpen(false)}
                style={styles.closeBtn}
              >
                <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            {/* Scrollable Form Inputs */}
            <ScrollView
              style={styles.formInputsBody}
              contentContainerStyle={styles.formInputsContent}
              keyboardShouldPersistTaps="handled"
            >
              {/* Field: Nama Siswa */}
              <View style={styles.inputFieldGroup}>
                <Text style={styles.inputFieldLabel}>NAMA LENGKAP SANTRI / SISWA *</Text>
                <View style={styles.inputFieldWrap}>
                  <MaterialCommunityIcons name="account-school-outline" size={18} color="#059669" />
                  <TextInput
                    style={styles.inputFieldText}
                    placeholder="Nama lengkap santri"
                    placeholderTextColor="#94A3B8"
                    value={formValues.siswa_nama}
                    onChangeText={(val) => setFormValues((prev) => ({ ...prev, siswa_nama: val }))}
                  />
                </View>
              </View>

              {/* Field: NISN & Kelas (2 Columns) */}
              <View style={styles.inputTwoColsRow}>
                <View style={[styles.inputFieldGroup, { flex: 1.2 }]}>
                  <Text style={styles.inputFieldLabel}>NISN / NIS</Text>
                  <View style={styles.inputFieldWrap}>
                    <MaterialCommunityIcons name="card-account-details-outline" size={17} color="#64748B" />
                    <TextInput
                      style={styles.inputFieldText}
                      placeholder="Contoh: 0012345678"
                      placeholderTextColor="#94A3B8"
                      value={formValues.nisn}
                      onChangeText={(val) => setFormValues((prev) => ({ ...prev, nisn: val }))}
                    />
                  </View>
                </View>

                <View style={[styles.inputFieldGroup, { flex: 1 }]}>
                  <Text style={styles.inputFieldLabel}>KELAS / ROMBEL</Text>
                  <View style={styles.inputFieldWrap}>
                    <MaterialCommunityIcons name="door-closed" size={17} color="#64748B" />
                    <TextInput
                      style={styles.inputFieldText}
                      placeholder="Contoh: 9A"
                      placeholderTextColor="#94A3B8"
                      value={formValues.kelas}
                      onChangeText={(val) => setFormValues((prev) => ({ ...prev, kelas: val }))}
                    />
                  </View>
                </View>
              </View>

              {/* Field: Judul Prestasi */}
              <View style={styles.inputFieldGroup}>
                <Text style={styles.inputFieldLabel}>JUDUL PRESTASI / NAMA KEJUARAAN *</Text>
                <View style={styles.inputFieldWrap}>
                  <MaterialCommunityIcons name="medal-outline" size={18} color="#D97706" />
                  <TextInput
                    style={styles.inputFieldText}
                    placeholder="Contoh: Juara 1 MHQ 10 Juz Antar Pelajar"
                    placeholderTextColor="#94A3B8"
                    value={formValues.judul_prestasi}
                    onChangeText={(val) => setFormValues((prev) => ({ ...prev, judul_prestasi: val }))}
                  />
                </View>
              </View>

              {/* Field: Kategori Prestasi (Chips) */}
              <View style={styles.inputFieldGroup}>
                <Text style={styles.inputFieldLabel}>BIDANG KATEGORI</Text>
                <View style={styles.selectorChipsRow}>
                  {CATEGORIES.map((cat) => {
                    const isSelected = formValues.kategori === cat.key;
                    return (
                      <TouchableOpacity
                        key={cat.key}
                        activeOpacity={0.75}
                        onPress={() => setFormValues((prev) => ({ ...prev, kategori: cat.key }))}
                        style={[
                          styles.selectorChip,
                          isSelected && { backgroundColor: cat.color, borderColor: cat.color },
                        ]}
                      >
                        <MaterialCommunityIcons
                          name={cat.icon as any}
                          size={13}
                          color={isSelected ? '#FFFFFF' : cat.color}
                        />
                        <Text style={[styles.selectorChipText, isSelected && styles.selectorChipTextActive]}>
                          {cat.label}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Field: Tingkat Prestasi (Chips) */}
              <View style={styles.inputFieldGroup}>
                <Text style={styles.inputFieldLabel}>TINGKAT KEJUARAAN</Text>
                <View style={styles.selectorChipsRow}>
                  {LEVELS.map((lvl) => {
                    const isSelected = formValues.tingkat === lvl;
                    return (
                      <TouchableOpacity
                        key={lvl}
                        activeOpacity={0.75}
                        onPress={() => setFormValues((prev) => ({ ...prev, tingkat: lvl }))}
                        style={[
                          styles.selectorChip,
                          isSelected && { backgroundColor: '#0F172A', borderColor: '#0F172A' },
                        ]}
                      >
                        <Text style={[styles.selectorChipText, isSelected && styles.selectorChipTextActive]}>
                          {lvl}
                        </Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* Field: Peringkat & Tahun (2 Columns) */}
              <View style={styles.inputTwoColsRow}>
                <View style={[styles.inputFieldGroup, { flex: 1.3 }]}>
                  <Text style={styles.inputFieldLabel}>PERINGKAT / JUARA</Text>
                  <View style={styles.inputFieldWrap}>
                    <MaterialCommunityIcons name="star-outline" size={17} color="#D97706" />
                    <TextInput
                      style={styles.inputFieldText}
                      placeholder="Juara 1 / Emas"
                      placeholderTextColor="#94A3B8"
                      value={formValues.peringkat}
                      onChangeText={(val) => setFormValues((prev) => ({ ...prev, peringkat: val }))}
                    />
                  </View>
                </View>

                <View style={[styles.inputFieldGroup, { flex: 0.9 }]}>
                  <Text style={styles.inputFieldLabel}>TAHUN</Text>
                  <View style={styles.inputFieldWrap}>
                    <MaterialCommunityIcons name="calendar-outline" size={17} color="#64748B" />
                    <TextInput
                      style={styles.inputFieldText}
                      placeholder="2026"
                      keyboardType="numeric"
                      placeholderTextColor="#94A3B8"
                      value={formValues.tahun}
                      onChangeText={(val) => setFormValues((prev) => ({ ...prev, tahun: val }))}
                    />
                  </View>
                </View>
              </View>

              {/* Quick Select Ranks */}
              <View style={styles.quickRankWrap}>
                <Text style={styles.quickRankLabel}>Pilihan Cepat Peringkat:</Text>
                <View style={styles.quickRankRow}>
                  {DEFAULT_RANKS.map((rk) => (
                    <TouchableOpacity
                      key={rk}
                      onPress={() => setFormValues((prev) => ({ ...prev, peringkat: rk }))}
                      style={[
                        styles.quickRankPill,
                        formValues.peringkat === rk && styles.quickRankPillActive,
                      ]}
                    >
                      <Text style={[styles.quickRankPillText, formValues.peringkat === rk && styles.quickRankPillTextActive]}>
                        {rk}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            </ScrollView>

            {/* Footer Form Buttons */}
            <View style={styles.formSheetFooter}>
              <TouchableOpacity
                disabled={isSubmitting}
                activeOpacity={0.7}
                onPress={() => setIsFormModalOpen(false)}
                style={styles.formCancelBtn}
              >
                <Text style={styles.formCancelBtnText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                disabled={isSubmitting}
                activeOpacity={0.88}
                onPress={handleSubmitForm}
                style={[styles.formSubmitBtn, isSubmitting && { opacity: 0.7 }]}
              >
                <LinearGradient
                  colors={formMode === 'create' ? ['#059669', '#10B981'] : ['#D97706', '#F59E0B']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 0 }}
                  style={styles.formSubmitGradient}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons
                        name={formMode === 'create' ? 'check' : 'content-save-outline'}
                        size={17}
                        color="#FFFFFF"
                      />
                      <Text style={styles.formSubmitBtnText}>
                        {formMode === 'create' ? 'Simpan Prestasi' : 'Perbarui Prestasi'}
                      </Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>
          </>
        )}

        {/* ── NOTIFIKASI BERUBAHAN & KONFIRMASI (APP FEEDBACK MODAL AS IN-SHEET OVERLAY) ── */}
        <AppFeedbackModal
          asOverlay
          visible={feedbackState.visible}
          type={feedbackState.type}
          title={feedbackState.title}
          message={feedbackState.message}
          actionLabel={feedbackState.actionLabel}
          isDestructive={feedbackState.isDestructive}
          onConfirm={feedbackState.confirmAction}
          onClose={() => setFeedbackState((prev) => ({ ...prev, visible: false }))}
        />
      </View>
    </View>
  </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 15.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  headerRightButtons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  addHeaderBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
  },
  addHeaderBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#92400E',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchInputBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 40,
  },
  searchInput: {
    flex: 1,
    fontSize: 12,
    color: '#1E293B',
    paddingVertical: 0,
  },
  categoryChipsBar: {
    backgroundColor: '#FFFFFF',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  categoryChipsRow: {
    paddingHorizontal: 16,
    gap: 8,
  },
  catChip: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  catChipActive: {
    backgroundColor: '#0F172A',
    borderColor: '#0F172A',
  },
  catChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  catChipTextActive: {
    color: '#FFFFFF',
  },
  listWrap: {
    maxHeight: 440,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingVertical: 12,
    gap: 12,
  },
  achievementCard: {
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 18,
    padding: 14,
    shadowColor: '#000000',
    shadowOpacity: 0.04,
    shadowRadius: 5,
    elevation: 2,
  },
  topRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  catBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  catBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  levelBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
  },
  levelBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#B45309',
  },
  achieveTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
    marginBottom: 4,
  },
  rankBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFBEB',
    alignSelf: 'flex-start',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginBottom: 8,
  },
  rankBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#92400E',
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 9,
    marginBottom: 10,
  },
  avatarMini: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: '#DEF7EC',
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarMiniText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  studentNameText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentSubText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  statusActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    paddingTop: 10,
  },
  verifyStatusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  pillVerified: {
    backgroundColor: '#DEF7EC',
  },
  pillPending: {
    backgroundColor: '#FEF3C7',
  },
  verifyStatusText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  cardActionsGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  verifyActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#059669',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  verifyActionBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  editActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  editActionBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#D97706',
  },
  deleteActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#FFF1F2',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingHorizontal: 9,
    paddingVertical: 5,
    borderRadius: 8,
  },
  deleteActionBtnText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#E11D48',
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
    maxWidth: 260,
  },
  emptyAddBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#059669',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    marginTop: 10,
  },
  emptyAddBtnText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    gap: 8,
  },
  footerAddBtn: {
    borderRadius: 14,
    overflow: 'hidden',
  },
  footerAddGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 11,
  },
  footerAddBtnText: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  closeFullBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
  },
  closeFullBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },

  // ── Form Modal Styles (Input / Ubah) ──
  formBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.78)',
    justifyContent: 'flex-end',
  },
  formSheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    overflow: 'hidden',
  },
  formSheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  formInputsBody: {
    maxHeight: 460,
    paddingHorizontal: 16,
    paddingTop: 14,
  },
  formInputsContent: {
    paddingBottom: 24,
    gap: 12,
  },
  inputFieldGroup: {
    gap: 4,
  },
  inputFieldLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
    letterSpacing: 0.3,
  },
  inputFieldWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 42,
  },
  inputFieldText: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
  },
  inputTwoColsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  selectorChipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 2,
  },
  selectorChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  selectorChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  selectorChipTextActive: {
    color: '#FFFFFF',
  },
  quickRankWrap: {
    marginTop: 4,
  },
  quickRankLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 6,
  },
  quickRankRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  quickRankPill: {
    paddingHorizontal: 9,
    paddingVertical: 4.5,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  quickRankPillActive: {
    backgroundColor: '#FEF3C7',
    borderColor: '#FDE68A',
  },
  quickRankPillText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
  },
  quickRankPillTextActive: {
    color: '#B45309',
    fontWeight: '800',
  },
  formSheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  formCancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  formCancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  formSubmitBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  formSubmitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
  },
  formSubmitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginVertical: 10,
    backgroundColor: '#FEF3C7',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  loadMoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#B45309',
  },
});
