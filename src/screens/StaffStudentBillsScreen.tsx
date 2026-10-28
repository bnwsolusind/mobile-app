import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Clipboard,
  Dimensions,
  Image,
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAuthStore } from '../stores/authStore';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { getProfileImageUrl } from '../utils/profile';

const PARENT_HOME_BG = require('../../assets/parent_home_bg.jpg');

const formatRupiah = (val: any) =>
  new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(
    Number(val || 0)
  );

const formatDate = (value?: string) => {
  if (!value) return '-';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? '-'
    : new Intl.DateTimeFormat('id-ID', { day: '2-digit', month: 'short', year: 'numeric' }).format(date);
};

export default function StaffStudentBillsScreen({ navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 14);

  const user = useAuthStore((state) => state.user);
  const userUnitId = user?.unit_id || user?.education_unit_id || (user as any)?.employee?.unit_id || '';

  // Data states
  const [bills, setBills] = useState<any[]>([]);
  const [stats, setStats] = useState<{
    total_bills: number;
    total_nominal: number;
    paid_nominal: number;
    unpaid_nominal: number;
    overdue_count: number;
    collection_rate: number;
  }>({
    total_bills: 0,
    total_nominal: 0,
    paid_nominal: 0,
    unpaid_nominal: 0,
    overdue_count: 0,
    collection_rate: 0,
  });

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [statusFilter, setStatusFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [search, setSearch] = useState<string>('');
  const [query, setQuery] = useState<string>('');
  const [page, setPage] = useState<number>(1);
  const [meta, setMeta] = useState<any>({ current_page: 1, last_page: 1, total: 0 });

  // Detail Modal State
  const [selectedBill, setSelectedBill] = useState<any | null>(null);
  const [copiedVa, setCopiedVa] = useState<boolean>(false);

  // Load KPI Stats
  const loadStats = useCallback(async () => {
    try {
      const params: Record<string, any> = {};
      if (userUnitId) params.unit_id = userUnitId;
      const res = await mobileApiService.getFinanceStats(params);
      const data = unwrapApiData<any>(res);
      if (data) {
        setStats({
          total_bills: Number(data.total_bills || 0),
          total_nominal: Number(data.total_nominal || 0),
          paid_nominal: Number(data.paid_nominal || 0),
          unpaid_nominal: Number(data.unpaid_nominal || 0),
          overdue_count: Number(data.overdue_count || 0),
          collection_rate: Number(data.collection_rate || 0),
        });
      }
    } catch {
      // Offline fallback: keep existing
    }
  }, [userUnitId]);

  // Load Bills List
  const loadBills = useCallback(
    async (currentPage = 1) => {
      try {
        const params: Record<string, any> = {
          page: currentPage,
          per_page: 20,
        };
        if (userUnitId) params.unit_id = userUnitId;
        if (statusFilter !== 'all') params.status = statusFilter;
        if (query.trim()) params.search = query.trim();

        const res = await mobileApiService.getFinanceBills(params);
        const payload = unwrapApiData<any>(res);
        const rows = Array.isArray(payload?.data)
          ? payload.data
          : Array.isArray(payload)
          ? payload
          : [];

        setBills(rows);
        setMeta({
          current_page: payload?.current_page || 1,
          last_page: payload?.last_page || 1,
          total: payload?.total ?? rows.length,
        });
      } catch {
        setBills([]);
      }
    },
    [userUnitId, statusFilter, query]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    await Promise.all([loadStats(), loadBills(1)]);
    setLoading(false);
  }, [loadStats, loadBills]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadStats(), loadBills(1)]);
    setRefreshing(false);
  }, [loadStats, loadBills]);

  const handleCopyVa = (vaNumber: string) => {
    Clipboard.setString(vaNumber);
    setCopiedVa(true);
    setTimeout(() => setCopiedVa(false), 2000);
  };

  return (
    <View style={s.container}>
      {/* ── Background Image & Gradient Identik Data Siswa (Layer Belakang) ── */}
      <View style={s.bgBackdrop} pointerEvents="none">
        <Image source={PARENT_HOME_BG} style={s.bgImage} resizeMode="cover" />
        <LinearGradient
          colors={[
            'rgba(24, 161, 101, 0.18)',
            'rgba(24, 161, 101, 0.40)',
            'rgba(240, 253, 244, 0.95)',
            '#F0FDF4',
          ]}
          locations={[0, 0.28, 0.65, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HERO HEADER (FLOATING CLEAN DI ATAS BACKGROUND MASJID) ── */}
      <View style={[s.topHeader, { paddingTop: topInset + 6 }]}>
        <View style={s.topHeaderRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => navigation?.goBack?.() || navigation?.navigate('Beranda')}
            style={s.headerSquircleBtn}
            accessibilityLabel="Kembali"
          >
            <MaterialCommunityIcons name="arrow-left" size={20} color="#064E3B" />
          </TouchableOpacity>
          <View style={s.headerTitleCol}>
            <View style={s.roleTag}>
              <MaterialCommunityIcons name="cash-register" size={12} color="#047857" style={{ marginRight: 4 }} />
              <Text style={s.roleTagText}>REKAP KEUANGAN SISWA</Text>
            </View>
            <Text style={s.headerTitle} numberOfLines={1}>
              Tagihan & SPP Siswa
            </Text>
            <Text style={s.headerSubtitle} numberOfLines={1}>
              Monitoring Keuangan Siswa Unit Sekolah
            </Text>
          </View>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={onRefresh}
            style={s.headerSquircleBtn}
            accessibilityLabel="Muat Ulang"
          >
            <MaterialCommunityIcons name="refresh" size={20} color="#047857" />
          </TouchableOpacity>
        </View>

        {/* ── 3 KPI Cards Ringkasan Keuangan Siswa ── */}
        <View style={s.kpiRow}>
          {/* Card 1: Total Tagihan */}
          <View style={[s.kpiBox, { borderColor: '#A7F3D0' }]}>
            <LinearGradient colors={['#FFFFFF', '#ECFDF5']} style={s.kpiGradient}>
              <View style={s.kpiIconSquare}>
                <MaterialCommunityIcons name="cash-multiple" size={13} color="#FFFFFF" />
              </View>
              <Text style={[s.kpiVal, { color: '#047857' }]}>{formatRupiah(stats.total_nominal)}</Text>
              <Text style={s.kpiLbl}>Total Tagihan</Text>
              <Text style={s.kpiSub}>{stats.total_bills} baris data</Text>
            </LinearGradient>
          </View>

          {/* Card 2: Belum Bayar */}
          <View style={[s.kpiBox, { borderColor: '#FECDD3' }]}>
            <LinearGradient colors={['#FFFFFF', '#FFF1F2']} style={s.kpiGradient}>
              <View style={[s.kpiIconSquare, { backgroundColor: '#E11D48' }]}>
                <MaterialCommunityIcons name="clock-alert-outline" size={13} color="#FFFFFF" />
              </View>
              <Text style={[s.kpiVal, { color: '#BE123C' }]}>{formatRupiah(stats.unpaid_nominal)}</Text>
              <Text style={[s.kpiLbl, { color: '#9F1239' }]}>Belum Lunas</Text>
              <Text style={s.kpiSub}>Menunggu bayar</Text>
            </LinearGradient>
          </View>

          {/* Card 3: Lunas */}
          <View style={[s.kpiBox, { borderColor: '#BAE6FD' }]}>
            <LinearGradient colors={['#FFFFFF', '#F0F9FF']} style={s.kpiGradient}>
              <View style={[s.kpiIconSquare, { backgroundColor: '#0284C7' }]}>
                <MaterialCommunityIcons name="check-decagram" size={13} color="#FFFFFF" />
              </View>
              <Text style={[s.kpiVal, { color: '#0369A1' }]}>{formatRupiah(stats.paid_nominal)}</Text>
              <Text style={[s.kpiLbl, { color: '#075985' }]}>Terbayar</Text>
              <Text style={s.kpiSub}>Kolektibilitas {stats.collection_rate}%</Text>
            </LinearGradient>
          </View>
        </View>

        {/* ── Search Bar Input ── */}
        <View style={s.searchBar}>
          <MaterialCommunityIcons name="magnify" size={18} color="#059669" />
          <TextInput
            style={s.searchInput}
            placeholder="Cari santri, NIS, atau jenis tagihan (SPP, Gedung)..."
            placeholderTextColor="#94A3B8"
            value={search}
            onChangeText={setSearch}
            onSubmitEditing={() => setQuery(search.trim())}
            returnKeyType="search"
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => { setSearch(''); setQuery(''); }}>
              <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
            </TouchableOpacity>
          )}
        </View>

        {/* ── Filter Segmented Tabs (Semua / Belum Bayar / Lunas) ── */}
        <View style={s.filterTabsRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setStatusFilter('all')}
            style={[s.filterTabBtn, statusFilter === 'all' && s.filterTabBtnActive]}
          >
            <Text style={[s.filterTabText, statusFilter === 'all' && s.filterTabTextActive]}>
              Semua ({meta.total || 0})
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setStatusFilter('unpaid')}
            style={[s.filterTabBtn, statusFilter === 'unpaid' && s.filterTabBtnActiveUnpaid]}
          >
            <View style={[s.tabDot, { backgroundColor: '#E11D48' }]} />
            <Text style={[s.filterTabText, statusFilter === 'unpaid' && s.filterTabTextActiveUnpaid]}>
              Belum Lunas
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            onPress={() => setStatusFilter('paid')}
            style={[s.filterTabBtn, statusFilter === 'paid' && s.filterTabBtnActivePaid]}
          >
            <View style={[s.tabDot, { backgroundColor: '#059669' }]} />
            <Text style={[s.filterTabText, statusFilter === 'paid' && s.filterTabTextActivePaid]}>
              Lunas
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* ── DAFTAR TAGIHAN SISWA ── */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[s.scrollContent, { paddingBottom: bottomInset + 30 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#059669']} />}
      >
        {loading ? (
          <View style={s.centerBox}>
            <ActivityIndicator size="large" color="#059669" />
            <Text style={s.loadingText}>Memuat data tagihan siswa...</Text>
          </View>
        ) : bills.length === 0 ? (
          <View style={s.emptyCard}>
            <View style={s.emptyIconCircle}>
              <MaterialCommunityIcons name="file-document-outline" size={32} color="#059669" />
            </View>
            <Text style={s.emptyTitle}>Belum Ada Tagihan</Text>
            <Text style={s.emptySubtitle}>
              {query
                ? `Tidak ditemukan tagihan dengan kata kunci "${query}".`
                : 'Belum ada data tagihan yang diterbitkan pada filter status ini.'}
            </Text>
          </View>
        ) : (
          bills.map((item, idx) => {
            const student = item.student || {};
            const isPaid = String(item.status).toLowerCase() === 'paid';
            const isPartial = String(item.status).toLowerCase() === 'partial';
            const studentPhoto = getProfileImageUrl(student);
            const studentClass = student.kelas?.nama_kelas || student.kelas?.name || '-';
            const studentUnit = student.kelas?.unitPendidikan?.name || student.unit_name || 'Unit Sekolah';
            const studentVa = student.metadata?.no_va || student.metadata?.nis_pembayaran || item.va_number || null;

            return (
              <TouchableOpacity
                key={item.id || idx}
                activeOpacity={0.88}
                onPress={() => setSelectedBill(item)}
                style={s.billCard}
              >
                {/* Header Kartu: Siswa & Lencana Status */}
                <View style={s.billCardHeader}>
                  <View style={s.studentInfoRow}>
                    <View style={s.studentAvatarWrap}>
                      {studentPhoto ? (
                        <Image source={{ uri: studentPhoto }} style={s.studentAvatarImg} />
                      ) : (
                        <View style={s.studentAvatarFallback}>
                          <Text style={s.studentAvatarInitial}>
                            {(student.full_name || 'S').slice(0, 2).toUpperCase()}
                          </Text>
                        </View>
                      )}
                    </View>
                    <View style={s.studentTextCol}>
                      <Text style={s.studentName} numberOfLines={1}>
                        {student.full_name || 'Santri'}
                      </Text>
                      <Text style={s.studentSub} numberOfLines={1}>
                        NIS: {student.nis || '-'} • Kelas {studentClass}
                      </Text>
                    </View>
                  </View>

                  {/* Lencana Status Pembayaran */}
                  <View
                    style={[
                      s.statusBadge,
                      isPaid
                        ? s.statusBadgePaid
                        : isPartial
                        ? s.statusBadgePartial
                        : s.statusBadgeUnpaid,
                    ]}
                  >
                    <MaterialCommunityIcons
                      name={isPaid ? 'check-circle' : isPartial ? 'clock-outline' : 'alert-circle'}
                      size={12}
                      color={isPaid ? '#047857' : isPartial ? '#B45309' : '#BE123C'}
                      style={{ marginRight: 3 }}
                    />
                    <Text
                      style={[
                        s.statusBadgeText,
                        isPaid
                          ? s.statusBadgeTextPaid
                          : isPartial
                          ? s.statusBadgeTextPartial
                          : s.statusBadgeTextUnpaid,
                      ]}
                    >
                      {isPaid ? 'LUNAS' : isPartial ? 'SEBAGIAN' : 'BELUM BAYAR'}
                    </Text>
                  </View>
                </View>

                {/* Body Kartu: Judul Tagihan & Nominal */}
                <View style={s.billCardBody}>
                  <View style={s.billTitleCol}>
                    <Text style={s.billTitle} numberOfLines={1}>
                      {item.title || item.fee_category?.name || 'Tagihan Pendidikan'}
                    </Text>
                    <Text style={s.billDueDate}>
                      Jatuh Tempo: {formatDate(item.due_date)}
                    </Text>
                  </View>
                  <View style={s.billAmountCol}>
                    <Text style={s.billAmount}>{formatRupiah(item.amount)}</Text>
                    {!isPaid && Number(item.remaining_amount || 0) > 0 && (
                      <Text style={s.billRemaining}>
                        Sisa: {formatRupiah(item.remaining_amount)}
                      </Text>
                    )}
                  </View>
                </View>

                {/* Footer Kartu: Nomor VA BSI & Detail Hint */}
                <View style={s.billCardFooter}>
                  {studentVa ? (
                    <View style={s.vaBox}>
                      <MaterialCommunityIcons name="bank-outline" size={13} color="#059669" />
                      <Text style={s.vaText}>VA BSI: {studentVa}</Text>
                    </View>
                  ) : (
                    <Text style={s.unitText} numberOfLines={1}>
                      {studentUnit}
                    </Text>
                  )}
                  <View style={s.detailHintRow}>
                    <Text style={s.detailHintText}>Lihat Rincian</Text>
                    <MaterialCommunityIcons name="chevron-right" size={14} color="#059669" />
                  </View>
                </View>
              </TouchableOpacity>
            );
          })
        )}
      </ScrollView>

      {/* ── MODAL RINCIAN DETAIL TAGIHAN (POP-UP) ── */}
      {selectedBill && (
        <Modal
          visible={!!selectedBill}
          transparent
          animationType="slide"
          onRequestClose={() => setSelectedBill(null)}
        >
          <View style={s.modalBackdrop}>
            <View style={s.modalSheet}>
              {/* Modal Top Bar */}
              <View style={s.modalTopBar}>
                <View style={s.modalHeaderCol}>
                  <View style={s.modalRoleTag}>
                    <Text style={s.modalRoleTagText}>DETAIL TAGIHAN SANTRI</Text>
                  </View>
                  <Text style={s.modalTitle} numberOfLines={1}>
                    {selectedBill.title || 'Tagihan Pendidikan'}
                  </Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedBill(null)}
                  style={s.modalCloseBtn}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#475569" />
                </TouchableOpacity>
              </View>

              {/* Santri Card in Modal */}
              <View style={s.modalStudentCard}>
                <View style={s.modalAvatarWrap}>
                  {getProfileImageUrl(selectedBill.student) ? (
                    <Image
                      source={{ uri: getProfileImageUrl(selectedBill.student)! }}
                      style={s.modalAvatarImg}
                    />
                  ) : (
                    <View style={s.modalAvatarFallback}>
                      <Text style={s.modalAvatarInitial}>
                        {(selectedBill.student?.full_name || 'S').slice(0, 2).toUpperCase()}
                      </Text>
                    </View>
                  )}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.modalStudentName}>
                    {selectedBill.student?.full_name || 'Santri'}
                  </Text>
                  <Text style={s.modalStudentSub}>
                    NIS: {selectedBill.student?.nis || '-'} • Kelas{' '}
                    {selectedBill.student?.kelas?.nama_kelas || '-'}
                  </Text>
                  <Text style={s.modalStudentUnit}>
                    {selectedBill.student?.kelas?.unitPendidikan?.name || 'Dar el-Iman'}
                  </Text>
                </View>
              </View>

              {/* Rincian Nominal */}
              <View style={s.modalDetailSection}>
                <View style={s.modalRow}>
                  <Text style={s.modalRowLabel}>Nomor Tagihan</Text>
                  <Text style={s.modalRowVal}>
                    {selectedBill.bill_number || `BILL-${selectedBill.id?.slice(0, 8)}`}
                  </Text>
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalRowLabel}>Total Tagihan</Text>
                  <Text style={[s.modalRowVal, { fontWeight: '800', color: '#047857' }]}>
                    {formatRupiah(selectedBill.amount)}
                  </Text>
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalRowLabel}>Jatuh Tempo</Text>
                  <Text style={s.modalRowVal}>{formatDate(selectedBill.due_date)}</Text>
                </View>
                <View style={s.modalRow}>
                  <Text style={s.modalRowLabel}>Status Pembayaran</Text>
                  <Text
                    style={[
                      s.modalRowVal,
                      {
                        fontWeight: '800',
                        color:
                          String(selectedBill.status).toLowerCase() === 'paid'
                            ? '#047857'
                            : '#BE123C',
                      },
                    ]}
                  >
                    {String(selectedBill.status).toLowerCase() === 'paid'
                      ? 'LUNAS'
                      : 'BELUM LUNAS'}
                  </Text>
                </View>
              </View>

              {/* Box Virtual Account BSI */}
              {(selectedBill.student?.metadata?.no_va ||
                selectedBill.student?.metadata?.nis_pembayaran) && (
                <View style={s.modalVaBox}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.modalVaTitle}>Nomor Virtual Account BSI</Text>
                    <Text style={s.modalVaNumber}>
                      {selectedBill.student?.metadata?.no_va ||
                        selectedBill.student?.metadata?.nis_pembayaran}
                    </Text>
                  </View>
                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() =>
                      handleCopyVa(
                        selectedBill.student?.metadata?.no_va ||
                          selectedBill.student?.metadata?.nis_pembayaran
                      )
                    }
                    style={s.modalCopyBtn}
                  >
                    <MaterialCommunityIcons
                      name={copiedVa ? 'check' : 'content-copy'}
                      size={15}
                      color="#047857"
                    />
                    <Text style={s.modalCopyBtnText}>{copiedVa ? 'Tersalin' : 'Salin'}</Text>
                  </TouchableOpacity>
                </View>
              )}

              {/* Tombol Tutup */}
              <TouchableOpacity
                activeOpacity={0.85}
                onPress={() => setSelectedBill(null)}
                style={s.modalCloseFullBtn}
              >
                <Text style={s.modalCloseFullBtnText}>Tutup Rincian</Text>
              </TouchableOpacity>
            </View>
          </View>
        </Modal>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#F0FDF4' },

  /* ── Background Backdrop Masjid Identik Data Siswa ── */
  bgBackdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 480,
    width: '100%',
  },
  bgImage: {
    width: '100%',
    height: '100%',
    opacity: 0.45,
  },

  /* ── Top Header ── */
  topHeader: {
    paddingHorizontal: 16,
    paddingBottom: 10,
  },
  topHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  headerSquircleBtn: {
    width: 42,
    height: 42,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  headerTitleCol: { flex: 1, marginHorizontal: 12 },
  roleTag: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.85)',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 2.5,
    borderRadius: 20,
    marginBottom: 3,
  },
  roleTagText: { fontSize: 9.5, fontWeight: '800', color: '#047857', letterSpacing: 0.5 },
  headerTitle: { fontSize: 18, fontWeight: '900', color: '#064E3B', letterSpacing: -0.3 },
  headerSubtitle: { fontSize: 11, color: '#047857', fontWeight: '600' },

  /* ── 3 KPI Cards ── */
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 10,
  },
  kpiBox: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kpiGradient: {
    padding: 8,
    alignItems: 'center',
  },
  kpiIconSquare: {
    width: 24,
    height: 24,
    borderRadius: 8,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  kpiVal: {
    fontSize: 10.5,
    fontWeight: '900',
    textAlign: 'center',
  },
  kpiLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#064E3B',
    marginTop: 2,
  },
  kpiSub: {
    fontSize: 8.5,
    color: '#64748B',
    marginTop: 1,
  },

  /* ── Search Bar ── */
  searchBar: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    height: 42,
    marginBottom: 8,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 11.5,
    color: '#0F172A',
    marginLeft: 6,
    height: 42,
  },

  /* ── Filter Tabs ── */
  filterTabsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  filterTabBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingVertical: 7,
    borderRadius: 12,
  },
  filterTabBtnActive: {
    backgroundColor: '#047857',
    borderColor: '#047857',
  },
  filterTabBtnActiveUnpaid: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  filterTabBtnActivePaid: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  tabDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    marginRight: 4,
  },
  filterTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  filterTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterTabTextActiveUnpaid: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterTabTextActivePaid: {
    color: '#FFFFFF',
    fontWeight: '800',
  },

  /* ── Scroll Content ── */
  scrollContent: {
    padding: 14,
    paddingTop: 4,
  },

  centerBox: {
    paddingVertical: 40,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    fontSize: 12,
    fontWeight: '600',
    color: '#059669',
    marginTop: 8,
  },

  /* ── Empty Card ── */
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 24,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    marginTop: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  emptyIconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  emptyTitle: {
    fontSize: 14,
    fontWeight: '800',
    color: '#064E3B',
  },
  emptySubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    lineHeight: 16,
  },

  /* ── Bill Card ── */
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 12,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  billCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F0FDF4',
  },
  studentInfoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  studentAvatarWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: '#ECFDF5',
    marginRight: 10,
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  studentAvatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  studentAvatarInitial: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  studentTextCol: {
    flex: 1,
  },
  studentName: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  studentSub: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },

  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 8,
  },
  statusBadgePaid: {
    backgroundColor: '#ECFDF5',
  },
  statusBadgePartial: {
    backgroundColor: '#FEF3C7',
  },
  statusBadgeUnpaid: {
    backgroundColor: '#FFE4E6',
  },
  statusBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
  },
  statusBadgeTextPaid: {
    color: '#047857',
  },
  statusBadgeTextPartial: {
    color: '#B45309',
  },
  statusBadgeTextUnpaid: {
    color: '#BE123C',
  },

  billCardBody: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 10,
  },
  billTitleCol: {
    flex: 1,
    marginRight: 8,
  },
  billTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#0F172A',
  },
  billDueDate: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  billAmountCol: {
    alignItems: 'flex-end',
  },
  billAmount: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#047857',
  },
  billRemaining: {
    fontSize: 10,
    color: '#BE123C',
    fontWeight: '700',
    marginTop: 1,
  },

  billCardFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F0FDF4',
  },
  vaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    gap: 4,
  },
  vaText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#047857',
  },
  unitText: {
    fontSize: 10.5,
    color: '#64748B',
    fontWeight: '600',
    flex: 1,
  },
  detailHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  detailHintText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },

  /* ── Modal Detail ── */
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  modalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    maxHeight: '85%',
  },
  modalTopBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  modalHeaderCol: {
    flex: 1,
  },
  modalRoleTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 12,
    marginBottom: 4,
  },
  modalRoleTagText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
    letterSpacing: 0.5,
  },
  modalTitle: {
    fontSize: 16,
    fontWeight: '900',
    color: '#0F172A',
  },
  modalCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },

  modalStudentCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  modalAvatarWrap: {
    width: 44,
    height: 44,
    borderRadius: 22,
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    marginRight: 12,
  },
  modalAvatarImg: {
    width: '100%',
    height: '100%',
  },
  modalAvatarFallback: {
    width: '100%',
    height: '100%',
    backgroundColor: '#D1FAE5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalAvatarInitial: {
    fontSize: 14,
    fontWeight: '800',
    color: '#047857',
  },
  modalStudentName: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalStudentSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  modalStudentUnit: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#059669',
    marginTop: 2,
  },

  modalDetailSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 12,
    marginBottom: 14,
  },
  modalRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 7,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalRowLabel: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
  },
  modalRowVal: {
    fontSize: 12,
    color: '#0F172A',
    fontWeight: '700',
  },

  modalVaBox: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  modalVaTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
    textTransform: 'uppercase',
  },
  modalVaNumber: {
    fontSize: 14,
    fontWeight: '900',
    color: '#065F46',
    marginTop: 2,
    letterSpacing: 0.5,
  },
  modalCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    gap: 4,
  },
  modalCopyBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#047857',
  },

  modalCloseFullBtn: {
    backgroundColor: '#047857',
    paddingVertical: 12,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  modalCloseFullBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});
