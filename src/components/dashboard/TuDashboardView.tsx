import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import TuKpiDrilldownModal, { TuKpiType } from './TuKpiDrilldownModal';

interface TuDashboardViewProps {
  dashboard: Record<string, any>;
  navigation: any;
}

type GradientTuple = [string, string];

// Mini donut/bar chart dari data [{name, value, color}]
function MiniBarChart({ data, label }: { data: any[]; label: string }) {
  const total = data.reduce((s: number, d: any) => s + (d.value || 0), 0);
  if (!total || total === 0) return null;
  return (
    <View style={chartStyles.wrap}>
      <Text style={chartStyles.label}>{label}</Text>
      <View style={chartStyles.barTrack}>
        {data.map((d: any, i: number) => {
          const pct = total > 0 ? (d.value / total) * 100 : 0;
          return (
            <View
              key={i}
              style={[
                chartStyles.barSegment,
                { flex: pct, backgroundColor: d.color || '#94A3B8' },
                i === 0 && chartStyles.barFirst,
                i === data.length - 1 && chartStyles.barLast,
              ]}
            />
          );
        })}
      </View>
      <View style={chartStyles.legend}>
        {data.map((d: any, i: number) => (
          <View key={i} style={chartStyles.legendItem}>
            <View style={[chartStyles.dot, { backgroundColor: d.color || '#94A3B8' }]} />
            <Text style={chartStyles.legendText}>{d.name}: {d.value}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

const chartStyles = StyleSheet.create({
  wrap: { marginTop: 10 },
  label: { fontSize: 10.5, fontWeight: '700', color: '#475569', marginBottom: 6 },
  barTrack: {
    flexDirection: 'row',
    height: 12,
    borderRadius: 6,
    overflow: 'hidden',
    backgroundColor: '#F1F5F9',
  },
  barSegment: { height: 12 },
  barFirst: { borderTopLeftRadius: 6, borderBottomLeftRadius: 6 },
  barLast: { borderTopRightRadius: 6, borderBottomRightRadius: 6 },
  legend: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  dot: { width: 8, height: 8, borderRadius: 4 },
  legendText: { fontSize: 10, color: '#64748B', fontWeight: '600' },
});

/**
 * TuDashboardView — Dedicated KPI dashboard untuk role Tata Usaha.
 *
 * Membaca dari struktur respons backend /dashboard/tata-usaha:
 *   dashboard.kpis.total_siswa.total / laki_laki / perempuan
 *   dashboard.kpis.total_pegawai.total / laki_laki / perempuan
 *   dashboard.kpis.absensi_hari_ini.siswa_hadir / siswa_belum_absen / pegawai_hadir
 *   dashboard.kpis.siswa_incomplete.total
 *   dashboard.kpis.pegawai_incomplete.total
 *   dashboard.context.tahun_ajaran.nama
 *   dashboard.charts.siswa_gender / absensi_hari_ini / siswa_kelengkapan / pegawai_kelengkapan
 */
export default function TuDashboardView({ dashboard, navigation }: TuDashboardViewProps) {
  const [activeKpiType, setActiveKpiType] = useState<TuKpiType | null>(null);
  const [activeAbsensiTab, setActiveAbsensiTab] = useState<'siswa_hadir' | 'siswa_belum_absen' | 'pegawai'>('siswa_hadir');

  // Struktur nested dari backend /dashboard/tata-usaha
  const kpis   = dashboard?.kpis    || {};
  const charts = dashboard?.charts  || {};
  const ctx    = dashboard?.context || {};

  // --- KPI values ---
  const totalSiswa        = kpis?.total_siswa?.total        ?? '-';
  const siswaLaki         = kpis?.total_siswa?.laki_laki    ?? 0;
  const siswaPerempuan    = kpis?.total_siswa?.perempuan    ?? 0;

  const totalPegawai      = kpis?.total_pegawai?.total      ?? '-';
  const pegawaiLaki       = kpis?.total_pegawai?.laki_laki  ?? 0;
  const pegawaiPerempuan  = kpis?.total_pegawai?.perempuan  ?? 0;

  const siswaHadir        = kpis?.absensi_hari_ini?.siswa_hadir       ?? '-';
  const siswaBelumAbsen   = kpis?.absensi_hari_ini?.siswa_belum_absen ?? '-';
  const pegawaiHadir      = kpis?.absensi_hari_ini?.guru_hadir        ?? kpis?.absensi_hari_ini?.pegawai_hadir ?? '-';

  const siswaIncomplete   = kpis?.siswa_incomplete?.total   ?? '-';
  const pegawaiIncomplete = kpis?.pegawai_incomplete?.total ?? '-';

  const tahunAjaran = ctx?.tahun_ajaran?.nama
    ?? ctx?.tahun_ajaran?.name
    ?? dashboard?.academic_year
    ?? null;

  const unitName = ctx?.unit?.nama
    ?? ctx?.unit?.name
    ?? dashboard?.unit?.nama
    ?? dashboard?.unit?.name
    ?? null;

  // --- Chart data ---
  const chartSiswaGender   = Array.isArray(charts?.siswa_gender)        ? charts.siswa_gender        : [];
  const chartAbsensi       = Array.isArray(charts?.absensi_hari_ini)    ? charts.absensi_hari_ini    : [];
  const chartSiswaLengkap  = Array.isArray(charts?.siswa_kelengkapan)   ? charts.siswa_kelengkapan   : [];
  const chartPegawaiLengkap= Array.isArray(charts?.pegawai_kelengkapan) ? charts.pegawai_kelengkapan : [];

  // --- Subcomponents ---
  const KpiCard = ({
    icon, iconBg, gradient, borderColor, count, label, sub, subDetail, onPress,
  }: {
    icon: string; iconBg: string; gradient: GradientTuple;
    borderColor: string; count: any; label: string; sub: string;
    subDetail?: string; onPress: () => void;
  }) => (
    <TouchableOpacity activeOpacity={0.85} onPress={onPress} style={[styles.kpiCard, { borderColor }]}>
      <LinearGradient colors={gradient} style={styles.kpiGradient}>
        <View style={styles.kpiTopRow}>
          <View style={[styles.kpiIconWrap, { backgroundColor: iconBg }]}>
            <MaterialCommunityIcons name={icon as never} size={16} color="#FFFFFF" />
          </View>
          <Text style={[styles.kpiCount, { color: iconBg }]} numberOfLines={1} adjustsFontSizeToFit>
            {count}
          </Text>
        </View>
        <Text style={styles.kpiLabel}>{label}</Text>
        <Text style={styles.kpiSub}>{sub}</Text>
        {subDetail ? <Text style={styles.kpiSubDetail}>{subDetail}</Text> : null}
      </LinearGradient>
    </TouchableOpacity>
  );

  const QBtn = ({ icon, iconBg, label, onPress }: {
    icon: string; iconBg: string; label: string; onPress: () => void;
  }) => (
    <TouchableOpacity activeOpacity={0.8} onPress={onPress} style={styles.qBtnTile}>
      <View style={[styles.qBtnBox, { backgroundColor: iconBg }]}>
        <MaterialCommunityIcons name={icon as never} size={20} color="#FFFFFF" />
      </View>
      <Text style={styles.qBtnLabel} numberOfLines={2}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      {/* ── Card Kelola Data & Tahun Ajaran (Model Card KPI) ── */}
      <TouchableOpacity
        activeOpacity={0.85}
        onPress={() => navigation?.navigate('Data', { initialResource: 'students' })}
        style={styles.kelolaKpiCard}
      >
        <LinearGradient colors={['#F0FDFA', '#CCFBF1']} style={styles.kelolaKpiGradient}>
          <View style={styles.kelolaKpiLeft}>
            <View style={styles.kelolaKpiIconWrap}>
              <MaterialCommunityIcons name="database-cog-outline" size={20} color="#FFFFFF" />
            </View>
            <View style={{ flex: 1 }}>
              <View style={styles.kelolaKpiYearRow}>
                <MaterialCommunityIcons name="calendar-clock-outline" size={12} color="#0D9488" />
                <Text style={styles.kelolaKpiYearText}>
                  {tahunAjaran ? `TA ${tahunAjaran}` : 'TA Aktif'}
                </Text>
                {unitName ? (
                  <>
                    <Text style={[styles.kelolaKpiYearText, { marginHorizontal: 2 }]}>•</Text>
                    <MaterialCommunityIcons name="domain" size={12} color="#0D9488" />
                    <Text style={styles.kelolaKpiYearText} numberOfLines={1}>{unitName}</Text>
                  </>
                ) : null}
              </View>
              <Text style={styles.kelolaKpiTitle}>Kelola Data Sekolah</Text>
              <Text style={styles.kelolaKpiSub}>
                {unitName ? `Unit: ${unitName} • Akses data siswa & pegawai` : 'Akses cepat master data siswa & pegawai'}
              </Text>
            </View>
          </View>

          <View style={styles.kelolaKpiActionBtn}>
            <Text style={styles.kelolaKpiActionText}>Kelola</Text>
            <MaterialCommunityIcons name="chevron-right" size={16} color="#0D9488" />
          </View>
        </LinearGradient>
      </TouchableOpacity>

      {/* ── Baris 1: Data Pokok (Siswa + Pegawai) ── */}
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="account-school-outline" iconBg="#2563EB"
          gradient={['#EFF6FF', '#DBEAFE']} borderColor="#93C5FD"
          count={totalSiswa}
          label="Total Siswa"
          sub="Aktif terdaftar"
          subDetail={totalSiswa !== '-' ? `L: ${siswaLaki}  P: ${siswaPerempuan}` : undefined}
          onPress={() => setActiveKpiType('total_siswa')}
        />
        <KpiCard
          icon="badge-account-outline" iconBg="#0891B2"
          gradient={['#ECFEFF', '#CFFAFE']} borderColor="#67E8F9"
          count={totalPegawai}
          label="Total Pegawai"
          sub="Staf aktif"
          subDetail={totalPegawai !== '-' ? `L: ${pegawaiLaki}  P: ${pegawaiPerempuan}` : undefined}
          onPress={() => setActiveKpiType('total_pegawai')}
        />
      </View>

      {/* ── Baris 2: Absensi Hari Ini (3 card rapi & proporsional) ── */}
      <View style={styles.kpiGrid3}>
        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setActiveAbsensiTab('siswa_hadir');
            setActiveKpiType('absensi_hari_ini');
          }}
          style={[styles.kpiCard3, { borderColor: '#99F6E4' }]}
        >
          <LinearGradient colors={['#F0FDFA', '#CCFBF1']} style={styles.kpiGradient3}>
            <View style={[styles.kpiIconWrap3, { backgroundColor: '#0D9488', shadowColor: '#0D9488' }]}>
              <MaterialCommunityIcons name="door-open" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.kpiContentCol3}>
              <Text style={[styles.kpiCount3, { color: '#0D9488' }]}>{siswaHadir}</Text>
              <Text style={styles.kpiLabel3} numberOfLines={1}>Siswa Hadir</Text>
              <Text style={[styles.kpiSub3, { color: '#0F766E' }]}>Tercatat</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setActiveAbsensiTab('siswa_belum_absen');
            setActiveKpiType('absensi_hari_ini');
          }}
          style={[styles.kpiCard3, { borderColor: '#FCD34D' }]}
        >
          <LinearGradient colors={['#FFFBEB', '#FEF3C7']} style={styles.kpiGradient3}>
            <View style={[styles.kpiIconWrap3, { backgroundColor: '#D97706', shadowColor: '#D97706' }]}>
              <MaterialCommunityIcons name="account-clock-outline" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.kpiContentCol3}>
              <Text style={[styles.kpiCount3, { color: '#D97706' }]}>{siswaBelumAbsen}</Text>
              <Text style={styles.kpiLabel3} numberOfLines={1}>Belum Absen</Text>
              <Text style={[styles.kpiSub3, { color: '#B45309' }]}>Belum Hadir</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={() => {
            setActiveAbsensiTab('pegawai');
            setActiveKpiType('absensi_hari_ini');
          }}
          style={[styles.kpiCard3, { borderColor: '#C7D2FE' }]}
        >
          <LinearGradient colors={['#EEF2FF', '#E0E7FF']} style={styles.kpiGradient3}>
            <View style={[styles.kpiIconWrap3, { backgroundColor: '#4F46E5', shadowColor: '#4F46E5' }]}>
              <MaterialCommunityIcons name="account-tie-outline" size={16} color="#FFFFFF" />
            </View>
            <View style={styles.kpiContentCol3}>
              <Text style={[styles.kpiCount3, { color: '#4F46E5' }]}>{pegawaiHadir}</Text>
              <Text style={styles.kpiLabel3} numberOfLines={1}>Guru Hadir</Text>
              <Text style={[styles.kpiSub3, { color: '#3730A3' }]}>Staf Pengajar</Text>
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>

      {/* ── Baris 3: Kelengkapan Data ── */}
      <View style={styles.kpiGrid}>
        <KpiCard
          icon="account-alert-outline" iconBg="#F59E0B"
          gradient={['#FFFBEB', '#FEF3C7']} borderColor="#FCD34D"
          count={siswaIncomplete}
          label="Siswa Belum Lengkap"
          sub="NISN / Tgl Lahir / Wali"
          onPress={() => setActiveKpiType('siswa_incomplete')}
        />
        <KpiCard
          icon="card-account-details-outline" iconBg="#EF4444"
          gradient={['#FEF2F2', '#FEE2E2']} borderColor="#FECACA"
          count={pegawaiIncomplete}
          label="Pegawai Belum Lengkap"
          sub="NIY / NIK belum diisi"
          onPress={() => setActiveKpiType('pegawai_incomplete')}
        />
      </View>

      {/* ── Charts: Absensi & Gender Siswa ── */}
      {(chartAbsensi.length > 0 || chartSiswaGender.length > 0) && (
        <View style={styles.chartSection}>
          <View style={styles.chartSectionHeader}>
            <MaterialCommunityIcons name="chart-pie" size={16} color="#0D9488" style={{ marginRight: 5 }} />
            <Text style={styles.chartSectionTitle}>Grafik Hari Ini</Text>
          </View>
          {chartAbsensi.length > 0 && (
            <MiniBarChart data={chartAbsensi} label="Komposisi Absensi Hari Ini" />
          )}
          {chartSiswaGender.length > 0 && (
            <MiniBarChart data={chartSiswaGender} label="Gender Siswa" />
          )}
          {chartSiswaLengkap.length > 0 && (
            <MiniBarChart data={chartSiswaLengkap} label="Kelengkapan Data Siswa" />
          )}
          {chartPegawaiLengkap.length > 0 && (
            <MiniBarChart data={chartPegawaiLengkap} label="Kelengkapan Data Pegawai" />
          )}
        </View>
      )}

      {/* ── Modul 1: Presensi & Kehadiran ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBadge, { backgroundColor: '#CCFBF1' }]}>
            <MaterialCommunityIcons name="clock-check-outline" size={16} color="#0D9488" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Presensi & Kehadiran</Text>
            <Text style={styles.sectionSubtitle}>Monitoring kehadiran & terminal gerbang</Text>
          </View>
        </View>
        <View style={styles.qBtnGrid}>
          <QBtn icon="door-open"              iconBg="#0D9488" label="Absensi Gerbang"  onPress={() => navigation?.navigate('AbsensiGerbangTerminal')} />
          <QBtn icon="calendar-check-outline" iconBg="#059669" label="Presensi KBM"     onPress={() => navigation?.navigate('PresensiKbmPengganti')} />
          <QBtn icon="clipboard-list-outline" iconBg="#059669" label="Rekap Siswa"      onPress={() => navigation?.navigate('RekapPresensiSiswa')} />
          <QBtn icon="account-check-outline" iconBg="#10B981" label="Presensi Mandiri" onPress={() => navigation?.navigate('PresensiMandiriStaff')} />
        </View>
      </View>

      {/* ── Modul 2: Pembelajaran LMS & Asesmen ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBadge, { backgroundColor: '#DBEAFE' }]}>
            <MaterialCommunityIcons name="school-outline" size={16} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Akademik & LMS</Text>
            <Text style={styles.sectionSubtitle}>Materi, tugas, CBT & penilaian</Text>
          </View>
        </View>
        <View style={styles.qBtnGrid}>
          <QBtn icon="clock-time-four"         iconBg="#7C3AED" label="Jadwal Pelajaran" onPress={() => navigation?.navigate('Jadwal')} />
          <QBtn icon="book-multiple"          iconBg="#0D9488" label="Bahan Ajar"      onPress={() => navigation?.navigate('Materi')} />
          <QBtn icon="clipboard-text"         iconBg="#F59E0B" label="Tugas LMS"       onPress={() => navigation?.navigate('Tugas')} />
          <QBtn icon="calendar-month"         iconBg="#0284C7" label="Kalender KBM"     onPress={() => navigation?.navigate('Kalender')} />
          <QBtn icon="laptop"                 iconBg="#2563EB" label="Ujian CBT"       onPress={() => navigation?.navigate('CbtExams')} />
          <QBtn icon="database-outline"       iconBg="#0D9488" label="Bank Soal"       onPress={() => navigation?.navigate('BankSoal')} />
          <QBtn icon="file-question"          iconBg="#EF4444" label="Kisi-kisi"       onPress={() => navigation?.navigate('KisiKisi')} />
          <QBtn icon="chart-box"              iconBg="#10B981" label="Nilai Siswa"     onPress={() => navigation?.navigate('Nilai')} />
        </View>
      </View>

      {/* ── Modul 3: Data Pokok & Administrasi ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBadge, { backgroundColor: '#DCFCE7' }]}>
            <MaterialCommunityIcons name="folder-account-outline" size={16} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Data Pokok & Administrasi</Text>
            <Text style={styles.sectionSubtitle}>Master data, alumni, tagihan & catatan</Text>
          </View>
        </View>
        <View style={styles.qBtnGrid}>
          <QBtn icon="database-outline"       iconBg="#059669" label="Data Master"      onPress={() => navigation?.navigate('Data')} />
          <QBtn icon="school"                 iconBg="#D97706" label="Kelola Alumni"    onPress={() => navigation?.navigate('Data', { initialResource: 'students', filterStatus: 'lulus', mode: 'alumni' })} />
          <QBtn icon="cash-multiple"          iconBg="#E11D48" label="Tagihan Siswa"    onPress={() => navigation?.navigate('Tagihan')} />
          <QBtn icon="book-open-page-variant" iconBg="#8B5CF6" label="Catatan Siswa"    onPress={() => navigation?.navigate('Komentar')} />
        </View>
      </View>

      {/* ── Modul 4: Keagamaan & Komunikasi ── */}
      <View style={styles.sectionCard}>
        <View style={styles.sectionHeader}>
          <View style={[styles.sectionIconBadge, { backgroundColor: '#F3E8FF' }]}>
            <MaterialCommunityIcons name="book-open-variant" size={16} color="#7C3AED" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.sectionTitle}>Keagamaan & Komunikasi</Text>
            <Text style={styles.sectionSubtitle}>Al-Qur'an, komunikasi & koordinasi pegawai</Text>
          </View>
        </View>
        <View style={styles.qBtnGrid}>
          <QBtn icon="book-open-variant"      iconBg="#2563EB" label="Al-Qur'an Digital" onPress={() => navigation?.navigate('Quran')} />
          <QBtn icon="message-text-outline"   iconBg="#059669" label="Chat Pegawai"     onPress={() => navigation?.navigate('Chat Guru')} />
          <QBtn icon="bullhorn"               iconBg="#E11D48" label="Informasi"        onPress={() => navigation?.navigate('Informasi')} />
        </View>
      </View>

      {/* ── Modal Drilldown Rincian Data KPI (Sama dengan Web-Dashboard TataUsahaKpiModal) ── */}
      <TuKpiDrilldownModal
        type={activeKpiType}
        visible={Boolean(activeKpiType)}
        onClose={() => setActiveKpiType(null)}
        navigation={navigation}
        initialTab={activeAbsensiTab}
        unitName={unitName || undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 16, paddingTop: 10, paddingBottom: 4 },
  // Card Kelola Utama / Data Sekolah (Model Card KPI)
  kelolaKpiCard: {
    borderRadius: 16,
    borderWidth: 1.5,
    borderColor: '#99F6E4',
    overflow: 'hidden',
    marginBottom: 10,
    marginTop: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
  },
  kelolaKpiGradient: {
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kelolaKpiLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  kelolaKpiIconWrap: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#0D9488',
    justifyContent: 'center',
    alignItems: 'center',
  },
  kelolaKpiYearRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 2,
  },
  kelolaKpiYearText: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#0D9488',
  },
  kelolaKpiTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: 18,
  },
  kelolaKpiSub: {
    fontSize: 10,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  kelolaKpiActionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#99F6E4',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 12,
    shadowColor: '#0D9488',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 1,
  },
  kelolaKpiActionText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0D9488',
  },
  // 2-col KPI grid
  kpiGrid: { flexDirection: 'row', gap: 10, marginBottom: 10 },
  kpiCard: {
    flex: 1, borderRadius: 16, borderWidth: 1.5, overflow: 'hidden',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.06, shadowRadius: 4, elevation: 2,
  },
  kpiGradient: { padding: 12 },
  kpiTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 },
  kpiIconWrap: { width: 30, height: 30, borderRadius: 9, justifyContent: 'center', alignItems: 'center' },
  kpiCount: { fontSize: 20, fontWeight: '900', letterSpacing: -0.5 },
  kpiLabel: { fontSize: 11.5, fontWeight: '800', color: '#1E293B', lineHeight: 15 },
  kpiSub: { fontSize: 10, fontWeight: '600', color: '#64748B', marginTop: 1 },
  kpiSubDetail: { fontSize: 10, fontWeight: '700', color: '#94A3B8', marginTop: 2 },
  // 3-col KPI grid (absensi rapi & lapang)
  kpiGrid3: { flexDirection: 'row', gap: 8, marginBottom: 12 },
  kpiCard3: {
    flex: 1,
    borderRadius: 16,
    borderWidth: 1.5,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 4,
    elevation: 2,
    minHeight: 114,
  },
  kpiGradient3: {
    flex: 1,
    paddingVertical: 12,
    paddingHorizontal: 6,
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  kpiIconWrap3: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.15,
    shadowRadius: 3,
    elevation: 2,
    marginBottom: 6,
  },
  kpiContentCol3: {
    alignItems: 'center',
    width: '100%',
  },
  kpiCount3: {
    fontSize: 20,
    fontWeight: '900',
    letterSpacing: -0.5,
    marginBottom: 2,
    lineHeight: 24,
  },
  kpiLabel3: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#1E293B',
    textAlign: 'center',
    lineHeight: 14,
  },
  kpiSub3: {
    fontSize: 9,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
    letterSpacing: 0.2,
  },
  // Chart section
  chartSection: {
    backgroundColor: '#FFFFFF', borderRadius: 20, padding: 14, marginBottom: 12,
    borderWidth: 1, borderColor: '#E2E8F0',
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.04, shadowRadius: 4, elevation: 1,
  },
  chartSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: 2 },
  chartSectionTitle: { fontSize: 13, fontWeight: '800', color: '#0F172A' },
  // Section card (quick actions categorized)
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 4,
    elevation: 2,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 10,
  },
  sectionIconBadge: {
    width: 32,
    height: 32,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionSubtitle: {
    fontSize: 10.5,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 1,
  },
  // Quick buttons
  qBtnGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  qBtnTile: {
    width: '22%',
    alignItems: 'center',
    paddingVertical: 4,
  },
  qBtnBox: {
    width: 44,
    height: 44,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 6,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 1.5,
  },
  qBtnLabel: {
    fontSize: 10,
    fontWeight: '700',
    color: '#334155',
    textAlign: 'center',
    lineHeight: 13,
  },
});
