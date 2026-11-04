import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
  Share,
  Linking,
  Alert,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useActiveChildStore } from '../stores/activeChildStore';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { useNavigationHistoryStore } from '../stores/navigationHistoryStore';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { useAuthStore } from '../stores/authStore';
import { StudentIdCardModal } from '../components/StudentIdCardModal';
import AccessDeniedScreen from '../components/AccessDeniedScreen';
import { canAccessBilling } from '../utils/accessControl';
import {
  getProfileImageUrl,
  getStudentAvatarSource,
} from '../utils/profile';
import { getStudentAttendanceStatus } from '../utils/studentAttendanceHelper';

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

export default function ParentBillsScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 0);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 36 : 16);

  const user = useAuthStore((state) => state.user);
  const unreadNotificationCount = useNotificationBadgeStore((state) => state.unreadNotificationCount);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const globalChildren = useActiveChildStore((state) => state.children);

  const [children, setChildren] = useState<any[]>(() => {
    return Array.isArray(globalChildren) && globalChildren.length > 0 ? globalChildren : [];
  });

  const [selectedChildId, setSelectedChildId] = useState<string | undefined>(() => {
    const fromRoute = route?.params?.child_id || route?.params?.student_id;
    if (fromRoute) return String(fromRoute);
    const fromStore = useActiveChildStore.getState().activeChildId;
    if (fromStore) return String(fromStore);
    if (Array.isArray(globalChildren) && globalChildren[0]) {
      return String(globalChildren[0].id || globalChildren[0].student_id);
    }
    return undefined;
  });

  const [bills, setBills] = useState<any[]>([]);
  const [meta, setMeta] = useState<any>({ current_page: 1, last_page: 1, total: 0 });
  const [paymentInfo, setPaymentInfo] = useState<any>(null);
  const [filter, setFilter] = useState<'all' | 'unpaid' | 'paid'>('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Modals & Multi-Select VA Payment
  const [selectedIdCardStudent, setSelectedIdCardStudent] = useState<any>(null);
  const [showChildSelectorModal, setShowChildSelectorModal] = useState(false);
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);
  const [isPayModalOpen, setIsPayModalOpen] = useState(false);
  const [selectedBank, setSelectedBank] = useState<'BSI' | 'NAGARI'>('BSI');
  const [processingVa, setProcessingVa] = useState(false);
  const [vaResult, setVaResult] = useState<any>(null);
  const [payError, setPayError] = useState<string | null>(null);

  const mobileConfig = useMobileConfigStore((state) => state.config);

  // Load portal children
  const loadChildren = useCallback(async () => {
    try {
      const response = await mobileApiService.getPortalChildren();
      const list = unwrapApiData<any[]>(response);
      const safeList = Array.isArray(list) ? list : [];
      setChildren(safeList);
      useActiveChildStore.getState().setChildren(safeList);

      setSelectedChildId((prev) => {
        if (prev && safeList.some((c) => String(c.id || c.student_id) === String(prev))) {
          return prev;
        }
        const fallbackId =
          route?.params?.child_id ||
          route?.params?.student_id ||
          useActiveChildStore.getState().activeChildId ||
          safeList[0]?.id ||
          safeList[0]?.student_id;
        const resId = fallbackId ? String(fallbackId) : undefined;
        if (resId) {
          useActiveChildStore.getState().setActiveChildId(resId);
        }
        return resId;
      });
    } catch {
      // Offline fallback: keep existing store data
    }
  }, [route?.params?.child_id, route?.params?.student_id]);

  // Load bills for selected student
  const loadBills = useCallback(async (targetChildId?: string, page = 1) => {
    const isStudent = user?.roles?.some((r: any) =>
      ['Siswa', 'siswa', 'student'].includes(typeof r === 'string' ? r : r?.name)
    );
    const cid = targetChildId || selectedChildId;
    if (!cid && !isStudent) return;
    try {
      setError(null);
      const response = await mobileApiService.getPortalBills(cid, page);
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
  }, [selectedChildId, user]);

  // Handle manual child switch
  const handleSelectChild = useCallback(
    (cId: string) => {
      setShowChildSelectorModal(false);
      setSelectedChildId(cId);
      useActiveChildStore.getState().setActiveChildId(cId);
      navigation?.setParams?.({ child_id: cId, student_id: cId });
      void loadBills(cId, 1);
    },
    [navigation, loadBills]
  );

  const loadAll = useCallback(async () => {
    setLoading(true);
    await loadChildren();
    setLoading(false);
  }, [loadChildren]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    const isStudent = user?.roles?.some((r: any) =>
      ['Siswa', 'siswa', 'student'].includes(typeof r === 'string' ? r : r?.name)
    );
    if (selectedChildId) {
      loadBills(selectedChildId, 1);
    } else if (isStudent) {
      loadBills(undefined, 1);
    }
  }, [selectedChildId, loadBills, user]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await Promise.all([loadChildren(), loadBills(selectedChildId, 1)]);
    setRefreshing(false);
  }, [loadChildren, loadBills, selectedChildId]);

  const unpaidBills = useMemo(() => {
    return bills.filter((b) => String(b.status || '').toUpperCase() !== 'PAID');
  }, [bills]);

  const toggleSelectBill = (id: string) => {
    setSelectedBillIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
    );
  };

  const handleSelectAllUnpaid = () => {
    if (selectedBillIds.length === unpaidBills.length) {
      setSelectedBillIds([]);
    } else {
      setSelectedBillIds(unpaidBills.map((b) => String(b.id)));
    }
  };

  const selectedBillsData = useMemo(() => {
    return bills.filter((b) => selectedBillIds.includes(String(b.id)));
  }, [bills, selectedBillIds]);

  const selectedTotal = useMemo(() => {
    return selectedBillsData.reduce((acc, b) => acc + Number(b.remaining_amount || b.amount || 0), 0);
  }, [selectedBillsData]);

  const handleCreateVaPayment = async () => {
    if (selectedBillsData.length === 0) return;
    setProcessingVa(true);
    setPayError(null);
    try {
      const items = selectedBillsData.map((b) => {
        const rawId = b.metadata?.sipdei_id || String(b.id).replace(/^sipdei_/, '');
        const numId = parseInt(rawId, 10) || 1;
        let jenis = 'TAGIHAN';
        if (b.fee_category?.category === 'TUNGGAKAN') jenis = 'TUNGGAKAN';
        if (b.fee_category?.category === 'DANA_ORTU_ASUH') jenis = 'DANA_ORTU_ASUH';

        return {
          jenis,
          id: numId,
          bayar: Number(b.remaining_amount || b.amount || 0),
        };
      });

      const response = await mobileApiService.createPortalVaPayment(
        selectedBank,
        items,
        selectedChildId
      );

      if (response?.success && response?.data) {
        setVaResult(response.data);
        void loadBills(selectedChildId, 1);
      } else {
        setPayError(response?.message || 'Gagal menerbitkan Virtual Account dari SIPDEI.');
      }
    } catch (err: any) {
      setPayError(getApiErrorMessage(err, 'Terjadi kendala saat menghubungi server SIPDEI.'));
    } finally {
      setProcessingVa(false);
    }
  };

  // Active header student resolution
  const headerStudent = useMemo(() => {
    if (children && children.length > 0) {
      if (selectedChildId) {
        const found = children.find(
          (c) => String(c.id || c.student_id) === String(selectedChildId)
        );
        if (found) return found;
      }
      return children[0];
    }
    return (user as any)?.student || user || null;
  }, [children, selectedChildId, user]);

  const studentFullName = useMemo(() => {
    return (
      (typeof headerStudent?.name === 'string' && headerStudent.name) ||
      (typeof headerStudent?.nama_lengkap === 'string' && headerStudent.nama_lengkap) ||
      (typeof headerStudent?.full_name === 'string' && headerStudent.full_name) ||
      'Ananda'
    );
  }, [headerStudent]);

  const studentUnit = useMemo(() => {
    return (
      headerStudent?.educationUnit?.name ||
      headerStudent?.education_unit?.name ||
      headerStudent?.unit_name ||
      headerStudent?.education_unit_name ||
      headerStudent?.kelas?.unit_pendidikan?.name ||
      headerStudent?.kelas?.unitPendidikan?.name ||
      (typeof headerStudent?.unit === 'string' ? headerStudent.unit : '') ||
      ''
    );
  }, [headerStudent]);

  const studentClass = useMemo(() => {
    return (
      headerStudent?.kelas?.nama_kelas ||
      headerStudent?.kelas?.name ||
      headerStudent?.class?.name ||
      headerStudent?.class_name ||
      (typeof headerStudent?.kelas === 'string' ? headerStudent.kelas : '') ||
      ''
    );
  }, [headerStudent]);

  const studentAvatarSource = useMemo(() => {
    return getStudentAvatarSource(headerStudent);
  }, [headerStudent]);

  const attendanceStatus = useMemo(() => {
    return getStudentAttendanceStatus(headerStudent);
  }, [headerStudent]);

  // Back Navigation handler
  const handleBack = () => {
    const handled = useNavigationHistoryStore.getState().goBackDynamic(navigation);
    if (!handled) {
      navigation?.navigate('Beranda');
    }
  };

  // Financial Stats calculation
  const stats = useMemo(() => {
    let totalNominal = 0;
    let paidNominal = 0;
    let unpaidNominal = 0;
    let countPaid = 0;
    let countUnpaid = 0;

    bills.forEach((b) => {
      const amt = Number(b.amount || 0);
      totalNominal += amt;
      if (String(b.status).toUpperCase() === 'PAID') {
        paidNominal += amt;
        countPaid++;
      } else {
        unpaidNominal += amt;
        countUnpaid++;
      }
    });
    return {
      totalNominal,
      paidNominal,
      unpaidNominal,
      countPaid,
      countUnpaid,
      totalCount: bills.length,
    };
  }, [bills]);

  // Filtered bills
  const filteredBills = useMemo(() => {
    return bills.filter((b) => {
      const status = String(b.status || 'UNPAID').toUpperCase();
      const title = String(b.title || '').toLowerCase();
      const category = String(b.fee_category?.name || '').toLowerCase();
      let statusMatch = true;
      if (filter === 'unpaid') statusMatch = status === 'UNPAID';
      if (filter === 'paid') statusMatch = status === 'PAID';
      const searchMatch =
        !search.trim() ||
        title.includes(search.toLowerCase().trim()) ||
        category.includes(search.toLowerCase().trim());
      return statusMatch && searchMatch;
    });
  }, [bills, filter, search]);

  if (!canAccessBilling(user, mobileConfig)) {
    return (
      <AccessDeniedScreen
        title="Akses Khusus Orang Tua"
        message="Informasi tagihan dan pembayaran SPP khusus diperuntukkan bagi akun Orang Tua / Wali Murid terdaftar."
        onGoBack={() => {
          if (navigation?.canGoBack?.()) {
            navigation.goBack();
          } else {
            navigation?.navigate('Beranda');
          }
        }}
      />
    );
  }

  return (
    <View style={styles.rootContainer}>
      {/* ── LATAR GAMBAR ILUSTRASI SEKOLAH DENGAN GRADASI EMERALD BERSIH ── */}
      <View style={[styles.topFoliageWrapper, { height: 380 }]} pointerEvents="none">
        <Image source={PARENT_HOME_BG} style={styles.topFoliageBgImage} resizeMode="cover" />
        <LinearGradient
          colors={['rgba(236, 253, 245, 0)', 'rgba(236, 253, 245, 0.45)', '#ECFDF5']}
          locations={[0, 0.45, 1]}
          style={StyleSheet.absoluteFill}
        />
      </View>

      {/* ── TOP HEADER IDENTIK HALAMAN UTAMA & INFORMASI SEKOLAH ── */}
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
          Tagihan & SPP
        </Text>

        <TouchableOpacity
          activeOpacity={0.75}
          onPress={() => navigation?.navigate('Notifikasi')}
          style={styles.cleanHeaderIconBtn}
          accessibilityRole="button"
          accessibilityLabel="Notifikasi"
        >
          <MaterialCommunityIcons name="bell-outline" size={20} color="#004D32" />
          {unreadNotificationCount > 0 && <View style={styles.cleanBellDot} />}
        </TouchableOpacity>
      </View>

      {/* ── MAIN SCROLL SHEET CONTAINER ── */}
      <View style={styles.sheetContainer}>
        <ScrollView
          style={styles.screen}
          contentContainerStyle={[
            styles.cleanMainScrollContent,
            { paddingBottom: Math.max(bottomInset + 72, 94) },
          ]}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={['#059669', '#10B981']}
              tintColor="#059669"
            />
          }
        >
          <View style={styles.cleanScrollInner}>
            <View style={styles.bodyContentWrapper}>
              {/* ── 0. OPEN PROFILE ROW (IDENTIK HALAMAN MODERN LAINNYA) ── */}
              <View style={styles.studentProfileRow}>
                {/* 60x60 Avatar with Mint Ring (Klik untuk Buka KTS Siswa) */}
                <TouchableOpacity
                  activeOpacity={0.8}
                  onPress={() => setSelectedIdCardStudent(headerStudent)}
                  style={styles.studentAvatarRing}
                  accessibilityRole="button"
                  accessibilityLabel="Lihat Kartu Pelajar"
                >
                  <Image
                    source={studentAvatarSource}
                    style={styles.studentAvatarImg}
                    resizeMode="cover"
                  />
                </TouchableOpacity>

                {/* 3-tier identity & action */}
                <View style={styles.studentProfileInfoCol}>
                  <TouchableOpacity
                    activeOpacity={children && children.length > 1 ? 0.75 : 1}
                    onPress={children && children.length > 1 ? () => setShowChildSelectorModal(true) : undefined}
                    style={styles.studentNameRow}
                  >
                    <Text numberOfLines={1} style={styles.studentProfileName}>
                      {studentFullName}
                    </Text>
                  </TouchableOpacity>

                  {/* Baris 2: Unit Pendidikan Dinamis */}
                  {studentUnit ? (
                    <View style={styles.studentMetaRow}>
                      <MaterialCommunityIcons
                        name="school-outline"
                        size={12}
                        color="#047857"
                        style={{ marginRight: 4 }}
                      />
                      <Text numberOfLines={1} style={styles.studentProfileUnitText}>
                        {studentUnit}
                      </Text>
                    </View>
                  ) : null}

                  {/* Baris 3: Kelas Siswa Dinamis */}
                  {studentClass ? (
                    <View style={styles.studentMetaRow}>
                      <MaterialCommunityIcons
                        name="door-open"
                        size={12}
                        color="#065F46"
                        style={{ marginRight: 4 }}
                      />
                      <Text numberOfLines={1} style={styles.studentProfileClassText}>
                        {studentClass}
                      </Text>
                    </View>
                  ) : null}

                  {/* Baris Aksi Terpadu */}
                  <View style={styles.studentActionBadgeRow}>
                    {children && children.length > 1 && (
                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setShowChildSelectorModal(true)}
                        style={styles.parentGantiAnakBtn}
                        accessibilityRole="button"
                        accessibilityLabel="Ganti Siswa"
                      >
                        <Text style={styles.parentGantiAnakBtnText}>Ganti Siswa</Text>
                        <MaterialCommunityIcons name="chevron-down" size={15} color="#FFFFFF" />
                      </TouchableOpacity>
                    )}

                    <View
                      style={[
                        styles.studentStatusBadge,
                        { backgroundColor: attendanceStatus.bg, borderColor: attendanceStatus.border },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={attendanceStatus.icon}
                        size={12}
                        color={attendanceStatus.color}
                        style={{ marginRight: 4 }}
                      />
                      <Text style={[styles.studentStatusBadgeText, { color: attendanceStatus.color }]}>
                        {attendanceStatus.label}
                      </Text>
                    </View>
                  </View>
                </View>
              </View>



              {/* ── ERROR BANNER ── */}
              {error ? (
                <View style={styles.errorBannerBox}>
                  <MaterialCommunityIcons name="alert-circle-outline" size={20} color="#E11D48" />
                  <Text style={styles.errorBannerText}>{error}</Text>
                  <TouchableOpacity onPress={() => void loadBills(selectedChildId, 1)} style={styles.errorRetryBtn}>
                    <Text style={styles.errorRetryText}>Coba Lagi</Text>
                  </TouchableOpacity>
                </View>
              ) : null}

              {/* ── 1. STATS KPI GRID (MODERN SQUIRCLE PASTEL) ── */}
              <View style={styles.statsGrid}>
                {/* Total Tagihan */}
                <View style={[styles.statCard, { backgroundColor: '#FFFFFF', borderColor: '#A7F3D0' }]}>
                  <View style={styles.statIconBadgeGreen}>
                    <MaterialCommunityIcons name="cash-multiple" size={16} color="#047857" />
                  </View>
                  <Text style={styles.statLabel}>Total Tagihan</Text>
                  <Text numberOfLines={1} style={[styles.statValue, { color: '#004D32' }]}>
                    {formatRupiah(stats.totalNominal)}
                  </Text>
                  <Text style={styles.statCountText}>{stats.totalCount} pos biaya</Text>
                </View>

                {/* Sudah Lunas */}
                <View style={[styles.statCard, { backgroundColor: '#FFFFFF', borderColor: '#BFDBFE' }]}>
                  <View style={styles.statIconBadgeBlue}>
                    <MaterialCommunityIcons name="check-circle-outline" size={16} color="#1D4ED8" />
                  </View>
                  <Text style={styles.statLabel}>Sudah Lunas</Text>
                  <Text numberOfLines={1} style={[styles.statValue, { color: '#1D4ED8' }]}>
                    {formatRupiah(stats.paidNominal)}
                  </Text>
                  <Text style={[styles.statCountText, { color: '#2563EB' }]}>
                    {stats.countPaid} tagihan lunas
                  </Text>
                </View>

                {/* Sisa Belum Lunas */}
                <View style={[styles.statCard, { backgroundColor: '#FFFFFF', borderColor: '#FDE68A' }]}>
                  <View style={styles.statIconBadgeAmber}>
                    <MaterialCommunityIcons name="clock-alert-outline" size={16} color="#B45309" />
                  </View>
                  <Text style={styles.statLabel}>Sisa Belum Lunas</Text>
                  <Text numberOfLines={1} style={[styles.statValue, { color: '#B45309' }]}>
                    {formatRupiah(stats.unpaidNominal)}
                  </Text>
                  <Text style={[styles.statCountText, { color: '#D97706' }]}>
                    {stats.countUnpaid} menunggu bayar
                  </Text>
                </View>
              </View>

              {/* ── 2. VIRTUAL ACCOUNT BSI ANANDA ── */}
              {paymentInfo?.student_va ? (
                <View style={styles.vaCardWrapper}>
                  <View style={styles.vaHeaderRow}>
                    <View style={styles.vaBadgePill}>
                      <MaterialCommunityIcons name="bank" size={13} color="#047857" />
                      <Text style={styles.vaBadgeText}>
                        {(paymentInfo?.va_bank_name || 'VIRTUAL ACCOUNT').toUpperCase()}
                      </Text>
                    </View>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => {
                        const bankTitle = paymentInfo?.va_bank_name || 'Bank Syariah Indonesia (BSI)';
                        const sName = paymentInfo?.student_name || studentFullName;
                        Share.share({
                          message: `Nomor Virtual Account ${bankTitle}\nAnanda: ${sName}\nNomor VA: ${paymentInfo.student_va}\nInstitusi: ${paymentInfo?.institution_name || 'Yayasan Sekolah Terpadu'}`,
                        });
                      }}
                      style={styles.vaShareBtn}
                      accessibilityRole="button"
                      accessibilityLabel="Bagikan Nomor Virtual Account"
                    >
                      <MaterialCommunityIcons name="share-variant-outline" size={13} color="#047857" />
                      <Text style={styles.vaShareBtnText}>Bagikan VA</Text>
                    </TouchableOpacity>
                  </View>

                  <Text style={styles.vaStudentName}>
                    Ananda: <Text style={{ fontWeight: '800' }}>{paymentInfo?.student_name || studentFullName}</Text>
                  </Text>

                  <View style={styles.vaNumberBox}>
                    <Text selectable style={styles.vaNumberText}>
                      {paymentInfo.student_va}
                    </Text>
                  </View>

                  <View style={styles.vaNoticeRow}>
                    <MaterialCommunityIcons name="information-outline" size={14} color="#059669" />
                    <Text style={styles.vaHelperText}>
                      Pembayaran via {paymentInfo?.va_bank_name || 'Bank'}, Mobile Banking, ATM, atau Transfer Antar-Bank. Terverifikasi otomatis oleh sistem.
                    </Text>
                  </View>
                </View>
              ) : null}

              {/* ── 3. SEARCH & FILTER TABS BAR ── */}
              <View style={styles.searchFilterContainer}>
                {/* Search Input Bar */}
                <View style={styles.searchBox}>
                  <MaterialCommunityIcons name="magnify" size={20} color="#059669" style={{ marginRight: 8 }} />
                  <TextInput
                    placeholder="Cari tagihan (misal: SPP, Ujian, Gedung)..."
                    placeholderTextColor="#94A3B8"
                    value={search}
                    onChangeText={setSearch}
                    style={styles.searchInput}
                    returnKeyType="search"
                  />
                  {search.length > 0 && (
                    <TouchableOpacity onPress={() => setSearch('')} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
                      <MaterialCommunityIcons name="close-circle" size={18} color="#94A3B8" />
                    </TouchableOpacity>
                  )}
                </View>

                {/* Filter Chips Bar */}
                <View style={styles.filterRow}>
                  {[
                    { id: 'all', label: 'Semua', count: stats.totalCount },
                    { id: 'unpaid', label: 'Belum Lunas', count: stats.countUnpaid },
                    { id: 'paid', label: 'Lunas', count: stats.countPaid },
                  ].map((item) => {
                    const isActive = filter === item.id;
                    return (
                      <TouchableOpacity
                        key={item.id}
                        activeOpacity={0.8}
                        onPress={() => setFilter(item.id as any)}
                        style={[styles.filterChip, isActive && styles.filterChipActive]}
                      >
                        <Text style={[styles.filterChipText, isActive && styles.filterChipTextActive]}>
                          {item.label}
                        </Text>
                        <View style={[styles.filterCountBadge, isActive && styles.filterCountBadgeActive]}>
                          <Text style={[styles.filterCountText, isActive && styles.filterCountTextActive]}>
                            {item.count}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              </View>

              {/* ── 5. LIST DAFTAR TAGIHAN ── */}
              {loading ? (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator color="#059669" size="large" />
                  <Text style={styles.loadingText}>Memuat rincian tagihan ananda...</Text>
                </View>
              ) : filteredBills.length === 0 ? (
                <View style={styles.emptyCard}>
                  <View style={styles.emptyIconCircle}>
                    <MaterialCommunityIcons name="receipt" size={36} color="#059669" />
                  </View>
                  <Text style={styles.emptyTitle}>
                    {search ? 'Tidak Ditemukan' : 'Belum Ada Tagihan'}
                  </Text>
                  <Text style={styles.emptyText}>
                    {search
                      ? `Tidak ada data tagihan yang sesuai kata kunci "${search}".`
                      : filter === 'unpaid'
                      ? 'Alhamdulillah, seluruh tagihan pendidikan ananda telah lunas.'
                      : 'Belum ada rincian tagihan pada filter ini.'}
                  </Text>
                </View>
              ) : (
                <View style={styles.billsListWrapper}>
                  {unpaidBills.length > 0 && (
                    <View style={styles.batchActionRow}>
                      <TouchableOpacity
                        activeOpacity={0.7}
                        onPress={handleSelectAllUnpaid}
                        style={styles.batchSelectBtn}
                      >
                        <MaterialCommunityIcons
                          name={selectedBillIds.length === unpaidBills.length ? 'checkbox-marked' : 'checkbox-blank-outline'}
                          size={18}
                          color="#004D32"
                        />
                        <Text style={styles.batchSelectText}>
                          {selectedBillIds.length === unpaidBills.length
                            ? 'Batal Pilih Semua'
                            : `Pilih Semua Belum Lunas (${unpaidBills.length})`}
                        </Text>
                      </TouchableOpacity>
                      {selectedBillIds.length > 0 && (
                        <View style={styles.batchCountPill}>
                          <Text style={styles.batchCountPillText}>{selectedBillIds.length} dipilih</Text>
                        </View>
                      )}
                    </View>
                  )}
                  {filteredBills.map((b) => {
                    const isPaid = String(b.status).toUpperCase() === 'PAID';
                    const isSelected = selectedBillIds.includes(String(b.id));
                    const payments = Array.isArray(b.payments) ? b.payments : [];

                    return (
                      <View
                        key={String(b.id)}
                        style={[
                          styles.billCard,
                          isPaid ? styles.billCardPaid : styles.billCardUnpaid,
                          isSelected && styles.billCardSelected,
                        ]}
                      >
                        {/* Header Tagihan */}
                        <View style={styles.billHead}>
                          {!isPaid && (
                            <TouchableOpacity
                              activeOpacity={0.7}
                              onPress={() => toggleSelectBill(String(b.id))}
                              style={styles.billCheckboxTouch}
                            >
                              <MaterialCommunityIcons
                                name={isSelected ? 'checkbox-marked-circle' : 'checkbox-blank-circle-outline'}
                                size={22}
                                color={isSelected ? '#047857' : '#94A3B8'}
                              />
                            </TouchableOpacity>
                          )}
                          <View style={{ flex: 1, paddingRight: 12 }}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                              <View style={styles.billCategoryBadge}>
                                <MaterialCommunityIcons
                                  name="tag-outline"
                                  size={11}
                                  color={isPaid ? '#047857' : '#0284C7'}
                                />
                                <Text
                                  style={[
                                    styles.billCategoryText,
                                    { color: isPaid ? '#047857' : '#0284C7' },
                                  ]}
                                >
                                  {b.fee_category?.name || 'SPP & Biaya Sekolah'}
                                </Text>
                              </View>
                              {b.source === 'sipdei' ? (
                                <View style={styles.sipdeiVerifiedBadge}>
                                  <MaterialCommunityIcons name="check-decagram" size={10} color="#047857" />
                                  <Text style={styles.sipdeiVerifiedText}>SIPDEI</Text>
                                </View>
                              ) : null}
                            </View>

                            <Text numberOfLines={2} style={styles.billTitle}>
                              {b.title}
                            </Text>

                            <View style={styles.billDueDateRow}>
                              <MaterialCommunityIcons name="calendar-clock" size={13} color="#64748B" />
                              <Text style={styles.billDueDate}>
                                Jatuh Tempo: {formatDate(b.due_date)}
                              </Text>
                            </View>
                          </View>

                          <View style={styles.billAmountCol}>
                            <Text style={styles.billAmount}>
                              {formatRupiah(b.amount)}
                            </Text>
                            <View
                              style={[
                                styles.statusBadge,
                                isPaid ? styles.badgePaid : styles.badgeUnpaid,
                              ]}
                            >
                              <MaterialCommunityIcons
                                name={isPaid ? 'check-decagram' : 'clock-outline'}
                                size={12}
                                color={isPaid ? '#047857' : '#B45309'}
                                style={{ marginRight: 3 }}
                              />
                              <Text style={[styles.statusText, isPaid ? styles.textPaid : styles.textUnpaid]}>
                                {isPaid ? 'LUNAS' : 'BELUM LUNAS'}
                              </Text>
                            </View>
                          </View>
                        </View>

                        {/* Riwayat Kuitansi Resmi */}
                        {payments.length > 0 && (
                          <View style={styles.paymentsBox}>
                            <View style={styles.paymentsBoxHeaderRow}>
                              <MaterialCommunityIcons name="receipt-text-check-outline" size={14} color="#047857" />
                              <Text style={styles.paymentsBoxTitle}>Histori Kuitansi Resmi:</Text>
                            </View>
                            {payments.map((p: any) => (
                              <View key={String(p.id)} style={styles.paymentItem}>
                                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                                  <MaterialCommunityIcons name="check-circle" size={14} color="#059669" />
                                  <Text style={styles.paymentInvoice}>
                                    {p.invoice_number || 'INV-RESMI'}
                                  </Text>
                                </View>
                                <Text style={styles.paymentMethod}>
                                  {p.payment_method || 'Transfer'} • {formatDate(p.paid_at)}
                                </Text>
                              </View>
                            ))}
                          </View>
                        )}

                        {!isPaid && (
                          <View style={styles.billCardFooterActions}>
                            <TouchableOpacity
                              activeOpacity={0.8}
                              onPress={() => {
                                setSelectedBillIds([String(b.id)]);
                                setVaResult(null);
                                setPayError(null);
                                setIsPayModalOpen(true);
                              }}
                              style={styles.singlePayBtn}
                            >
                              <MaterialCommunityIcons name="credit-card-outline" size={13} color="#047857" />
                              <Text style={styles.singlePayBtnText}>Bayar via VA</Text>
                            </TouchableOpacity>
                          </View>
                        )}
                      </View>
                    );
                  })}
                </View>
              )}
            </View>
          </View>
        </ScrollView>
      </View>

      {/* ── STICKY FLOATING ACTION BAR FOR VA PAYMENT ── */}
      {selectedBillIds.length > 0 && (
        <View style={[styles.floatingBarContainer, { bottom: bottomInset + 8 }]}>
          <View style={styles.floatingBarInner}>
            <View style={{ flex: 1, marginRight: 12 }}>
              <Text style={styles.floatingBarLabel}>
                {selectedBillIds.length} Tagihan Terpilih
              </Text>
              <Text style={styles.floatingBarTotal}>
                {formatRupiah(selectedTotal)}
              </Text>
            </View>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                setVaResult(null);
                setPayError(null);
                setIsPayModalOpen(true);
              }}
              style={styles.floatingBarPayBtn}
            >
              <LinearGradient
                colors={['#047857', '#004D32']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 0 }}
                style={styles.floatingBarBtnGradient}
              >
                <MaterialCommunityIcons name="bank-transfer" size={18} color="#FFFFFF" />
                <Text style={styles.floatingBarBtnText}>Bayar VA</Text>
              </LinearGradient>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* ── MODAL PEMBAYARAN VIRTUAL ACCOUNT SIPDEI ── */}
      <Modal
        visible={isPayModalOpen}
        transparent
        animationType="slide"
        onRequestClose={() => {
          if (!processingVa) setIsPayModalOpen(false);
        }}
      >
        <View style={styles.vaModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => {
              if (!processingVa) setIsPayModalOpen(false);
            }}
          />
          <View style={[styles.vaModalSheet, { paddingBottom: bottomInset + 16 }]}>
            {/* Header Modal */}
            <View style={styles.vaModalHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <View style={styles.vaHeaderIconBadge}>
                  <MaterialCommunityIcons name="credit-card-fast-outline" size={20} color="#047857" />
                </View>
                <View>
                  <Text style={styles.vaModalTitle}>Pembayaran Virtual Account</Text>
                  <Text style={styles.vaModalSubtitle}>Integrasi SIPDEI Bank Nagari & BSI</Text>
                </View>
              </View>
              <TouchableOpacity
                disabled={processingVa}
                onPress={() => setIsPayModalOpen(false)}
                style={styles.vaCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: 480 }}>
              {vaResult ? (
                /* ── HASIL NOMOR VA DITERBITKAN ── */
                <View style={styles.vaSuccessCard}>
                  <View style={styles.vaSuccessBadgeRow}>
                    <View style={styles.vaSuccessIconCircle}>
                      <MaterialCommunityIcons name="check-decagram" size={28} color="#059669" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.vaSuccessHeading}>Nomor VA Berhasil Diterbitkan!</Text>
                      <Text style={styles.vaSuccessSubheading}>
                        {vaResult.nama_bank || (selectedBank === 'NAGARI' ? 'Bank Nagari' : 'Bank Syariah Indonesia')}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.vaNumberContainer}>
                    <Text style={styles.vaNumberLabel}>NOMOR VIRTUAL ACCOUNT</Text>
                    <Text selectable style={styles.vaNumberText}>
                      {vaResult.nomor_va || '-'}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={async () => {
                        try {
                          await Share.share({
                            message: `Pembayaran Tagihan Siswa ${vaResult.nama_siswa || ''}\nBank: ${vaResult.nama_bank || selectedBank}\nNo. Virtual Account: ${vaResult.nomor_va}\nTotal Bayar: ${formatRupiah(vaResult.total_bayar)}\nBatas Waktu: ${vaResult.expired_at || '-'}\n\nPanduan: ${vaResult.panduan_pembayaran_pdf || '-'}`,
                          });
                        } catch (e) {
                          Alert.alert('Salin VA', `Nomor VA: ${vaResult.nomor_va}`);
                        }
                      }}
                      style={styles.vaCopyBtn}
                    >
                      <MaterialCommunityIcons name="share-variant-outline" size={15} color="#047857" />
                      <Text style={styles.vaCopyBtnText}>Salin & Bagikan Info VA</Text>
                    </TouchableOpacity>
                  </View>

                  <View style={styles.vaDetailRowsBox}>
                    <View style={styles.vaDetailRow}>
                      <Text style={styles.vaDetailRowLabel}>Nama Siswa</Text>
                      <Text style={styles.vaDetailRowValue}>{vaResult.nama_siswa || '-'}</Text>
                    </View>
                    <View style={styles.vaDetailRow}>
                      <Text style={styles.vaDetailRowLabel}>NIS Pembayaran</Text>
                      <Text style={styles.vaDetailRowValue}>{vaResult.nis_pembayaran || '-'}</Text>
                    </View>
                    <View style={styles.vaDetailRow}>
                      <Text style={styles.vaDetailRowLabel}>Total Tagihan VA</Text>
                      <Text style={[styles.vaDetailRowValue, { color: '#047857', fontWeight: '800' }]}>
                        {formatRupiah(vaResult.total_bayar)}
                      </Text>
                    </View>
                    <View style={styles.vaDetailRow}>
                      <Text style={styles.vaDetailRowLabel}>Batas Pembayaran</Text>
                      <Text style={[styles.vaDetailRowValue, { color: '#B45309', fontWeight: '700' }]}>
                        {vaResult.expired_at || '-'}
                      </Text>
                    </View>
                  </View>

                  {vaResult.panduan_pembayaran_pdf ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => Linking.openURL(vaResult.panduan_pembayaran_pdf)}
                      style={styles.vaPdfBtn}
                    >
                      <MaterialCommunityIcons name="file-pdf-box" size={18} color="#DC2626" />
                      <Text style={styles.vaPdfBtnText}>Buka Petunjuk Pembayaran (PDF Resmi)</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    activeOpacity={0.85}
                    onPress={() => {
                      setVaResult(null);
                      setIsPayModalOpen(false);
                      setSelectedBillIds([]);
                    }}
                    style={styles.vaDoneBtn}
                  >
                    <Text style={styles.vaDoneBtnText}>Selesai & Tutup</Text>
                  </TouchableOpacity>
                </View>
              ) : (
                /* ── FORM PEMILIHAN BANK & REVIEW TAGIHAN ── */
                <View>
                  {payError ? (
                    <View style={styles.vaErrorBox}>
                      <MaterialCommunityIcons name="alert-circle-outline" size={18} color="#DC2626" />
                      <Text style={styles.vaErrorText}>{payError}</Text>
                    </View>
                  ) : null}

                  {/* Pilihan Bank */}
                  <Text style={styles.vaSectionTitle}>Pilih Saluran Virtual Account:</Text>
                  <View style={{ gap: 10, marginBottom: 16 }}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setSelectedBank('NAGARI')}
                      style={[
                        styles.bankOptionCard,
                        selectedBank === 'NAGARI' && styles.bankOptionCardActive,
                      ]}
                    >
                      <View style={styles.bankRadioCircle}>
                        {selectedBank === 'NAGARI' && <View style={styles.bankRadioDot} />}
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.bankOptionName}>Bank Nagari (Virtual Account)</Text>
                        <Text style={styles.bankOptionDesc}>
                          Mendukung ATM & Mobile Banking Nagari. Format VA: 95 + NIS
                        </Text>
                      </View>
                      <View style={[styles.bankBadge, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                        <Text style={[styles.bankBadgeText, { color: '#1D4ED8' }]}>NAGARI</Text>
                      </View>
                    </TouchableOpacity>

                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setSelectedBank('BSI')}
                      style={[
                        styles.bankOptionCard,
                        selectedBank === 'BSI' && styles.bankOptionCardActive,
                      ]}
                    >
                      <View style={styles.bankRadioCircle}>
                        {selectedBank === 'BSI' && <View style={styles.bankRadioDot} />}
                      </View>
                      <View style={{ flex: 1, marginLeft: 12 }}>
                        <Text style={styles.bankOptionName}>Bank Syariah Indonesia (BSI)</Text>
                        <Text style={styles.bankOptionDesc}>
                          Mendukung BSI Mobile, BYOND & ATM BSI. Format VA: NIS
                        </Text>
                      </View>
                      <View style={[styles.bankBadge, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}>
                        <Text style={[styles.bankBadgeText, { color: '#047857' }]}>BSI</Text>
                      </View>
                    </TouchableOpacity>
                  </View>

                  {/* Ringkasan Item Terpilih */}
                  <Text style={styles.vaSectionTitle}>Rincian Tagihan yang Dibayar ({selectedBillsData.length}):</Text>
                  <View style={styles.vaBillsSummaryBox}>
                    {selectedBillsData.map((item, idx) => (
                      <View key={String(item.id || idx)} style={styles.vaBillSummaryRow}>
                        <View style={{ flex: 1, paddingRight: 8 }}>
                          <Text numberOfLines={1} style={styles.vaBillSummaryTitle}>
                            {item.title}
                          </Text>
                          <Text style={styles.vaBillSummaryCategory}>
                            {item.fee_category?.name || 'SPP'}
                          </Text>
                        </View>
                        <Text style={styles.vaBillSummaryAmount}>
                          {formatRupiah(item.remaining_amount || item.amount || 0)}
                        </Text>
                      </View>
                    ))}
                    <View style={styles.vaTotalRow}>
                      <Text style={styles.vaTotalLabel}>Total Nominal Bayar:</Text>
                      <Text style={styles.vaTotalValue}>{formatRupiah(selectedTotal)}</Text>
                    </View>
                  </View>

                  {/* Catatan SIPDEI */}
                  <View style={styles.vaNoticeBox}>
                    <MaterialCommunityIcons name="information" size={16} color="#0284C7" />
                    <Text style={styles.vaNoticeText}>
                      Penting: Pembuatan kode Virtual Account baru akan menggantikan sesi pembayaran sebelumnya yang belum lunas di server SIPDEI.
                    </Text>
                  </View>

                  {/* Tombol Terbitkan VA */}
                  <TouchableOpacity
                    activeOpacity={0.85}
                    disabled={processingVa || selectedBillsData.length === 0}
                    onPress={handleCreateVaPayment}
                    style={styles.vaSubmitBtn}
                  >
                    <LinearGradient
                      colors={['#059669', '#004D32']}
                      start={{ x: 0, y: 0 }}
                      end={{ x: 1, y: 0 }}
                      style={styles.vaSubmitGradient}
                    >
                      {processingVa ? (
                        <ActivityIndicator color="#FFFFFF" size="small" />
                      ) : (
                        <>
                          <MaterialCommunityIcons name="shield-check" size={18} color="#FFFFFF" />
                          <Text style={styles.vaSubmitText}>
                            Terbitkan Nomor VA ({selectedBank})
                          </Text>
                        </>
                      )}
                    </LinearGradient>
                  </TouchableOpacity>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL PILIH ANANDA ── */}
      <Modal
        visible={showChildSelectorModal}
        transparent
        animationType="fade"
        onRequestClose={() => setShowChildSelectorModal(false)}
      >
        <View style={styles.childModalBackdrop}>
          <TouchableOpacity
            style={StyleSheet.absoluteFill}
            activeOpacity={1}
            onPress={() => setShowChildSelectorModal(false)}
          />
          <View style={styles.childModalSheet}>
            <View style={styles.childModalHeader}>
              <Text style={styles.childModalTitle}>Pilih Ananda</Text>
              <TouchableOpacity onPress={() => setShowChildSelectorModal(false)}>
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
            <ScrollView style={{ maxHeight: 320 }}>
              {children.map((c: any, idx: number) => {
                const cId = String(c.id || c.student_id);
                const isSelected = cId === String(selectedChildId);
                const cName =
                  (typeof c.name === 'string' && c.name) ||
                  (typeof c.nama_lengkap === 'string' && c.nama_lengkap) ||
                  (typeof c.full_name === 'string' && c.full_name) ||
                  'Ananda';
                const cUnit =
                  c.educationUnit?.name ||
                  c.education_unit?.name ||
                  c.unit_name ||
                  c.education_unit_name ||
                  c.kelas?.unit_pendidikan?.name ||
                  c.kelas?.unitPendidikan?.name ||
                  '';
                const cClass =
                  c.kelas?.nama_kelas ||
                  c.kelas?.name ||
                  c.class?.name ||
                  c.class_name ||
                  '';

                return (
                  <TouchableOpacity
                    key={cId || idx}
                    activeOpacity={0.8}
                    onPress={() => handleSelectChild(cId)}
                    style={[
                      styles.childModalItem,
                      isSelected && styles.childModalItemActive,
                    ]}
                  >
                    <Image
                      source={getStudentAvatarSource(c)}
                      style={styles.childModalAvatar}
                      resizeMode="cover"
                    />
                    <View style={{ flex: 1, marginLeft: 12 }}>
                      <Text
                        style={[
                          styles.childModalItemName,
                          isSelected && { color: '#004D32', fontWeight: '800' },
                        ]}
                      >
                        {cName}
                      </Text>
                      <Text style={styles.childModalItemSub}>
                        {cUnit ? `${cUnit} • ` : ''}{cClass || 'Siswa'}
                      </Text>
                    </View>
                    {isSelected && (
                      <MaterialCommunityIcons name="check-circle" size={20} color="#004D32" />
                    )}
                  </TouchableOpacity>
                );
              })}
            </ScrollView>
          </View>
        </View>
      </Modal>

      {/* ── MODAL KARTU PELAJAR (KTS) ── */}
      <StudentIdCardModal
        visible={!!selectedIdCardStudent}
        student={selectedIdCardStudent}
        onClose={() => setSelectedIdCardStudent(null)}
      />
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
    overflow: 'hidden',
  },
  topFoliageBgImage: {
    width: '100%',
    height: '100%',
  },
  cleanTopHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  cleanHeaderIconBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 4,
    elevation: 3,
  },
  cleanHeaderTitle: {
    fontSize: 17,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.2,
  },
  cleanBellDot: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#EF4444',
    borderWidth: 1.5,
    borderColor: '#FFFFFF',
  },
  sheetContainer: {
    flex: 1,
    overflow: 'hidden',
  },
  screen: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  cleanMainScrollContent: {
    flexGrow: 1,
    paddingTop: 8,
  },
  cleanScrollInner: {
    width: '100%',
  },
  bodyContentWrapper: {
    paddingHorizontal: 16,
    paddingTop: 8,
  },

  /* 0. Open Profile Row */
  studentProfileRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
    paddingHorizontal: 4,
  },
  studentAvatarRing: {
    width: 60,
    height: 60,
    borderRadius: 30,
    borderWidth: 2.5,
    borderColor: '#10B981',
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 3,
  },
  studentAvatarImg: {
    width: '100%',
    height: '100%',
  },
  studentProfileInfoCol: {
    flex: 1,
    marginLeft: 14,
    justifyContent: 'center',
  },
  studentNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  studentProfileName: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
    letterSpacing: -0.3,
  },
  studentMetaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 2,
  },
  studentProfileUnitText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#065F46',
  },
  studentProfileClassText: {
    fontSize: 11.5,
    fontWeight: '600',
    color: '#047857',
  },
  studentActionBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 6,
  },
  parentGantiAnakBtn: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D32',
    paddingHorizontal: 12,
    paddingVertical: 5,
    borderRadius: 999,
    gap: 4,
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 4,
    elevation: 2,
  },
  parentGantiAnakBtnText: {
    fontSize: 11.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  studentStatusBadgeText: {
    fontSize: 11,
    fontWeight: '800',
  },

  /* Error Banner */
  errorBannerBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF1F2',
    borderWidth: 1.5,
    borderColor: '#FECDD3',
    borderRadius: 14,
    padding: 10,
    gap: 10,
    marginBottom: 14,
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

  /* 1. Stats KPI Grid */
  statsGrid: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  statCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    padding: 10,
    alignItems: 'flex-start',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 3,
    elevation: 1,
  },
  statIconBadgeGreen: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statIconBadgeBlue: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#EFF6FF',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statIconBadgeAmber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#FEF3C7',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  statLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
  },
  statValue: {
    fontSize: 12,
    fontWeight: '900',
    marginTop: 2,
  },
  statCountText: {
    fontSize: 9,
    fontWeight: '600',
    color: '#059669',
    marginTop: 2,
  },

  /* 2. BSI Virtual Account */
  vaCardWrapper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 14,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  vaHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  vaBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DCFCE7',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#BBF7D0',
  },
  vaBadgeText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.5,
  },
  vaShareBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: 9,
    paddingVertical: 4,
    borderRadius: 8,
  },
  vaShareBtnText: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  vaStudentName: {
    fontSize: 12,
    color: '#334155',
    marginBottom: 6,
  },
  vaNumberBox: {
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
  },
  vaNumberText: {
    fontSize: 18,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '900',
    color: '#004D32',
    letterSpacing: 1.5,
  },
  vaNoticeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  vaHelperText: {
    flex: 1,
    fontSize: 10.5,
    color: '#059669',
    lineHeight: 15,
  },

  /* 3. Info Rekening Resmi */
  rekeningBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
    borderRadius: 14,
    padding: 12,
    marginBottom: 14,
  },
  rekeningIconBox: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#D1FAE5',
  },
  rekeningTitle: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
  },
  rekeningText: {
    fontSize: 11.5,
    color: '#0F172A',
    marginTop: 1,
  },
  rekeningBold: {
    fontWeight: '900',
    color: '#004D32',
  },

  /* 4. Search & Filter Bar */
  searchFilterContainer: {
    marginBottom: 14,
    gap: 10,
  },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 10 : 6,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  searchInput: {
    flex: 1,
    fontSize: 12.5,
    color: '#0F172A',
    fontWeight: '600',
    padding: 0,
  },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 7,
    paddingHorizontal: 14,
    borderRadius: 999,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.2,
    borderColor: '#A7F3D0',
  },
  filterChipActive: {
    backgroundColor: '#004D32',
    borderColor: '#004D32',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#475569',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  filterCountBadge: {
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 8,
  },
  filterCountBadgeActive: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
  },
  filterCountText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
  },
  filterCountTextActive: {
    color: '#FFFFFF',
  },

  /* 5. Bills List */
  loadingContainer: {
    alignItems: 'center',
    paddingVertical: 40,
    gap: 8,
  },
  loadingText: {
    fontSize: 12,
    color: '#059669',
    fontWeight: '700',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    padding: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  emptyIconCircle: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#004D32',
  },
  emptyText: {
    fontSize: 12,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 4,
    maxWidth: 260,
    lineHeight: 18,
  },
  billsListWrapper: {
    gap: 12,
  },
  billCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    borderWidth: 1.5,
    padding: 14,
    gap: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 4,
    elevation: 2,
  },
  billCardPaid: {
    borderColor: '#A7F3D0',
  },
  billCardUnpaid: {
    borderColor: '#E2E8F0',
  },
  billHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  billCategoryBadge: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 7,
    paddingVertical: 2,
    borderRadius: 6,
    marginBottom: 4,
  },
  billCategoryText: {
    fontSize: 9.5,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  sipdeiVerifiedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    backgroundColor: '#DCFCE7',
    borderWidth: 1,
    borderColor: '#86EFAC',
    paddingHorizontal: 6,
    paddingVertical: 1.5,
    borderRadius: 6,
  },
  sipdeiVerifiedText: {
    fontSize: 9,
    fontWeight: '900',
    color: '#047857',
    letterSpacing: 0.4,
  },
  billTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  billDueDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 4,
  },
  billDueDate: {
    fontSize: 11,
    color: '#64748B',
  },
  billAmountCol: {
    alignItems: 'flex-end',
  },
  billAmount: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#004D32',
  },
  statusBadge: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 8,
  },
  badgePaid: {
    backgroundColor: '#D1FAE5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  badgeUnpaid: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  statusText: {
    fontSize: 9.5,
    fontWeight: '900',
  },
  textPaid: {
    color: '#047857',
  },
  textUnpaid: {
    color: '#B45309',
  },
  paymentsBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    gap: 6,
    borderTopWidth: 1,
    borderColor: '#F1F5F9',
  },
  paymentsBoxHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  paymentsBoxTitle: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#047857',
  },
  paymentItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  paymentInvoice: {
    fontSize: 10.5,
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    fontWeight: '700',
    color: '#1E293B',
  },
  paymentMethod: {
    fontSize: 10.5,
    color: '#64748B',
  },

  /* Modal Pilih Ananda */
  childModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.6)',
    justifyContent: 'flex-end',
  },
  childModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    padding: 20,
    paddingBottom: 36,
  },
  childModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  childModalTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalItem: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    marginBottom: 8,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    shadowColor: '#004D32',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  childModalItemActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#004D32',
  },
  childModalAvatar: {
    width: 44,
    height: 44,
    borderRadius: 22,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  childModalItemName: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
  },
  childModalItemSub: {
    fontSize: 11.5,
    color: '#047857',
    marginTop: 2,
  },

  /* Batch Selection & Checkbox */
  batchActionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
    paddingHorizontal: 4,
  },
  batchSelectBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    backgroundColor: '#E6F4EA',
    borderRadius: 8,
  },
  batchSelectText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#004D32',
  },
  batchCountPill: {
    backgroundColor: '#004D32',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  batchCountPillText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  billCardSelected: {
    borderColor: '#059669',
    backgroundColor: '#F0FDF4',
    borderWidth: 2,
  },
  billCheckboxTouch: {
    marginRight: 10,
    justifyContent: 'center',
  },
  billCardFooterActions: {
    marginTop: 10,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  singlePayBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: '#ECFDF5',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  singlePayBtnText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#047857',
  },

  /* Sticky Floating Action Bar */
  floatingBarContainer: {
    position: 'absolute',
    left: 16,
    right: 16,
    zIndex: 40,
  },
  floatingBarInner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#004D32',
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 12,
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
    borderWidth: 1.5,
    borderColor: '#059669',
  },
  floatingBarLabel: {
    fontSize: 11,
    fontWeight: '600',
    color: '#A7F3D0',
    textTransform: 'uppercase',
  },
  floatingBarTotal: {
    fontSize: 17,
    fontWeight: '900',
    color: '#FFFFFF',
    marginTop: 2,
  },
  floatingBarPayBtn: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  floatingBarBtnGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#34D399',
  },
  floatingBarBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },

  /* Modal Pembayaran VA SIPDEI */
  vaModalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  vaModalSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 26,
    borderTopRightRadius: 26,
    padding: 20,
    maxHeight: '90%',
  },
  vaModalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 14,
  },
  vaHeaderIconBadge: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  vaModalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#004D32',
  },
  vaModalSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  vaCloseBtn: {
    padding: 6,
    borderRadius: 8,
    backgroundColor: '#F8FAFC',
  },
  vaSectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
    marginBottom: 8,
  },
  bankOptionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    backgroundColor: '#F8FAFC',
  },
  bankOptionCardActive: {
    borderColor: '#047857',
    backgroundColor: '#ECFDF5',
  },
  bankRadioCircle: {
    width: 20,
    height: 20,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: '#047857',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bankRadioDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#047857',
  },
  bankOptionName: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  bankOptionDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  bankBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  bankBadgeText: {
    fontSize: 10.5,
    fontWeight: '800',
  },
  vaBillsSummaryBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  vaBillSummaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  vaBillSummaryTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
  },
  vaBillSummaryCategory: {
    fontSize: 10.5,
    color: '#64748B',
  },
  vaBillSummaryAmount: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  vaTotalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
    paddingTop: 6,
  },
  vaTotalLabel: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#004D32',
  },
  vaTotalValue: {
    fontSize: 15,
    fontWeight: '900',
    color: '#047857',
  },
  vaNoticeBox: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
    padding: 10,
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: 16,
  },
  vaNoticeText: {
    flex: 1,
    fontSize: 10.5,
    color: '#0369A1',
    lineHeight: 15,
  },
  vaSubmitBtn: {
    borderRadius: 14,
    overflow: 'hidden',
    marginTop: 4,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 6,
    elevation: 3,
  },
  vaSubmitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 13,
  },
  vaSubmitText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  vaErrorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FEF2F2',
    borderWidth: 1,
    borderColor: '#FECACA',
    borderRadius: 10,
    padding: 10,
    marginBottom: 12,
  },
  vaErrorText: {
    flex: 1,
    fontSize: 11.5,
    color: '#B91C1C',
  },

  /* VA Success Card */
  vaSuccessCard: {
    paddingVertical: 4,
  },
  vaSuccessBadgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#ECFDF5',
    padding: 14,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    marginBottom: 14,
  },
  vaSuccessIconCircle: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  vaSuccessHeading: {
    fontSize: 14,
    fontWeight: '800',
    color: '#004D32',
  },
  vaSuccessSubheading: {
    fontSize: 11.5,
    color: '#047857',
    marginTop: 2,
  },
  vaNumberContainer: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 16,
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  vaNumberLabel: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.8,
  },
  vaNumberText: {
    fontSize: 24,
    fontWeight: '900',
    color: '#004D32',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    letterSpacing: 1.5,
    marginVertical: 8,
  },
  vaCopyBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  vaCopyBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#047857',
  },
  vaDetailRowsBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
    gap: 8,
  },
  vaDetailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  vaDetailRowLabel: {
    fontSize: 11.5,
    color: '#64748B',
  },
  vaDetailRowValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  vaPdfBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 11,
    backgroundColor: '#FEF2F2',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#FECACA',
    marginBottom: 10,
  },
  vaPdfBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#DC2626',
  },
  vaDoneBtn: {
    backgroundColor: '#004D32',
    paddingVertical: 12,
    borderRadius: 12,
    alignItems: 'center',
    marginTop: 4,
  },
  vaDoneBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
