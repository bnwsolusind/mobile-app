import React, { useEffect, useState } from 'react';
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

interface StudentWeeklyReportModalProps {
  visible: boolean;
  student: any;
  onClose: () => void;
}

export const StudentWeeklyReportModal: React.FC<StudentWeeklyReportModalProps> = ({
  visible,
  student,
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

  if (!student) return null;

  const sName = student.full_name || student.nama_lengkap || student.name || 'Ananda';

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
                <MaterialCommunityIcons name="file-document-check-outline" size={22} color="#059669" />
              </View>
              <View style={{ flex: 1 }}>
                <Text numberOfLines={1} style={styles.titleText}>
                  Laporan Perkembangan Pekanan
                </Text>
                <Text numberOfLines={1} style={styles.studentNameText}>
                  {sName}
                </Text>
              </View>
            </View>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <TouchableOpacity
                onPress={() => setShowPaperPrint(true)}
                style={styles.closeBtn}
                accessibilityLabel="Cetak Laporan Pekanan"
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
                Memuat data perkembangan ananda...
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
                    ? `Periode: ${reportData.academic_context.date}`
                    : (reportData?.academic_context?.academic_year
                    ? `Tahun Ajaran ${reportData.academic_context.academic_year}`
                    : 'Periode Berjalan')}
                </Text>

                <View style={styles.classInfoRow}>
                  <Text style={styles.classInfoText}>
                    Kelas: <Text style={{ fontWeight: '800' }}>{student?.kelas?.nama_kelas || student?.kelas || student?.rombel || reportData?.student?.kelas?.nama_kelas || '-'}</Text>
                  </Text>
                  <Text style={styles.classInfoText}>
                    Wali Kelas: <Text style={{ fontWeight: '800' }}>{student?.wali_kelas || student?.homeroom_teacher || reportData?.student?.wali_kelas || reportData?.latest_note?.teacher_name || '-'}</Text>
                  </Text>
                </View>
              </View>

              {/* 1. KEDISIPLINAN & KEHADIRAN */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="alarm-check" size={16} color="#059669" />
                  <Text style={styles.sectionTitle}>
                    1. Kedisiplinan & Kehadiran Pagi
                  </Text>
                </View>
                <View style={styles.attendanceBox}>
                  <View>
                    <Text style={styles.attendanceLabel}>Tingkat Kehadiran</Text>
                    <Text style={styles.attendanceValue}>
                      {reportData?.kpi?.attendance_summary?.total_days > 0
                        ? `${reportData.kpi.attendance_rate}% (${reportData.kpi.attendance_summary.present_days}/${reportData.kpi.attendance_summary.total_days} Hari)`
                        : (reportData?.kpi?.attendance_rate != null
                            ? `${reportData.kpi.attendance_rate}% Hadir`
                            : (reportData?.attendance_today || 'Tercatat Hadir'))}
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

              {/* 2. AKTIVITAS IBADAH & MUTABA'AH */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="mosque" size={16} color="#0284C7" />
                  <Text style={styles.sectionTitle}>
                    2. Aktivitas Ibadah & Mutaba'ah
                  </Text>
                </View>
                <View style={styles.mutabaahBox}>
                  <Text style={styles.mutabaahLabel}>Status Mutaba'ah Yaumiyyah Hari Ini</Text>
                  <Text style={styles.mutabaahValue}>
                    {reportData?.mutabaah_today?.status_label || (reportData?.mutabaah_today ? '✅ Sudah Terisi Lengkap' : '📅 Menunggu Pengisian')}
                  </Text>
                </View>
              </View>

              {/* 3. CAPAIAN TAHSIN & TAHFIZH */}
              <View style={[styles.sectionCard, styles.tahfizhCard]}>
                <View style={styles.tahfizhHeaderRow}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <MaterialCommunityIcons name="book-open-page-variant" size={16} color="#EA580C" />
                    <Text style={styles.tahfizhTitle}>
                      3. Capaian Tahsin & Tahfizh
                    </Text>
                  </View>
                  <View style={styles.tahfizhStatusBadge}>
                    <Text style={styles.tahfizhStatusText}>
                      {reportData?.latest_tahfizh?.status ? String(reportData.latest_tahfizh.status).toUpperCase() : 'AKTIF'}
                    </Text>
                  </View>
                </View>
                <View>
                  <Text style={styles.tahfizhDetailText}>
                    Hafalan Terakhir:{' '}
                    <Text style={{ fontWeight: '800' }}>
                      {reportData?.latest_tahfizh
                        ? `${reportData.latest_tahfizh.surah_name || 'Al-Qur\'an'}${reportData.latest_tahfizh.ayah_start != null && reportData.latest_tahfizh.ayah_end != null ? ` (Ayat ${reportData.latest_tahfizh.ayah_start}-${reportData.latest_tahfizh.ayah_end})` : ''}`
                        : 'Belum ada setoran terbaru pekan ini'}
                    </Text>
                  </Text>
                  <Text style={styles.tahfizhSubText}>
                    {reportData?.latest_tahfizh
                      ? `Capaian: Juz ${reportData.latest_tahfizh.juz != null ? reportData.latest_tahfizh.juz : '-'} · Skor ${reportData.latest_tahfizh.score != null ? reportData.latest_tahfizh.score : '-'}`
                      : 'Terjadwal pada sesi halaqah tahfizh berikutnya'}
                  </Text>
                </View>
              </View>

              {/* 4. PEMBELAJARAN & TUGAS */}
              <View style={styles.sectionCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="notebook-outline" size={16} color="#4F46E5" />
                  <Text style={styles.sectionTitle}>
                    4. Pembelajaran & Penugasan Akademik
                  </Text>
                </View>
                <Text style={styles.academicText}>
                  {reportData?.latest_grades && reportData.latest_grades.length > 0
                    ? `Tercatat ${reportData.latest_grades.length} rekaman evaluasi mata pelajaran terbaru.`
                    : 'Seluruh sesi KBM terkoordinasi aktif dengan jadwal sekolah.'}
                </Text>
                <View style={styles.academicPresensiRow}>
                  <Text style={styles.academicPresensiLabel}>Status Presensi Akademik</Text>
                  <Text style={styles.academicPresensiValue}>
                    {reportData?.kpi?.attendance_rate != null ? `${reportData.kpi.attendance_rate}% Hadir` : '—'}
                  </Text>
                </View>
              </View>

              {/* 5. CATATAN GURU */}
              <View style={styles.noteCard}>
                <View style={styles.sectionTitleRow}>
                  <MaterialCommunityIcons name="comment-text-outline" size={16} color="#CA8A04" />
                  <Text style={styles.noteTitle}>
                    5. Catatan Guru & Kemitraan
                  </Text>
                </View>
                <Text style={styles.noteContent}>
                  {reportData?.latest_note?.content ||
                    reportData?.latest_note?.title ||
                    '🤝 Keberhasilan pendidikan Ananda merupakan hasil sinergi antara sekolah dan keluarga. Semoga Allah ﷻ senantiasa menjaga dan memberkahi ananda.'}
                </Text>
                {Boolean(reportData?.latest_note?.teacher_name) && (
                  <Text style={styles.noteTeacher}>
                    — {reportData.latest_note.teacher_name}
                  </Text>
                )}
                <Text style={styles.doaText}>
                  جَزَاكُمُ اللَّهُ خَيْرًا وَبَARAKALLAHU FIIKUM
                </Text>
              </View>

              {/* Tombol Aksi Bawah */}
              <View style={{ gap: 10 }}>
                <TouchableOpacity
                  onPress={() => setShowPaperPrint(true)}
                  activeOpacity={0.85}
                  style={{
                    backgroundColor: '#ECFDF5',
                    borderWidth: 1.5,
                    borderColor: '#A7F3D0',
                    paddingVertical: 12,
                    borderRadius: 14,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 8,
                  }}
                >
                  <MaterialCommunityIcons name="printer" size={18} color="#047857" />
                  <Text style={{ color: '#047857', fontSize: 13, fontWeight: '800' }}>
                    Cetak Dokumen Resmi Pekanan
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  onPress={onClose}
                  activeOpacity={0.82}
                  style={styles.closeBottomBtn}
                >
                  <Text style={styles.closeBottomBtnText}>Tutup Pratinjau Perkembangan</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          )}
        </View>
      </View>

      {/* Modal Format Cetak Kertas Resmi */}
      <WeeklyEvaluationReportPaperModal
        visible={showPaperPrint}
        student={student}
        periodText={reportData?.academic_context?.date || reportData?.period || '-'}
        morningAttendance={reportData?.daily_attendance || []}
        prayerAttendance={reportData?.prayer_attendance || []}
        tahfizhData={{
          lastSurah: reportData?.latest_tahfizh
            ? `${reportData.latest_tahfizh.surah_name || 'Al-Qur\'an'} (Ayat ${reportData.latest_tahfizh.ayah_start || 1}-${reportData.latest_tahfizh.ayah_end || 10})`
            : '-',
          lastDepositDate: reportData?.latest_tahfizh?.date || '-',
          totalLines: reportData?.latest_tahfizh?.lines || '-',
          targetLines: reportData?.latest_tahfizh?.target_lines || '-',
          status: reportData?.latest_tahfizh?.status || 'Mutqin',
        }}
        teacherNotes={reportData?.latest_note?.content || reportData?.latest_note?.title}
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
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  periodText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  classInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  classInfoText: {
    fontSize: 11,
    color: '#334155',
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
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0F172A',
  },
  attendanceBox: {
    backgroundColor: '#ECFDF5',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  attendanceLabel: {
    fontSize: 10,
    color: '#047857',
    fontWeight: '600',
  },
  attendanceValue: {
    fontSize: 13,
    fontWeight: '900',
    color: '#064E3B',
  },
  attendancePermit: {
    fontSize: 13,
    fontWeight: '900',
    color: '#047857',
  },
  mutabaahBox: {
    backgroundColor: '#F0F9FF',
    borderRadius: 10,
    padding: 10,
  },
  mutabaahLabel: {
    fontSize: 10,
    color: '#0369A1',
    fontWeight: '600',
  },
  mutabaahValue: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#0C4A6E',
    marginTop: 2,
  },
  tahfizhCard: {
    backgroundColor: '#FFF7ED',
    borderColor: '#FED7AA',
  },
  tahfizhHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  tahfizhTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#9A3412',
  },
  tahfizhStatusBadge: {
    backgroundColor: '#10B981',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  tahfizhStatusText: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#FFFFFF',
  },
  tahfizhDetailText: {
    fontSize: 11,
    color: '#7C2D12',
  },
  tahfizhSubText: {
    fontSize: 11,
    color: '#7C2D12',
    marginTop: 2,
  },
  academicText: {
    fontSize: 11,
    color: '#64748B',
    marginBottom: 6,
  },
  academicPresensiRow: {
    backgroundColor: '#EEF2FF',
    borderRadius: 10,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  academicPresensiLabel: {
    fontSize: 11,
    fontWeight: '800',
    color: '#3730A3',
  },
  academicPresensiValue: {
    fontSize: 11,
    fontWeight: '900',
    color: '#4338CA',
  },
  noteCard: {
    backgroundColor: '#FEFCE8',
    borderRadius: 16,
    padding: 14,
    borderWidth: 1,
    borderColor: '#FEF08A',
    marginBottom: 14,
  },
  noteTitle: {
    fontSize: 12.5,
    fontWeight: '900',
    color: '#854D0E',
  },
  noteContent: {
    fontSize: 11,
    color: '#713F12',
    lineHeight: 16,
  },
  noteTeacher: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#A16207',
    marginTop: 4,
  },
  doaText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#854D0E',
    textAlign: 'center',
    marginTop: 10,
  },
  closeBottomBtn: {
    backgroundColor: '#059669',
    paddingVertical: 13,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBottomBtnText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: '800',
  },
});

export default StudentWeeklyReportModal;
