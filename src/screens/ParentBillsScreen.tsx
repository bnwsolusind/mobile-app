import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
  Share,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { StudentHeroCard } from '../components/StudentHeroCard';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const STUDENT_CARD_GAP = 12;
const STUDENT_PEEK_WIDTH = 26;

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

export default function ParentBillsScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);
  const studentScrollRef = useRef<ScrollView>(null);

  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    return fromStore ? String(fromStore) : undefined;
  });
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const [bills, setBills] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ current_page: 1, last_page: 1, total: 0 });
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const mobileConfig = useMobileConfigStore((state) => state.config);

  const studentCardWidth = useMemo(() => {
    return children.length > 1
      ? SCREEN_WIDTH - 16 - STUDENT_CARD_GAP - STUDENT_PEEK_WIDTH
      : SCREEN_WIDTH - 32;
  }, [children.length]);

  const studentSnapInterval = useMemo(() => {
    return studentCardWidth + STUDENT_CARD_GAP;
  }, [studentCardWidth]);

  const loadChildren = useCallback(async () => {
    const isSingleChild = route?.params?.single_child_only === true;
    const targetChildId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
    const response = await mobileApiService.getPortalChildren();
    const list = unwrapApiData<any[]>(response);
    const safeList = Array.isArray(list) ? list : [];
    const displayList =
      isSingleChild && targetChildId ? safeList.filter((c) => String(c.id || c.student_id) === String(targetChildId)) : safeList;
    const finalChildren = displayList.length > 0 ? displayList : safeList;
    setChildren(finalChildren);
    useActiveChildStore.getState().setChildren(safeList);
    const resolvedId =
      targetChildId ||
      useActiveChildStore.getState().activeChildId ||
      (finalChildren[0]?.id || finalChildren[0]?.student_id ? String(finalChildren[0].id || finalChildren[0].student_id) : undefined);
    if (resolvedId) {
      setSelectedChildId(String(resolvedId));
      useActiveChildStore.getState().setActiveChildId(String(resolvedId));
    }
  }, [route?.params?.child_id, route?.params?.student_id, route?.params?.single_child_only, globalActiveChildId]);

  // Handle selectedChildId sync with route and globalActiveChildId
  useEffect(() => {
    const incomingId = route?.params?.child_id || route?.params?.student_id || globalActiveChildId;
    if (incomingId && String(incomingId) !== String(selectedChildId)) {
      setSelectedChildId(String(incomingId));
    }
  }, [route?.params?.child_id, route?.params?.student_id, globalActiveChildId]);

  const loadBills = useCallback(async (page = 1) => {
    if (!selectedChildId) return;
    try {
      setError(null);
      const response = await mobileApiService.getPortalBills(selectedChildId, page);
      const payload = unwrapApiData<any>(response) || {};
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setBills(rows);
      setMeta(payload);
      const payInfo = response?.payment_info || response?.data?.payment_info || payload?.payment_info;
      if (payInfo) {
        setPaymentInfo(payInfo);
      }
    } catch (err: any) {
      setError(getApiErrorMessage(err, 'Daftar tagihan dan pembayaran belum berhasil dimuat.'));
    }
  }, [selectedChildId]);

  const load = useCallback(async () => {
    setLoading(true);
    await loadChildren();
    setLoading(false);
  }, [loadChildren]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (selectedChildId) {
      loadBills(1);
    }
  }, [selectedChildId, loadBills]);

  useEffect(() => {
    if (selectedChildId && children.length > 0) {
      const idx = children.findIndex((c) => String(c.id || c.student_id) === String(selectedChildId));
      if (idx !== -1 && idx !== activeChildIndex) {
        setActiveChildIndex(idx);
        studentScrollRef.current?.scrollTo({ x: idx * studentSnapInterval, animated: true });
      }
    }
  }, [selectedChildId, children, studentSnapInterval]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadBills(1);
    setRefreshing(false);
  }, [loadBills]);

  const selectChildWithScroll = (childId: string, index: number) => {
    setSelectedChildId(childId);
    setActiveChildIndex(index);
    useActiveChildStore.getState().setActiveChildId(childId);
    studentScrollRef.current?.scrollTo({ x: index * studentSnapInterval, animated: true });
  };

  const stats = useMemo(() => {
    let totalNominal = 0;
    let paidNominal = 0;
    let unpaidNominal = 0;
    bills.forEach((b) => {
      const amt = Number(b.amount || 0);
      totalNominal += amt;
      if (String(b.status).toUpperCase() === 'PAID') {
        paidNominal += amt;
      } else {
        unpaidNominal += amt;
      }
    });
    return { totalNominal, paidNominal, unpaidNominal };
  }, [bills]);

  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const status = String(b.status || 'UNPAID').toUpperCase();
      const title = String(b.title || '').toLowerCase();
      let statusMatch = true;
      if (filter === 'unpaid') statusMatch = status === 'UNPAID';
      if (filter === 'paid') statusMatch = status === 'PAID';
      const searchMatch = !search || title.includes(search.toLowerCase());
      return statusMatch && searchMatch;
    });
  }, [bills, filter, search]);

  return (
    <View style={styles.rootContainer}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[styles.content, { paddingBottom: bottomInset + 30 }]}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={['#18A165']} />}
      >
        {/* Child Selector Carousel */}
        {children.length > 0 && (
          <View style={styles.studentContainerBlock}>
            <ScrollView
              ref={studentScrollRef}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.studentCardsTrack}
              decelerationRate="fast"
              snapToInterval={studentSnapInterval}
              onScroll={(e) => {
                const offsetX = e.nativeEvent.contentOffset.x;
                const idx = Math.round(offsetX / studentSnapInterval);
                if (idx !== activeChildIndex && idx >= 0 && idx < children.length) {
                  setActiveChildIndex(idx);
                  const selChild = children[idx];
                  const sid = selChild?.id || selChild?.student_id;
                  if (sid && String(sid) !== selectedChildId) {
                    setSelectedChildId(String(sid));
                    useActiveChildStore.getState().setActiveChildId(String(sid));
                  }
                }
              }}
              scrollEventThrottle={16}
            >
              {children.map((child, index) => {
                const childId = String(child.id || child.student_id);
                return (
                  <StudentHeroCard
                    key={childId}
                    child={child}
                    isSelected={childId === String(selectedChildId)}
                    cardWidth={studentCardWidth}
                    onSelect={() => selectChildWithScroll(childId, index)}
                  />
                );
              })}
            </ScrollView>

            {/* Pagination Dots for Multiple Children */}
            {children.length > 1 && (
              <View style={styles.studentDotsRow}>
                {children.map((_, dotIdx) => (
                  <TouchableOpacity
                    key={dotIdx}
                    activeOpacity={0.7}
                    onPress={() => {
                      const targetC = children[dotIdx];
                      const sid = targetC?.id || targetC?.student_id;
                      if (sid) {
                        selectChildWithScroll(String(sid), dotIdx);
                      }
                    }}
                    style={[
                      styles.studentDot,
                      activeChildIndex === dotIdx ? styles.studentDotActive : styles.studentDotInactive,
                    ]}
                  />
                ))}
              </View>
            )}
          </View>
        )}

        {/* Header Block */}
        <View style={styles.containerBlock}>
          <View style={styles.sectionHeader}>
            <MaterialCommunityIcons name="cash-check" size={20} color="#18A165" />
            <View>
              <Text style={styles.sectionTitle}>Tagihan & Pembayaran SPP</Text>
              <Text style={styles.sectionSub}>Rincian biaya pendidikan dan histori kuitansi resmi.</Text>
            </View>
          </View>

          {/* Error Banner */}
          {error ? (
            <View style={styles.errorBannerBox}>
              <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#E11D48" />
              <Text style={styles.errorBannerText}>{error}</Text>
              <TouchableOpacity onPress={() => void loadBills(1)} style={styles.errorRetryBtn}>
                <Text style={styles.errorRetryText}>Coba Lagi</Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {/* Stats Bar */}
          <View style={styles.statsRow}>
            <View style={[styles.statBox, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
              <Text style={styles.statLabel}>Total Tagihan</Text>
              <Text style={[styles.statVal, { color: '#047857' }]}>{formatRupiah(stats.totalNominal)}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
              <Text style={styles.statLabel}>Sudah Lunas</Text>
              <Text style={[styles.statVal, { color: '#1D4ED8' }]}>{formatRupiah(stats.paidNominal)}</Text>
            </View>
            <View style={[styles.statBox, { backgroundColor: '#FEF3C7', borderColor: '#FDE68A' }]}>
              <Text style={styles.statLabel}>Sisa Belum Lunas</Text>
              <Text style={[styles.statVal, { color: '#B45309' }]}>{formatRupiah(stats.unpaidNominal)}</Text>
            </View>
          </View>

          {/* Virtual Account BSI Khusus Ananda */}
          {paymentInfo?.student_va ? (
            <View style={styles.vaContainer}>
              <View style={styles.vaHeaderRow}>
                <View style={styles.vaBadge}>
                  <MaterialCommunityIcons name="bank" size={13} color="#047857" />
                  <Text style={styles.vaBadgeText}>BSI VIRTUAL ACCOUNT</Text>
                </View>
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => {
                    Share.share({
                      message: `Nomor Virtual Account BSI ${paymentInfo?.student_name || 'Ananda'}: ${paymentInfo.student_va}\nBank Syariah Indonesia (Kode: 451)`,
                    });
                  }}
                  style={styles.vaShareBtn}
                >
                  <MaterialCommunityIcons name="share-variant-outline" size={13} color="#047857" />
                  <Text style={styles.vaShareBtnText}>Bagikan VA</Text>
                </TouchableOpacity>
              </View>
              <Text style={styles.vaStudentName}>
                Ananda: {paymentInfo?.student_name || 'Siswa'}
              </Text>
              <Text selectable style={styles.vaNumberText}>
                {paymentInfo.student_va}
              </Text>
              <Text style={styles.vaHelperText}>
                Pembayaran via BSI Mobile, ATM BSI, atau Transfer Antar Bank (Kode 451). Langsung terverifikasi otomatis.
              </Text>
            </View>
          ) : null}

          {/* Info Rekening */}
          <View style={styles.rekeningBox}>
            <MaterialCommunityIcons name="bank-outline" size={18} color="#0E5C44" />
            <Text style={styles.rekeningText}>
              {paymentInfo?.bank_name || 'Rekening Pembayaran'}:{' '}
              <Text style={{ fontWeight: '900' }}>{paymentInfo?.account_number || '-'}</Text>
              {paymentInfo?.account_holder
                ? ` a.n. ${paymentInfo.account_holder}`
                : mobileConfig?.branding?.school_name
                ? ` a.n. ${mobileConfig.branding.school_name}`
                : ''}
            </Text>
          </View>

          {/* Filter Row */}
          <View style={styles.filterRow}>
            {[
              { id: 'all', label: 'Semua' },
              { id: 'unpaid', label: 'Belum Lunas' },
              { id: 'paid', label: 'Lunas' },
            ].map((item) => (
              <TouchableOpacity
                key={item.id}
                onPress={() => setFilter(item.id as any)}
                style={[styles.filterChip, filter === item.id && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, filter === item.id && styles.filterChipTextActive]}>
                  {item.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* List Tagihan */}
        {loading ? (
          <ActivityIndicator color="#18A165" style={{ marginVertical: 36 }} />
        ) : filteredBills.length === 0 ? (
          <View style={styles.empty}>
            <MaterialCommunityIcons name="receipt" size={38} color="#CBD5E1" />
            <Text style={styles.emptyTitle}>Belum Ada Tagihan</Text>
            <Text style={styles.emptyText}>Tidak ada data tagihan yang sesuai dengan filter yang dipilih.</Text>
          </View>
        ) : (
          filteredBills.map((b) => {
            const isPaid = String(b.status).toUpperCase() === 'PAID';
            const payments = Array.isArray(b.payments) ? b.payments : [];

            return (
              <View key={String(b.id)} style={styles.billCard}>
                <View style={styles.billHead}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.billCategory}>{b.fee_category?.name || 'SPP Bulanan'}</Text>
                    <Text style={styles.billTitle}>{b.title}</Text>
                    <Text style={styles.billDueDate}>Jatuh Tempo: {formatDate(b.due_date)}</Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.billAmount}>{formatRupiah(b.amount)}</Text>
                    <View style={[styles.statusBadge, isPaid ? styles.badgePaid : styles.badgeUnpaid]}>
                      <Text style={[styles.statusText, isPaid ? styles.textPaid : styles.textUnpaid]}>
                        {isPaid ? 'LUNAS' : 'BELUM LUNAS'}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* Riwayat Pelunasan */}
                {payments.length > 0 && (
                  <View style={styles.paymentsBox}>
                    <Text style={styles.paymentsBoxTitle}>Histori Pembayaran Resmi:</Text>
                    {payments.map((p: any) => (
                      <View key={String(p.id)} style={styles.paymentItem}>
                        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                          <MaterialCommunityIcons name="check-decagram" size={14} color="#047857" />
                          <Text style={styles.paymentInvoice}>{p.invoice_number}</Text>
                        </View>
                        <Text style={styles.paymentMethod}>
                          {p.payment_method} • {formatDate(p.paid_at)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            );
          })
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  rootContainer: { flex: 1, backgroundColor: '#FFFFFF' },
  screen: { flex: 1 },
  content: { padding: 16, gap: 14 },
  studentContainerBlock: {
    marginHorizontal: -16,
    marginBottom: 4,
  },
  studentCardsTrack: {
    paddingHorizontal: 16,
    gap: STUDENT_CARD_GAP,
    paddingBottom: 4,
  },
  studentDotsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
  },
  studentDot: {
    height: 5,
    borderRadius: 2.5,
  },
  studentDotActive: {
    width: 18,
    backgroundColor: '#0D6B42',
  },
  studentDotInactive: {
    width: 6,
    backgroundColor: '#CBD5E1',
  },
  containerBlock: {
    backgroundColor: 'rgba(255,255,255,0.94)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#DDEBE4',
    padding: 14,
    gap: 12,
  },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  sectionTitle: { fontSize: 14, fontWeight: '800', color: '#1E293B' },
  sectionSub: { fontSize: 11, color: '#64748B', marginTop: 2 },
  errorBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    borderRadius: 14,
    padding: 10,
    gap: 10,
  },
  errorBannerText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '600',
    color: '#9F1239',
  },
  errorRetryBtn: {
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 8,
    backgroundColor: '#E11D48',
  },
  errorRetryText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 8 },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#64748B' },
  statVal: { fontSize: 11, fontWeight: '900', marginTop: 2 },
  vaContainer: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1.5,
    borderColor: '#6EE7B7',
    borderRadius: 14,
    padding: 12,
    gap: 4,
  },
  vaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vaBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  vaBadgeText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.5,
  },
  vaShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  vaShareBtnText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  vaStudentName: {
    fontSize: 11,
    fontWeight: '700',
    color: '#334155',
    marginTop: 2,
  },
  vaNumberText: {
    fontSize: 16,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '900',
    color: '#065F46',
    letterSpacing: 1,
  },
  vaHelperText: {
    fontSize: 10,
    color: '#059669',
    marginTop: 2,
  },
  rekeningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    padding: 8,
    borderRadius: 10,
  },
  rekeningText: { fontSize: 11, color: '#064E3B' },
  filterRow: { flexDirection: 'row', gap: 8 },
  filterChip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: { backgroundColor: '#059669' },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  filterChipTextActive: { color: '#FFFFFF' },
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    gap: 10,
    shadowColor: '#000',
    shadowOpacity: 0.03,
    shadowRadius: 4,
    elevation: 1,
  },
  billHead: { flexDirection: 'row', justifyContent: 'space-between' },
  billCategory: { fontSize: 10, fontWeight: '800', color: '#0284C7', textTransform: 'uppercase' },
  billTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A', marginTop: 2 },
  billDueDate: { fontSize: 11, color: '#64748B', marginTop: 3 },
  billAmount: { fontSize: 14, fontWeight: '900', color: '#0F172A' },
  statusBadge: { marginTop: 4, paddingVertical: 2, paddingHorizontal: 8, borderRadius: 6 },
  badgePaid: { backgroundColor: '#D1FAE5' },
  badgeUnpaid: { backgroundColor: '#FEF3C7' },
  statusText: { fontSize: 9, fontWeight: '900' },
  textPaid: { color: '#047857' },
  textUnpaid: { color: '#B45309' },
  paymentsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    padding: 10,
    gap: 6,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  paymentsBoxTitle: { fontSize: 10, fontWeight: '700', color: '#64748B' },
  paymentItem: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  paymentInvoice: { fontSize: 10, fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace', fontWeight: '700', color: '#1E293B' },
  paymentMethod: { fontSize: 10, color: '#64748B' },
  empty: { alignItems: 'center', paddingVertical: 40, gap: 6 },
  emptyTitle: { fontSize: 14, fontWeight: '800', color: '#64748B' },
  emptyText: { fontSize: 11, color: '#94A3B8', textAlign: 'center', maxWidth: 260 },
});
