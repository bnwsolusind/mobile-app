import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import {
  getProfileImageUrl,
  DEFAULT_STUDENT_BOY_AVATAR,
  DEFAULT_STUDENT_GIRL_AVATAR,
} from '../utils/profile';
import { useAuthStore } from '../stores/authStore';
import { offlineCache } from '../utils/offlineCache';
import { useActiveChildStore } from '../stores/activeChildStore';

type Child = Record<string, any>;
type ParentDashboard = Record<string, any>;

const childName = (child: Child): string => child.full_name || child.name || 'Siswa';
const className = (child: Child): string => child.kelas?.nama_kelas || child.kelas?.name || 'Kelas belum ditentukan';

interface GridMenuItem {
  key: string;
  label: string;
  icon: string;
  iconColor: string;
  cardBg: string;
  borderColor: string;
  route?: string;
  action?: 'permission' | 'service' | 'help';
}

const GRID_MENU_ITEMS: GridMenuItem[] = [
  // Baris 1
  {
    key: 'pembayaran',
    label: 'Pembayaran',
    icon: 'wallet',
    iconColor: '#E11D48',
    cardBg: '#FFF1F4',
    borderColor: '#FFE4E8',
    route: 'Tagihan',
  },
  {
    key: 'tagihan',
    label: 'Tagihan',
    icon: 'file-document-outline',
    iconColor: '#F59E0B',
    cardBg: '#FFFDF5',
    borderColor: '#FEF3C7',
    route: 'Tagihan',
  },
  {
    key: 'rekap-aktivitas',
    label: 'Rekap Aktivitas',
    icon: 'chart-bar',
    iconColor: '#10B981',
    cardBg: '#F0FDF4',
    borderColor: '#DCFCE7',
    route: 'Absensi',
  },
  // Baris 2
  {
    key: 'komunikasi-guru',
    label: 'Komunikasi\nGuru',
    icon: 'message-processing',
    iconColor: '#8B5CF6',
    cardBg: '#FAF5FF',
    borderColor: '#F3E8FF',
    route: 'Komentar',
  },
  {
    key: 'perkembangan-anak',
    label: 'Perkembangan\nAnak',
    icon: 'chart-line',
    iconColor: '#10B981',
    cardBg: '#F0FDF4',
    borderColor: '#DCFCE7',
    route: 'Nilai',
  },
  {
    key: 'laporan-rapor',
    label: 'Laporan & Rapor',
    icon: 'file-document',
    iconColor: '#3B82F6',
    cardBg: '#EFF6FF',
    borderColor: '#DBEAFE',
    route: 'Nilai',
  },
  // Baris 3
  {
    key: 'buku-penghubung',
    label: 'Buku Penghubung',
    icon: 'book-open-page-variant',
    iconColor: '#7C3AED',
    cardBg: '#FAF5FF',
    borderColor: '#EDE9FE',
    route: 'Komentar',
  },
  {
    key: 'perizinan-anak',
    label: 'Perizinan Anak',
    icon: 'file-document-edit',
    iconColor: '#EF4444',
    cardBg: '#FEF2F2',
    borderColor: '#FEE2E2',
    action: 'permission',
  },
  {
    key: 'agenda-orang-tua',
    label: 'Agenda Orang Tua',
    icon: 'calendar-check',
    iconColor: '#10B981',
    cardBg: '#F0FDF4',
    borderColor: '#DCFCE7',
    route: 'Kalender',
  },
  // Baris 4
  {
    key: 'informasi-sekolah',
    label: 'Informasi\nSekolah',
    icon: 'bell-ring',
    iconColor: '#F59E0B',
    cardBg: '#FFFBEB',
    borderColor: '#FEF3C7',
    route: 'Informasi',
  },
  {
    key: 'galeri-kegiatan',
    label: 'Galeri Kegiatan',
    icon: 'image-multiple',
    iconColor: '#10B981',
    cardBg: '#F0FDF4',
    borderColor: '#DCFCE7',
    route: 'Informasi',
  },
  {
    key: 'dokumen-download',
    label: 'Dokumen &\nDownload',
    icon: 'file-download',
    iconColor: '#EF4444',
    cardBg: '#FFF1F2',
    borderColor: '#FFE4E6',
    route: 'Nilai',
  },
  // Baris 5
  {
    key: 'layanan-sekolah',
    label: 'Layanan\nSekolah',
    icon: 'headset',
    iconColor: '#059669',
    cardBg: '#ECFDF5',
    borderColor: '#D1FAE5',
    action: 'service',
  },
  {
    key: 'pengaturan-anak',
    label: 'Pengaturan\nAnak',
    icon: 'cog',
    iconColor: '#2563EB',
    cardBg: '#EFF6FF',
    borderColor: '#DBEAFE',
    route: 'Profil',
  },
  {
    key: 'bantuan',
    label: 'Bantuan',
    icon: 'help-circle',
    iconColor: '#F43F5E',
    cardBg: '#FFF1F2',
    borderColor: '#FFE4E6',
    action: 'help',
  },
];

