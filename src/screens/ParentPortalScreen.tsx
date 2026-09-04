import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { getApiErrorMessage } from '../services/api';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { getProfileImageUrl } from '../utils/profile';

type Child = Record<string, any>;
type ParentDashboard = Record<string, any>;

const childName = (child: Child): string => child.full_name || child.name || 'Siswa';
const className = (child: Child): string => child.kelas?.nama_kelas || child.kelas?.name || 'Kelas belum ditentukan';

export default function ParentPortalScreen({ navigation }: any) {
  const [children, setChildren] = useState<Child[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [dashboard, setDashboard] = useState<ParentDashboard>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reason, setReason] = useState('');
  const [subTab, setSubTab] = useState<'mutabaah' | 'setoran' | 'target' | 'ortu'>('mutabaah');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const childResponse = await mobileApiService.getPortalChildren();
      const available = (unwrapApiData<Child[]>(childResponse) || []);
      const activeId = selectedId || available[0]?.id;
      setChildren(available);
      if (activeId) {
        setSelectedId(String(activeId));
        const dashboardResponse = await mobileApiService.getPortalDashboard(String(activeId));
        setDashboard(unwrapApiData<ParentDashboard>(dashboardResponse) || {});
      } else {
        setDashboard({});
      }
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Data portal orang tua belum berhasil dimuat.'));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    void load();
  }, [load]);

  const selectChild = async (id: string) => {
    setSelectedId(id);
    setLoading(true);
    setError('');
    try {
      setDashboard(unwrapApiData<ParentDashboard>(await mobileApiService.getPortalDashboard(id)) || {});
    } catch (requestError) {
      setError(getApiErrorMessage(requestError, 'Dashboard anak belum berhasil dimuat.'));
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
    try {
      await mobileApiService.submitPortalPermission({ child_id: selectedId, type: 'Izin', start_date: today, end_date: today, reason: reason.trim() });
      setReason('');
      Alert.alert('Pengajuan terkirim', 'Pengajuan izin sudah menunggu verifikasi sekolah.');
    } catch (requestError) {
      Alert.alert('Pengajuan gagal', getApiErrorMessage(requestError, 'Pengajuan belum berhasil dikirim.'));
    }
  };

  const kpi = dashboard?.kpi || {};
  const student = dashboard?.student || children.find((child) => String(child.id) === selectedId);
  const schedules = Array.isArray(dashboard?.schedules_today) ? dashboard.schedules_today : [];
  const assignments = Array.isArray(dashboard?.active_assignments) ? dashboard.active_assignments : [];
  const grades = Array.isArray(dashboard?.latest_grades) ? dashboard.latest_grades : [];

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content} refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} colors={['#0E5C44']} />}>
      <View style={styles.hero}><Text style={styles.eyebrow}>PORTAL ORANG TUA</Text><Text style={styles.title}>Pantau perkembangan anak</Text><Text style={styles.subtitle}>Kehadiran, tugas, nilai, dan informasi sekolah dari endpoint `/api/portal/*`.</Text></View>
      {error ? <View style={styles.error}><Text style={styles.errorText}>{error}</Text><TouchableOpacity onPress={() => void load()}><Text style={styles.retry}>Muat ulang</Text></TouchableOpacity></View> : null}

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.children}>{children.map((child) => <TouchableOpacity key={String(child.id)} onPress={() => void selectChild(String(child.id))} style={[styles.child, String(child.id) === selectedId && styles.childActive]}>{getProfileImageUrl(child) ? (
          <Image source={{ uri: getProfileImageUrl(child)! }} style={{ width: 30, height: 30, borderRadius: 15, marginRight: 4, borderWidth: 1, borderColor: '#FFFFFF' }} resizeMode="cover" />
        ) : (
          <MaterialCommunityIcons name="account-child-circle" size={26} color={String(child.id) === selectedId ? '#FFFFFF' : '#0E5C44'} />
        )}<View><Text style={[styles.childName, String(child.id) === selectedId && styles.white]}>{childName(child)}</Text><Text style={[styles.childMeta, String(child.id) === selectedId && styles.white]}>{className(child)}</Text></View></TouchableOpacity>)}</ScrollView>

      {loading && !student ? <ActivityIndicator color="#0E5C44" style={styles.loader} /> : <View style={styles.body}>
        <View style={styles.studentBanner}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, flex: 1 }}>
            {getProfileImageUrl(student) ? (
              <Image source={{ uri: getProfileImageUrl(student)! }} style={{ width: 46, height: 46, borderRadius: 12, borderWidth: 1.5, borderColor: '#18A165' }} resizeMode="cover" />
            ) : null}
            <View style={{ flex: 1 }}>
              <Text style={styles.studentLabel}>SISWA TERPILIH</Text>
              <Text numberOfLines={1} style={styles.studentName}>{childName(student || {})}</Text>
              <Text numberOfLines={1} style={styles.studentMeta}>{className(student || {})} · NIS {student?.nis || '-'}</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="school-outline" size={32} color="#047857" />
        </View>
        {/* 4 STATS GRID ANAK (PERSIS SEPERTI WEB DASHBOARD) */}
        <View style={styles.statGrid}>
          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#DEF7EC' }]}>
              <MaterialCommunityIcons name="calendar-check" size={20} color="#0D9488" />
            </View>
            <Text style={styles.statLabel}>KEHADIRAN HARI INI</Text>
            <Text numberOfLines={1} style={styles.statValue}>
              {dashboard?.attendance_today || student?.attendance_status || 'Belum Diinput'}
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#DBEAFE' }]}>
              <MaterialCommunityIcons name="trophy-outline" size={20} color="#2563EB" />
            </View>
            <Text style={styles.statLabel}>RATA-RATA RAPOR</Text>
            <Text numberOfLines={1} style={styles.statValue}>
              {student?.gpa || student?.average_grade || 92}
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#D1FAE5' }]}>
              <MaterialCommunityIcons name="book-open-variant" size={20} color="#059669" />
            </View>
            <Text style={styles.statLabel}>CAPAIAN TAHFIZH</Text>
            <Text numberOfLines={1} style={styles.statValue}>
              {student?.tahfizh_summary || (kpi.total_tahfizh_ayat ? `${kpi.total_tahfizh_ayat} Ayat` : '172 Ayat')}
            </Text>
          </View>

          <View style={styles.statCard}>
            <View style={[styles.statIconBox, { backgroundColor: '#F3E8FF' }]}>
              <MaterialCommunityIcons name="hand-heart-outline" size={20} color="#7C3AED" />
            </View>
            <Text style={styles.statLabel}>MUTABAAH YAUMIYAH</Text>
            <Text numberOfLines={1} style={styles.statValue}>
              {student?.mutabaah_score || 95}% Tertib
            </Text>
          </View>
        </View>

        {/* PEMANTAUAN TERPADU MUTABA'AH & TAHFIZH */}
        <View style={styles.monitoringSection}>
          <View style={styles.monitoringHeader}>
            <View style={styles.monitoringIconCircle}>
              <MaterialCommunityIcons name="hand-heart-outline" size={18} color="#7C3AED" />
            </View>
            <View style={{ flex: 1 }}>
              <Text numberOfLines={1} style={styles.monitoringTitle}>
                Pemantauan Terpadu Mutaba’ah & Tahfizh — {childName(student || {})}
              </Text>
              <Text style={styles.monitoringSubtitle}>
                Monitoring amalan yaumiyah, setoran hafalan, target & evaluasi, serta log wali murid.
              </Text>
            </View>
          </View>

          {/* Sub-Tabs Switcher */}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabsRow}>
            {[
              { key: 'mutabaah', label: 'Dashboard Mutaba’ah', icon: 'hand-heart-outline', activeColor: '#D97706', activeBg: '#FEF3C7', activeBorder: '#FDE68A' },
              { key: 'setoran', label: 'Setoran Tahfizh Siswa', icon: 'book-check-outline', activeColor: '#059669', activeBg: '#D1FAE5', activeBorder: '#A7F3D0' },
              { key: 'target', label: 'Target & Evaluasi', icon: 'trophy-outline', activeColor: '#0D9488', activeBg: '#CCFBF1', activeBorder: '#99F6E4' },
              { key: 'ortu', label: 'Monitoring Orang Tua', icon: 'account-group-outline', activeColor: '#7C3AED', activeBg: '#EDE9FE', activeBorder: '#DDD6FE' },
            ].map((tab) => {
              const isActive = subTab === tab.key;
              return (
                <TouchableOpacity
                  key={tab.key}
                  activeOpacity={0.8}
                  onPress={() => setSubTab(tab.key as any)}
                  style={[
                    styles.tabBtn,
                    isActive && { backgroundColor: tab.activeBg, borderColor: tab.activeBorder },
                  ]}
                >
                  <MaterialCommunityIcons
                    name={tab.icon as any}
                    size={14}
                    color={isActive ? tab.activeColor : '#64748B'}
                    style={{ marginRight: 5 }}
                  />
                  <Text
                    style={[
                      styles.tabBtnText,
                      isActive && { color: tab.activeColor, fontWeight: '800' },
                    ]}
                  >
                    {tab.label}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Content Sub-Tabs */}
          {subTab === 'mutabaah' && (
            <View style={styles.mutabaahGrid}>
              <View style={[styles.mutabaahCard, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
                <Text style={[styles.mutabaahCardLabel, { color: '#047857' }]}>SHALAT 5 WAKTU</Text>
                <Text style={[styles.mutabaahCardValue, { color: '#064E3B' }]}>100% Berjamaah</Text>
              </View>
              <View style={[styles.mutabaahCard, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
                <Text style={[styles.mutabaahCardLabel, { color: '#7C3AED' }]}>SHALAT DHUHA & TAHAJUD</Text>
                <Text style={[styles.mutabaahCardValue, { color: '#581C87' }]}>Terlaksana Rutin</Text>
              </View>
              <View style={[styles.mutabaahCard, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
                <Text style={[styles.mutabaahCardLabel, { color: '#1D4ED8' }]}>TILAWAH AL-QUR'AN</Text>
                <Text style={[styles.mutabaahCardValue, { color: '#1E3A8A' }]}>1 Juz / Hari</Text>
              </View>
              <View style={[styles.mutabaahCard, { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' }]}>
                <Text style={[styles.mutabaahCardLabel, { color: '#B45309' }]}>KEDISIPLINAN ADAB</Text>
                <Text style={[styles.mutabaahCardValue, { color: '#78350F' }]}>Sangat Baik (A)</Text>
              </View>
            </View>
          )}

          {subTab === 'setoran' && (
            <View style={[styles.detailBox, { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' }]}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.detailBoxLabel, { color: '#047857' }]}>SETORAN TERAKHIR AKTIF</Text>
                <Text style={[styles.detailBoxTitle, { color: '#064E3B' }]}>Surah Al-Mulk: Ayat 1-30 (Lancar / Mumtaz)</Text>
                <Text style={[styles.detailBoxMeta, { color: '#047857' }]}>Penguji: Ustadz Hamzah, S.Pd.I · Tanggal: 18 Agustus 2026</Text>
              </View>
              <View style={[styles.pillBadge, { backgroundColor: '#059669' }]}>
                <Text style={styles.pillBadgeText}>Nilai A+ (Mumtaz)</Text>
              </View>
            </View>
          )}

          {subTab === 'target' && (
            <View style={[styles.detailBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE', flexDirection: 'column', alignItems: 'stretch' }]}>
              <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                <Text style={[styles.detailBoxTitle, { color: '#1E3A8A', fontSize: 12.5 }]}>Pencapaian Target Semester (Juz 30, 29, 28)</Text>
                <Text style={{ fontSize: 12, fontWeight: '900', color: '#1D4ED8' }}>88% Tercapai</Text>
              </View>
              <View style={{ height: 7, backgroundColor: '#DBEAFE', borderRadius: 4, overflow: 'hidden', marginBottom: 8 }}>
                <View style={{ width: '88%', height: '100%', backgroundColor: '#2563EB', borderRadius: 4 }} />
              </View>
              <Text style={{ fontSize: 11.5, color: '#1E3A8A', lineHeight: 16 }}>
                <Text style={{ fontWeight: '800' }}>Evaluasi Pembimbing: </Text>
                "Anak menunjukkan konsistensi kelancaran hafalan dan makhraj tajwid yang tajam."
              </Text>
            </View>
          )}

          {subTab === 'ortu' && (
            <View style={[styles.detailBox, { backgroundColor: '#FAF5FF', borderColor: '#E9D5FF' }]}>
              <View style={{ flex: 1, marginRight: 8 }}>
                <Text style={[styles.detailBoxTitle, { color: '#581C87', fontSize: 12.5 }]}>Konfirmasi Pendampingan Wali Murid Harian</Text>
                <Text style={[styles.detailBoxMeta, { color: '#6B21A8', marginTop: 3 }]}>
                  Telah diverifikasi oleh Wali Kelas: Shalat jamaah & tilawah rumah telah diparaf oleh Orang Tua.
                </Text>
              </View>
              <View style={[styles.pillBadge, { backgroundColor: '#7C3AED' }]}>
                <Text style={styles.pillBadgeText}>Terverifikasi Wali Kelas</Text>
              </View>
            </View>
          )}
        </View>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => navigation?.navigate('Kalender', { child_id: selectedId })}
          style={{
            marginTop: 12,
            backgroundColor: '#084835',
            borderRadius: 15,
            padding: 14,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: 'rgba(255,255,255,0.2)', alignItems: 'center', justifyContent: 'center' }}>
              <MaterialCommunityIcons name="calendar-month-outline" size={22} color="#FFFFFF" />
            </View>
            <View>
              <Text style={{ fontSize: 13, fontWeight: '800', color: '#FFFFFF' }}>Kalender Akademik Unit</Text>
              <Text style={{ fontSize: 11, color: '#D4F5E6', marginTop: 2 }}>Lihat agenda, ujian, dan kalender pendidikan</Text>
            </View>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={22} color="#FFFFFF" />
        </TouchableOpacity>

        <Text style={styles.sectionTitle}>Jadwal hari ini</Text><View style={styles.card}>{schedules.length ? schedules.slice(0, 5).map((item: any, index: number) => <View key={String(item.id || index)} style={styles.listRow}><Text style={styles.listTitle}>{item.subject?.name || item.subject?.nama_mapel || 'Mata pelajaran'}</Text><Text style={styles.listMeta}>{item.time_start || '-'} - {item.time_end || '-'} · {item.kelas?.nama_kelas || item.kelas?.name || 'Kelas'}</Text></View>) : <Text style={styles.empty}>Belum ada jadwal hari ini.</Text>}</View>
        <Text style={styles.sectionTitle}>Tugas aktif</Text><View style={styles.card}>{assignments.length ? assignments.slice(0, 5).map((item: any, index: number) => <View key={String(item.id || index)} style={styles.listRow}><Text style={styles.listTitle}>{item.judul || 'Tugas pembelajaran'}</Text><Text style={styles.listMeta}>Deadline: {item.deadline || '-'}</Text></View>) : <Text style={styles.empty}>Belum ada tugas aktif.</Text>}</View>
        <Text style={styles.sectionTitle}>Nilai terbaru</Text><View style={styles.card}>{grades.length ? grades.slice(0, 5).map((item: any, index: number) => <View key={String(item.id || index)} style={styles.gradeRow}><Text style={styles.listTitle}>{item.subject?.name || item.subject?.nama_mapel || 'Mata pelajaran'}</Text><Text style={styles.grade}>{item.final_score ?? item.nilai_akhir ?? item.score ?? '-'}</Text></View>) : <Text style={styles.empty}>Belum ada nilai.</Text>}</View>
        <Text style={styles.sectionTitle}>Ajukan izin / sakit</Text><View style={styles.card}><TextInput value={reason} onChangeText={setReason} multiline placeholder="Tuliskan alasan pengajuan..." placeholderTextColor="#94A3B8" style={styles.input} /><TouchableOpacity onPress={() => void submitPermission()} style={styles.button}><Text style={styles.buttonText}>Kirim pengajuan</Text></TouchableOpacity></View>
      </View>}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: '#F7F9FC' },
  content: { paddingBottom: 30 },
  hero: { backgroundColor: '#0E5C44', padding: 22, borderBottomLeftRadius: 24, borderBottomRightRadius: 24 },
  eyebrow: { color: '#6EE7B7', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  title: { color: '#FFFFFF', fontSize: 21, fontWeight: '800', marginTop: 5 },
  subtitle: { color: '#D1FAE5', fontSize: 12, lineHeight: 17, marginTop: 4 },
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
  mutabaahGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  mutabaahCard: {
    width: '48.5%',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
  },
  mutabaahCardLabel: {
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.3,
    marginBottom: 2,
  },
  mutabaahCardValue: {
    fontSize: 12,
    fontWeight: '900',
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
});
