import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';
import { mobileApiService } from '../../services/mobileApiService';

export type TuKpiType =
  | 'total_siswa'
  | 'total_pegawai'
  | 'absensi_hari_ini'
  | 'siswa_incomplete'
  | 'pegawai_incomplete'
  | 'pengajuan_surat'
  | 'pembayaran_hari_ini'
  | 'tugas_menunggu'
  | 'jadwal_kbm'
  | 'laporan_nilai';

interface TuKpiDrilldownModalProps {
  type?: TuKpiType | null;
  kpiType?: TuKpiType | null;
  visible: boolean;
  onClose: () => void;
  navigation?: any;
  initialTab?: 'siswa_hadir' | 'siswa_belum_absen' | 'pegawai';
  unitName?: string;
  academicYear?: string;
}

interface ClassOption {
  id: string;
  nama_kelas: string;
  tingkat?: string;
}

const MODAL_CONFIG: Record<
  TuKpiType,
  {
    title: string;
    subtitle: string;
    icon: keyof typeof MaterialCommunityIcons.glyphMap;
    iconColor: string;
    iconBg: string;
    gradient: [string, string, string];
    summaryKeys: string[];
    summaryLabels: Record<string, string>;
  }
> = {
  total_siswa: {
    title: 'Total Siswa Aktif',
    subtitle: 'Daftar peserta didik aktif dalam unit pendidikan',
    icon: 'account-school-outline',
    iconColor: '#2563EB',
    iconBg: '#EFF6FF',
    gradient: ['#1D4ED8', '#2563EB', '#3B82F6'],
    summaryKeys: ['total', 'laki_laki', 'perempuan'],
    summaryLabels: { total: 'Total', laki_laki: 'Laki-laki', perempuan: 'Perempuan' },
  },
  pengajuan_surat: {
    title: 'Pengajuan Surat Masuk',
    subtitle: 'Daftar permohonan surat izin, dispensasi & surat santri',
    icon: 'file-document-edit-outline',
    iconColor: '#E11D48',
    iconBg: '#FFF1F2',
    gradient: ['#9F1239', '#BE123C', '#E11D48'],
    summaryKeys: ['total', 'menunggu', 'disetujui'],
    summaryLabels: { total: 'Total Pengajuan', menunggu: 'Menunggu', disetujui: 'Disetujui' },
  },
  pembayaran_hari_ini: {
    title: 'Pembayaran Hari Ini',
    subtitle: 'Rincian transaksi kas & penerimaan SPP/tagihan hari ini',
    icon: 'cash-check',
    iconColor: '#0D9488',
    iconBg: '#F0FDFA',
    gradient: ['#115E59', '#0D9488', '#14B8A6'],
    summaryKeys: ['total', 'total_nominal'],
    summaryLabels: { total: 'Transaksi Masuk', total_nominal: 'Penerimaan Hari Ini' },
  },
  tugas_menunggu: {
    title: 'Tugas Menunggu',
    subtitle: 'Kelengkapan berkas siswa, pegawai & verifikasi surat',
    icon: 'clipboard-clock-outline',
    iconColor: '#6366F1',
    iconBg: '#EEF2FF',
    gradient: ['#3730A3', '#4F46E5', '#6366F1'],
    summaryKeys: ['total', 'siswa', 'pegawai'],
    summaryLabels: { total: 'Total Tugas', siswa: 'Berkas Siswa', pegawai: 'Berkas Pegawai' },
  },
  total_pegawai: {
    title: 'Total Pegawai & Guru',
    subtitle: 'Daftar pendidik & tenaga kependidikan aktif',
    icon: 'badge-account-outline',
    iconColor: '#0891B2',
    iconBg: '#ECFEFF',
    gradient: ['#0E7490', '#0891B2', '#06B6D4'],
    summaryKeys: ['total', 'laki_laki', 'perempuan'],
    summaryLabels: { total: 'Total', laki_laki: 'Laki-laki', perempuan: 'Perempuan' },
  },
  absensi_hari_ini: {
    title: 'Absensi Hari Ini',
    subtitle: 'Rekap kehadiran gerbang siswa dan staf',
    icon: 'check-circle-outline',
    iconColor: '#059669',
    iconBg: '#ECFDF5',
    gradient: ['#047857', '#059669', '#10B981'],
    summaryKeys: ['total_verified', 'siswa_hadir', 'siswa_belum_absen', 'pegawai_hadir'],
    summaryLabels: {
      total_verified: 'Terverifikasi',
      siswa_hadir: 'Siswa Hadir',
      siswa_belum_absen: 'Belum Absen',
      pegawai_hadir: 'Guru Hadir',
    },
  },
  siswa_incomplete: {
    title: 'Siswa Belum Lengkap',
    subtitle: 'Santri dengan NISN, Tgl Lahir, atau Wali belum terdata',
    icon: 'alert-circle-outline',
    iconColor: '#D97706',
    iconBg: '#FFFBEB',
    gradient: ['#B45309', '#D97706', '#F59E0B'],
    summaryKeys: ['total'],
    summaryLabels: { total: 'Perlu Dilengkapi' },
  },
  pegawai_incomplete: {
    title: 'Pegawai Belum Lengkap',
    subtitle: 'Pegawai dengan NIY atau NIK belum terisi',
    icon: 'card-account-details-outline',
    iconColor: '#EF4444',
    iconBg: '#FEF2F2',
    gradient: ['#B91C1C', '#DC2626', '#EF4444'],
    summaryKeys: ['total'],
    summaryLabels: { total: 'Perlu Dilengkapi' },
  },
  jadwal_kbm: {
    title: 'Jadwal Pelajaran & KBM',
    subtitle: 'Roster jadwal mengajar & pembelajaran santri aktif',
    icon: 'calendar-clock',
    iconColor: '#0284C7',
    iconBg: '#F0F9FF',
    gradient: ['#0369A1', '#0284C7', '#38BDF8'],
    summaryKeys: ['total', 'hari_ini'],
    summaryLabels: { total: 'Total Jadwal', hari_ini: 'Jadwal Hari Ini' },
  },
  laporan_nilai: {
    title: 'Laporan Nilai & Leger',
    subtitle: 'Rekap capaian akademik & penilaian hasil belajar santri',
    icon: 'chart-box-outline',
    iconColor: '#9333EA',
    iconBg: '#FAF5FF',
    gradient: ['#7E22CE', '#9333EA', '#C084FC'],
    summaryKeys: ['total', 'tuntas', 'belum_tuntas'],
    summaryLabels: { total: 'Total Nilai', tuntas: 'Tuntas', belum_tuntas: 'Remidial' },
  },
};

