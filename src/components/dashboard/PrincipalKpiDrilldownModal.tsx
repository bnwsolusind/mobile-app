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
import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';
import { isEmployeeGuru } from '../../utils/employeeUtils';

export type PrincipalKpiType =
  | 'total_siswa'
  | 'total_guru'
  | 'total_pegawai'
  | 'total_tendik'
  | 'total_kelas'
  | 'total_rombel'
  | 'setoran_tahfizh';

interface PrincipalKpiDrilldownModalProps {
  type: PrincipalKpiType | null;
  isOpen: boolean;
  onClose: () => void;
  dashboardData?: Record<string, any>;
  unitId?: string;
}

export default function PrincipalKpiDrilldownModal({
  type,
  isOpen,
  onClose,
  dashboardData,
  unitId,
}: PrincipalKpiDrilldownModalProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [displayLimit, setDisplayLimit] = useState(25);
  const [remoteItems, setRemoteItems] = useState<any[] | null>(null);
  const [loadingRemote, setLoadingRemote] = useState<boolean>(false);

  const resolvedUnitId = useMemo(() => {
    if (unitId) return unitId;
    const d = dashboardData?.data || dashboardData || {};
    return d?.school_info?.id || d?.schoolInfo?.id || d?.context?.unit?.id || d?.context?.unit_id || undefined;
  }, [unitId, dashboardData]);

  const normalizedType = useMemo<'total_siswa' | 'total_guru' | 'total_pegawai' | 'total_kelas' | 'setoran_tahfizh' | null>(() => {
    if (!type) return null;
    if (type === 'total_tendik') return 'total_pegawai';
    if (type === 'total_rombel') return 'total_kelas';
    if (type === 'setoran_tahfizh') return 'setoran_tahfizh';
    return type as 'total_siswa' | 'total_guru' | 'total_pegawai' | 'total_kelas' | 'setoran_tahfizh';
  }, [type]);

  useEffect(() => {
    setDisplayLimit(25);
  }, [searchQuery, type, isOpen]);

  // Dynamic Remote Fetching (Selaras 100% dengan Web Dashboard)
  useEffect(() => {
    if (!isOpen || !normalizedType) {
      setRemoteItems(null);
      setLoadingRemote(false);
      return;
    }

    let isMounted = true;
    setLoadingRemote(true);

    const fetchDrilldown = async () => {
      try {
        if (normalizedType === 'total_guru') {
          // Web: GET /api/v1/foundation/teachers (unit_id: resolvedUnitId, per_page: 500)
          let list: any[] = [];
          try {
            const res = await mobileApiService.getFoundationTeachers({
              unit_id: resolvedUnitId,
              per_page: 500,
            });
            const raw = unwrapApiData(res);
            list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          } catch {
            const res = await mobileApiService.getEmployees({
              unit_id: resolvedUnitId,
              per_page: 500,
              exclude_restricted_roles: 1,
            });
            const raw = unwrapApiData(res);
            const rawList = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
            list = rawList.filter((emp: any) => isEmployeeGuru(emp));
          }

          const mapped = list.map((item: any) => ({
            id: item.id,
            name: item.full_name || item.nama_lengkap || item.name || item.nama || item.employee?.nama_lengkap || 'Guru Pengajar',
            id_num: item.employee_number || item.nip || item.employee?.niy || item.employee?.nip || item.nik || item.nuptk || item.nomor_induk || '-',
            status: item.status || (item.is_active !== false ? 'Aktif' : 'Nonaktif'),
            extra:
              item.position ||
              item.employee?.position?.name ||
              item.subject ||
              item.mata_pelajaran ||
              item.position?.name ||
              'Guru Pengajar',
            isGuru: true,
          }));

          if (!isMounted) return;
          setRemoteItems(mapped);
        } else if (normalizedType === 'total_pegawai') {
          // Web: GET /api/v1/foundation/employees (role_type: 'tendik' jika total_tendik, unit_id: resolvedUnitId)
          let list: any[] = [];
          try {
            const res = await mobileApiService.getFoundationEmployees({
              unit_id: resolvedUnitId,
              role_type: type === 'total_tendik' ? 'tendik' : undefined,
              per_page: 500,
            });
            const raw = unwrapApiData(res);
            list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          } catch {
            const res = await mobileApiService.getEmployees({
              unit_id: resolvedUnitId,
              per_page: 500,
              exclude_restricted_roles: 1,
            });
            const raw = unwrapApiData(res);
            list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          }

          const mapped = list
            .map((emp: any) => {
              const isGuru = isEmployeeGuru(emp);
              return {
                id: emp.id,
                name: emp.nama_lengkap || emp.name || emp.nama || 'Tanpa Nama',
                id_num: emp.nip || emp.nik || emp.nuptk || emp.nomor_induk || emp.niy || '-',
                status: emp.status || (emp.is_active !== false ? 'Aktif' : 'Nonaktif'),
                extra:
                  emp.position?.name ||
                  emp.position?.nama ||
                  emp.jabatan?.nama ||
                  emp.jabatan ||
                  emp.posisi ||
                  (isGuru ? 'Guru Pengajar' : 'Tenaga Kependidikan'),
                isGuru,
              };
            })
            .filter((item: any) => (type === 'total_tendik' ? !item.isGuru : true));

          if (!isMounted) return;
          setRemoteItems(mapped);
        } else if (normalizedType === 'total_siswa') {
          // Web: GET /api/v1/foundation/students (unit_id: resolvedUnitId, per_page: 500)
          let list: any[] = [];
          try {
            const res = await mobileApiService.getFoundationStudents({
              unit_id: resolvedUnitId,
              per_page: 500,
            });
            const raw = unwrapApiData(res);
            list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          } catch {
            const res = await mobileApiService.getStudents({
              unit_id: resolvedUnitId,
              per_page: 500,
            });
            const raw = unwrapApiData(res);
            list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          }

          const mapped = list.map((st: any) => ({
            id: st.id,
            name: st.nama_lengkap || st.name || st.nama || 'Siswa',
            id_num: st.nisn || st.nis || '-',
            status: st.status || (st.is_active !== false ? 'Aktif' : 'Nonaktif'),
            extra:
              st.kelas?.nama_kelas ||
              st.kelas?.nama ||
              st.rombel?.nama ||
              st.rombel ||
              (st.tingkat ? `Kelas ${st.tingkat}` : '-'),
          }));

          if (!isMounted) return;
          setRemoteItems(mapped);
        } else if (normalizedType === 'total_kelas') {
          // Web: GET /api/v1/foundation/classes (unit_id: resolvedUnitId, per_page: 500)
          let list: any[] = [];
          try {
            const res = await mobileApiService.getFoundationClasses({
              unit_id: resolvedUnitId,
              per_page: 500,
            });
            const raw = unwrapApiData(res);
            list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          } catch {
            const res = await mobileApiService.getClasses({
              unit_id: resolvedUnitId,
              per_page: 500,
            });
            const raw = unwrapApiData(res);
            list = Array.isArray(raw) ? raw : Array.isArray(raw?.data) ? raw.data : [];
          }

          const mapped = list.map((cls: any) => ({
            id: cls.id,
            name: cls.nama_kelas || cls.nama || cls.name || 'Kelas',
            id_num: cls.tingkat ? `Tingkat ${cls.tingkat}` : '-',
            status: 'Aktif',
            extra:
              cls.wali_kelas?.nama || cls.wali_kelas?.name
                ? `Wali: ${cls.wali_kelas?.nama || cls.wali_kelas?.name}`
                : cls.kapasitas
                ? `Kapasitas: ${cls.kapasitas}`
                : '-',
          }));

          if (!isMounted) return;
          setRemoteItems(mapped);
        } else if (normalizedType === 'setoran_tahfizh') {
          // Web: GET /api/teacher/tahfizh (per_page: 200) atau GET /api/tahfizh/report
          const res = await mobileApiService.getTeacherTahfizh({
            unit_id: resolvedUnitId,
            per_page: 200,
          });
          const raw = unwrapApiData(res);
          const list = Array.isArray(raw)
            ? raw
            : Array.isArray(raw?.data)
            ? raw.data
            : [];

          const mapped = list.map((lg: any) => ({
            id: lg.id,
            name: lg.student?.nama_lengkap || lg.student?.name || lg.nama_santri || 'Santri',
            id_num: lg.student?.nis || lg.student?.nisn || '-',
            status: lg.status === 'verified' || lg.status === 'Disetujui' ? 'Terverifikasi' : 'Setoran Baru',
            extra: `${lg.hafalan_surah_name || lg.surah || 'Al-Qur’an'} (Ayat ${lg.hafalan_ayah_start || lg.ayat_start || 1}–${lg.hafalan_ayah_end || lg.ayat_end || 1}) • ${lg.kelancaran || 'Lancar'} • ${lg.class_model?.nama_kelas || lg.kelas?.nama_kelas || lg.rombel || 'Halaqah'}`,
          }));

          if (!isMounted) return;
          setRemoteItems(mapped);
        }
      } catch (err) {
        console.warn('Gagal memuat dynamic drilldown data:', err);
      } finally {
        if (isMounted) setLoadingRemote(false);
      }
    };

    fetchDrilldown();

    return () => {
      isMounted = false;
    };
  }, [isOpen, normalizedType, resolvedUnitId, type]);

  if (!normalizedType || !isOpen) return null;

  const config = {
    total_siswa: {
      title: 'Data Siswa Aktif',
      subtitle: 'Daftar seluruh peserta didik terdaftar aktif di unit sekolah',
      icon: 'school',
      gradient: ['#047857', '#059669', '#10B981'] as [string, string, string],
      badgeBg: '#DEF7EC',
      badgeColor: '#059669',
      searchPlaceholder: 'Cari nama siswa, NISN, atau kelas...',
    },
    total_guru: {
      title: 'Data Guru Pengajar',
      subtitle: 'Tenaga pendidik aktif pengampu mata pelajaran',
      icon: 'account-tie',
      gradient: ['#1D4ED8', '#2563EB', '#3B82F6'] as [string, string, string],
      badgeBg: '#EFF6FF',
      badgeColor: '#2563EB',
      searchPlaceholder: 'Cari nama guru, NIP, atau mata pelajaran...',
    },
    total_pegawai: {
      title: 'Data Tenaga Kependidikan (Tendik)',
      subtitle: 'Daftar staf administrasi, operasional, dan teknis unit',
      icon: 'account-check',
      gradient: ['#6D28D9', '#7C3AED', '#8B5CF6'] as [string, string, string],
      badgeBg: '#F5F3FF',
      badgeColor: '#7C3AED',
      searchPlaceholder: 'Cari nama staf, jabatan, atau divisi...',
    },
    total_kelas: {
      title: 'Data Rombongan Belajar (Rombel)',
      subtitle: 'Struktur rombel kelas aktif dan pembagian wali kelas',
      icon: 'door-open',
      gradient: ['#B45309', '#D97706', '#F59E0B'] as [string, string, string],
      badgeBg: '#FEF3C7',
      badgeColor: '#D97706',
      searchPlaceholder: 'Cari nama rombel, tingkat, atau wali kelas...',
    },
    setoran_tahfizh: {
      title: 'Monitoring Setoran Tahfizh Unit',
      subtitle: 'Rekapitulasi setoran hafalan santri dalam unit sekolah',
      icon: 'book-open-page-variant',
      gradient: ['#065F46', '#059669', '#10B981'] as [string, string, string],
      badgeBg: '#DEF7EC',
      badgeColor: '#059669',
      searchPlaceholder: 'Cari nama santri, surah, atau rombel...',
    },
  }[normalizedType];

  // Resolve Raw Items: Remote dataset first, fallback to initial dashboard context
  const rawItems = useMemo(() => {
    if (remoteItems !== null) {
      return remoteItems;
    }

    const d = dashboardData?.data || dashboardData || {};

    if (normalizedType === 'setoran_tahfizh') {
      const list = d.tables?.recent_logs || d.tahfizh_logs || d.recent_logs;
      if (Array.isArray(list) && list.length > 0) return list;
      return [];
    }

    if (normalizedType === 'total_guru') {
      const list = d.tables?.total_guru || d.teachers_list || d.guru_list;
      if (Array.isArray(list) && list.length > 0) return list;
      return [];
    }

    if (normalizedType === 'total_pegawai') {
      const list = type === 'total_tendik'
        ? (d.tables?.total_tendik || d.tendik_list)
        : (d.tables?.total_pegawai || d.staff_list || d.pegawai_list);
      if (Array.isArray(list) && list.length > 0) return list;
      return [];
    }

    if (normalizedType === 'total_siswa') {
      const list = d.tables?.total_siswa || d.students_list || d.siswa_list;
      return Array.isArray(list) ? list : [];
    }

    // total_kelas / rombel
    const list = d.tables?.total_kelas || d.rombel_list || d.kelas_list;
    return Array.isArray(list) ? list : [];
  }, [normalizedType, dashboardData, remoteItems, type]);

  const filteredItems = useMemo(() => {
    if (!searchQuery.trim()) return rawItems;
    const q = searchQuery.toLowerCase();
    return rawItems.filter((it: any) =>
      (it.name || '').toLowerCase().includes(q) ||
      (it.id_num || '').toLowerCase().includes(q) ||
      (it.extra || '').toLowerCase().includes(q)
    );
  }, [rawItems, searchQuery]);

  const displayedItems = useMemo(() => {
    return filteredItems.slice(0, displayLimit);
  }, [filteredItems, displayLimit]);

  return (
    <Modal visible={isOpen} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Header */}
          <LinearGradient
            colors={config.gradient}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 1 }}
            style={styles.sheetHeader}
          >
            <View style={styles.headerLeft}>
              <View style={styles.headerIconWrap}>
                <MaterialCommunityIcons name={config.icon as any} size={22} color={config.badgeColor} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={styles.headerTitle} numberOfLines={1}>
                  {config.title}
                </Text>
                <Text style={styles.headerSub} numberOfLines={1}>
                  {config.subtitle}
                </Text>
              </View>
            </View>

            <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </LinearGradient>

          {/* Search Box */}
          <View style={styles.searchBarWrap}>
            <View style={styles.searchInputBox}>
              <MaterialCommunityIcons name="magnify" size={18} color="#94A3B8" />
              <TextInput
                style={styles.searchInput}
                placeholder={config.searchPlaceholder}
                placeholderTextColor="#94A3B8"
                value={searchQuery}
                onChangeText={setSearchQuery}
              />
              {searchQuery ? (
                <TouchableOpacity onPress={() => setSearchQuery('')}>
                  <MaterialCommunityIcons name="close-circle" size={16} color="#94A3B8" />
                </TouchableOpacity>
              ) : null}
            </View>
          </View>

          {/* List Content */}
          <ScrollView style={styles.listWrap} contentContainerStyle={styles.listContent}>
            <View style={styles.metaRow}>
              <Text style={styles.metaCount}>
                Menampilkan <Text style={{ fontWeight: '800', color: '#0F172A' }}>{displayedItems.length}</Text> dari <Text style={{ fontWeight: '800', color: '#0F172A' }}>{filteredItems.length}</Text> data
              </Text>
              {loadingRemote && (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <ActivityIndicator size="small" color={config.badgeColor} />
                  <Text style={{ fontSize: 11, fontWeight: '600', color: config.badgeColor }}>Sinkronisasi...</Text>
                </View>
              )}
            </View>

            {displayedItems.map((item: any, idx: number) => (
              <View key={item.id || idx} style={styles.cardItem}>
                <View style={[styles.avatarBox, { backgroundColor: config.badgeBg }]}>
                  <Text style={[styles.avatarText, { color: config.badgeColor }]}>
                    {(item.name || 'U').substring(0, 2).toUpperCase()}
                  </Text>
                </View>

                <View style={styles.cardInfo}>
                  <View style={styles.cardTopRow}>
                    <Text style={styles.cardName} numberOfLines={1}>
                      {item.name}
                    </Text>
                    <View style={[styles.statusBadge, { backgroundColor: config.badgeBg }]}>
                      <Text style={[styles.statusText, { color: config.badgeColor }]}>
                        {item.status || 'Aktif'}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.cardIdNum}>{item.id_num}</Text>
                  <Text style={styles.cardExtra}>{item.extra}</Text>
                </View>
              </View>
            ))}

            {filteredItems.length > displayLimit && (
              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setDisplayLimit((prev) => prev + 25)}
                style={[styles.loadMoreBtn, { borderColor: config.badgeBg, backgroundColor: config.badgeBg }]}
              >
                <MaterialCommunityIcons name="chevron-down" size={16} color={config.badgeColor} />
                <Text style={[styles.loadMoreBtnText, { color: config.badgeColor }]}>
                  Tampilkan Lebih Banyak ({filteredItems.length - displayLimit} data tersisa)
                </Text>
              </TouchableOpacity>
            )}

            {filteredItems.length === 0 && (
              <View style={styles.emptyWrap}>
                <MaterialCommunityIcons name="text-box-search-outline" size={40} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Data Tidak Ditemukan</Text>
                <Text style={styles.emptySub}>
                  {searchQuery.trim()
                    ? `Tidak ada data yang cocok dengan kata kunci "${searchQuery}"`
                    : `Belum ada catatan data riil untuk kriteria ini.`}
                </Text>
              </View>
            )}
          </ScrollView>

          {/* Footer */}
          <View style={styles.footerWrap}>
            <TouchableOpacity activeOpacity={0.8} onPress={onClose} style={styles.closeFullBtn}>
              <Text style={styles.closeFullBtnText}>Tutup Window</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
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
    maxHeight: '85%',
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
  listWrap: {
    maxHeight: 380,
    paddingHorizontal: 16,
  },
  listContent: {
    paddingVertical: 12,
    gap: 10,
  },
  metaRow: {
    marginBottom: 4,
  },
  metaCount: {
    fontSize: 11.5,
    color: '#64748B',
  },
  cardItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: 16,
    padding: 12,
  },
  avatarBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  avatarText: {
    fontSize: 14,
    fontWeight: '800',
  },
  cardInfo: {
    flex: 1,
  },
  cardTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  cardName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 6,
  },
  statusText: {
    fontSize: 10,
    fontWeight: '700',
  },
  cardIdNum: {
    fontSize: 11,
    fontFamily: 'monospace',
    color: '#64748B',
    marginTop: 1,
  },
  cardExtra: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
    marginTop: 2,
  },
  emptyWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
    gap: 6,
  },
  emptyTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#64748B',
    marginTop: 4,
  },
  emptySub: {
    fontSize: 11,
    color: '#94A3B8',
    textAlign: 'center',
  },
  footerWrap: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  closeFullBtn: {
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    paddingVertical: 11,
    alignItems: 'center',
  },
  closeFullBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  loadMoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 12,
    marginVertical: 10,
    borderRadius: 14,
    borderWidth: 1,
  },
  loadMoreBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
});