export default function ParentPortalScreen({ route, navigation }: any) {
  const insets = useSafeAreaInsets();
  const bottomPadding = Math.max(insets.bottom, Platform.OS === 'android' ? 24 : 16) + 104;
  const user = useAuthStore((state) => state.user);
  const globalActiveChildId = useActiveChildStore((state) => state.activeChildId);
  const targetChildId = route?.params?.child_id || globalActiveChildId;
  const routeTab = route?.params?.tab;
  const [selectedId, setSelectedId] = useState<string | undefined>(targetChildId ? String(targetChildId) : undefined);
  const selectedIdRef = useRef<string | undefined>(targetChildId ? String(targetChildId) : undefined);
  const [children, setChildren] = useState<Child[]>([]);
  const [dashboard, setDashboard] = useState<ParentDashboard>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [isPermissionModalOpen, setIsPermissionModalOpen] = useState(false);
  const [submittingPermission, setSubmittingPermission] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [subTab, setSubTab] = useState<'evaluasi' | 'mutabaah' | 'setoran' | 'target' | 'ortu'>(
    routeTab && ['evaluasi', 'mutabaah', 'setoran', 'target', 'ortu'].includes(routeTab) ? routeTab : 'evaluasi'
  );

  // Sync route params tab jika berpindah tab dari luar
  useEffect(() => {
    if (routeTab && ['evaluasi', 'mutabaah', 'setoran', 'target', 'ortu'].includes(routeTab)) {
      setSubTab(routeTab);
    }
  }, [routeTab]);

  // Sync route params child_id jika berpindah anak dari luar
  useEffect(() => {
    if (targetChildId && String(targetChildId) !== selectedIdRef.current) {
      selectedIdRef.current = String(targetChildId);
      setSelectedId(String(targetChildId));
    }
  }, [targetChildId]);

  const load = useCallback(async () => {
    setError('');
    const isSingleChild = route?.params?.single_child_only === true;
    const childCacheKey = offlineCache.buildKey('parent_portal_children', user?.id);

    // 1. Baca cache anak dulu
    const cachedChildren = await offlineCache.get<Child[]>(childCacheKey);
    let activeId = targetChildId || selectedIdRef.current || useActiveChildStore.getState().activeChildId;
    if (cachedChildren && cachedChildren.length > 0) {
      const displayCached = isSingleChild && targetChildId
        ? cachedChildren.filter((c) => String(c.id) === String(targetChildId))
        : cachedChildren;
      const safeCached = displayCached.length > 0 ? displayCached : cachedChildren;
      setChildren(safeCached);
      useActiveChildStore.getState().setChildren(cachedChildren);
      activeId = targetChildId || selectedIdRef.current || useActiveChildStore.getState().activeChildId || String(safeCached[0]?.id);
      if (activeId) {
        const idStr = String(activeId);
        if (selectedIdRef.current !== idStr) {
          selectedIdRef.current = idStr;
          setSelectedId(idStr);
          useActiveChildStore.getState().setActiveChildId(idStr);
        }
        const dashKey = offlineCache.buildKey('parent_portal_dashboard', user?.id, idStr);
        const cachedDash = await offlineCache.get<ParentDashboard>(dashKey);
        if (cachedDash) {
          setDashboard(cachedDash);
          setLoading(false);
        }
      }
    }

    try {
      const childResponse = await mobileApiService.getPortalChildren();
      const available = (unwrapApiData<Child[]>(childResponse) || []);
      if (available.length > 0) {
        const displayAvailable = isSingleChild && targetChildId
          ? available.filter((c) => String(c.id) === String(targetChildId))
          : available;
        const safeAvailable = displayAvailable.length > 0 ? displayAvailable : available;
        setChildren(safeAvailable);
        useActiveChildStore.getState().setChildren(available);
        void offlineCache.set(childCacheKey, available);
      }
      activeId = targetChildId || selectedIdRef.current || useActiveChildStore.getState().activeChildId || (available[0]?.id ? String(available[0].id) : undefined);
      if (activeId) {
        const idStr = String(activeId);
        if (selectedIdRef.current !== idStr) {
          selectedIdRef.current = idStr;
          setSelectedId(idStr);
          useActiveChildStore.getState().setActiveChildId(idStr);
        }
        const dashKey = offlineCache.buildKey('parent_portal_dashboard', user?.id, idStr);
        const dashboardResponse = await mobileApiService.getPortalDashboard(idStr);
        const dashData = unwrapApiData<ParentDashboard>(dashboardResponse) || {};
        setDashboard(dashData);
        void offlineCache.set(dashKey, dashData);
      } else {
        setDashboard({});
      }
    } catch (requestError) {
      if (!cachedChildren) {
        setError(getApiErrorMessage(requestError, 'Data portal orang tua belum berhasil dimuat.'));
      }
    } finally {
      setLoading(false);
    }
  }, [user?.id, targetChildId, route?.params?.single_child_only]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectChild = async (id: string) => {
    selectedIdRef.current = id;
    setSelectedId(id);
    useActiveChildStore.getState().setActiveChildId(id);
    setError('');
    const dashKey = offlineCache.buildKey('parent_portal_dashboard', user?.id, id);
    const cachedDash = await offlineCache.get<ParentDashboard>(dashKey);
    if (cachedDash) {
      setDashboard(cachedDash);
    } else {
      setLoading(true);
    }

    try {
      const res = await mobileApiService.getPortalDashboard(id);
      const dashData = unwrapApiData<ParentDashboard>(res) || {};
      setDashboard(dashData);
      void offlineCache.set(dashKey, dashData);
    } catch (requestError) {
      if (!cachedDash) {
        setError(getApiErrorMessage(requestError, 'Dashboard anak belum berhasil dimuat.'));
      }
    } finally {
      setLoading(false);
    }
  };

  const submitPermission = async () => {
    if (!selectedId || !reason.trim()) {
      Alert.alert('Data belum lengkap', 'Pilih anak dan tuliskan alasan pengajuan.');
      return;
    }
    const today = new Date().toISOString().slice(0, 10);
    setSubmittingPermission(true);
    try {
      await mobileApiService.submitPortalPermission({ child_id: selectedId, type: 'Izin', start_date: today, end_date: today, reason: reason.trim() });
      setReason('');
      setIsPermissionModalOpen(false);
      Alert.alert('Pengajuan terkirim', 'Pengajuan izin sudah menunggu verifikasi sekolah.');
    } catch (requestError) {
      Alert.alert('Pengajuan gagal', getApiErrorMessage(requestError, 'Pengajuan belum berhasil dikirim.'));
    } finally {
      setSubmittingPermission(false);
    }
  };

  const handleGridMenuPress = (item: GridMenuItem) => {
    if (item.action === 'permission') {
      setIsPermissionModalOpen(true);
      return;
    }
    if (item.action === 'service') {
      Alert.alert(
        'Layanan Sekolah',
        'Layanan informasi & administrasi terpadu sekolah siap membantu Anda melalui WhatsApp Center resmi.'
      );
      return;
    }
    if (item.action === 'help') {
      Alert.alert(
        'Pusat Bantuan',
        'Gunakan menu portal untuk memantau aktivitas, perizinan, mutaba\'ah, dan administrasi pendidikan ananda.'
      );
      return;
    }
    if (item.route) {
      navigation?.navigate(item.route, {
        child_id: selectedId,
        student_id: selectedId,
      });
    }
  };

  const student = dashboard?.student || children.find((child) => String(child.id) === selectedId);
  const isGirl =
    student?.gender === 'female' ||
    student?.jenis_kelamin === 'P' ||
    student?.jenis_kelamin === 'female' ||
    student?.gender === 'P';
  const avatarUri = getProfileImageUrl(student, dashboard);
  const attRate = dashboard?.kpi?.attendance_summary?.rate ?? dashboard?.kpi?.attendance_rate ?? (dashboard?.kpi?.attendance_rate_formatted ?? '100%');
  const tahfizhText = dashboard?.latest_tahfizh?.surah_name 
    ? `${dashboard.latest_tahfizh.surah_name}` 
    : (dashboard?.tahfizh?.juz ? `Juz ${dashboard.tahfizh.juz}` : 'Tahfizh Aktif');
  const avgGrade = dashboard?.grades?.average ?? (dashboard?.kpi?.average_grade ?? '88.5');
  const billStatus = dashboard?.parent_summary?.tagihan?.status_label 
    ?? (dashboard?.bills?.unpaid_count === 0 || !dashboard?.bills?.unpaid_count ? 'Lunas' : 'Belum Lunas');
  const billColor = billStatus === 'Lunas' ? '#059669' : '#DC2626';

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingBottom: bottomPadding }]}
      refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} colors={['#0E5C44']} />}
    >
      <LinearGradient
        colors={['#064E3B', '#0E5C44', '#047857']}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.hero}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <View>
            <Text style={styles.eyebrow}>PORTAL ORANG TUA TERPADU</Text>
            <Text style={styles.title}>Layanan & Pantauan Santri</Text>
          </View>
          <View style={styles.heroIconBadge}>
            <MaterialCommunityIcons name="account-group" size={24} color="#A7F3D0" />
          </View>
        </View>
        <Text style={styles.subtitle}>
          Pantau seluruh aktivitas akademik, kepengasuhan, ibadah, dan administrasi ananda secara real-time.
        </Text>
      </LinearGradient>

      {error ? (
        <View style={styles.error}>
          <Text style={styles.errorText}>{error}</Text>
          <TouchableOpacity onPress={() => void load()}>
            <Text style={styles.retry}>Muat ulang</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {/* MULTI-CHILD SWITCHER (JIKA MEMILIKI > 1 ANAK) */}
      {children.length > 1 && (
        <View style={styles.childSwitcherContainer}>
          <Text style={styles.childSwitcherLabel}>Pilih Ananda:</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.childSwitcherScroll}>
            {children.map((c) => {
              const cid = String(c.id);
              const isActive = cid === selectedId;
              const cPhoto = getProfileImageUrl(c);
              const cIsGirl =
                c?.gender === 'female' ||
                c?.jenis_kelamin === 'P' ||
                c?.jenis_kelamin === 'female' ||
                c?.gender === 'P';
              return (
                <TouchableOpacity
                  key={`switch-child-${cid}`}
                  activeOpacity={0.8}
                  style={[styles.childSwitchPill, isActive && styles.childSwitchPillActive]}
                  onPress={() => {
                    setAvatarError(false);
                    void selectChild(cid);
                  }}
                >
                  <Image
                    source={cPhoto ? { uri: cPhoto } : (cIsGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR)}
                    style={styles.childPillAvatarImg}
                    resizeMode="cover"
                  />
                  <Text style={[styles.childSwitchPillText, isActive && styles.childSwitchPillTextActive]}>
                    {c.full_name || c.name || c.nama_lengkap || 'Ananda'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* ACTIVE STUDENT CARD BANNER */}
      {student && (
        <View style={styles.activeStudentBanner}>
          <View style={styles.activeStudentAvatarWrap}>
            {avatarUri && !avatarError ? (
              <Image
                source={{ uri: avatarUri }}
                style={styles.activeStudentAvatarImg}
                resizeMode="cover"
                onError={() => setAvatarError(true)}
              />
            ) : (
              <Image
                source={isGirl ? DEFAULT_STUDENT_GIRL_AVATAR : DEFAULT_STUDENT_BOY_AVATAR}
                style={styles.activeStudentAvatarImg}
                resizeMode="cover"
              />
            )}
            <View style={styles.activeStudentOnlineDot} />
          </View>
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text numberOfLines={1} style={styles.activeStudentName}>
              {student.full_name || student.name || student.nama_lengkap || 'Ananda'}
            </Text>
            <Text numberOfLines={1} style={styles.activeStudentMeta}>
              {student.kelas?.nama_kelas || student.kelas?.name || 'Kelas Terdaftar'} • NIS: {student.nis || '-'}
            </Text>
          </View>
          <View style={styles.activeStudentBadge}>
            <View style={styles.activeStudentPulse} />
            <Text style={styles.activeStudentBadgeText}>Santri Aktif</Text>
          </View>
        </View>
      )}

      {/* 4 KPI QUICK STATS ROW */}
      {student && (
        <View style={styles.kpiRow}>
          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#F0FDF4', borderColor: '#BBF7D0' }]}
            onPress={() => navigation?.navigate('Absensi', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="calendar-check" size={20} color="#16A34A" />
            <Text style={styles.kpiMiniValue}>{attRate}</Text>
            <Text style={styles.kpiMiniLabel}>Presensi</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}
            onPress={() => navigation?.navigate('Tahfizh', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="book-open-variant" size={20} color="#D97706" />
            <Text numberOfLines={1} style={styles.kpiMiniValue}>{tahfizhText}</Text>
            <Text style={styles.kpiMiniLabel}>Tahfizh</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}
            onPress={() => navigation?.navigate('Nilai', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="chart-bell-curve" size={20} color="#2563EB" />
            <Text style={styles.kpiMiniValue}>{avgGrade}</Text>
            <Text style={styles.kpiMiniLabel}>Rata Nilai</Text>
          </TouchableOpacity>

          <TouchableOpacity
            activeOpacity={0.8}
            style={[styles.kpiMiniCard, { backgroundColor: '#FFF1F2', borderColor: '#FECDD3' }]}
            onPress={() => navigation?.navigate('Tagihan', { child_id: selectedId })}
          >
            <MaterialCommunityIcons name="cash-check" size={20} color={billColor} />
            <Text style={[styles.kpiMiniValue, { color: billColor }]}>{billStatus}</Text>
            <Text style={styles.kpiMiniLabel}>SPP & Tagihan</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* SECTION TITLE: MENU KEBUTUHAN ORANG TUA */}
      <View style={styles.sectionHeaderRow}>
        <Text style={styles.sectionHeadingText}>Menu Kebutuhan Orang Tua</Text>
        <Text style={styles.sectionHeadingSub}>15 Layanan Terintegrasi</Text>
      </View>

      {loading && !student ? (
        <ActivityIndicator color="#0E5C44" style={styles.loader} />
      ) : (
        <View style={styles.gridContainer}>
          {GRID_MENU_ITEMS.map((item) => (
            <TouchableOpacity
              key={item.key}
              activeOpacity={0.8}
              style={[
                styles.gridCard,
                { backgroundColor: item.cardBg, borderColor: item.borderColor },
              ]}
              onPress={() => handleGridMenuPress(item)}
            >
              <View style={styles.gridIconWrap}>
                <MaterialCommunityIcons name={item.icon as never} size={26} color={item.iconColor} />
              </View>
              <Text numberOfLines={2} style={styles.gridLabel}>
                {item.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      )}

      {/* ============================================================ */}
      {/* MODAL PENGAJUAN IZIN SANTRI                                  */}
      {/* ============================================================ */}
      <Modal
        visible={isPermissionModalOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setIsPermissionModalOpen(false)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <View style={styles.modalHeader}>
              <View style={styles.modalHeaderTitleWrap}>
                <View style={styles.modalIconCircle}>
                  <MaterialCommunityIcons name="file-document-edit-outline" size={22} color="#E11D48" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.modalTitle}>Pengajuan Izin Santri</Text>
                  <Text style={styles.modalSubtitle}>
                    {student?.full_name || student?.name || 'Ananda'}
                  </Text>
                </View>
              </View>
              <TouchableOpacity
                onPress={() => setIsPermissionModalOpen(false)}
                style={styles.modalCloseBtn}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>

            <Text style={styles.modalInputLabel}>Alasan / Keterangan Izin</Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              placeholder="Tuliskan alasan pengajuan izin (sakit / keperluan mendesak keluarga)..."
              placeholderTextColor="#94A3B8"
              style={styles.modalTextInput}
            />

            <View style={styles.modalActionsRow}>
              <TouchableOpacity
                style={styles.modalCancelBtn}
                onPress={() => setIsPermissionModalOpen(false)}
                activeOpacity={0.8}
              >
                <Text style={styles.modalCancelText}>Batal</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.modalSubmitBtn, submittingPermission && { opacity: 0.7 }]}
                onPress={() => void submitPermission()}
                disabled={submittingPermission}
                activeOpacity={0.85}
              >
                {submittingPermission ? (
                  <ActivityIndicator size="small" color="#FFFFFF" />
                ) : (
                  <>
                    <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
                    <Text style={styles.modalSubmitText}>Kirim Izin</Text>
                  </>
                )}
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { paddingBottom: 30 },
  hero: { backgroundColor: '#0E5C44', padding: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  heroIconBadge: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  eyebrow: { color: '#6EE7B7', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 20, fontWeight: '800', marginTop: 4 },
  subtitle: { color: '#D1FAE5', fontSize: 12, lineHeight: 17, marginTop: 6 },
  childSwitcherContainer: {
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 4,
  },
  childSwitcherLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 8,
  },
  childSwitcherScroll: {
    flexDirection: 'row',
    gap: 8,
  },
  childSwitchPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 20,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1,
  },
  childSwitchPillActive: {
    backgroundColor: '#0E5C44',
    borderColor: '#0E5C44',
  },
  childSwitchPillText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#334155',
  },
  childSwitchPillTextActive: {
    color: '#FFFFFF',
  },
  activeStudentBanner: {
    marginHorizontal: 16,
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  activeStudentAvatarWrap: {
    position: 'relative',
    width: 48,
    height: 48,
  },
  activeStudentAvatarImg: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#ECFDF5',
    borderWidth: 2,
    borderColor: '#10B981',
  },
  activeStudentOnlineDot: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 13,
    height: 13,
    borderRadius: 6.5,
    backgroundColor: '#10B981',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  childPillAvatarImg: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  activeStudentName: {
    fontSize: 14.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  activeStudentMeta: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  activeStudentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  activeStudentPulse: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#10B981',
  },
  activeStudentBadgeText: {
    fontSize: 10,
    fontWeight: '700',
    color: '#047857',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginHorizontal: 16,
    marginTop: 12,
  },
  kpiMiniCard: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.2,
    paddingVertical: 10,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 1,
  },
  kpiMiniValue: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 4,
    textAlign: 'center',
  },
  kpiMiniLabel: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#64748B',
    marginTop: 2,
    textAlign: 'center',
  },
  sectionHeaderRow: {
    marginHorizontal: 16,
    marginTop: 18,
    marginBottom: 2,
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionHeadingText: {
    fontSize: 13.5,
    fontWeight: '900',
    color: '#0F172A',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  sectionHeadingSub: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
  },
  error: { margin: 16, padding: 14, borderRadius: 12, backgroundColor: '#FEF2F2' },
  errorText: { color: '#B91C1C', fontSize: 12 },
  retry: { color: '#0E5C44', fontWeight: '800', fontSize: 12, marginTop: 8 },
  children: { padding: 16, gap: 10 },
  child: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  childActive: { backgroundColor: '#1E8E5A', borderColor: '#1E8E5A' },
  childName: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  childMeta: { color: '#64748B', fontSize: 11, marginTop: 2 },
  white: { color: '#FFFFFF' },
  loader: { margin: 40 },
  body: { paddingHorizontal: 16 },
  statGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  statCard: {
    width: '48.5%',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 5,
    elevation: 2,
  },
  statIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  statLabel: {
    fontSize: 9,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.3,
  },
  statValue: {
    fontSize: 14.5,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  monitoringSection: {
    marginTop: 12,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.05,
    shadowRadius: 6,
    elevation: 2,
  },
  monitoringHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  monitoringIconCircle: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#F3E8FF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monitoringTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#1E293B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  monitoringSubtitle: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 1,
  },
  tabsRow: {
    flexDirection: 'row',
    gap: 8,
    paddingBottom: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    marginBottom: 12,
  },
  tabBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  tabBtnText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  mutabaahQuickBox: {
    borderRadius: 14,
    padding: 14,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    gap: 12,
  },
  mutabaahQuickHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  mutabaahQuickIconCircle: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#CCFBF1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  mutabaahQuickTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  mutabaahQuickDesc: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
    lineHeight: 16,
  },
  mutabaahActionBtn: {
    borderRadius: 10,
    overflow: 'hidden',
    shadowColor: '#18A165',
    shadowOpacity: 0.2,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  mutabaahActionGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    paddingHorizontal: 16,
    gap: 8,
  },
  mutabaahActionBtnText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '800',
  },
  detailBox: {
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  detailBoxLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  detailBoxTitle: {
    fontSize: 12,
    fontWeight: '900',
  },
  detailBoxMeta: {
    fontSize: 10,
    marginTop: 2,
  },
  pillBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  pillBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  studentBanner: { backgroundColor: '#D1FAE5', padding: 16, borderRadius: 16, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  studentLabel: { color: '#047857', fontSize: 10, fontWeight: '800' },
  studentName: { color: '#065F46', fontSize: 18, fontWeight: '900', marginTop: 3 },
  studentMeta: { color: '#047857', fontSize: 11, marginTop: 3 },
  attendance: { marginTop: 12, backgroundColor: '#FFFFFF', borderRadius: 15, padding: 15 },
  attendanceLabel: { color: '#64748B', fontSize: 11 },
  attendanceValue: { color: '#0E5C44', fontSize: 19, fontWeight: '900', marginTop: 3 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  kpi: { width: '48%', padding: 14, borderRadius: 15, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E2E8F0' },
  kpiLabel: { color: '#64748B', fontSize: 11 },
  kpiValue: { color: '#0E5C44', fontSize: 20, fontWeight: '900', marginTop: 4 },
  sectionTitle: { color: '#0F172A', fontSize: 15, fontWeight: '800', marginTop: 18, marginBottom: 9 },
  card: { backgroundColor: '#FFFFFF', padding: 16, borderRadius: 16, borderWidth: 1, borderColor: '#E2E8F0' },
  listRow: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  listTitle: { color: '#0F172A', fontSize: 13, fontWeight: '800' },
  listMeta: { color: '#64748B', fontSize: 11, marginTop: 3 },
  gradeRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F1F5F9' },
  grade: { color: '#0E5C44', fontSize: 18, fontWeight: '900' },
  empty: { color: '#94A3B8', fontSize: 12 },
  input: { minHeight: 80, borderWidth: 1, borderColor: '#CBD5E1', borderRadius: 12, padding: 12, textAlignVertical: 'top', color: '#0F172A' },
  button: { marginTop: 10, backgroundColor: '#0E5C44', borderRadius: 12, padding: 13, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '800' },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 22,
    rowGap: 10,
  },
  gridCard: {
    width: '31%',
    minHeight: 88,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
    paddingVertical: 10,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.03,
    shadowRadius: 5,
    elevation: 2,
  },
  gridIconWrap: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  gridLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 13.5,
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  modalCard: {
    width: '100%',
    maxWidth: 420,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.15,
    shadowRadius: 20,
    elevation: 10,
  },
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  modalHeaderTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  modalIconCircle: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#FFE4E6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#0F172A',
  },
  modalSubtitle: {
    fontSize: 11.5,
    color: '#64748B',
    marginTop: 1,
  },
  modalCloseBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalInputLabel: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#334155',
    marginBottom: 6,
  },
  modalTextInput: {
    minHeight: 100,
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 14,
    padding: 12,
    textAlignVertical: 'top',
    color: '#0F172A',
    fontSize: 13,
    backgroundColor: '#F8FAFC',
    marginBottom: 16,
  },
  modalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
    gap: 10,
  },
  modalCancelBtn: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: '#F1F5F9',
  },
  modalCancelText: {
    color: '#475569',
    fontWeight: '700',
    fontSize: 12.5,
  },
  modalSubmitBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 12,
    backgroundColor: '#0E5C44',
  },
  modalSubmitText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: 12.5,
  },
});