export default function TuKpiDrilldownModal({
  type: propType,
  kpiType,
  visible,
  onClose,
  navigation,
  initialTab,
  unitName,
}: TuKpiDrilldownModalProps) {
  const type = propType || kpiType || null;
  const navHook = useNavigation<any>();
  const activeNav = navigation || navHook;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [summary, setSummary] = useState<any>(null);

  // Search & filter states
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [selectedKelasId, setSelectedKelasId] = useState<string>('all');
  const [parentSearch, setParentSearch] = useState('');
  const [availableClasses, setAvailableClasses] = useState<ClassOption[]>([]);
  const [availableParents, setAvailableParents] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<'siswa_hadir' | 'siswa_belum_absen' | 'pegawai'>('siswa_hadir');

  // Dropdown Picker Modals
  const [classPickerVisible, setClassPickerVisible] = useState(false);
  const [parentPickerVisible, setParentPickerVisible] = useState(false);
  const [parentPickerQuery, setParentPickerQuery] = useState('');

  // Detail sub-modal state
  const [selectedStudent, setSelectedStudent] = useState<any | null>(null);
  const [selectedEmployee, setSelectedEmployee] = useState<any | null>(null);

  const config = type ? MODAL_CONFIG[type] : null;

  // Search input debouncing (350ms rule)
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedSearch(search);
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchData = useCallback(async () => {
    if (!type) return;
    setLoading(true);
    setError(null);
    try {
      const res: any = await mobileApiService.getTataUsahaKpiDetail(type, {
        search: debouncedSearch.trim() || undefined,
        per_page: 100,
        ...(type === 'absensi_hari_ini' ? { tab: activeTab } : {}),
        ...(type === 'total_siswa'
          ? {
              kelas_id: selectedKelasId !== 'all' ? selectedKelasId : undefined,
              parent_search: parentSearch.trim() || undefined,
            }
          : {}),
      });
      const payload = res?.data || res || {};
      setItems(Array.isArray(payload.items) ? payload.items : (Array.isArray(payload) ? payload : []));
      setSummary(payload.summary || null);

      if (Array.isArray(payload.available_classes)) {
        setAvailableClasses(payload.available_classes);
      }
      if (Array.isArray(payload.available_parents)) {
        setAvailableParents(payload.available_parents);
      }
    } catch (err: any) {
      setError(err?.response?.data?.message || err?.message || 'Gagal memuat rincian data.');
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [type, debouncedSearch, parentSearch, selectedKelasId, activeTab]);

  useEffect(() => {
    if (visible && type) {
      if (initialTab) {
        setActiveTab(initialTab);
      }
      void fetchData();
    } else {
      setItems([]);
      setSummary(null);
      setSearch('');
      setDebouncedSearch('');
      setParentSearch('');
      setSelectedKelasId('all');
      setAvailableClasses([]);
      setAvailableParents([]);
      setSelectedStudent(null);
      setSelectedEmployee(null);
      setError(null);
      setClassPickerVisible(false);
      setParentPickerVisible(false);
    }
  }, [visible, type, fetchData]);

  const getSummaryBadgeIcon = (key: string): keyof typeof MaterialCommunityIcons.glyphMap => {
    switch (key) {
      case 'total':
        return 'account-group-outline';
      case 'laki_laki':
        return 'gender-male';
      case 'perempuan':
        return 'gender-female';
      case 'total_verified':
        return 'shield-check-outline';
      case 'siswa_hadir':
        return 'door-open';
      case 'siswa_belum_absen':
        return 'account-clock-outline';
      case 'pegawai_hadir':
        return 'account-tie-outline';
      case 'menunggu':
        return 'clock-alert-outline';
      case 'disetujui':
        return 'check-decagram-outline';
      case 'total_nominal':
        return 'cash-multiple';
      case 'siswa':
        return 'account-school-outline';
      case 'pegawai':
        return 'account-tie-outline';
      default:
        return 'information-outline';
    }
  };

  const selectedClassName = useMemo(() => {
    if (selectedKelasId === 'all') return 'Semua Kelas';
    return (
      availableClasses.find((c) => String(c.id) === String(selectedKelasId))?.nama_kelas ||
      'Pilih Kelas'
    );
  }, [selectedKelasId, availableClasses]);

  const selectedParentName = useMemo(() => {
    if (!parentSearch.trim()) return 'Semua Orang Tua';
    return parentSearch.trim();
  }, [parentSearch]);

  const filteredParents = useMemo(() => {
    if (!parentPickerQuery.trim()) return availableParents;
    const q = parentPickerQuery.toLowerCase();
    return availableParents.filter((p) => p.toLowerCase().includes(q));
  }, [availableParents, parentPickerQuery]);

  if (!visible || !config || !type) return null;

  const handleActionNavigate = (item: any) => {
    onClose();
    if (type === 'siswa_incomplete' || type === 'total_siswa') {
      navigation?.navigate('Data', { initialResource: 'students' });
    } else if (type === 'pegawai_incomplete' || type === 'total_pegawai') {
      navigation?.navigate('Data', { initialResource: 'employees' });
    } else if (type === 'absensi_hari_ini') {
      navigation?.navigate('Absensi');
    }
  };

  const handleOpenWhatsApp = (phone?: string | number, contactType: 'ortu' | 'pegawai' = 'ortu') => {
    const raw = phone != null ? String(phone).trim() : '';
    if (!raw || raw === '-') {
      Alert.alert(
        'Kontak Tidak Tersedia',
        contactType === 'pegawai'
          ? 'Nomor telepon/WhatsApp pegawai belum tercatat di data sistem.'
          : 'Nomor telepon/WhatsApp orang tua belum tercatat di data siswa.'
      );
      return;
    }
    let cleaned = raw.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) {
      cleaned = '62' + cleaned.slice(1);
    }
    const url = `whatsapp://send?phone=${cleaned}`;
    Linking.canOpenURL(url)
      .then((supported) => {
        if (supported) {
          return Linking.openURL(url);
        } else {
          return Linking.openURL(`https://wa.me/${cleaned}`);
        }
      })
      .catch(() => {
        Linking.openURL(`https://wa.me/${cleaned}`);
      });
  };

  const handleCallPhone = (phone?: string | number, contactType: 'ortu' | 'pegawai' = 'ortu') => {
    const raw = phone != null ? String(phone).trim() : '';
    if (!raw || raw === '-') {
      Alert.alert(
        'Kontak Tidak Tersedia',
        contactType === 'pegawai'
          ? 'Nomor telepon pegawai belum tercatat di data sistem.'
          : 'Nomor telepon orang tua belum tercatat di data siswa.'
      );
      return;
    }
    const cleaned = raw.replace(/[^0-9+]/g, '');
    Linking.openURL(`tel:${cleaned}`).catch(() => {
      Alert.alert('Gagal Memanggil', 'Tidak dapat melakukan panggilan telepon.');
    });
  };

  const handleInAppChat = (student: any) => {
    if (!student) return;
    const parentUserId = student?.orang_tua?.user_id || student?.parent_user_id;
    const parentName =
      student?.orang_tua?.nama_ayah ||
      student?.orang_tua?.nama_ibu ||
      student?.orang_tua?.nama_wali ||
      'Orang Tua / Wali';
    const payload = {
      studentId: student.id,
      student_id: student.id,
      studentName: student.nama || student.name || 'Santri',
      student_name: student.nama || student.name || 'Santri',
      parentId: parentUserId,
      parent_user_id: parentUserId,
      parentName,
      parent_name: parentName,
      className: student.kelas || student.kelas_nama || '',
      class_name: student.kelas || student.kelas_nama || '',
      unitName: student.unit || student.unit_nama || '',
      unit_name: student.unit || student.unit_nama || '',
    };

    setSelectedStudent(null);
    onClose();

    try {
      if (activeNav?.navigate) {
        activeNav.navigate('Chat Guru', payload);
        return;
      }
    } catch {}

    try {
      if (activeNav?.navigate) {
        activeNav.navigate('Chat', payload);
        return;
      }
    } catch {
      Alert.alert('Info', 'Ruang chat aplikasi belum dapat dibuka langsung.');
    }
  };

  const renderItem = ({ item }: { item: any }) => {
    const isTotalSiswa = type === 'total_siswa';
    const isSiswa = isTotalSiswa || type === 'siswa_incomplete';
    const isPegawai = type === 'total_pegawai' || type === 'pegawai_incomplete';

    // RENDER KHUSUS SISWA (TOTAL SISWA): Desain rapi, lapang, tanpa button detail
    if (isTotalSiswa) {
      return (
        <TouchableOpacity
          activeOpacity={0.7}
          onPress={() => setSelectedStudent(item)}
          style={[styles.itemCard, styles.studentCard]}
        >
          {/* Baris 1: Avatar Siswa + Nama & Gender + Status Pill */}
          <View style={styles.studentTopRow}>
            <View style={styles.studentAvatarBox}>
              <MaterialCommunityIcons
                name="account-school-outline"
                size={22}
                color="#059669"
              />
            </View>
            <View style={styles.studentNameCol}>
              <Text style={styles.studentNameText} numberOfLines={1}>
                {item.nama || item.name || item.full_name || 'Tanpa Nama'}
              </Text>
              <Text style={styles.studentSubText}>
                {item.jenis_kelamin || 'Siswa'} {item.unit ? `• ${item.unit}` : ''}
              </Text>
            </View>
            <View
              style={[
                styles.studentStatusPill,
                item.status === 'Aktif'
                  ? styles.statusAktifPill
                  : styles.statusNonaktifPill,
              ]}
            >
              <Text
                style={[
                  styles.studentStatusPillText,
                  item.status === 'Aktif'
                    ? styles.statusAktifPillText
                    : styles.statusNonaktifPillText,
                ]}
              >
                {item.status || 'Aktif'}
              </Text>
            </View>
          </View>

          {/* Baris 2: Badges Metadata (Kelas & NIS/NISN) */}
          <View style={styles.studentBadgeRow}>
            {item.kelas ? (
              <View style={styles.studentKelasBadge}>
                <MaterialCommunityIcons name="google-classroom" size={13} color="#0D9488" />
                <Text style={styles.studentKelasBadgeText}>{item.kelas}</Text>
              </View>
            ) : null}
            {item.nis ? (
              <View style={styles.studentMetaBadge}>
                <Text style={styles.studentMetaBadgeLabel}>NIS:</Text>
                <Text style={styles.studentMetaBadgeVal}>{item.nis}</Text>
              </View>
            ) : null}
            {item.nisn ? (
              <View style={styles.studentMetaBadge}>
                <Text style={styles.studentMetaBadgeLabel}>NISN:</Text>
                <Text style={styles.studentMetaBadgeVal}>{item.nisn}</Text>
              </View>
            ) : null}
          </View>

          {/* Baris 3: Wadah Data Orang Tua yang Rapi & Tidak Berhimpitan */}
          {item.orang_tua && (
            <View style={styles.studentParentCardBox}>
              <View style={styles.parentCardMainRow}>
                <MaterialCommunityIcons name="account-child-outline" size={16} color="#0D9488" />
                <Text style={styles.parentCardNameText} numberOfLines={1}>
                  Ortu: {item.orang_tua.nama || item.orang_tua.nama_ayah || 'Data Ortu Belum Lengkap'}
                </Text>
              </View>
              {item.orang_tua.no_hp && item.orang_tua.no_hp !== '-' ? (
                <View style={styles.parentCardPhoneRow}>
                  <MaterialCommunityIcons name="whatsapp" size={13} color="#059669" />
                  <Text style={styles.parentCardPhoneText}>
                    {item.orang_tua.no_hp}
                  </Text>
                </View>
              ) : null}
            </View>
          )}
        </TouchableOpacity>
      );
    }

    // RENDER KHUSUS PEGAWAI & GURU: Desain lapang, modern, dan rapi tanpa tulisan berhimpitan
    if (isPegawai) {
      const isWoman =
        (item.jenis_kelamin || '').toLowerCase().includes('perempuan') ||
        (item.jenis_kelamin || '').toLowerCase() === 'p';
      const isTetap =
        (item.status || '').toLowerCase().includes('tetap') ||
        (item.status || '').toLowerCase() === 'aktif';

      return (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setSelectedEmployee(item)}
          style={[styles.itemCard, styles.employeeCard]}
        >
          {/* Baris 1: Avatar Pegawai + Nama & Identitas Gender/Unit + Status Pill */}
          <View style={styles.employeeTopRow}>
            <View
              style={[
                styles.employeeAvatarBox,
                {
                  backgroundColor: isWoman ? '#FDF2F8' : '#ECFEFF',
                  borderColor: isWoman ? '#FBCFE8' : '#A5F3FC',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={isWoman ? 'account-tie-woman' : 'account-tie'}
                size={22}
                color={isWoman ? '#DB2777' : '#0891B2'}
              />
            </View>

            <View style={styles.employeeNameCol}>
              <Text style={styles.employeeNameText} numberOfLines={2}>
                {item.nama || item.name || item.full_name || 'Tanpa Nama'}
              </Text>
              <View style={styles.employeeSubRow}>
                <Text style={styles.employeeSubText}>
                  {item.jenis_kelamin || 'Pegawai'}
                </Text>
                {item.unit && (
                  <>
                    <Text style={styles.employeeSubDot}>•</Text>
                    <MaterialCommunityIcons name="domain" size={11} color="#0D9488" />
                    <Text style={styles.employeeSubUnitText} numberOfLines={1}>
                      {item.unit}
                    </Text>
                  </>
                )}
              </View>
            </View>

            {item.status && (
              <View
                style={[
                  styles.employeeStatusPill,
                  isTetap ? styles.statusTetapPill : styles.statusHonorerPill,
                ]}
              >
                <Text
                  style={[
                    styles.employeeStatusPillText,
                    isTetap ? styles.statusTetapPillText : styles.statusHonorerPillText,
                  ]}
                >
                  {item.status}
                </Text>
              </View>
            )}
          </View>

          {/* Baris 2: Strip Jabatan Pegawai / Guru yang Lapang & Rapi */}
          {item.jabatan && item.jabatan !== '-' && (
            <View style={styles.employeeJabatanBox}>
              <View style={styles.employeeJabatanIconWrap}>
                <MaterialCommunityIcons name="briefcase-outline" size={13} color="#2563EB" />
              </View>
              <Text style={styles.employeeJabatanText} numberOfLines={2}>
                {item.jabatan}
              </Text>
            </View>
          )}

          {/* Baris 3: Metadata Resmi (NIY & NIK) dengan Kotak Badge Rapi */}
          <View style={styles.employeeMetaRow}>
            {item.niy ? (
              <View style={styles.employeeMetaBadge}>
                <MaterialCommunityIcons name="card-account-details-outline" size={12} color="#0891B2" />
                <Text style={styles.employeeMetaLabel}>NIY:</Text>
                <Text style={styles.employeeMetaVal}>{item.niy}</Text>
              </View>
            ) : (
              <View style={[styles.employeeMetaBadge, styles.employeeMetaMissing]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#D97706" />
                <Text style={styles.employeeMetaMissingText}>NIY: Belum Diisi</Text>
              </View>
            )}

            {item.nik ? (
              <View style={styles.employeeMetaBadge}>
                <MaterialCommunityIcons name="identifier" size={12} color="#64748B" />
                <Text style={styles.employeeMetaLabel}>NIK:</Text>
                <Text style={styles.employeeMetaVal}>{item.nik}</Text>
              </View>
            ) : (
              <View style={[styles.employeeMetaBadge, styles.employeeMetaMissing]}>
                <MaterialCommunityIcons name="alert-circle-outline" size={12} color="#D97706" />
                <Text style={styles.employeeMetaMissingText}>NIK: Belum Diisi</Text>
              </View>
            )}
          </View>

          {/* Baris 4: Jika Pegawai Incomplete, tampilkan notice keterangan + tombol Lengkapi */}
          {item.keterangan ? (
            <View style={styles.employeeIncompleteRow}>
              <View style={styles.employeeIncompleteBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#D97706" />
                <Text style={styles.employeeIncompleteText} numberOfLines={2}>
                  {item.keterangan}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleActionNavigate(item)}
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>Lengkapi</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </TouchableOpacity>
      );
    }

    // RENDER KHUSUS ABSENSI HARI INI: SISWA HADIR, BELUM ABSEN, DAN GURU HADIR
    if (type === 'absensi_hari_ini') {
      // 1. TAB SISWA HADIR
      if (activeTab === 'siswa_hadir') {
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSelectedStudent(item)}
            style={[styles.itemCard, styles.studentCard, { borderColor: '#A7F3D0' }]}
          >
            {/* Baris 1: Avatar Siswa Hadir + Nama & Gender + Jam Masuk & Status Pill */}
            <View style={styles.studentTopRow}>
              <View style={[styles.studentAvatarBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <MaterialCommunityIcons
                  name="account-check-outline"
                  size={22}
                  color="#059669"
                />
              </View>
              <View style={styles.studentNameCol}>
                <Text style={styles.studentNameText} numberOfLines={1}>
                  {item.nama || item.name || item.full_name || 'Tanpa Nama'}
                </Text>
                <Text style={styles.studentSubText}>
                  {item.jenis_kelamin || 'Siswa'} {item.unit ? `• ${item.unit}` : ''}
                </Text>
              </View>

              <View style={styles.attendanceStatusCol}>
                {item.jam_masuk && item.jam_masuk !== '-' ? (
                  <View style={styles.jamMasukPill}>
                    <MaterialCommunityIcons name="clock-outline" size={11} color="#065F46" />
                    <Text style={styles.jamMasukPillText}>{item.jam_masuk}</Text>
                  </View>
                ) : null}
                <View style={[styles.studentStatusPill, styles.statusAktifPill]}>
                  <Text style={[styles.studentStatusPillText, styles.statusAktifPillText]}>
                    {item.status || 'Hadir'}
                  </Text>
                </View>
              </View>
            </View>

            {/* Baris 2: Badges Metadata (Kelas & NIS/NISN) */}
            <View style={styles.studentBadgeRow}>
              {item.kelas && item.kelas !== '-' ? (
                <View style={styles.studentKelasBadge}>
                  <MaterialCommunityIcons name="google-classroom" size={13} color="#0D9488" />
                  <Text style={styles.studentKelasBadgeText}>{item.kelas}</Text>
                </View>
              ) : null}
              {item.nis && item.nis !== '-' ? (
                <View style={styles.studentMetaBadge}>
                  <Text style={styles.studentMetaBadgeLabel}>NIS:</Text>
                  <Text style={styles.studentMetaBadgeVal}>{item.nis}</Text>
                </View>
              ) : null}
              {item.nisn && item.nisn !== '-' ? (
                <View style={styles.studentMetaBadge}>
                  <Text style={styles.studentMetaBadgeLabel}>NISN:</Text>
                  <Text style={styles.studentMetaBadgeVal}>{item.nisn}</Text>
                </View>
              ) : null}
            </View>

            {/* Baris 3: Wadah Data Orang Tua jika ada */}
            {item.orang_tua && item.orang_tua.nama ? (
              <View style={styles.studentParentCardBox}>
                <View style={styles.parentCardMainRow}>
                  <MaterialCommunityIcons name="account-child-outline" size={16} color="#0D9488" />
                  <Text style={styles.parentCardNameText} numberOfLines={1}>
                    Ortu: {item.orang_tua.nama}
                  </Text>
                </View>
                {item.orang_tua.no_hp && item.orang_tua.no_hp !== '-' ? (
                  <View style={styles.parentCardPhoneRow}>
                    <MaterialCommunityIcons name="whatsapp" size={13} color="#059669" />
                    <Text style={styles.parentCardPhoneText}>
                      {item.orang_tua.no_hp}
                    </Text>
                  </View>
                ) : null}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      }

      // 2. TAB SISWA BELUM ABSEN (Perlu Konfirmasi / Follow Up)
      if (activeTab === 'siswa_belum_absen') {
        return (
          <TouchableOpacity
            activeOpacity={0.75}
            onPress={() => setSelectedStudent(item)}
            style={[styles.itemCard, styles.studentCard, { borderColor: '#FDE68A' }]}
          >
            {/* Baris 1: Avatar Siswa Belum Absen + Nama & Gender + Status Pill Amber */}
            <View style={styles.studentTopRow}>
              <View style={[styles.studentAvatarBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <MaterialCommunityIcons
                  name="account-clock-outline"
                  size={22}
                  color="#D97706"
                />
              </View>
              <View style={styles.studentNameCol}>
                <Text style={styles.studentNameText} numberOfLines={1}>
                  {item.nama || item.name || item.full_name || 'Tanpa Nama'}
                </Text>
                <Text style={styles.studentSubText}>
                  {item.jenis_kelamin || 'Siswa'} {item.unit ? `• ${item.unit}` : ''}
                </Text>
              </View>

              <View style={[styles.studentStatusPill, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
                <Text style={[styles.studentStatusPillText, { color: '#B45309' }]}>
                  Belum Hadir
                </Text>
              </View>
            </View>

            {/* Baris 2: Badges Metadata (Kelas & NIS/NISN) */}
            <View style={styles.studentBadgeRow}>
              {item.kelas && item.kelas !== '-' ? (
                <View style={[styles.studentKelasBadge, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                  <MaterialCommunityIcons name="google-classroom" size={13} color="#D97706" />
                  <Text style={[styles.studentKelasBadgeText, { color: '#B45309' }]}>{item.kelas}</Text>
                </View>
              ) : null}
              {item.nis && item.nis !== '-' ? (
                <View style={styles.studentMetaBadge}>
                  <Text style={styles.studentMetaBadgeLabel}>NIS:</Text>
                  <Text style={styles.studentMetaBadgeVal}>{item.nis}</Text>
                </View>
              ) : null}
              {item.nisn && item.nisn !== '-' ? (
                <View style={styles.studentMetaBadge}>
                  <Text style={styles.studentMetaBadgeLabel}>NISN:</Text>
                  <Text style={styles.studentMetaBadgeVal}>{item.nisn}</Text>
                </View>
              ) : null}
            </View>

            {/* Baris 3: Wadah Orang Tua + Aksi Cepat Hubungi Ortu */}
            {item.orang_tua && item.orang_tua.nama ? (
              <View style={[styles.studentParentCardBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <View style={{ flex: 1 }}>
                  <View style={styles.parentCardMainRow}>
                    <MaterialCommunityIcons name="account-alert-outline" size={15} color="#D97706" />
                    <Text style={[styles.parentCardNameText, { color: '#92400E' }]} numberOfLines={1}>
                      Wali: {item.orang_tua.nama}
                    </Text>
                  </View>
                  {item.orang_tua.no_hp && item.orang_tua.no_hp !== '-' ? (
                    <View style={styles.parentCardPhoneRow}>
                      <MaterialCommunityIcons name="phone-outline" size={12} color="#D97706" />
                      <Text style={[styles.parentCardPhoneText, { color: '#B45309' }]}>
                        {item.orang_tua.no_hp}
                      </Text>
                    </View>
                  ) : null}
                </View>

                {item.orang_tua.no_hp && item.orang_tua.no_hp !== '-' && (
                  <View style={styles.parentQuickActionRow}>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleOpenWhatsApp(item.orang_tua.no_hp)}
                      style={styles.quickWaBtn}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={14} color="#FFFFFF" />
                      <Text style={styles.quickWaBtnText}>WA</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.7}
                      onPress={() => handleCallPhone(item.orang_tua.no_hp)}
                      style={styles.quickCallBtn}
                    >
                      <MaterialCommunityIcons name="phone" size={13} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>
                )}
              </View>
            ) : null}
          </TouchableOpacity>
        );
      }

      // 3. TAB PEGAWAI / GURU HADIR
      return (
        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => setSelectedEmployee(item)}
          style={[styles.itemCard, styles.employeeCard, { borderColor: '#C7D2FE' }]}
        >
          {/* Baris 1: Avatar Guru Hadir + Nama & Gender + Jam Masuk & Status Pill */}
          <View style={styles.employeeTopRow}>
            <View
              style={[
                styles.employeeAvatarBox,
                {
                  backgroundColor: '#EEF2FF',
                  borderColor: '#C7D2FE',
                },
              ]}
            >
              <MaterialCommunityIcons
                name="account-tie"
                size={22}
                color="#4F46E5"
              />
            </View>

            <View style={styles.employeeNameCol}>
              <Text style={styles.employeeNameText} numberOfLines={2}>
                {item.nama || item.name || item.full_name || 'Tanpa Nama'}
              </Text>
              <View style={styles.employeeSubRow}>
                <Text style={styles.employeeSubText}>
                  {item.jenis_kelamin || 'Guru'}
                </Text>
                {item.unit && item.unit !== '-' && (
                  <>
                    <Text style={styles.employeeSubDot}>•</Text>
                    <MaterialCommunityIcons name="domain" size={11} color="#0D9488" />
                    <Text style={styles.employeeSubUnitText} numberOfLines={1}>
                      {item.unit}
                    </Text>
                  </>
                )}
              </View>
            </View>

            <View style={styles.attendanceStatusCol}>
              {item.jam_masuk && item.jam_masuk !== '-' ? (
                <View style={styles.jamMasukIndigoPill}>
                  <MaterialCommunityIcons name="clock-outline" size={11} color="#4338CA" />
                  <Text style={styles.jamMasukIndigoPillText}>{item.jam_masuk}</Text>
                </View>
              ) : null}
              <View style={[styles.employeeStatusPill, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Text style={[styles.employeeStatusPillText, { color: '#059669' }]}>
                  {item.status || 'Hadir'}
                </Text>
              </View>
            </View>
          </View>

          {/* Baris 2: Strip Jabatan Pegawai / Guru yang Lapang */}
          {item.jabatan && item.jabatan !== '-' && (
            <View style={[styles.employeeJabatanBox, { backgroundColor: '#EEF2FF', borderColor: '#E0E7FF' }]}>
              <View style={[styles.employeeJabatanIconWrap, { backgroundColor: '#C7D2FE' }]}>
                <MaterialCommunityIcons name="briefcase-outline" size={13} color="#4338CA" />
              </View>
              <Text style={[styles.employeeJabatanText, { color: '#312E81' }]} numberOfLines={2}>
                {item.jabatan}
              </Text>
            </View>
          )}

          {/* Baris 3: Metadata Resmi (NIY & NIK) */}
          <View style={styles.employeeMetaRow}>
            {item.niy && item.niy !== '-' ? (
              <View style={styles.employeeMetaBadge}>
                <MaterialCommunityIcons name="card-account-details-outline" size={12} color="#0891B2" />
                <Text style={styles.employeeMetaLabel}>NIY:</Text>
                <Text style={styles.employeeMetaVal}>{item.niy}</Text>
              </View>
            ) : null}

            {item.nik && item.nik !== '-' ? (
              <View style={styles.employeeMetaBadge}>
                <MaterialCommunityIcons name="identifier" size={12} color="#64748B" />
                <Text style={styles.employeeMetaLabel}>NIK:</Text>
                <Text style={styles.employeeMetaVal}>{item.nik}</Text>
              </View>
            ) : null}
          </View>
        </TouchableOpacity>
      );
    }

    // RENDER UNTUK SISWA INCOMPLETE: Desain rapi dengan notice keterangan
    if (type === 'siswa_incomplete') {
      return (
        <View style={[styles.itemCard, styles.studentCard, { borderColor: '#FDE68A' }]}>
          <View style={styles.studentTopRow}>
            <View style={[styles.studentAvatarBox, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={22}
                color="#D97706"
              />
            </View>
            <View style={styles.studentNameCol}>
              <Text style={styles.studentNameText} numberOfLines={1}>
                {item.nama || item.name || item.full_name || 'Tanpa Nama'}
              </Text>
              <Text style={styles.studentSubText}>
                {item.jenis_kelamin || 'Siswa'} {item.unit ? `• ${item.unit}` : ''}
              </Text>
            </View>
            <View style={[styles.studentStatusPill, { backgroundColor: '#FEF3C7', borderColor: '#FCD34D' }]}>
              <Text style={[styles.studentStatusPillText, { color: '#B45309' }]}>
                Belum Lengkap
              </Text>
            </View>
          </View>

          <View style={styles.studentBadgeRow}>
            {item.kelas && item.kelas !== '-' ? (
              <View style={styles.studentKelasBadge}>
                <MaterialCommunityIcons name="google-classroom" size={13} color="#0D9488" />
                <Text style={styles.studentKelasBadgeText}>{item.kelas}</Text>
              </View>
            ) : null}
            {item.nis && item.nis !== '-' ? (
              <View style={styles.studentMetaBadge}>
                <Text style={styles.studentMetaBadgeLabel}>NIS:</Text>
                <Text style={styles.studentMetaBadgeVal}>{item.nis}</Text>
              </View>
            ) : null}
          </View>

          {item.keterangan ? (
            <View style={styles.employeeIncompleteRow}>
              <View style={styles.employeeIncompleteBox}>
                <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#D97706" />
                <Text style={styles.employeeIncompleteText} numberOfLines={2}>
                  {item.keterangan}
                </Text>
              </View>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => handleActionNavigate(item)}
                style={styles.actionBtn}
              >
                <Text style={styles.actionBtnText}>Lengkapi</Text>
              </TouchableOpacity>
            </View>
          ) : null}
        </View>
      );
    }

    // RENDER KHUSUS PENGAJUAN SURAT
    if (type === 'pengajuan_surat') {
      const isPending =
        (item.status || '').toUpperCase() === 'MENUNGGU' ||
        (item.status || '').toUpperCase() === 'PENDING';
      return (
        <View style={[styles.itemCard, { borderColor: isPending ? '#FECDD3' : '#E2E8F0', padding: 14 }]}>
          <View style={styles.studentTopRow}>
            <View style={[styles.studentAvatarBox, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}>
              <MaterialCommunityIcons name="file-document-edit-outline" size={22} color="#E11D48" />
            </View>
            <View style={styles.studentNameCol}>
              <Text style={styles.studentNameText} numberOfLines={1}>
                {item.nama || 'Santri'}
              </Text>
              <Text style={styles.studentSubText}>
                {item.kelas || '-'} {item.unit ? `• ${item.unit}` : ''}
              </Text>
            </View>
            <View
              style={[
                styles.studentStatusPill,
                {
                  backgroundColor: isPending ? '#FFE4E6' : '#ECFDF5',
                  borderColor: isPending ? '#FDA4AF' : '#A7F3D0',
                },
              ]}
            >
              <Text
                style={[
                  styles.studentStatusPillText,
                  { color: isPending ? '#E11D48' : '#059669' },
                ]}
              >
                {item.status || 'MENUNGGU'}
              </Text>
            </View>
          </View>

          <View
            style={{
              marginTop: 10,
              backgroundColor: '#F8FAFC',
              borderRadius: 10,
              padding: 10,
              borderWidth: 1,
              borderColor: '#F1F5F9',
            }}
          >
            <Text style={{ fontSize: 13, fontWeight: '700', color: '#1E293B', marginBottom: 2 }}>
              {item.tipe_surat || 'Surat Permohonan'}
            </Text>
            <Text style={{ fontSize: 12, color: '#64748B', lineHeight: 17 }} numberOfLines={2}>
              {item.alasan || '-'}
            </Text>
          </View>

          <View
            style={{
              flexDirection: 'row',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginTop: 10,
            }}
          >
            <Text style={{ fontSize: 11, color: '#94A3B8' }}>
              Diajukan: {item.tanggal || '-'}
            </Text>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                Alert.alert(
                  'Detail Pengajuan Surat',
                  `Nama: ${item.nama}\nKelas: ${item.kelas}\nTipe Surat: ${item.tipe_surat}\nStatus: ${item.status}\nKeterangan: ${item.alasan}`
                );
              }}
              style={[styles.actionBtn, { backgroundColor: '#E11D48' }]}
            >
              <Text style={styles.actionBtnText}>Lihat Surat</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // RENDER KHUSUS PEMBAYARAN HARI INI
    if (type === 'pembayaran_hari_ini') {
      return (
        <View style={[styles.itemCard, { borderColor: '#CCFBF1', padding: 14 }]}>
          <View style={styles.studentTopRow}>
            <View style={[styles.studentAvatarBox, { backgroundColor: '#F0FDFA', borderColor: '#99F6E4' }]}>
              <MaterialCommunityIcons name="cash-check" size={22} color="#0D9488" />
            </View>
            <View style={styles.studentNameCol}>
              <Text style={styles.studentNameText} numberOfLines={1}>
                {item.nama || '-'}
              </Text>
              <Text style={styles.studentSubText}>
                {item.kelas || '-'} {item.unit ? `• ${item.unit}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={{ fontSize: 15, fontWeight: '800', color: '#059669' }}>
                {item.nominal || 'Rp 0'}
              </Text>
              <Text style={{ fontSize: 11, color: '#0D9488', fontWeight: '600', marginTop: 2 }}>
                Pukul {item.jam || '-'}
              </Text>
            </View>
          </View>

          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginTop: 10,
              paddingTop: 8,
              borderTopWidth: 1,
              borderTopColor: '#F0FDFA',
            }}
          >
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <MaterialCommunityIcons name="receipt" size={14} color="#64748B" />
              <Text style={{ fontSize: 12, color: '#475569', fontWeight: '600' }}>
                {item.pos_tagihan || 'SPP / Pendidikan'}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: '#F0FDFA',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 6,
                borderWidth: 1,
                borderColor: '#CCFBF1',
              }}
            >
              <Text style={{ fontSize: 10.5, fontWeight: '700', color: '#0D9488' }}>
                {item.metode || 'TUNAI'}
              </Text>
            </View>
          </View>
        </View>
      );
    }

    // RENDER KHUSUS TUGAS MENUNGGU
    if (type === 'tugas_menunggu') {
      const isHighPriority = item.priority === 'Tinggi';
      return (
        <View
          style={[
            styles.itemCard,
            { borderColor: isHighPriority ? '#E0E7FF' : '#E2E8F0', padding: 14 },
          ]}
        >
          <View style={styles.studentTopRow}>
            <View
              style={[
                styles.studentAvatarBox,
                {
                  backgroundColor: isHighPriority ? '#EEF2FF' : '#F8FAFC',
                  borderColor: isHighPriority ? '#C7D2FE' : '#E2E8F0',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={
                  item.tipe === 'surat'
                    ? 'file-clock-outline'
                    : item.tipe === 'pegawai'
                    ? 'account-tie'
                    : 'account-alert'
                }
                size={22}
                color={isHighPriority ? '#4F46E5' : '#64748B'}
              />
            </View>
            <View style={styles.studentNameCol}>
              <Text style={styles.studentNameText} numberOfLines={1}>
                {item.nama || 'Tugas'}
              </Text>
              <Text style={styles.studentSubText} numberOfLines={1}>
                {item.subjudul || '-'}
              </Text>
            </View>
            <View
              style={{
                backgroundColor: isHighPriority ? '#EEF2FF' : '#F1F5F9',
                paddingHorizontal: 8,
                paddingVertical: 3,
                borderRadius: 8,
              }}
            >
              <Text
                style={{
                  fontSize: 10.5,
                  fontWeight: '700',
                  color: isHighPriority ? '#4338CA' : '#475569',
                }}
              >
                {item.kategori || 'Tugas'}
              </Text>
            </View>
          </View>

          <View
            style={{
              marginTop: 8,
              backgroundColor: '#FAF5FF',
              borderRadius: 8,
              padding: 8,
              borderWidth: 1,
              borderColor: '#F3E8FF',
            }}
          >
            <Text style={{ fontSize: 11.5, color: '#6B21A8' }}>
              {item.keterangan || '-'}
            </Text>
          </View>

          <View style={{ flexDirection: 'row', justifyContent: 'flex-end', marginTop: 10 }}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                onClose();
                if (item.tipe === 'surat') {
                  navigation?.navigate('Lainnya');
                } else if (item.tipe === 'pegawai') {
                  navigation?.navigate('Data', { initialResource: 'employees' });
                } else {
                  navigation?.navigate('Data', { initialResource: 'students' });
                }
              }}
              style={[styles.actionBtn, { backgroundColor: '#4F46E5' }]}
            >
              <Text style={styles.actionBtnText}>Tindak Lanjuti</Text>
            </TouchableOpacity>
          </View>
        </View>
      );
    }

    // RENDER KHUSUS JADWAL PELAJARAN & KBM
    if (type === 'jadwal_kbm') {
      return (
        <View style={[styles.itemCard, { borderColor: '#BAE6FD', padding: 14 }]}>
          <View style={styles.studentTopRow}>
            <View style={[styles.studentAvatarBox, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <MaterialCommunityIcons name="calendar-clock" size={22} color="#0284C7" />
            </View>
            <View style={styles.studentNameCol}>
              <Text style={styles.studentNameText} numberOfLines={1}>
                {item.mapel || 'Pelajaran'}
              </Text>
              <Text style={styles.studentSubText}>
                {item.hari} • {item.jam}
              </Text>
            </View>
            <View style={[styles.studentStatusPill, { backgroundColor: '#F0F9FF', borderColor: '#BAE6FD' }]}>
              <Text style={[styles.studentStatusPillText, { color: '#0369A1' }]}>
                {item.ruang || 'Kelas'}
              </Text>
            </View>
          </View>

          <View style={styles.studentBadgeRow}>
            <View style={styles.studentKelasBadge}>
              <MaterialCommunityIcons name="google-classroom" size={13} color="#0D9488" />
              <Text style={styles.studentKelasBadgeText}>{item.kelas}</Text>
            </View>
            <View style={[styles.studentMetaBadge, { backgroundColor: '#F8FAFC' }]}>
              <MaterialCommunityIcons name="account-tie" size={13} color="#475569" style={{ marginRight: 4 }} />
              <Text style={styles.studentMetaBadgeVal}>{item.guru}</Text>
            </View>
          </View>
        </View>
      );
    }

    // RENDER KHUSUS LAPORAN NILAI & LEGER
    if (type === 'laporan_nilai') {
      const isTuntas = (item.status || '').toUpperCase() === 'TUNTAS';
      return (
        <View style={[styles.itemCard, { borderColor: isTuntas ? '#E9D5FF' : '#FECDD3', padding: 14 }]}>
          <View style={styles.studentTopRow}>
            <View
              style={[
                styles.studentAvatarBox,
                {
                  backgroundColor: isTuntas ? '#FAF5FF' : '#FFF1F2',
                  borderColor: isTuntas ? '#E9D5FF' : '#FECDD3',
                },
              ]}
            >
              <MaterialCommunityIcons
                name={isTuntas ? 'check-decagram' : 'alert-decagram-outline'}
                size={22}
                color={isTuntas ? '#9333EA' : '#E11D48'}
              />
            </View>
            <View style={styles.studentNameCol}>
              <Text style={styles.studentNameText} numberOfLines={1}>
                {item.nama || 'Santri'}
              </Text>
              <Text style={styles.studentSubText}>
                {item.kelas} {item.nis ? `• NIS: ${item.nis}` : ''}
              </Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                <Text style={{ fontSize: 16, fontWeight: '900', color: isTuntas ? '#7E22CE' : '#E11D48' }}>
                  {item.nilai_akhir}
                </Text>
                <View
                  style={{
                    backgroundColor: isTuntas ? '#F3E8FF' : '#FFE4E6',
                    paddingHorizontal: 6,
                    paddingVertical: 1,
                    borderRadius: 4,
                  }}
                >
                  <Text style={{ fontSize: 11, fontWeight: '800', color: isTuntas ? '#7E22CE' : '#BE123C' }}>
                    {item.predikat}
                  </Text>
                </View>
              </View>
              <Text
                style={{
                  fontSize: 10,
                  fontWeight: '700',
                  color: isTuntas ? '#059669' : '#DC2626',
                  marginTop: 2,
                }}
              >
                {item.status}
              </Text>
            </View>
          </View>

          <View style={[styles.studentBadgeRow, { marginTop: 8 }]}>
            <View style={[styles.studentKelasBadge, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
              <MaterialCommunityIcons name="book-open-page-variant" size={13} color="#9333EA" />
              <Text style={[styles.studentKelasBadgeText, { color: '#7E22CE' }]}>{item.mapel}</Text>
            </View>
            <View style={styles.studentMetaBadge}>
              <Text style={styles.studentMetaBadgeLabel}>Tugas: </Text>
              <Text style={styles.studentMetaBadgeVal}>{item.nilai_tugas}</Text>
            </View>
            <View style={styles.studentMetaBadge}>
              <Text style={styles.studentMetaBadgeLabel}>UTS: </Text>
              <Text style={styles.studentMetaBadgeVal}>{item.nilai_uts}</Text>
            </View>
            <View style={styles.studentMetaBadge}>
              <Text style={styles.studentMetaBadgeLabel}>UAS: </Text>
              <Text style={styles.studentMetaBadgeVal}>{item.nilai_uas}</Text>
            </View>
          </View>
        </View>
      );
    }

    // FALLBACK GENERIC JIKA ADA TIPE LAIN
    const cardContent = (
      <View style={styles.itemMainRow}>
        <View style={[styles.avatarBox, { backgroundColor: config.iconBg }]}>
          <MaterialCommunityIcons
            name={
              isSiswa
                ? 'account-school-outline'
                : isPegawai
                ? 'account-tie-outline'
                : 'account-clock-outline'
            }
            size={20}
            color={config.iconColor}
          />
        </View>
        <View style={styles.itemInfoCol}>
          <Text style={styles.itemName} numberOfLines={1}>
            {item.nama || item.name || item.full_name || 'Tanpa Nama'}
          </Text>
          <View style={styles.itemMetaRow}>
            {item.nis && <Text style={styles.itemBadge}>NIS: {item.nis}</Text>}
            {item.nisn && <Text style={styles.itemBadge}>NISN: {item.nisn}</Text>}
            {item.niy && <Text style={styles.itemBadge}>NIY: {item.niy}</Text>}
            {item.nik && <Text style={styles.itemBadge}>NIK: {item.nik}</Text>}
            {item.kelas && <Text style={styles.itemBadgeKelas}>{item.kelas}</Text>}
            {item.jabatan && <Text style={styles.itemBadgeJabatan}>{item.jabatan}</Text>}
            {item.unit && <Text style={styles.itemBadgeUnit}>🏫 {item.unit}</Text>}
            {item.status && <Text style={styles.itemBadgeStatus}>{item.status}</Text>}
            {item.jam_masuk && (
              <Text style={styles.itemBadgeJam}>🕒 {item.jam_masuk}</Text>
            )}
          </View>

          {item.keterangan ? (
            <View style={styles.incompleteBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={13} color="#D97706" />
              <Text style={styles.incompleteText}>{item.keterangan}</Text>
            </View>
          ) : null}
        </View>

        {type === 'siswa_incomplete' && (
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => handleActionNavigate(item)}
            style={styles.actionBtn}
          >
            <Text style={styles.actionBtnText}>Lengkapi</Text>
          </TouchableOpacity>
        )}
      </View>
    );

    return <View style={styles.itemCard}>{cardContent}</View>;
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Top Bar with Accent Gradient */}
          <LinearGradient
            colors={config.gradient || ['#047857', '#059669', '#10B981']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.headerGradient}
          >
            <View style={styles.headerTopRow}>
              <View style={styles.headerLeft}>
                <View style={styles.headerIconSquircle}>
                  <MaterialCommunityIcons name={config.icon} size={22} color={config.iconColor || '#059669'} />
                </View>
                <View style={styles.headerTextCol}>
                  <Text style={styles.modalTitle} numberOfLines={1}>
                    {config.title}
                  </Text>
                  <Text style={styles.modalSubtitle} numberOfLines={2}>
                    {unitName ? `Unit: ${unitName} • ${config.subtitle}` : config.subtitle}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityLabel="Tutup"
              >
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </View>

            {/* Summary badges */}
            {summary ? (
              <View style={styles.summaryBadgesRow}>
                {config.summaryKeys.map((key) => {
                  const val = summary[key];
                  if (val === undefined || val === null) return null;
                  const label = config.summaryLabels[key] || key;
                  return (
                    <View key={key} style={styles.summaryBadge}>
                      <MaterialCommunityIcons
                        name={getSummaryBadgeIcon(key) as never}
                        size={13}
                        color="#FFFFFF"
                      />
                      <Text style={styles.summaryBadgeLabel}>{label}:</Text>
                      <Text style={styles.summaryBadgeVal}>
                        {typeof val === 'number'
                          ? Number(val).toLocaleString('id-ID')
                          : String(val)}
                      </Text>
                    </View>
                  );
                })}
              </View>
            ) : null}
          </LinearGradient>

          {/* Absensi Tab Switcher (if type === 'absensi_hari_ini') */}
          {type === 'absensi_hari_ini' && (
            <View style={styles.tabBar}>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveTab('siswa_hadir')}
                style={[styles.tabItem, activeTab === 'siswa_hadir' && styles.tabItemActive]}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    activeTab === 'siswa_hadir' && styles.tabItemTextActive,
                  ]}
                >
                  Siswa Hadir
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveTab('siswa_belum_absen')}
                style={[
                  styles.tabItem,
                  activeTab === 'siswa_belum_absen' && styles.tabItemActive,
                ]}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    activeTab === 'siswa_belum_absen' && styles.tabItemTextActive,
                  ]}
                >
                  Belum Absen
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setActiveTab('pegawai')}
                style={[styles.tabItem, activeTab === 'pegawai' && styles.tabItemActive]}
              >
                <Text
                  style={[
                    styles.tabItemText,
                    activeTab === 'pegawai' && styles.tabItemTextActive,
                  ]}
                >
                  Guru Hadir
                </Text>
              </TouchableOpacity>
            </View>
          )}

          {/* TOTAL SISWA: DROPDOWN KELAS & DROPDOWN ORANG TUA */}
          {type === 'total_siswa' && (
            <View style={styles.totalSiswaFilterContainer}>
              {/* Dropdowns Row: Kelas Dropdown + Orang Tua Dropdown */}
              <View style={styles.dropdownRow}>
                {/* 1. Dropdown Kelas / Rombel */}
                <View style={styles.dropdownCol}>
                  <Text style={styles.dropdownLabel}>Kelas / Rombel:</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setClassPickerVisible(true)}
                    style={[
                      styles.dropdownTrigger,
                      selectedKelasId !== 'all' && styles.dropdownTriggerActive,
                    ]}
                  >
                    <MaterialCommunityIcons name="google-classroom" size={17} color="#059669" />
                    <Text
                      style={[
                        styles.dropdownTriggerText,
                        selectedKelasId !== 'all' && styles.dropdownTriggerTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedClassName}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>

                {/* 2. Dropdown Nama Orang Tua */}
                <View style={styles.dropdownCol}>
                  <Text style={styles.dropdownLabel}>Nama Orang Tua:</Text>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setParentPickerVisible(true)}
                    style={[
                      styles.dropdownTrigger,
                      parentSearch !== '' && styles.dropdownTriggerActive,
                    ]}
                  >
                    <MaterialCommunityIcons name="account-child-outline" size={17} color="#0D9488" />
                    <Text
                      style={[
                        styles.dropdownTriggerText,
                        parentSearch !== '' && styles.dropdownTriggerTextActive,
                      ]}
                      numberOfLines={1}
                    >
                      {selectedParentName}
                    </Text>
                    <MaterialCommunityIcons name="chevron-down" size={18} color="#64748B" />
                  </TouchableOpacity>
                </View>
              </View>

              {/* Active Filter Pill & Reset Button */}
              {(selectedKelasId !== 'all' || parentSearch !== '') && (
                <View style={styles.activeFilterNoticeRow}>
                  <Text style={styles.activeFilterNoticeText} numberOfLines={1}>
                    Filter: {selectedKelasId !== 'all' ? selectedClassName : ''}
                    {selectedKelasId !== 'all' && parentSearch !== '' ? ' • ' : ''}
                    {parentSearch !== '' ? `Ortu: ${parentSearch}` : ''}
                  </Text>
                  <TouchableOpacity
                    onPress={() => {
                      setSelectedKelasId('all');
                      setParentSearch('');
                    }}
                    style={styles.resetFilterBtn}
                  >
                    <MaterialCommunityIcons name="refresh" size={13} color="#059669" />
                    <Text style={styles.resetFilterBtnText}>Reset</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Student Name / NIS Search Input */}
              <View style={styles.searchBarWrapInner}>
                <View style={styles.searchBox}>
                  <MaterialCommunityIcons name="magnify" size={17} color="#059669" />
                  <TextInput
                    style={styles.searchInput}
                    placeholder="Cari siswa (nama / NIS)..."
                    placeholderTextColor="#94A3B8"
                    value={search}
                    onChangeText={setSearch}
                    clearButtonMode="while-editing"
                  />
                  {search.length > 0 && Platform.OS !== 'ios' && (
                    <TouchableOpacity onPress={() => setSearch('')}>
                      <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            </View>
          )}

          {/* Standard Search bar for other KPI types */}
          {type !== 'total_siswa' && (
            <View style={styles.searchBarWrap}>
              <View style={styles.searchBox}>
                <MaterialCommunityIcons
                  name="magnify"
                  size={18}
                  color={type === 'total_pegawai' ? '#0891B2' : '#94A3B8'}
                />
                <TextInput
                  style={styles.searchInput}
                  placeholder={
                    type === 'total_pegawai'
                      ? 'Cari nama pegawai, NIY, NIK, jabatan...'
                      : type === 'pegawai_incomplete'
                      ? 'Cari nama pegawai belum lengkap...'
                      : 'Cari berdasarkan nama, NIS, NIY...'
                  }
                  placeholderTextColor="#94A3B8"
                  value={search}
                  onChangeText={setSearch}
                  clearButtonMode="while-editing"
                />
                {search.length > 0 && Platform.OS !== 'ios' && (
                  <TouchableOpacity onPress={() => setSearch('')}>
                    <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                  </TouchableOpacity>
                )}
              </View>
            </View>
          )}

          {/* Content Body */}
          {loading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>Memuat rincian data...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorWrap}>
              <MaterialCommunityIcons name="alert-circle-outline" size={36} color="#EF4444" />
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={fetchData}
                style={styles.retryBtn}
              >
                <Text style={styles.retryBtnText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.emptyWrap}>
              <MaterialCommunityIcons
                name="clipboard-text-search-outline"
                size={40}
                color="#94A3B8"
              />
              <Text style={styles.emptyText}>Tidak ada data yang sesuai filter pencarian.</Text>
            </View>
          ) : (
            <FlatList
              data={items}
              keyExtractor={(it, idx) => String(it.id || it.nis || it.niy || idx)}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            />
          )}
        </View>
      </View>

      {/* DROPDOWN PICKER MODAL 1: KELAS / ROMBEL */}
      <Modal
        visible={classPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setClassPickerVisible(false)}
      >
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <MaterialCommunityIcons name="google-classroom" size={20} color="#059669" />
                <Text style={styles.pickerModalTitle}>Pilih Kelas & Rombel</Text>
              </View>
              <TouchableOpacity onPress={() => setClassPickerVisible(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView style={styles.pickerScrollList} showsVerticalScrollIndicator={false}>
              <TouchableOpacity
                onPress={() => {
                  setSelectedKelasId('all');
                  setParentSearch('');
                  setClassPickerVisible(false);
                }}
                style={[
                  styles.pickerItem,
                  selectedKelasId === 'all' && styles.pickerItemActive,
                ]}
              >
                <MaterialCommunityIcons
                  name={selectedKelasId === 'all' ? 'check-circle' : 'circle-outline'}
                  size={18}
                  color={selectedKelasId === 'all' ? '#059669' : '#94A3B8'}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.pickerItemText,
                      selectedKelasId === 'all' && styles.pickerItemTextActive,
                    ]}
                  >
                    Semua Kelas
                  </Text>
                  <Text style={styles.pickerItemSub}>Tampilkan siswa dari seluruh rombel</Text>
                </View>
              </TouchableOpacity>

              {availableClasses.map((cls) => {
                const isSelected = String(selectedKelasId) === String(cls.id);
                return (
                  <TouchableOpacity
                    key={cls.id}
                    onPress={() => {
                      setSelectedKelasId(String(cls.id));
                      setParentSearch('');
                      setClassPickerVisible(false);
                    }}
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? 'check-circle' : 'circle-outline'}
                      size={18}
                      color={isSelected ? '#059669' : '#94A3B8'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextActive,
                        ]}
                      >
                        {cls.nama_kelas}
                      </Text>
                      {cls.tingkat && (
                        <Text style={styles.pickerItemSub}>Tingkat: {cls.tingkat}</Text>
                      )}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DROPDOWN PICKER MODAL 2: NAMA ORANG TUA */}
      <Modal
        visible={parentPickerVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setParentPickerVisible(false);
          setParentPickerQuery('');
        }}
      >
        <View style={styles.pickerBackdrop}>
          <View style={styles.pickerModalContent}>
            <View style={styles.pickerModalHeader}>
              <View style={styles.pickerHeaderLeft}>
                <MaterialCommunityIcons name="account-child-outline" size={20} color="#0D9488" />
                <View>
                  <Text style={styles.pickerModalTitle}>Pilih Nama Orang Tua</Text>
                  <Text style={styles.pickerModalSub}>
                    {selectedKelasId === 'all' ? 'Seluruh Unit Pendidikan' : selectedClassName}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => {
                  setParentPickerVisible(false);
                  setParentPickerQuery('');
                }}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            {/* Mini search inside parent picker modal */}
            <View style={styles.pickerSearchWrap}>
              <MaterialCommunityIcons name="magnify" size={16} color="#94A3B8" />
              <TextInput
                style={styles.pickerSearchInput}
                placeholder="Cari nama orang tua..."
                placeholderTextColor="#94A3B8"
                value={parentPickerQuery}
                onChangeText={setParentPickerQuery}
                clearButtonMode="while-editing"
              />
            </View>

            <ScrollView style={styles.pickerScrollList} showsVerticalScrollIndicator={false}>
              {/* Option: Semua Orang Tua */}
              <TouchableOpacity
                onPress={() => {
                  setParentSearch('');
                  setParentPickerQuery('');
                  setParentPickerVisible(false);
                }}
                style={[
                  styles.pickerItem,
                  parentSearch === '' && styles.pickerItemActive,
                ]}
              >
                <MaterialCommunityIcons
                  name={parentSearch === '' ? 'check-circle' : 'circle-outline'}
                  size={18}
                  color={parentSearch === '' ? '#059669' : '#94A3B8'}
                />
                <View style={{ flex: 1 }}>
                  <Text
                    style={[
                      styles.pickerItemText,
                      parentSearch === '' && styles.pickerItemTextActive,
                    ]}
                  >
                    Semua Orang Tua
                  </Text>
                  <Text style={styles.pickerItemSub}>Tampilkan seluruh data tanpa filter orang tua</Text>
                </View>
              </TouchableOpacity>

              {filteredParents.map((parentName, idx) => {
                const isSelected = parentSearch === parentName;
                return (
                  <TouchableOpacity
                    key={`${parentName}-${idx}`}
                    onPress={() => {
                      setParentSearch(parentName);
                      setParentPickerQuery('');
                      setParentPickerVisible(false);
                    }}
                    style={[styles.pickerItem, isSelected && styles.pickerItemActive]}
                  >
                    <MaterialCommunityIcons
                      name={isSelected ? 'check-circle' : 'circle-outline'}
                      size={18}
                      color={isSelected ? '#059669' : '#94A3B8'}
                    />
                    <View style={{ flex: 1 }}>
                      <Text
                        style={[
                          styles.pickerItemText,
                          isSelected && styles.pickerItemTextActive,
                        ]}
                      >
                        {parentName}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}

              {filteredParents.length === 0 && (
                <View style={{ padding: 24, alignItems: 'center' }}>
                  <Text style={{ fontSize: 12, color: '#94A3B8', fontWeight: '600' }}>
                    Tidak ada nama orang tua yang cocok.
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DETAIL MODAL: Siswa & Orang Tua */}
      <Modal
        visible={!!selectedStudent}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedStudent(null)}
      >
        <View style={styles.detailModalBackdrop}>
          <View style={styles.detailModalCard}>
            {/* Header */}
            <LinearGradient
              colors={['#047857', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.detailHeaderGradient}
            >
              <View style={styles.detailHeaderRow}>
                <View style={styles.detailAvatarSquircle}>
                  <MaterialCommunityIcons name="account-school" size={24} color="#059669" />
                </View>
                <View style={styles.detailHeaderTextCol}>
                  <Text style={styles.detailStudentName} numberOfLines={1}>
                    {selectedStudent?.nama || selectedStudent?.name || '-'}
                  </Text>
                  <Text style={styles.detailStudentSub} numberOfLines={1}>
                    NIS: {selectedStudent?.nis || '-'} • Kelas: {selectedStudent?.kelas || '-'}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedStudent(null)}
                  style={styles.detailCloseBtn}
                  accessibilityLabel="Tutup Rincian"
                >
                  <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* Scrollable details */}
            <ScrollView
              style={styles.detailBodyScroll}
              contentContainerStyle={styles.detailBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Unit & Status Tags */}
              <View style={styles.detailBadgeRow}>
                <View style={styles.detailUnitBadge}>
                  <MaterialCommunityIcons name="domain" size={14} color="#0D9488" />
                  <Text style={styles.detailUnitBadgeText}>
                    {selectedStudent?.unit || '-'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.detailStatusBadge,
                    selectedStudent?.status === 'Aktif'
                      ? styles.statusAktif
                      : styles.statusNonaktif,
                  ]}
                >
                  <Text
                    style={[
                      styles.detailStatusText,
                      selectedStudent?.status === 'Aktif'
                        ? styles.statusAktifText
                        : styles.statusNonaktifText,
                    ]}
                  >
                    {selectedStudent?.status || 'Aktif'}
                  </Text>
                </View>
              </View>

              {/* Section 1: Data Identitas Siswa */}
              <View style={styles.detailSectionBox}>
                <View style={styles.detailSectionHeader}>
                  <MaterialCommunityIcons
                    name="card-account-details-outline"
                    size={16}
                    color="#059669"
                  />
                  <Text style={styles.detailSectionTitle}>Data Pribadi Siswa</Text>
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>Jenis Kelamin</Text>
                    <Text style={styles.detailFieldValue}>
                      {selectedStudent?.jenis_kelamin || '-'}
                    </Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>NISN</Text>
                    <Text style={styles.detailFieldValue}>
                      {selectedStudent?.nisn || '-'}
                    </Text>
                  </View>
                  <View style={styles.detailGridItemFull}>
                    <Text style={styles.detailFieldLabel}>Tempat, Tanggal Lahir</Text>
                    <Text style={styles.detailFieldValue}>
                      {selectedStudent?.tempat_lahir || '-'}, {selectedStudent?.tanggal_lahir || '-'}
                    </Text>
                  </View>
                  <View style={styles.detailGridItemFull}>
                    <Text style={styles.detailFieldLabel}>Alamat Domisili Siswa</Text>
                    <Text style={styles.detailFieldValue}>
                      {selectedStudent?.alamat || '-'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Section 2: Data Orang Tua / Wali */}
              <View style={styles.detailSectionBox}>
                <View style={styles.detailSectionHeader}>
                  <MaterialCommunityIcons
                    name="account-child-outline"
                    size={16}
                    color="#0D9488"
                  />
                  <Text style={styles.detailSectionTitle}>Data Orang Tua & Wali</Text>
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>Nama Ayah</Text>
                    <Text style={styles.detailFieldValueBold}>
                      {selectedStudent?.orang_tua?.nama_ayah || '-'}
                    </Text>
                    {selectedStudent?.orang_tua?.pekerjaan_ayah &&
                      selectedStudent?.orang_tua?.pekerjaan_ayah !== '-' && (
                        <Text style={styles.detailFieldSub}>
                          Pekerjaan: {selectedStudent.orang_tua.pekerjaan_ayah}
                        </Text>
                      )}
                  </View>

                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>Nama Ibu</Text>
                    <Text style={styles.detailFieldValueBold}>
                      {selectedStudent?.orang_tua?.nama_ibu || '-'}
                    </Text>
                    {selectedStudent?.orang_tua?.pekerjaan_ibu &&
                      selectedStudent?.orang_tua?.pekerjaan_ibu !== '-' && (
                        <Text style={styles.detailFieldSub}>
                          Pekerjaan: {selectedStudent.orang_tua.pekerjaan_ibu}
                        </Text>
                      )}
                  </View>

                  {selectedStudent?.orang_tua?.nama_wali &&
                    selectedStudent?.orang_tua?.nama_wali !== '-' && (
                      <View style={styles.detailGridItemFull}>
                        <Text style={styles.detailFieldLabel}>Nama Wali</Text>
                        <Text style={styles.detailFieldValueBold}>
                          {selectedStudent.orang_tua.nama_wali}
                        </Text>
                        {selectedStudent?.orang_tua?.pekerjaan_wali &&
                          selectedStudent?.orang_tua?.pekerjaan_wali !== '-' && (
                            <Text style={styles.detailFieldSub}>
                              Pekerjaan: {selectedStudent.orang_tua.pekerjaan_wali}
                            </Text>
                          )}
                      </View>
                    )}

                  <View style={styles.detailGridItemFull}>
                    <Text style={styles.detailFieldLabel}>Alamat Orang Tua / Wali</Text>
                    <Text style={styles.detailFieldValue}>
                      {selectedStudent?.orang_tua?.alamat || selectedStudent?.alamat || '-'}
                    </Text>
                  </View>
                </View>

                {/* Hubungi Orang Tua Quick Action */}
                <View style={styles.contactActionContainer}>
                  <View style={styles.contactPhoneRow}>
                    <MaterialCommunityIcons name="phone-outline" size={15} color="#059669" />
                    <Text style={styles.contactPhoneText}>
                      No. HP: {selectedStudent?.orang_tua?.no_hp || '-'}
                    </Text>
                  </View>

                  {/* Tombol Utama: Chat Langsung via Aplikasi Internal */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => handleInAppChat(selectedStudent)}
                    style={styles.inAppChatBtn}
                  >
                    <LinearGradient
                      colors={['#059669', '#0D9488']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.inAppChatGradient}
                    >
                      <MaterialCommunityIcons
                        name="chat-processing-outline"
                        size={18}
                        color="#FFFFFF"
                      />
                      <Text style={styles.inAppChatBtnText}>Chat Langsung via Aplikasi</Text>
                    </LinearGradient>
                  </TouchableOpacity>

                  <View style={styles.contactBtnGroup}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleOpenWhatsApp(selectedStudent?.orang_tua?.no_hp)}
                      style={styles.waBtn}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={18} color="#FFFFFF" />
                      <Text style={styles.waBtnText}>Chat WhatsApp</Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => handleCallPhone(selectedStudent?.orang_tua?.no_hp)}
                      style={styles.callBtn}
                    >
                      <MaterialCommunityIcons name="phone" size={16} color="#2563EB" />
                      <Text style={styles.callBtnText}>Telepon</Text>
                    </TouchableOpacity>
                  </View>
                </View>
              </View>
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* DETAIL MODAL: Pegawai & Guru */}
      <Modal
        visible={!!selectedEmployee}
        animationType="fade"
        transparent
        onRequestClose={() => setSelectedEmployee(null)}
      >
        <View style={styles.detailModalBackdrop}>
          <View style={styles.detailModalCard}>
            {/* Header */}
            <LinearGradient
              colors={['#0891B2', '#0E7490', '#155E75']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.detailHeaderGradient}
            >
              <View style={styles.detailHeaderRow}>
                <View style={[styles.detailAvatarSquircle, { backgroundColor: '#ECFEFF' }]}>
                  <MaterialCommunityIcons
                    name={
                      (selectedEmployee?.jenis_kelamin || '').toLowerCase().includes('perempuan')
                        ? 'account-tie-woman'
                        : 'account-tie'
                    }
                    size={24}
                    color="#0891B2"
                  />
                </View>
                <View style={styles.detailHeaderTextCol}>
                  <Text style={styles.detailStudentName} numberOfLines={2}>
                    {selectedEmployee?.nama || selectedEmployee?.name || '-'}
                  </Text>
                  <Text style={styles.detailStudentSub} numberOfLines={1}>
                    NIY: {selectedEmployee?.niy || '-'} • {selectedEmployee?.jenis_kelamin || 'Pegawai'}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.7}
                  onPress={() => setSelectedEmployee(null)}
                  style={styles.detailCloseBtn}
                  accessibilityLabel="Tutup Rincian"
                >
                  <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
                </TouchableOpacity>
              </View>
            </LinearGradient>

            {/* Scrollable details */}
            <ScrollView
              style={styles.detailBodyScroll}
              contentContainerStyle={styles.detailBodyContent}
              showsVerticalScrollIndicator={false}
            >
              {/* Unit & Status Tags */}
              <View style={styles.detailBadgeRow}>
                <View style={styles.detailUnitBadge}>
                  <MaterialCommunityIcons name="domain" size={14} color="#0D9488" />
                  <Text style={styles.detailUnitBadgeText}>
                    {selectedEmployee?.unit || '-'}
                  </Text>
                </View>
                <View
                  style={[
                    styles.detailStatusBadge,
                    (selectedEmployee?.status || '').toLowerCase().includes('tetap')
                      ? styles.statusAktif
                      : styles.statusNonaktif,
                  ]}
                >
                  <Text
                    style={[
                      styles.detailStatusText,
                      (selectedEmployee?.status || '').toLowerCase().includes('tetap')
                        ? styles.statusAktifText
                        : styles.statusNonaktifText,
                    ]}
                  >
                    {selectedEmployee?.status || 'Aktif'}
                  </Text>
                </View>
              </View>

              {/* Jabatan Card */}
              {selectedEmployee?.jabatan && selectedEmployee.jabatan !== '-' && (
                <View style={styles.employeeDetailJabatanBox}>
                  <MaterialCommunityIcons name="briefcase-outline" size={20} color="#2563EB" />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.employeeDetailJabatanLabel}>Jabatan / Penugasan</Text>
                    <Text style={styles.employeeDetailJabatanVal}>{selectedEmployee.jabatan}</Text>
                  </View>
                </View>
              )}

              {/* Data Identitas Resmi */}
              <View style={styles.detailSectionBox}>
                <View style={styles.detailSectionHeader}>
                  <MaterialCommunityIcons
                    name="card-account-details-outline"
                    size={16}
                    color="#0891B2"
                  />
                  <Text style={styles.detailSectionTitle}>Data Pribadi Pegawai</Text>
                </View>

                <View style={styles.detailGrid}>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>NIY (Nomor Induk)</Text>
                    <Text style={styles.detailFieldValue}>{selectedEmployee?.niy || '-'}</Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>NIK (Kependudukan)</Text>
                    <Text style={styles.detailFieldValue}>{selectedEmployee?.nik || '-'}</Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>Jenis Kelamin</Text>
                    <Text style={styles.detailFieldValue}>{selectedEmployee?.jenis_kelamin || '-'}</Text>
                  </View>
                  <View style={styles.detailGridItem}>
                    <Text style={styles.detailFieldLabel}>Status Kepegawaian</Text>
                    <Text style={styles.detailFieldValue}>{selectedEmployee?.status || '-'}</Text>
                  </View>
                  <View style={styles.detailGridItemFull}>
                    <Text style={styles.detailFieldLabel}>Nomor WhatsApp / HP</Text>
                    <Text style={styles.detailFieldValueBold}>{selectedEmployee?.no_hp || '-'}</Text>
                  </View>
                  <View style={styles.detailGridItemFull}>
                    <Text style={styles.detailFieldLabel}>Email</Text>
                    <Text style={styles.detailFieldValue}>{selectedEmployee?.email || '-'}</Text>
                  </View>
                </View>
              </View>

              {/* Kontak WhatsApp & Telepon (jika ada no_hp) */}
              {selectedEmployee?.no_hp && selectedEmployee?.no_hp !== '-' && (
                <View style={[styles.contactBtnGroup, { marginTop: 10 }]}>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleOpenWhatsApp(selectedEmployee.no_hp, 'pegawai')}
                    style={styles.waBtn}
                  >
                    <MaterialCommunityIcons name="whatsapp" size={16} color="#FFFFFF" />
                    <Text style={styles.waBtnText}>WhatsApp</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => handleCallPhone(selectedEmployee.no_hp, 'pegawai')}
                    style={styles.callBtn}
                  >
                    <MaterialCommunityIcons name="phone" size={16} color="#2563EB" />
                    <Text style={styles.callBtnText}>Telepon</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tombol Akses Data Pegawai */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => {
                  setSelectedEmployee(null);
                  onClose();
                  navigation?.navigate('Data', { initialResource: 'employees' });
                }}
                style={styles.employeeDetailActionBtn}
              >
                <MaterialCommunityIcons name="badge-account-outline" size={18} color="#0891B2" />
                <Text style={styles.employeeDetailActionText}>Buka Master Data Pegawai</Text>
                <MaterialCommunityIcons name="chevron-right" size={18} color="#0891B2" />
              </TouchableOpacity>
            </ScrollView>
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#F8FAFC',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '92%',
    minHeight: '65%',
    overflow: 'hidden',
  },
  headerGradient: {
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 16,
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 12,
  },
  headerIconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
    shadowColor: '#000',
    shadowOpacity: 0.1,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 3,
  },
  headerTextCol: {
    flex: 1,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  modalSubtitle: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  summaryBadgesRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  summaryBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 10,
    gap: 4,
  },
  summaryBadgeLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.9)',
  },
  summaryBadgeVal: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    gap: 8,
  },
  tabItem: {
    flex: 1,
    paddingVertical: 8,
    alignItems: 'center',
    borderRadius: 10,
    backgroundColor: '#F1F5F9',
  },
  tabItemActive: {
    backgroundColor: '#059669',
  },
  tabItemText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#64748B',
  },
  tabItemTextActive: {
    color: '#FFFFFF',
  },

  // Dropdown Filter Bar
  totalSiswaFilterContainer: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  dropdownRow: {
    flexDirection: 'row',
    gap: 10,
  },
  dropdownCol: {
    flex: 1,
  },
  dropdownLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
    marginBottom: 4,
  },
  dropdownTrigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 12,
    paddingHorizontal: 10,
    height: 38,
    gap: 6,
  },
  dropdownTriggerActive: {
    borderColor: '#059669',
    backgroundColor: '#ECFDF5',
  },
  dropdownTriggerText: {
    flex: 1,
    fontSize: 12,
    color: '#334155',
    fontWeight: '600',
  },
  dropdownTriggerTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  activeFilterNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  activeFilterNoticeText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '600',
    color: '#15803D',
    marginRight: 6,
  },
  resetFilterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  resetFilterBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  searchBarWrapInner: {
    marginTop: 2,
  },
  searchBarWrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingHorizontal: 12,
    height: 38,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    paddingVertical: 0,
  },

  // Picker Modal Styles
  pickerBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  pickerModalContent: {
    width: '100%',
    maxHeight: '75%',
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.2,
    shadowRadius: 12,
    elevation: 8,
  },
  pickerModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    backgroundColor: '#F8FAFC',
  },
  pickerHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    flex: 1,
  },
  pickerModalTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
  },
  pickerModalSub: {
    fontSize: 11,
    fontWeight: '600',
    color: '#059669',
    marginTop: 1,
  },
  pickerSearchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: '#F1F5F9',
    marginHorizontal: 14,
    marginTop: 10,
    borderRadius: 10,
  },
  pickerSearchInput: {
    flex: 1,
    fontSize: 12,
    color: '#0F172A',
    paddingVertical: 0,
  },
  pickerScrollList: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    maxHeight: 340,
  },
  pickerItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingVertical: 12,
    paddingHorizontal: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  pickerItemActive: {
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
  },
  pickerItemText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#1E293B',
  },
  pickerItemTextActive: {
    fontWeight: '800',
    color: '#059669',
  },
  pickerItemSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },

  loadingWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 10,
  },
  errorWrap: {
    paddingVertical: 36,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  errorText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#EF4444',
    textAlign: 'center',
    marginTop: 8,
  },
  retryBtn: {
    marginTop: 12,
    backgroundColor: '#059669',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 10,
  },
  retryBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  emptyWrap: {
    paddingVertical: 48,
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  emptyText: {
    fontSize: 13,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    fontWeight: '600',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 12,
  },
  itemCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 3,
    elevation: 1.5,
  },
  studentCard: {
    borderColor: '#E2E8F0',
    gap: 10,
  },
  studentTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  studentAvatarBox: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  studentNameCol: {
    flex: 1,
  },
  studentNameText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  studentSubText: {
    fontSize: 11,
    fontWeight: '500',
    color: '#64748B',
    marginTop: 2,
  },
  studentStatusPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusAktifPill: {
    backgroundColor: '#DEF7EC',
  },
  statusNonaktifPill: {
    backgroundColor: '#FEE2E2',
  },
  studentStatusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusAktifPillText: {
    color: '#059669',
  },
  statusNonaktifPillText: {
    color: '#DC2626',
  },
  studentBadgeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    alignItems: 'center',
  },
  studentKelasBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#CCFBF1',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  studentKelasBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
  },
  studentMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 8,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  studentMetaBadgeLabel: {
    fontSize: 10.5,
    fontWeight: '500',
    color: '#64748B',
  },
  studentMetaBadgeVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
  },
  studentParentCardBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  parentCardMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    flex: 1,
  },
  parentCardNameText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  parentCardPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  parentCardPhoneText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  attendanceStatusCol: {
    alignItems: 'flex-end',
    justifyContent: 'center',
    gap: 4,
  },
  jamMasukPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  jamMasukPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#065F46',
  },
  jamMasukIndigoPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    paddingHorizontal: 6,
    paddingVertical: 2.5,
    borderRadius: 8,
  },
  jamMasukIndigoPillText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#4338CA',
  },
  parentQuickActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  quickWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#059669',
    paddingHorizontal: 8,
    paddingVertical: 5,
    borderRadius: 8,
  },
  quickWaBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  quickCallBtn: {
    backgroundColor: '#0D9488',
    width: 28,
    height: 28,
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
  },
  itemMainRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarBox: {
    width: 38,
    height: 38,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  itemInfoCol: {
    flex: 1,
  },
  itemName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  itemMetaRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
    marginTop: 3,
  },
  itemBadge: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemBadgeKelas: {
    fontSize: 10.5,
    color: '#0D9488',
    fontWeight: '700',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemBadgeJabatan: {
    fontSize: 10.5,
    color: '#2563EB',
    fontWeight: '700',
    backgroundColor: '#DBEAFE',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemBadgeStatus: {
    fontSize: 10.5,
    color: '#059669',
    fontWeight: '700',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemBadgeJam: {
    fontSize: 10.5,
    color: '#6366F1',
    fontWeight: '700',
    backgroundColor: '#EEF2FF',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  itemBadgeUnit: {
    fontSize: 10.5,
    color: '#0D9488',
    fontWeight: '700',
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  parentPreviewBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 7,
    paddingVertical: 2.5,
    borderRadius: 6,
    marginTop: 4,
    alignSelf: 'flex-start',
    borderWidth: 1,
    borderColor: '#DCFCE7',
  },
  parentPreviewText: {
    fontSize: 10.5,
    color: '#047857',
    fontWeight: '600',
  },
  incompleteBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FEF3C7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    marginTop: 5,
    alignSelf: 'flex-start',
  },
  incompleteText: {
    fontSize: 10.5,
    color: '#92400E',
    fontWeight: '700',
  },
  actionBtn: {
    backgroundColor: '#059669',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionBtnText: {
    color: '#FFFFFF',
    fontSize: 11,
    fontWeight: '700',
  },
  footerBar: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  footerCloseBtn: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 32,
    paddingVertical: 10,
    borderRadius: 12,
  },
  footerCloseText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#475569',
  },

  // Detail Sub-Modal Styles
  detailModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  detailModalCard: {
    width: '100%',
    maxHeight: '88%',
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.25,
    shadowRadius: 16,
    elevation: 10,
  },
  detailHeaderGradient: {
    paddingHorizontal: 18,
    paddingTop: 16,
    paddingBottom: 16,
  },
  detailHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailAvatarSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  detailHeaderTextCol: {
    flex: 1,
  },
  detailStudentName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.2,
  },
  detailStudentSub: {
    fontSize: 12,
    color: 'rgba(255, 255, 255, 0.9)',
    marginTop: 2,
    fontWeight: '600',
  },
  detailCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailBodyScroll: {
    backgroundColor: '#F8FAFC',
  },
  detailBodyContent: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 28,
    gap: 14,
  },
  detailBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  detailUnitBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  detailUnitBadgeText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0F766E',
  },
  detailStatusBadge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 10,
  },
  statusAktif: {
    backgroundColor: '#DEF7EC',
  },
  statusNonaktif: {
    backgroundColor: '#FEE2E2',
  },
  detailStatusText: {
    fontSize: 11.5,
    fontWeight: '700',
  },
  statusAktifText: {
    color: '#059669',
  },
  statusNonaktifText: {
    color: '#DC2626',
  },
  detailSectionBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOpacity: 0.02,
    shadowOffset: { width: 0, height: 1 },
    shadowRadius: 2,
    elevation: 1,
  },
  detailSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingBottom: 10,
    marginBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  detailSectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 10,
  },
  detailGridItem: {
    width: '50%',
    paddingRight: 8,
  },
  detailGridItemFull: {
    width: '100%',
    marginTop: 2,
  },
  detailFieldLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginBottom: 2,
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  detailFieldValue: {
    fontSize: 12.5,
    fontWeight: '600',
    color: '#1E293B',
  },
  detailFieldValueBold: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  detailFieldSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
    fontWeight: '500',
  },
  contactActionContainer: {
    marginTop: 14,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
  },
  contactPhoneRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  contactPhoneText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#059669',
  },
  contactBtnGroup: {
    flexDirection: 'row',
    gap: 10,
  },
  inAppChatBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginBottom: 10,
    shadowColor: '#059669',
    shadowOpacity: 0.25,
    shadowOffset: { width: 0, height: 3 },
    shadowRadius: 6,
    elevation: 3,
  },
  inAppChatGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 11,
    paddingHorizontal: 16,
    gap: 8,
  },
  inAppChatBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  waBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#059669',
    paddingVertical: 10,
    borderRadius: 12,
    gap: 6,
    shadowColor: '#059669',
    shadowOpacity: 0.2,
    shadowOffset: { width: 0, height: 2 },
    shadowRadius: 4,
    elevation: 2,
  },
  waBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  callBtn: {
    paddingHorizontal: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#EFF6FF',
    borderRadius: 12,
    gap: 5,
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  callBtnText: {
    color: '#2563EB',
    fontSize: 12,
    fontWeight: '700',
  },
  detailFooterBar: {
    padding: 14,
    backgroundColor: '#FFFFFF',
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    alignItems: 'center',
  },
  detailDoneBtn: {
    width: '100%',
    backgroundColor: '#F1F5F9',
    paddingVertical: 11,
    borderRadius: 12,
    alignItems: 'center',
  },
  detailDoneBtnText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#334155',
  },

  // Dedicated styles for Employee & Guru Cards
  employeeCard: {
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
  },
  employeeTopRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
  },
  employeeAvatarBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
  },
  employeeNameCol: {
    flex: 1,
    paddingRight: 4,
  },
  employeeNameText: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 20,
    letterSpacing: -0.2,
  },
  employeeSubRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 5,
    marginTop: 3,
  },
  employeeSubText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#64748B',
  },
  employeeSubDot: {
    fontSize: 12,
    color: '#CBD5E1',
    fontWeight: '700',
  },
  employeeSubUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  employeeStatusPill: {
    paddingHorizontal: 9,
    paddingVertical: 3.5,
    borderRadius: 8,
  },
  statusTetapPill: {
    backgroundColor: '#DEF7EC',
  },
  statusHonorerPill: {
    backgroundColor: '#EFF6FF',
  },
  employeeStatusPillText: {
    fontSize: 10.5,
    fontWeight: '700',
  },
  statusTetapPillText: {
    color: '#059669',
  },
  statusHonorerPillText: {
    color: '#2563EB',
  },
  employeeJabatanBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  employeeJabatanIconWrap: {
    width: 22,
    height: 22,
    borderRadius: 6,
    backgroundColor: '#DBEAFE',
    alignItems: 'center',
    justifyContent: 'center',
  },
  employeeJabatanText: {
    flex: 1,
    fontSize: 12,
    fontWeight: '700',
    color: '#0369A1',
    lineHeight: 16,
  },
  employeeMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 8,
  },
  employeeMetaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  employeeMetaLabel: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  employeeMetaVal: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
  },
  employeeMetaMissing: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  employeeMetaMissingText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#D97706',
  },
  employeeIncompleteRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: '#FFFBEB',
    borderWidth: 1,
    borderColor: '#FDE68A',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  employeeIncompleteBox: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  employeeIncompleteText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#B45309',
    flex: 1,
  },
  employeeDetailJabatanBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    borderRadius: 14,
    padding: 12,
    marginBottom: 16,
  },
  employeeDetailJabatanLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#3B82F6',
  },
  employeeDetailJabatanVal: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#1D4ED8',
    marginTop: 2,
  },
  employeeDetailActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFEFF',
    borderWidth: 1.5,
    borderColor: '#A5F3FC',
    borderRadius: 14,
    paddingVertical: 13,
    marginTop: 18,
  },
  employeeDetailActionText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0891B2',
  },
});
