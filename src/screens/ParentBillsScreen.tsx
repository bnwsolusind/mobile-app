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

  const [children, setChildren] = useState<any[]>([]);
  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(route?.params?.child_id);
  const [activeChildIndex, setActiveChildIndex] = useState<number>(0);
  const [bills, setBills] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ current_page: 1, last_page: 1, total: 0 });
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
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
    const targetChildId = route?.params?.child_id || useActiveChildStore.getState().activeChildId;
    const response = await mobileApiService.getPortalChildren();
    const list = unwrapApiData<any[]>(response);
    const safeList = Array.isArray(list) ? list : [];
    const displayList =
      isSingleChild && targetChildId ? safeList.filter((c) => String(c.id) === String(targetChildId)) : safeList;
    const finalChildren = displayList.length > 0 ? displayList : safeList;
    setChildren(finalChildren);
    useActiveChildStore.getState().setChildren(safeList);
    const resolvedId =
      targetChildId ||
      useActiveChildStore.getState().activeChildId ||
      (finalChildren[0]?.id ? String(finalChildren[0].id) : undefined);
    if (resolvedId) {
      setSelectedChildId(String(resolvedId));
      useActiveChildStore.getState().setActiveChildId(String(resolvedId));
    }
  }, [route?.params?.child_id, route?.params?.single_child_only]);

  const loadBills = useCallback(async (page = 1) => {
    if (!selectedChildId) return;
    try {
      const response = await mobileApiService.getPortalBills(selectedChildId, page);
      const payload = unwrapApiData<any>(response) || {};
      const rows = Array.isArray(payload?.data) ? payload.data : Array.isArray(payload) ? payload : [];
      setBills(rows);
      setMeta(payload);
      const payInfo = response?.payment_info || response?.data?.payment_info || payload?.payment_info;
      if (payInfo) {
        setPaymentInfo(payInfo);
      }
    } catch (err) {
      // ignore
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
      const idx = children.findIndex((c) => String(c.id) === String(selectedChildId));
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
              {children.map((child, index) => (
                <StudentHeroCard
                  key={String(child.id)}
                  child={child}
                  isSelected={String(child.id) === selectedChildId}
                  cardWidth={studentCardWidth}
                  onSelect={() => selectChildWithScroll(String(child.id), index)}
                />
              ))}
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

          {/* Info Rekening */}
          <View style={styles.rekeningBox}>
            <MaterialCommunityIcons name="bank" size={18} color="#0E5C44" />
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
  statsRow: { flexDirection: 'row', gap: 8 },
  statBox: { flex: 1, borderRadius: 12, borderWidth: 1, padding: 8 },
  statLabel: { fontSize: 9, fontWeight: '700', color: '#64748B' },
  statVal: { fontSize: 11, fontWeight: '900', marginTop: 2 },
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
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: '#F1F5F9',
  },
  filterChipActive: { backgroundColor: '#0E5C44' },
  filterChipText: { fontSize: 11, fontWeight: '700', color: '#475569' },
  filterChipTextActive: { color: '#FFFFFF' },
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
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
