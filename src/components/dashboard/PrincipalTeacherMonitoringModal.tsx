import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ActivityIndicator,
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
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { mobileApiService, unwrapApiData } from '../../services/mobileApiService';

interface PrincipalTeacherMonitoringModalProps {
  visible: boolean;
  onClose: () => void;
  unitName?: string;
}

export default function PrincipalTeacherMonitoringModal({
  visible,
  onClose,
  unitName = 'Unit Sekolah',
}: PrincipalTeacherMonitoringModalProps) {
  const insets = useSafeAreaInsets();
  const topInset = Math.max(insets.top, Platform.OS === 'android' ? 24 : 12);
  const bottomInset = Math.max(insets.bottom, Platform.OS === 'android' ? 16 : 8);

  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [search, setSearch] = useState<string>('');
  const [debouncedQuery, setDebouncedQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'hadir' | 'belum' | 'terlambat'>('all');
  const [selectedSessionForDetail, setSelectedSessionForDetail] = useState<any | null>(null);

  const [monitoringData, setMonitoringData] = useState<{
    summary?: any;
    rows?: any[];
  }>({});

  // Debounce search input (350ms) sesuai standar performa
  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedQuery(search.trim().toLowerCase());
    }, 350);
    return () => clearTimeout(handler);
  }, [search]);

  const fetchMonitoring = useCallback(async (isPull = false) => {
    if (isPull) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await mobileApiService.getTeacherMonitoring();
      const raw = unwrapApiData(res);
      setMonitoringData(raw || {});
    } catch (err) {
      console.warn('Gagal memuat teacher monitoring data:', err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (visible) {
      fetchMonitoring();
    }
  }, [visible, fetchMonitoring]);

  const summary = monitoringData.summary || {
    scheduled_today: 0,
    checked_in: 0,
    not_checked_in: 0,
    late: 0,
    active: 0,
    completed: 0,
  };

  const rows = useMemo(() => {
    return Array.isArray(monitoringData.rows) ? monitoringData.rows : [];
  }, [monitoringData.rows]);

  const stats = useMemo(() => {
    const totalSesi = summary.scheduled_today || rows.length || 0;
    const guruHadir = (summary.checked_in || 0) + (summary.active || 0) + (summary.completed || 0);
    const belumHadir = summary.not_checked_in || 0;
    const terlambat = summary.late || 0;

    return {
      totalSesi,
      guruHadir,
      belumHadir,
      terlambat,
    };
  }, [summary, rows]);

  const filteredRows = useMemo(() => {
    return rows.filter((row: any) => {
      const tName = (row.teacher?.name || row.teacher_name || '').toLowerCase();
      const sSubject = (row.schedule?.subject || row.subject || '').toLowerCase();
      const sClass = (row.schedule?.class || row.class_name || '').toLowerCase();
      const q = debouncedQuery;

      const matchSearch = !q || tName.includes(q) || sSubject.includes(q) || sClass.includes(q);
      if (!matchSearch) return false;

      const att = String(row.attendance_status || '').toLowerCase();
      const teach = String(row.teaching_status || '').toLowerCase();

      if (statusFilter === 'hadir') {
        return att === 'hadir' || teach === 'sedang_mengajar' || teach === 'selesai' || att === 'tepat_waktu';
      }
      if (statusFilter === 'belum') {
        return att === 'belum_presensi' || teach === 'belum_presensi' || att === 'alpha';
      }
      if (statusFilter === 'terlambat') {
        return att === 'terlambat' || teach === 'terlambat';
      }
      return true;
    });
  }, [rows, debouncedQuery, statusFilter]);

  const getStatusBadge = (row: any) => {
    const att = String(row.attendance_status || '').toLowerCase();
    const teach = String(row.teaching_status || '').toLowerCase();

    if (teach === 'sedang_mengajar') {
      return {
        label: 'Sedang Mengajar',
        bg: '#DEF7EC',
        text: '#059669',
        border: '#A7F3D0',
        icon: 'record-circle-outline',
      };
    }
    if (teach === 'selesai' || att === 'hadir' || att === 'tepat_waktu') {
      return {
        label: 'Sesi Selesai / Hadir',
        bg: '#E0F2FE',
        text: '#0284C7',
        border: '#BAE6FD',
        icon: 'check-circle-outline',
      };
    }
    if (att === 'terlambat' || teach === 'terlambat') {
      return {
        label: 'Terlambat Hadir',
        bg: '#FEF3C7',
        text: '#D97706',
        border: '#FDE68A',
        icon: 'clock-alert-outline',
      };
    }
    return {
      label: 'Belum Presensi KBM',
      bg: '#FFF1F2',
      text: '#E11D48',
      border: '#FECDD3',
      icon: 'alert-circle-outline',
    };
  };

  const handleContactTeacher = (phone?: string, name?: string, subject?: string, className?: string) => {
    if (!phone) {
      alert(`Kontak telepon/WhatsApp untuk ${name || 'guru bersangkutan'} belum tersedia.`);
      return;
    }
    const cleanPhone = String(phone).replace(/^0/, '62').replace(/[^\d]/g, '');
    const message = encodeURIComponent(
      `Assalamu'alaikum Warahmatullahi Wabarakatuh Ustadz/Ustadzah ${name || ''}. Terkait supervisi KBM hari ini (${subject || 'Mata Pelajaran'} - ${className || 'Kelas'}) di ${unitName}.`
    );
    const url = `https://wa.me/${cleanPhone}?text=${message}`;
    Linking.openURL(url).catch(() => {
      Linking.openURL(`tel:${cleanPhone}`);
    });
  };

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose}>
      <View style={styles.container}>
        {/* ── HEADER HALAMAN SUPERVISI GURU (IDENTIK DENGAN PANTAU KELAS SCREEN) ── */}
        <LinearGradient
          colors={['#0F766E', '#0D9488', '#14B8A6']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[styles.headerContainer, { paddingTop: topInset + 6 }]}
        >
          <View style={styles.headerTopRow}>
            <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.backButton}>
              <MaterialCommunityIcons name="arrow-left" size={22} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.headerTitleWrap}>
              <View style={styles.headerBadge}>
                <MaterialCommunityIcons name="human-male-board" size={12} color="#CCFBF1" />
                <Text style={styles.headerBadgeText}>SUPERVISI PEMBELAJARAN GURU</Text>
              </View>
              <Text style={styles.headerMainTitle}>Supervisi & Pantau Guru</Text>
            </View>

            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => fetchMonitoring(true)}
              style={styles.refreshButton}
            >
              <MaterialCommunityIcons
                name="refresh"
                size={20}
                color="#FFFFFF"
                style={refreshing ? { transform: [{ rotate: '45deg' }] } : undefined}
              />
            </TouchableOpacity>
          </View>

          {/* Search Bar */}
          <View style={styles.searchBar}>
            <MaterialCommunityIcons name="magnify" size={20} color="#64748B" />
            <TextInput
              style={styles.searchInput}
              placeholder="Cari nama guru, mata pelajaran, atau rombel..."
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

          {/* 4 KPI Cards (Sesuai PantauKelasScreen & Web Dashboard) */}
          <View style={styles.kpiCardsRow}>
            <View style={styles.kpiBox}>
              <Text style={styles.kpiVal}>{stats.totalSesi}</Text>
              <Text style={styles.kpiLbl}>Total Sesi KBM</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiVal, { color: '#CCFBF1' }]}>{stats.guruHadir}</Text>
              <Text style={styles.kpiLbl}>Guru Hadir</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiVal, { color: stats.belumHadir > 0 ? '#FECDD3' : '#FFFFFF' }]}>
                {stats.belumHadir}
              </Text>
              <Text style={styles.kpiLbl}>Belum Presensi</Text>
            </View>
            <View style={styles.kpiDivider} />
            <View style={styles.kpiBox}>
              <Text style={[styles.kpiVal, { color: stats.terlambat > 0 ? '#FED7AA' : '#FFFFFF' }]}>
                {stats.terlambat}
              </Text>
              <Text style={styles.kpiLbl}>Terlambat</Text>
            </View>
          </View>
        </LinearGradient>

        {/* ── NOTIFIKASI ALERT STATUS SUPERVISI KBM ── */}
        {stats.belumHadir > 0 ? (
          <View style={[styles.alertBanner, styles.alertBannerWarning]}>
            <View style={[styles.alertBannerIconWrap, { backgroundColor: '#FEE2E2' }]}>
              <MaterialCommunityIcons name="alert-circle" size={20} color="#DC2626" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertBannerTitle, { color: '#991B1B' }]}>
                Perhatian: {stats.belumHadir} Guru Belum Melakukan Presensi KBM!
              </Text>
              <Text style={[styles.alertBannerText, { color: '#B91C1C' }]}>
                Sesi mengajar telah terjadwal. Hubungi guru bersangkutan melalui tombol WhatsApp pada kartu sesi untuk verifikasi kehadiran.
              </Text>
            </View>
          </View>
        ) : (
          <View style={[styles.alertBanner, styles.alertBannerSuccess]}>
            <View style={[styles.alertBannerIconWrap, { backgroundColor: '#DEF7EC' }]}>
              <MaterialCommunityIcons name="check-decagram" size={20} color="#059669" />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.alertBannerTitle, { color: '#065F46' }]}>
                Alhamdulillah: Pembelajaran Berjalan Tertib
              </Text>
              <Text style={[styles.alertBannerText, { color: '#047857' }]}>
                Seluruh pengajar yang terjadwal telah melakukan presensi mengajar tepat waktu di {unitName}.
              </Text>
            </View>
          </View>
        )}

        {/* ── FILTER HORIZONTAL STRIP ── */}
        <View style={styles.filterBarWrapper}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.filterScroll}
          >
            <TouchableOpacity
              style={[styles.filterChip, statusFilter === 'all' && styles.filterChipActive]}
              onPress={() => setStatusFilter('all')}
            >
              <Text style={[styles.filterChipText, statusFilter === 'all' && styles.filterChipTextActive]}>
                Semua Sesi ({rows.length})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, statusFilter === 'hadir' && styles.filterChipActiveGreen]}
              onPress={() => setStatusFilter('hadir')}
            >
              <MaterialCommunityIcons
                name="check-circle-outline"
                size={13}
                color={statusFilter === 'hadir' ? '#FFFFFF' : '#059669'}
              />
              <Text style={[styles.filterChipText, statusFilter === 'hadir' && styles.filterChipTextActive]}>
                Hadir / Mengajar ({stats.guruHadir})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, statusFilter === 'belum' && styles.filterChipActiveRed]}
              onPress={() => setStatusFilter('belum')}
            >
              <MaterialCommunityIcons
                name="alert-circle-outline"
                size={13}
                color={statusFilter === 'belum' ? '#FFFFFF' : '#E11D48'}
              />
              <Text style={[styles.filterChipText, statusFilter === 'belum' && styles.filterChipTextActive]}>
                Belum Hadir ({stats.belumHadir})
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, statusFilter === 'terlambat' && styles.filterChipActiveAmber]}
              onPress={() => setStatusFilter('terlambat')}
            >
              <MaterialCommunityIcons
                name="clock-alert-outline"
                size={13}
                color={statusFilter === 'terlambat' ? '#FFFFFF' : '#D97706'}
              />
              <Text style={[styles.filterChipText, statusFilter === 'terlambat' && styles.filterChipTextActive]}>
                Terlambat ({stats.terlambat})
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </View>

        {/* ── DAFTAR SESI KBM GURU ── */}
        {loading ? (
          <View style={styles.loadingBox}>
            <ActivityIndicator size="large" color="#0D9488" />
            <Text style={styles.loadingText}>Memuat jadwal & sesi mengajar guru...</Text>
          </View>
        ) : (
          <FlatList
            data={filteredRows}
            keyExtractor={(item, index) => String(item.id || item.schedule_id || index)}
            contentContainerStyle={[styles.listContent, { paddingBottom: bottomInset + 30 }]}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl
                refreshing={refreshing}
                onRefresh={() => fetchMonitoring(true)}
                colors={['#0D9488']}
              />
            }
            ListEmptyComponent={
              <View style={styles.emptyBox}>
                <MaterialCommunityIcons name="book-clock-outline" size={54} color="#CBD5E1" />
                <Text style={styles.emptyTitle}>Sesi KBM Tidak Ditemukan</Text>
                <Text style={styles.emptySubtitle}>
                  {search
                    ? `Tidak ada sesi KBM yang sesuai dengan pencarian "${search}".`
                    : 'Tidak ada jadwal mengajar pada filter kategori ini.'}
                </Text>
              </View>
            }
            renderItem={({ item }) => {
              const teacherName = item.teacher?.name || item.teacher_name || 'Ustadz / Ustadzah';
              const subjectName = item.schedule?.subject || item.subject || 'Mata Pelajaran';
              const className = item.schedule?.class || item.class_name || 'Rombel';
              const roomName = item.schedule?.room || item.room || 'Ruang Kelas';
              const timeStart = item.schedule?.time_start ? item.schedule.time_start.slice(0, 5) : '07:30';
              const timeEnd = item.schedule?.time_end ? item.schedule.time_end.slice(0, 5) : '08:50';
              const phone = item.teacher?.phone || item.teacher?.kontak || '';
              const badge = getStatusBadge(item);
              const isNotPresent = badge.text === '#E11D48';

              return (
                <View style={styles.classCard}>
                  {/* Card Header Row */}
                  <View style={styles.cardHeaderRow}>
                    {/* Icon Square */}
                    <View
                      style={[
                        styles.classIconSquare,
                        { backgroundColor: isNotPresent ? '#FFE4E6' : '#CCFBF1' },
                      ]}
                    >
                      <MaterialCommunityIcons
                        name={isNotPresent ? 'alert-circle' : 'human-male-board'}
                        size={22}
                        color={isNotPresent ? '#E11D48' : '#0F766E'}
                      />
                    </View>

                    {/* Teacher Title & Subject */}
                    <View style={{ flex: 1 }}>
                      <View style={styles.titleRow}>
                        <Text style={styles.classTitleText} numberOfLines={1}>
                          {teacherName}
                        </Text>
                        <View style={[styles.statusBadge, { backgroundColor: badge.bg, borderColor: badge.border }]}>
                          <MaterialCommunityIcons name={badge.icon as any} size={11} color={badge.text} />
                          <Text style={[styles.statusBadgeText, { color: badge.text }]}>
                            {badge.label}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.classSubText}>
                        {subjectName} • {className}
                      </Text>
                    </View>
                  </View>

                  {/* Schedule & Time Middle Box (Style progressBox PantauKelas) */}
                  <View style={[styles.progressBox, isNotPresent && { backgroundColor: '#FFF1F2' }]}>
                    <View style={styles.progressLabelRow}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
                        <MaterialCommunityIcons name="clock-outline" size={13} color="#0D9488" />
                        <Text style={styles.progressLabelLeft}>
                          Jam KBM: <Text style={{ fontWeight: '800', color: '#0F766E' }}>{timeStart} - {timeEnd} WIB</Text>
                        </Text>
                      </View>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
                        <MaterialCommunityIcons name="map-marker-outline" size={13} color="#64748B" />
                        <Text style={styles.progressLabelRight}>{roomName}</Text>
                      </View>
                    </View>
                  </View>

                  {/* Card Footer Row */}
                  <View style={styles.cardFooterRow}>
                    <View style={styles.waliInfoWrap}>
                      <View style={styles.waliAvatar}>
                        <MaterialCommunityIcons name="account-tie" size={16} color="#0D9488" />
                      </View>
                      <View style={{ flex: 1 }}>
                        <Text style={styles.waliNameText} numberOfLines={1}>
                          {item.teacher?.nip ? `NIP. ${item.teacher.nip}` : 'Tenaga Pendidik Aktif'}
                        </Text>
                        <Text style={styles.waliLabel}>Pengampu Pelajaran</Text>
                      </View>
                    </View>

                    <View style={styles.cardActionGroup}>
                      {Boolean(phone) && (
                        <TouchableOpacity
                          activeOpacity={0.7}
                          onPress={() => handleContactTeacher(phone, teacherName, subjectName, className)}
                          style={styles.waBtn}
                        >
                          <MaterialCommunityIcons name="whatsapp" size={15} color="#FFFFFF" />
                        </TouchableOpacity>
                      )}

                      <TouchableOpacity
                        activeOpacity={0.8}
                        onPress={() => setSelectedSessionForDetail(item)}
                        style={styles.drilldownBtn}
                      >
                        <MaterialCommunityIcons name="eye-outline" size={14} color="#0F766E" />
                        <Text style={styles.drilldownBtnText}>Detail Sesi</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              );
            }}
          />
        )}

        {/* ── MODAL DRILL-DOWN DETAIL SESI KBM GURU (STYLE IDENTIK DENGAN PANTAU KELAS) ── */}
        <Modal
          visible={Boolean(selectedSessionForDetail)}
          animationType="slide"
          transparent
          onRequestClose={() => setSelectedSessionForDetail(null)}
        >
          <View style={styles.modalBackdrop}>
            <View style={styles.modalCard}>
              <View style={styles.modalHeader}>
                <View style={styles.modalTitleRow}>
                  <MaterialCommunityIcons name="human-male-board" size={22} color="#0D9488" />
                  <View>
                    <Text style={styles.modalTitle}>
                      {selectedSessionForDetail?.teacher?.name || selectedSessionForDetail?.teacher_name || 'Detail Sesi KBM'}
                    </Text>
                    <Text style={styles.modalSubtitle}>Supervisi Mengajar & Konfirmasi Kehadiran</Text>
                  </View>
                </View>
                <TouchableOpacity
                  onPress={() => setSelectedSessionForDetail(null)}
                  style={styles.modalCloseBtn}
                >
                  <MaterialCommunityIcons name="close" size={20} color="#64748B" />
                </TouchableOpacity>
              </View>

              {selectedSessionForDetail && (
                <ScrollView contentContainerStyle={{ padding: 18, gap: 12 }}>
                  {/* Info Box */}
                  <View style={styles.detailCardBox}>
                    <Text style={styles.detailCardLabel}>MATA PELAJARAN</Text>
                    <Text style={styles.detailCardValue}>
                      {selectedSessionForDetail.schedule?.subject || selectedSessionForDetail.subject || '—'}
                    </Text>

                    <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 }} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={styles.detailCardLabel}>ROMBEL / KELAS</Text>
                        <Text style={styles.detailCardSubValue}>
                          {selectedSessionForDetail.schedule?.class || selectedSessionForDetail.class_name || '—'}
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.detailCardLabel}>RUANGAN</Text>
                        <Text style={styles.detailCardSubValue}>
                          {selectedSessionForDetail.schedule?.room || selectedSessionForDetail.room || '—'}
                        </Text>
                      </View>
                    </View>

                    <View style={{ height: 1, backgroundColor: '#E2E8F0', marginVertical: 8 }} />

                    <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
                      <View>
                        <Text style={styles.detailCardLabel}>WAKTU KBM</Text>
                        <Text style={styles.detailCardSubValue}>
                          {selectedSessionForDetail.schedule?.time_start?.slice(0, 5) || '07:30'} - {selectedSessionForDetail.schedule?.time_end?.slice(0, 5) || '08:50'} WIB
                        </Text>
                      </View>
                      <View>
                        <Text style={styles.detailCardLabel}>STATUS PRESENSI</Text>
                        <Text style={[styles.detailCardSubValue, { fontWeight: '800', color: '#0F766E' }]}>
                          {selectedSessionForDetail.attendance_status || selectedSessionForDetail.teaching_status || 'Belum Presensi'}
                        </Text>
                      </View>
                    </View>
                  </View>

                  {/* Tombol Hubungi WhatsApp */}
                  {selectedSessionForDetail.teacher?.phone || selectedSessionForDetail.teacher?.kontak ? (
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() =>
                        handleContactTeacher(
                          selectedSessionForDetail.teacher?.phone || selectedSessionForDetail.teacher?.kontak,
                          selectedSessionForDetail.teacher?.name || selectedSessionForDetail.teacher_name,
                          selectedSessionForDetail.schedule?.subject || selectedSessionForDetail.subject,
                          selectedSessionForDetail.schedule?.class || selectedSessionForDetail.class_name
                        )
                      }
                      style={styles.modalWaBtn}
                    >
                      <MaterialCommunityIcons name="whatsapp" size={18} color="#FFFFFF" />
                      <Text style={styles.modalWaBtnText}>Hubungi Guru via WhatsApp</Text>
                    </TouchableOpacity>
                  ) : null}

                  <TouchableOpacity
                    activeOpacity={0.8}
                    onPress={() => setSelectedSessionForDetail(null)}
                    style={styles.modalCloseMainBtn}
                  >
                    <Text style={styles.modalCloseMainBtnText}>Tutup Detail</Text>
                  </TouchableOpacity>
                </ScrollView>
              )}
            </View>
          </View>
        </Modal>
      </View>
    </Modal>
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
  },
  headerTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  backButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitleWrap: {
    flex: 1,
    marginLeft: 12,
  },
  headerBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: 'flex-start',
    marginBottom: 2,
  },
  headerBadgeText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#CCFBF1',
    letterSpacing: 0.5,
  },
  headerMainTitle: {
    fontSize: 18,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  refreshButton: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
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
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 2,
    elevation: 2,
  },
  searchInput: {
    flex: 1,
    fontSize: 13,
    color: '#0F172A',
    paddingVertical: 0,
  },
  kpiCardsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    borderRadius: 14,
    paddingVertical: 10,
    paddingHorizontal: 8,
    marginTop: 12,
  },
  kpiBox: {
    flex: 1,
    alignItems: 'center',
  },
  kpiVal: {
    fontSize: 16,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  kpiLbl: {
    fontSize: 10,
    fontWeight: '700',
    color: '#E2E8F0',
    marginTop: 1,
  },
  kpiDivider: {
    width: 1,
    height: 24,
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
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
  alertBannerWarning: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
  },
  alertBannerSuccess: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  alertBannerIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  alertBannerTitle: {
    fontSize: 12,
    fontWeight: '800',
  },
  alertBannerText: {
    fontSize: 11,
    marginTop: 2,
    lineHeight: 15,
  },
  filterBarWrapper: {
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    paddingVertical: 8,
  },
  filterScroll: {
    paddingHorizontal: 14,
    gap: 8,
    alignItems: 'center',
  },
  filterChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  filterChipActive: {
    backgroundColor: '#0D9488',
    borderColor: '#0D9488',
  },
  filterChipActiveGreen: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  filterChipActiveRed: {
    backgroundColor: '#E11D48',
    borderColor: '#E11D48',
  },
  filterChipActiveAmber: {
    backgroundColor: '#D97706',
    borderColor: '#D97706',
  },
  filterChipText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#64748B',
  },
  filterChipTextActive: {
    color: '#FFFFFF',
  },
  loadingBox: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 40,
    gap: 12,
  },
  loadingText: {
    fontSize: 13,
    fontWeight: '700',
    color: '#64748B',
  },
  listContent: {
    padding: 14,
    gap: 12,
  },
  emptyBox: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 48,
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
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: 14,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05,
    shadowRadius: 3,
    elevation: 1.5,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  classIconSquare: {
    width: 42,
    height: 42,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 6,
  },
  classTitleText: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    flex: 1,
  },
  classSubText: {
    fontSize: 11.5,
    color: '#64748B',
    fontWeight: '600',
    marginTop: 2,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
  },
  statusBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  progressBox: {
    backgroundColor: '#F0FDFA',
    borderRadius: 10,
    padding: 10,
    marginTop: 10,
  },
  progressLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  progressLabelLeft: {
    fontSize: 11,
    color: '#475569',
    fontWeight: '600',
  },
  progressLabelRight: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
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
    backgroundColor: '#CCFBF1',
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
    backgroundColor: '#CCFBF1',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  drilldownBtnText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F766E',
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
  detailCardBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  detailCardLabel: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#64748B',
    letterSpacing: 0.5,
  },
  detailCardValue: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
    marginTop: 2,
  },
  detailCardSubValue: {
    fontSize: 12,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
  },
  modalWaBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: '#10B981',
    borderRadius: 12,
    paddingVertical: 12,
  },
  modalWaBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
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
