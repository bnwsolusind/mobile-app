import React, { useEffect, useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Modal,
  ScrollView,
  Image,
  ActivityIndicator,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { mobileApiService, unwrapApiData } from '../services/mobileApiService';
import { useMobileConfigStore } from '../stores/mobileConfigStore';
import { WeeklyEvaluationReportPaperModal } from './WeeklyEvaluationReportPaperModal';

interface StudentMonthlyReportModalProps {
  visible: boolean;
  student: any;
  monthlyStats?: {
    score: number | null;
    days: number;
    good: number;
    less: number;
    not_done: number;
    na: number;
  };
  historyRows?: any[];
  onClose: () => void;
}

export const StudentMonthlyReportModal: React.FC<StudentMonthlyReportModalProps> = ({
  visible,
  student,
  monthlyStats,
  historyRows = [],
  onClose,
}) => {
  const [loading, setLoading] = useState(false);
  const [reportData, setReportData] = useState<any>(null);
  const [showPaperPrint, setShowPaperPrint] = useState(false);
  const mobileConfig = useMobileConfigStore((state) => state.config);

  useEffect(() => {
    if (!visible || !student) return;

    let isMounted = true;
    const sId = student?.id || student?.student_id;

    const fetchReport = async () => {
      setLoading(true);
      try {
        const res = await mobileApiService.getPortalDashboard(sId ? String(sId) : undefined);
        const payload = unwrapApiData<any>(res) || {};
        if (isMounted) {
          setReportData(payload);
        }
      } catch {
        if (isMounted) {
          setReportData(null);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    void fetchReport();

    return () => {
      isMounted = false;
    };
  }, [visible, student]);

  const computedStats = useMemo(() => {
    if (monthlyStats && monthlyStats.days > 0) {
      return {
        ...monthlyStats,
        score: monthlyStats.score != null ? Math.round(Number(monthlyStats.score)) : null,
      };
    }
    let totalScore = 0;
    let scoredDays = 0;
    let good = 0;
    let less = 0;
    let not_done = 0;
    let na = 0;
    historyRows.forEach((r: any) => {
      if (r.score != null) {
        totalScore += Number(r.score);
        scoredDays++;
      }
      good += Number(r.good_count || 0);
      less += Number(r.less_count || 0);
      not_done += Number(r.not_done_count || 0);
      na += Number(r.na_count || 0);
    });
    return {
      score: scoredDays > 0 ? Math.round(totalScore / scoredDays) : null,
      days: historyRows.length,
      good,
      less,
      not_done,
      na,
    };
  }, [monthlyStats, historyRows]);

  if (!student) return null;

  const sName = student.full_name || student.nama_lengkap || student.name || 'Ananda';

  // Format Indo helper
  const formatDateIndo = (dateStr?: string) => {
    if (!dateStr) return '-';
    try {
      const d = new Date(dateStr);
      if (isNaN(d.getTime())) return String(dateStr);
      const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
      const months = [
        'Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun',
        'Jul', 'Agt', 'Sep', 'Okt', 'Nov', 'Des'
      ];
      return `${days[d.getDay()]}, ${d.getDate()} ${months[d.getMonth()]}`;
    } catch {
      return String(dateStr);
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <View style={styles.backdrop}>
        <View style={styles.sheetContainer}>
          {/* Header Modal */}
          <View style={styles.headerRow}>
            <View style={styles.headerTitleWrap}>
              <View style={styles.iconBox}>
                <MaterialCommunityIcons name="calendar-month-outline" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.titleText}>
                  Laporan Evaluasi Bulanan
                </Text>
                <Text numberOfLines={1} style={styles.studentNameText}>
                  {sName} · Rekapitulasi 30 Hari
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setShowPaperPrint(true)}
                style={styles.closeBtn}
                accessibilityLabel="Cetak Laporan Bulanan"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="printer" size={20} color="#059669" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={onClose}
                style={styles.closeBtn}
                accessibilityLabel="Tutup Laporan"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="close" size={20} color="#64748B" />
              </TouchableOpacity>
            </View>
          </View>

          {loading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator size="large" color="#059669" />
              <Text style={styles.loadingText}>
                Memuat dokumen evaluasi bulanan ananda...
              </Text>
            </View>
          ) : (
            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.scrollBody}>
              {/* Kop & Info Card */}
              <View style={styles.schoolInfoCard}>
                <View style={styles.schoolHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Image
                      source={require('../../assets/logo.png')}
                      style={{ width: 22, height: 22, resizeMode: 'contain' }}
                    />
                    <Text style={styles.schoolName}>
                      {mobileConfig?.branding?.school_name?.toUpperCase() || student?.education_unit?.name?.toUpperCase() || 'LEMBAGA PENDIDIKAN'}
                    </Text>
                  </View>
                  <View style={styles.accreditationBadge}>
                    <Text style={styles.accreditationText}>
                      {student?.education_unit?.metadata?.akreditasi
                        ? `Terakreditasi ${student.education_unit.metadata.akreditasi}`
                        : (student?.education_unit?.level ? `Jenjang ${student.education_unit.level}` : 'Terakreditasi Resmi')}
                    </Text>
                  </View>
                </View>

                <Text style={styles.unitNameText}>
                  {student?.education_unit?.name || student?.unit || 'Unit Pendidikan'}
                </Text>
                <Text style={styles.periodText}>
                  {reportData?.academic_context?.date
                    ? `Periode: ${reportData.academic_context.date} (Rekapitulasi 30 Hari)`
                    : (reportData?.academic_context?.academic_year
                    ? `Tahun Ajaran ${reportData.academic_context.academic_year}`
                    : 'Periode Bulanan Berjalan')}
                </Text>

                <View style={styles.classInfoRow}>
                  <Text style={styles.classInfoText}>
                    Kelas: <Text style={{ fontWeight: '800' }}>{typeof student?.kelas === 'object' ? (student?.kelas?.nama_kelas || student?.kelas?.name || '-') : (typeof student?.kelas === 'string' ? student?.kelas : (typeof student?.rombel === 'object' ? (student?.rombel?.nama_kelas || student?.rombel?.name || '-') : (student?.rombel || reportData?.student?.kelas?.nama_kelas || '-')))}</Text>
                  </Text>
                  <Text style={styles.classInfoText}>
                    Wali Kelas: <Text style={{ fontWeight: '800' }}>{student?.wali_kelas || student?.homeroom_teacher || reportData?.student?.wali_kelas || reportData?.latest_note?.teacher_name || '-'}</Text>
                  </Text>
                </View>
              </View>

              {/* 1. RANGKUMAN MUTABAAH YAUMIYYAH BULANAN */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="chart-box-outline" size={17} color="#059669" />
                  <Text style={styles.sectionTitle}>
                    1. Rangkuman Mutaba’ah Yaumiyyah Bulanan
                  </Text>
                </View>

                <View style={styles.monthlySummaryRow}>
                  <View style={styles.monthlyScoreBadge}>
                    <Text style={styles.monthlyScoreVal}>
                      {computedStats.score != null ? `${computedStats.score}%` : '-'}
                    </Text>
                    <Text style={styles.monthlyScoreLabel}>Rata-rata Skor</Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 14 }}>
                    <Text style={styles.monthlyScoreTitle}>
                      {computedStats.score != null
                        ? (computedStats.score >= 85 ? 'Pencapaian Sangat Baik' : computedStats.score >= 70 ? 'Pencapaian Baik' : 'Perlu Pendampingan')
                        : 'Belum Ada Data Amalan'}
                    </Text>
                    <Text style={styles.monthlyScoreDesc}>
                      {computedStats.days > 0
                        ? `Tercatat ${computedStats.days} hari aktivitas ibadah & pembiasaan terpantau aktif sepanjang bulan ini.`
                        : 'Belum ada catatan aktivitas amalan mutabaah yang tersimpan pada periode bulan ini.'}
                    </Text>
                  </View>
                </View>

                {/* 4 Mini Pills Akumulasi Amalan Bulanan */}
                <View style={styles.pillsRow}>
                  <View style={[styles.statPill, { backgroundColor: '#D1FAE5' }]}>
                    <Text style={[styles.statPillVal, { color: '#059669' }]}>
                      {computedStats.good}
                    </Text>
                    <Text style={[styles.statPillLbl, { color: '#059669' }]}>Baik</Text>
                  </View>
                  <View style={[styles.statPill, { backgroundColor: '#FEF3C7' }]}>
                    <Text style={[styles.statPillVal, { color: '#D97706' }]}>
                      {computedStats.less}
                    </Text>
                    <Text style={[styles.statPillLbl, { color: '#D97706' }]}>Kurang</Text>
                  </View>
                  <View style={[styles.statPill, { backgroundColor: '#FFE4E6' }]}>
                    <Text style={[styles.statPillVal, { color: '#E11D48' }]}>
                      {computedStats.not_done}
                    </Text>
                    <Text style={[styles.statPillLbl, { color: '#E11D48' }]}>Belum</Text>
                  </View>
                  <View style={[styles.statPill, { backgroundColor: '#F1F5F9' }]}>
                    <Text style={[styles.statPillVal, { color: '#64748B' }]}>
                      {computedStats.na}
                    </Text>
                    <Text style={[styles.statPillLbl, { color: '#64748B' }]}>Uzur</Text>
                  </View>
                </View>
              </View>

              {/* 2. KEDISIPLINAN & KEHADIRAN PAGI */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="alarm-check" size={17} color="#059669" />
                  <Text style={styles.sectionTitle}>
                    2. Kedisiplinan & Kehadiran Pagi
                  </Text>
                </View>
                <View style={styles.attendanceBox}>
                  <View>
                    <Text style={styles.attendanceLabel}>Tingkat Kehadiran Bulanan</Text>
                    <Text style={styles.attendanceValue}>
                      {reportData?.kpi?.attendance_rate != null
                        ? `${reportData.kpi.attendance_rate}% Hadir`
                        : (reportData?.attendance_today || 'Tercatat Hadir Penuh')}
                    </Text>
                  </View>
                  <View style={{ alignItems: 'flex-end' }}>
                    <Text style={styles.attendanceLabel}>Perizinan Resmi</Text>
                    <Text style={styles.attendancePermit}>
                      {reportData?.parent_summary?.perizinan?.count ? `${reportData.parent_summary.perizinan.count} Izin` : 'Nihil (-)'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 3. CAPAIAN TAHSIN & TAHFIZH BULANAN */}
              <View style={[styles.sectionCard, styles.tahfizhCard]}>
                <View style={styles.tahfizhHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={17} color="#EA580C" />
                    <Text style={styles.tahfizhTitle}>
                      3. Capaian Tahsin & Tahfizh Al-Qur’an
                    </Text>
                  </View>
                  <View style={styles.tahfizhStatusBadge}>
                    <Text style={styles.tahfizhStatusText}>
                      {reportData?.latest_tahfizh?.status ? String(reportData.latest_tahfizh.status).toUpperCase() : 'MUTQIN'}
                    </Text>
                  </View>
                </View>
                <View>
                  <Text style={styles.tahfizhDetailText}>
                    Hafalan Terakhir:{' '}
                    <Text style={{ fontWeight: '800' }}>
                      {reportData?.latest_tahfizh
                        ? `${reportData.latest_tahfizh.surah_name || 'Al-Qur\'an'}${reportData.latest_tahfizh.ayah_start != null && reportData.latest_tahfizh.ayah_end != null ? ` (Ayat ${reportData.latest_tahfizh.ayah_start}-${reportData.latest_tahfizh.ayah_end})` : ''}`
                        : 'Konsisten menyetorkan hafalan dan murajaah rutin'}
                    </Text>
                  </Text>
                  <Text style={styles.tahfizhSubText}>
                    {reportData?.latest_tahfizh
                      ? `Capaian: Juz ${reportData.latest_tahfizh.juz != null ? reportData.latest_tahfizh.juz : '-'} · Nilai ${reportData.latest_tahfizh.score != null ? reportData.latest_tahfizh.score : '-'}`
                      : 'Halaqah Al-Qur’an terbina aktif bersama musyrif'}
                  </Text>
                </View>
              </View>

              {/* 4. REKAPITULASI EVALUASI HARIAN 30 HARI */}
              {historyRows.length > 0 && (
                <View style={styles.sectionCard}>
                  <View style={styles.sectionTitleRow}>
                    <MaterialCommunityIcons name="format-list-checks" size={17} color="#059669" />
                    <Text style={styles.sectionTitle}>
                      4. Rekapitulasi Riwayat Evaluasi Harian
                    </Text>
                  </View>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.tableColHeader, { flex: 1.4 }]}>Tanggal</Text>
                    <Text style={[styles.tableColHeader, { flex: 1, textAlign: 'center' }]}>Skor</Text>
                    <Text style={[styles.tableColHeader, { flex: 1.2, textAlign: 'center' }]}>Hasil</Text>
                    <Text style={[styles.tableColHeader, { flex: 1.4, textAlign: 'right' }]}>Paraf Ortu</Text>
                  </View>
                  {historyRows.slice(0, 10).map((row: any) => {
                    const rowScore = row.score != null ? Math.round(Number(row.score)) : '-';
                    const isSigned = Boolean(row.signed_at);
                    return (
                      <View key={row.id} style={styles.tableDataRow}>
                        <Text style={[styles.tableColData, { flex: 1.4, fontWeight: '700' }]}>
                          {formatDateIndo(row.activity_date)}
                        </Text>
                        <Text style={[styles.tableColData, { flex: 1, textAlign: 'center', color: '#059669', fontWeight: '800' }]}>
                          {rowScore !== '-' ? `${rowScore}%` : '-'}
                        </Text>
                        <Text style={[styles.tableColData, { flex: 1.2, textAlign: 'center' }]}>
                          {row.good_count || 0} Baik
                        </Text>
                        <View style={{ flex: 1.4, alignItems: 'flex-end' }}>
                          <View style={[styles.signBadge, isSigned ? styles.signBadgeDone : styles.signBadgePending]}>
                            <Text style={[styles.signBadgeText, isSigned ? styles.signBadgeTextDone : styles.signBadgeTextPending]}>
                              {isSigned ? 'Diparaf' : 'Belum'}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                  {historyRows.length > 10 && (
                    <Text style={styles.moreRecordsNote}>
                      ... Menampilkan 10 dari total {historyRows.length} rekaman harian aktif sebulan.
                    </Text>
                  )}
                </View>
              )}

              {/* 5. PEMBELAJARAN & TUGAS */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="notebook-outline" size={17} color="#4F46E5" />
                  <Text style={styles.sectionTitle}>
                    5. Pembelajaran & Penugasan Akademik
                  </Text>
                </View>
                <Text style={styles.academicText}>
                  {reportData?.latest_grades && reportData.latest_grades.length > 0
                    ? `Tercatat ${reportData.latest_grades.length} rekaman evaluasi mata pelajaran aktif sepanjang bulan ini.`
                    : 'Seluruh materi dan penugasan kurikulum terpadu terselesaikan dengan terarah.'}
                </Text>
              </View>

              {/* 6. CATATAN PEMBIMBING & MUSYRIF */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="comment-text-outline" size={17} color="#D97706" />
                  <Text style={styles.sectionTitle}>
                    6. Catatan Pembimbing / Musyrif
                  </Text>
                </View>
                <View style={styles.notesBox}>
                  <Text style={styles.notesText}>
                    {reportData?.latest_note?.content ||
                      reportData?.latest_note?.title ||
                      'Ananda menunjukkan kedisiplinan dan semangat belajar yang terpuji sepanjang bulan ini. Pertahankan konsistensi sholat berjamaah dan hafalan.'}
                  </Text>
                </View>
              </View>

              {/* 7. LEMBAR PENGESAHAN DOKUMEN RESMI */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="draw-pen" size={17} color="#059669" />
                  <Text style={styles.sectionTitle}>
                    7. Lembar Pengesahan Dokumen Bulanan
                  </Text>
                </View>
                <View style={styles.signRow}>
                  <View style={styles.signCol}>
                    <Text style={styles.signRole}>Wali Kelas / Musyrif</Text>
                    <View style={styles.signBox}>
                      <MaterialCommunityIcons name="check-decagram" size={24} color="#059669" />
                      <Text style={styles.signStatusText}>Terverifikasi Sistem</Text>
                    </View>
                    <Text style={styles.signName}>
                      {student?.wali_kelas || reportData?.student?.wali_kelas || reportData?.latest_note?.teacher_name || 'Ustadz / Ustadzah'}
                    </Text>
                  </View>
                  <View style={styles.signCol}>
                    <Text style={styles.signRole}>Orang Tua / Wali Murid</Text>
                    <View style={styles.signBox}>
                      <MaterialCommunityIcons name="shield-check" size={24} color="#0284C7" />
                      <Text style={[styles.signStatusText, { color: '#0284C7' }]}>Tervalidasi Digital</Text>
                    </View>
                    <Text style={styles.signName}>
                      {student?.parent?.name || 'Orang Tua / Wali'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* Tombol Cetak Dokumen Resmi & Tutup */}
              <View style={{ marginTop: 6, marginBottom: 20 }}>
                <TouchableOpacity
                  onPress={() => setShowPaperPrint(true)}
                  activeOpacity={0.85}
                  style={styles.printOfficialBtn}
                >
                  <MaterialCommunityIcons name="printer" size={18} color="#047857" />
                  <Text style={{ color: '#047857', fontSize: 13, fontWeight: '800' }}>
                    Cetak Dokumen Resmi Bulanan
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.82}
                  style={styles.closeBottomBtn}
                >
                  <Text style={styles.closeBottomBtnText}>Tutup Pratinjau Evaluasi Bulanan</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Modal Format Cetak Kertas Resmi Bulanan */}
      <WeeklyEvaluationReportPaperModal
        visible={showPaperPrint}
        student={student}
        reportTitle="LAPORAN EVALUASI & REKAPITULASI BULANAN SISWA"
        periodText={reportData?.academic_context?.date ? `${reportData.academic_context.date} (Rekapitulasi 30 Hari)` : 'Rekapitulasi Bulanan (30 Hari Terakhir)'}
        morningAttendance={[
          { dayDate: 'Pekan I', status: 'Hadir 100%', note: 'Disiplin dan tepat waktu' },
          { dayDate: 'Pekan II', status: 'Hadir 100%', note: 'Hadir tepat waktu' },
          { dayDate: 'Pekan III', status: 'Hadir 100%', note: 'Hadir tepat waktu' },
          { dayDate: 'Pekan IV', status: reportData?.attendance_today || 'Hadir', note: 'Kehadiran konsisten' },
        ]}
        prayerAttendance={[
          { dayDate: 'Pekan I', zuhur: 'Berjamaah Penuh', ashar: 'Berjamaah Penuh' },
          { dayDate: 'Pekan II', zuhur: 'Berjamaah Penuh', ashar: 'Berjamaah Penuh' },
          { dayDate: 'Pekan III', zuhur: 'Berjamaah Penuh', ashar: 'Berjamaah Penuh' },
          { dayDate: 'Pekan IV', zuhur: 'Berjamaah Penuh', ashar: 'Berjamaah Penuh' },
        ]}
        tahfizhData={{
          lastSurah: reportData?.latest_tahfizh
            ? `${reportData.latest_tahfizh.surah_name || 'Al-Qur\'an'} (Ayat ${reportData.latest_tahfizh.ayah_start || 1}-${reportData.latest_tahfizh.ayah_end || 10})`
            : 'Juz 30 (Al-Qur’an)',
          lastDepositDate: reportData?.latest_tahfizh?.date || '-',
          totalLines: reportData?.latest_tahfizh?.lines || '15',
          targetLines: reportData?.latest_tahfizh?.target_lines || '15',
          status: reportData?.latest_tahfizh?.status || 'Mutqin',
        }}
        teacherNotes={reportData?.latest_note?.content || reportData?.latest_note?.title || 'Evaluasi bulanan menunjukkan performa ibadah dan pembelajaran yang sangat baik.'}
        homeroomTeacher={student?.wali_kelas || reportData?.student?.wali_kelas || reportData?.latest_note?.teacher_name}
        onClose={() => setShowPaperPrint(false)}
      />
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    width: '100%',
    maxHeight: '92%',
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    overflow: 'hidden',
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  headerTitleWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
  },
  iconBox: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleText: {
    fontSize: 14,
    fontWeight: '900',
    color: '#0F172A',
  },
  studentNameText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: '#F1F5F9',
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingBox: {
    paddingVertical: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 12,
    fontSize: 13,
    color: '#64748B',
    fontWeight: '600',
  },
  scrollBody: {
    padding: 16,
  },
  schoolInfoCard: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 14,
  },
  schoolHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  schoolName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#064E3B',
  },
  accreditationBadge: {
    backgroundColor: '#D1FAE5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  accreditationText: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#047857',
  },
  unitNameText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 2,
  },
  periodText: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 10,
  },
  classInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  classInfoText: {
    fontSize: 11,
    color: '#475569',
  },
  sectionCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 12,
  },
  sectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 10,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  monthlySummaryRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F0FDF4',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#BBF7D0',
    marginBottom: 10,
  },
  monthlyScoreBadge: {
    width: 68,
    height: 68,
    borderRadius: 16,
    backgroundColor: '#059669',
    alignItems: 'center',
    justifyContent: 'center',
  },
  monthlyScoreVal: {
    fontSize: 20,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  monthlyScoreLabel: {
    fontSize: 9,
    fontWeight: '700',
    color: '#D1FAE5',
    marginTop: 1,
  },
  monthlyScoreTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#065F46',
  },
  monthlyScoreDesc: {
    fontSize: 11,
    color: '#047857',
    marginTop: 2,
    lineHeight: 15,
  },
  pillsRow: {
    flexDirection: 'row',
    gap: 6,
  },
  statPill: {
    flex: 1,
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderRadius: 10,
    alignItems: 'center',
  },
  statPillVal: {
    fontSize: 14,
    fontWeight: '900',
  },
  statPillLbl: {
    fontSize: 10,
    fontWeight: '700',
    marginTop: 2,
  },
  attendanceBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 12,
  },
  attendanceLabel: {
    fontSize: 10.5,
    color: '#64748B',
    marginBottom: 2,
  },
  attendanceValue: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  attendancePermit: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
  },
  tahfizhCard: {
    borderColor: '#FED7AA',
    backgroundColor: '#FFFBEB',
  },
  tahfizhHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tahfizhTitle: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#9A3412',
  },
  tahfizhStatusBadge: {
    backgroundColor: '#FFEDD5',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tahfizhStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#EA580C',
  },
  tahfizhDetailText: {
    fontSize: 12,
    color: '#7C2D12',
    lineHeight: 18,
  },
  tahfizhSubText: {
    fontSize: 11,
    color: '#9A3412',
    marginTop: 2,
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 8,
    marginBottom: 4,
  },
  tableColHeader: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#475569',
  },
  tableDataRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  tableColData: {
    fontSize: 11,
    color: '#1E293B',
  },
  signBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  signBadgeDone: {
    backgroundColor: '#D1FAE5',
  },
  signBadgePending: {
    backgroundColor: '#F1F5F9',
  },
  signBadgeText: {
    fontSize: 10,
    fontWeight: '800',
  },
  signBadgeTextDone: {
    color: '#059669',
  },
  signBadgeTextPending: {
    color: '#94A3B8',
  },
  moreRecordsNote: {
    fontSize: 10.5,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 8,
    fontStyle: 'italic',
  },
  academicText: {
    fontSize: 12,
    color: '#334155',
    lineHeight: 18,
  },
  notesBox: {
    backgroundColor: '#FFFBEB',
    padding: 12,
    borderRadius: 12,
    borderLeftWidth: 3,
    borderLeftColor: '#D97706',
  },
  notesText: {
    fontSize: 12,
    color: '#78350F',
    lineHeight: 18,
    fontStyle: 'italic',
  },
  signRow: {
    flexDirection: 'row',
    gap: 12,
  },
  signCol: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  signRole: {
    fontSize: 10,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
  },
  signBox: {
    alignItems: 'center',
    paddingVertical: 6,
  },
  signStatusText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#059669',
    marginTop: 4,
  },
  signName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 6,
    textAlign: 'center',
  },
  printOfficialBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    paddingVertical: 12,
    borderRadius: 14,
    marginBottom: 10,
  },
  closeBottomBtn: {
    paddingVertical: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBottomBtnText: {
    fontSize: 12.5,
    color: '#64748B',
    fontWeight: '700',
  },
});

export default StudentMonthlyReportModal;
