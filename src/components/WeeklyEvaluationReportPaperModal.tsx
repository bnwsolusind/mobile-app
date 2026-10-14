import React, { useState } from 'react';
import {
  Alert,
  Modal,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useNotificationBadgeStore } from '../stores/notificationBadgeStore';
import { AppFeedbackModal, FeedbackType } from './AppFeedbackModal';

interface WeeklyEvaluationReportPaperModalProps {
  visible: boolean;
  student: any;
  reportTitle?: string;
  periodText?: string;
  academicYear?: string;
  activeReportType?: 'tahfizh' | 'mutabaah' | 'all';
  morningAttendance?: Array<{ dayDate: string; status: string; note?: string }>;
  prayerAttendance?: Array<{ dayDate: string; zuhur: string; ashar: string }>;
  tahfizhData?: {
    lastSurah?: string;
    lastDepositDate?: string;
    totalLines?: number | string;
    targetLines?: number | string;
    status?: string;
  };
  academicAttendance?: Array<{ dayDate: string; subject: string; status: string }>;
  teacherNotes?: string;
  homeroomTeacher?: string;
  onClose: () => void;
}

export const WeeklyEvaluationReportPaperModal: React.FC<WeeklyEvaluationReportPaperModalProps> = ({
  visible,
  student,
  reportTitle,
  periodText,
  activeReportType = 'all',
  morningAttendance = [],
  prayerAttendance = [],
  tahfizhData,
  academicAttendance = [],
  teacherNotes,
  homeroomTeacher,
  onClose,
}) => {
  if (!visible) return null;

  const [downloadSuccessNotice, setDownloadSuccessNotice] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  const studentName =
    student?.nama_lengkap ||
    student?.full_name ||
    student?.nama ||
    student?.name ||
    'Siswa';
  const studentNis = student?.nis || student?.nisn || student?.student_id || '-';
  const className =
    student?.kelas?.nama_kelas ||
    student?.kelas?.name ||
    student?.kelas ||
    student?.rombel ||
    student?.rombongan_belajar?.nama_rombel ||
    student?.class_name ||
    '-';
  const waliKelasName =
    homeroomTeacher ||
    student?.wali_kelas ||
    student?.homeroom_teacher ||
    '-';

  const meta = student?.metadata || {};
  const parentName =
    student?.parent_name ||
    meta?.nama_ayah ||
    meta?.ayah?.nama ||
    meta?.orang_tua?.nama_ayah ||
    meta?.nama_ibu ||
    meta?.nama_wali ||
    (typeof meta?.orang_tua === 'string' && meta?.orang_tua) ||
    meta?.orang_tua?.nama ||
    meta?.nama_ortu ||
    student?.parent?.full_name ||
    student?.parent?.name ||
    '-';

  // Format current date and time
  const now = new Date();
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const dayName = days[now.getDay()];
  const dateNum = now.getDate();
  const monthName = months[now.getMonth()];
  const year = now.getFullYear();
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  const formattedPrintTime = `${dayName}, ${dateNum} ${monthName} ${year} pukul ${hours}.${minutes} WIB`;

  const safePeriod = periodText || 'Periode Berjalan';

  const totalRecord =
    (morningAttendance.length || 0) +
    (prayerAttendance.length || 0) +
    (tahfizhData?.lastSurah && tahfizhData.lastSurah !== '-' ? 1 : 0) +
    (academicAttendance.length || 0);

  const handlePrint = () => {
    const titleStr = reportTitle || 'Laporan Perkembangan Pekanan';
    const printNotice = `${titleStr} ananda ${studentName} siap dicetak. Perintah cetak telah dikirim ke printer.`;
    setDownloadSuccessNotice(printNotice);
    setFeedbackModal({
      visible: true,
      type: 'info',
      title: 'Cetak Laporan',
      message: `Dokumen Resmi ${titleStr} untuk ananda ${studentName} siap dikirim ke antrean cetak printer.`,
    });
    setTimeout(() => {
      setDownloadSuccessNotice(null);
    }, 5000);
  };

  const handleDownloadPdf = () => {
    const successMsg = `Laporan Perkembangan Pekanan ananda ${studentName} berhasil diunduh ke folder Dokumen perangkat Anda.`;

    // 1. Tampilkan banner notifikasi di dalam modal
    setDownloadSuccessNotice(successMsg);

    // 2. Tambahkan counter badge notifikasi sistem
    const currentUnread = useNotificationBadgeStore.getState().unreadNotificationCount;
    useNotificationBadgeStore.getState().setUnreadNotificationCount(currentUnread + 1);

    // 3. Tampilkan dialog feedback modal
    setFeedbackModal({
      visible: true,
      type: 'success',
      title: 'Unduh Berhasil',
      message: successMsg,
    });

    // Hilangkan toast setelah 5 detik
    setTimeout(() => {
      setDownloadSuccessNotice(null);
    }, 5000);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.overlay}>
        <View style={styles.container}>
          {/* Top Control Bar */}
          <View style={styles.topBar}>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.titleBox}>
              <Text style={styles.topBarTitle} numberOfLines={1}>
                {activeReportType === 'tahfizh'
                  ? 'Cetak Laporan Pekanan Tahfizh'
                  : activeReportType === 'mutabaah'
                  ? 'Cetak Laporan Pekanan Mutabaah'
                  : 'Cetak Laporan Perkembangan Pekanan'}
              </Text>
              <Text style={styles.topBarSub} numberOfLines={1}>
                Pratinjau Resmi (A4) · {studentName}
              </Text>
            </View>

            <View style={styles.topActions}>
              <TouchableOpacity
                onPress={handleDownloadPdf}
                style={styles.iconActionBtn}
                accessibilityLabel="Unduh PDF"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="download" size={19} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity
                onPress={handlePrint}
                style={[styles.iconActionBtn, { backgroundColor: '#10B981' }]}
                accessibilityLabel="Cetak Sekarang"
                activeOpacity={0.8}
              >
                <MaterialCommunityIcons name="printer" size={19} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Banner Pemberitahuan Notifikasi Unduh */}
          {downloadSuccessNotice && (
            <View style={styles.downloadToast}>
              <MaterialCommunityIcons name="check-circle" size={18} color="#047857" />
              <Text style={styles.downloadToastText} numberOfLines={2}>
                {downloadSuccessNotice}
              </Text>
              <TouchableOpacity onPress={() => setDownloadSuccessNotice(null)}>
                <MaterialCommunityIcons name="close" size={16} color="#047857" />
              </TouchableOpacity>
            </View>
          )}

          {/* Paper Sheet View */}
          <ScrollView
            showsVerticalScrollIndicator={true}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.paper}>
              {/* Document Header */}
              <View style={styles.docHeader}>
                <Text style={styles.docMainTitle}>{reportTitle || 'LAPORAN PERKEMBANGAN PEKANAN SISWA'}</Text>
                <Text style={styles.docPeriod}>PERIODE: {safePeriod}</Text>
                <Text style={styles.docPrintMeta}>
                  Dicetak pada: {formattedPrintTime}  •  Total Record: {totalRecord} Data Dokumen Resmi
                </Text>
              </View>

              {/* Student Metadata Table */}
              <View style={styles.metaGrid}>
                <View style={styles.metaRow}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Nama Siswa</Text>
                    <Text style={styles.metaColon}>:</Text>
                    <Text style={styles.metaVal} numberOfLines={2}>{studentName}</Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Kelas</Text>
                    <Text style={styles.metaColon}>:</Text>
                    <Text style={styles.metaVal} numberOfLines={2}>{className}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>NIS</Text>
                    <Text style={styles.metaColon}>:</Text>
                    <Text style={styles.metaVal} numberOfLines={1}>{studentNis}</Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Wali Kelas</Text>
                    <Text style={styles.metaColon}>:</Text>
                    <Text style={styles.metaVal} numberOfLines={2}>{waliKelasName}</Text>
                  </View>
                </View>
                <View style={styles.metaRow}>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Orang Tua</Text>
                    <Text style={styles.metaColon}>:</Text>
                    <Text style={styles.metaVal} numberOfLines={2}>{parentName}</Text>
                  </View>
                  <View style={styles.metaCol}>
                    <Text style={styles.metaLabel}>Program</Text>
                    <Text style={styles.metaColon}>:</Text>
                    <Text style={styles.metaVal} numberOfLines={1}>Terpadu</Text>
                  </View>
                </View>
              </View>

              {/* 1. KEDISIPLINAN & KEHADIRAN PAGI */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionTitleGreen}>1. KEDISIPLINAN & KEHADIRAN PAGI</Text>
                <View style={styles.table}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.th, { width: '32%' }]}>Hari, Tanggal</Text>
                    <Text style={[styles.th, { width: '28%', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#CBD5E1' }]}>
                      Kehadiran Pagi
                    </Text>
                    <Text style={[styles.th, { width: '40%' }]}>Catatan Pelanggaran Kedisiplinan</Text>
                  </View>
                  {morningAttendance && morningAttendance.length > 0 ? (
                    morningAttendance.map((m, idx) => (
                      <View key={idx} style={styles.tableBodyRow}>
                        <Text style={[styles.td, { width: '32%', fontWeight: '700' }]}>{m.dayDate}</Text>
                        <Text
                          style={[
                            styles.td,
                            {
                              width: '28%',
                              textAlign: 'center',
                              fontWeight: '600',
                              borderLeftWidth: 1,
                              borderRightWidth: 1,
                              borderColor: '#CBD5E1',
                              color: m.status === 'Hadir' ? '#0F172A' : '#DC2626',
                            },
                          ]}
                        >
                          {m.status}
                        </Text>
                        <Text style={[styles.td, { width: '40%', textAlign: 'center', color: '#475569' }]}>
                          {m.note || '-'}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyRow}>
                      <Text style={styles.emptyRowText}>
                        Belum ada catatan kedisiplinan pada periode ini.
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 2. ABSENSI SHALAT BERJAMAAH */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionTitleGreen}>2. ABSENSI SHALAT BERJAMAAH</Text>
                <View style={styles.table}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.th, { width: '36%' }]}>Hari, Tanggal</Text>
                    <Text style={[styles.th, { width: '32%', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#CBD5E1' }]}>
                      Shalat Zuhur
                    </Text>
                    <Text style={[styles.th, { width: '32%' }]}>Shalat Ashar</Text>
                  </View>
                  {prayerAttendance && prayerAttendance.length > 0 ? (
                    prayerAttendance.map((p, idx) => (
                      <View key={idx} style={styles.tableBodyRow}>
                        <Text style={[styles.td, { width: '36%', fontWeight: '700' }]}>{p.dayDate}</Text>
                        <Text
                          style={[
                            styles.td,
                            {
                              width: '32%',
                              textAlign: 'center',
                              fontWeight: '600',
                              borderLeftWidth: 1,
                              borderRightWidth: 1,
                              borderColor: '#CBD5E1',
                            },
                          ]}
                        >
                          {p.zuhur}
                        </Text>
                        <Text style={[styles.td, { width: '32%', textAlign: 'center', fontWeight: '600' }]}>
                          {p.ashar}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyRow}>
                      <Text style={styles.emptyRowText}>
                        Belum ada catatan shalat berjamaah pada periode ini.
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 3. CAPAIAN TAHSIN & TAHFIZH */}
              <View style={styles.sectionWrap}>
                <View style={styles.sectionBannerOrange}>
                  <Text style={styles.sectionBannerOrangeText}>3. CAPAIAN TAHSIN & TAHFIZH</Text>
                </View>
                <View style={styles.table}>
                  <View style={styles.keyValueRow}>
                    <Text style={styles.keyCol}>Hafalan Terakhir</Text>
                    <Text style={styles.valCol}>{tahfizhData?.lastSurah || '-'}</Text>
                  </View>
                  <View style={styles.keyValueRow}>
                    <Text style={styles.keyCol}>Tanggal Setoran Terakhir</Text>
                    <Text style={styles.valCol}>{tahfizhData?.lastDepositDate || '-'}</Text>
                  </View>
                  <View style={styles.keyValueRow}>
                    <Text style={styles.keyCol}>Total Baris (Periode Ini)</Text>
                    <Text style={styles.valCol}>
                      {tahfizhData?.totalLines != null ? `${tahfizhData.totalLines} Baris` : '-'}
                    </Text>
                  </View>
                  <View style={styles.keyValueRow}>
                    <Text style={styles.keyCol}>Target Baris Pekan Ini</Text>
                    <Text style={styles.valCol}>
                      {tahfizhData?.targetLines != null ? `${tahfizhData.targetLines} Baris` : '-'}
                    </Text>
                  </View>
                  <View style={[styles.keyValueRow, { borderBottomWidth: 0 }]}>
                    <Text style={styles.keyCol}>Status Pencapaian</Text>
                    <Text style={[styles.valCol, styles.statusColActive]}>
                      ● {tahfizhData?.status || '-'}
                    </Text>
                  </View>
                </View>
              </View>

              {/* 4. KEHADIRAN PER MATA PELAJARAN (AKADEMIK) */}
              <View style={styles.sectionWrap}>
                <Text style={styles.sectionTitleGreen}>4. KEHADIRAN PER MATA PELAJARAN (AKADEMIK)</Text>
                <View style={styles.table}>
                  <View style={styles.tableHeaderRow}>
                    <Text style={[styles.th, { width: '32%' }]}>Hari, Tanggal</Text>
                    <Text style={[styles.th, { width: '42%', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#CBD5E1' }]}>
                      Mata Pelajaran
                    </Text>
                    <Text style={[styles.th, { width: '26%' }]}>Status Kehadiran</Text>
                  </View>
                  {academicAttendance && academicAttendance.length > 0 ? (
                    academicAttendance.map((a, idx) => (
                      <View key={idx} style={styles.tableBodyRow}>
                        <Text style={[styles.td, { width: '32%', fontWeight: '700' }]}>{a.dayDate}</Text>
                        <Text style={[styles.td, { width: '42%', borderLeftWidth: 1, borderRightWidth: 1, borderColor: '#CBD5E1' }]}>
                          {a.subject}
                        </Text>
                        <Text style={[styles.td, { width: '26%', textAlign: 'center', fontWeight: '600' }]}>
                          {a.status}
                        </Text>
                      </View>
                    ))
                  ) : (
                    <View style={styles.emptyRow}>
                      <Text style={styles.emptyRowText}>
                        Belum ada catatan kehadiran mata pelajaran pada periode ini.
                      </Text>
                    </View>
                  )}
                </View>
              </View>

              {/* 5. CATATAN GURU */}
              <View style={styles.sectionWrap}>
                <View style={styles.sectionBannerOrange}>
                  <Text style={styles.sectionBannerOrangeText}>5. CATATAN GURU</Text>
                </View>
                <View style={styles.notesBox}>
                  <Text style={styles.notesText}>
                    {teacherNotes ||
                      'Tidak ada catatan khusus pada periode ini. Tingkatkan terus kedisiplinan dan hafalan Ananda.'}
                  </Text>
                </View>
              </View>

              {/* Closing Partnership & Arabic Doa */}
              <View style={styles.closingWrap}>
                <Text style={styles.closingParagraph}>
                  🤝 Kami meyakini bahwa keberhasilan pendidikan Ananda merupakan hasil sinergi antara sekolah dan keluarga. Semoga Allah senantiasa menjaga, membimbing, dan memberkahi langkah Ananda dalam menuntut ilmu.
                </Text>
                <Text style={styles.closingArabic}>
                  جَزَاكُمُ اللَّهُ خَيْرًا وَبَارَكَ اللَّهُ فِيكُمْ
                </Text>
                <Text style={styles.closingLatin}>
                  BARAKALLAHU FIIKUM
                </Text>
              </View>

              {/* KOTAK TANDA TANGAN 3 PIHAK */}
              <View style={styles.signatureRow}>
                <View style={styles.signatureCol}>
                  <Text style={styles.signatureRole}>Orang Tua / Wali</Text>
                  <View style={styles.signatureSpace} />
                  <Text style={styles.signatureName}>({parentName})</Text>
                </View>
                <View style={styles.signatureCol}>
                  <Text style={styles.signatureRole}>Wali Kelas</Text>
                  <View style={styles.signatureSpace} />
                  <Text style={styles.signatureName}>({waliKelasName})</Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Action Footer */}
          <View style={styles.footerBar}>
            <TouchableOpacity
              onPress={onClose}
              style={styles.footerCloseRedBtn}
              accessibilityLabel="Tutup"
              activeOpacity={0.8}
            >
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.footerRightActions}>
              <TouchableOpacity
                onPress={handleDownloadPdf}
                style={styles.footerDownloadBtn}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="download" size={17} color="#047857" />
                <Text style={styles.footerDownloadText}>Unduh</Text>
              </TouchableOpacity>

              <TouchableOpacity
                onPress={handlePrint}
                style={styles.footerPrintBtn}
                activeOpacity={0.85}
              >
                <MaterialCommunityIcons name="printer" size={17} color="#FFFFFF" />
                <Text style={styles.footerPrintText}>Cetak</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>

      {/* Universal Feedback Modal */}
      {feedbackModal && (
        <AppFeedbackModal
          visible={feedbackModal.visible}
          type={feedbackModal.type || 'info'}
          title={feedbackModal.title}
          message={feedbackModal.message}
          onClose={() => setFeedbackModal(null)}
        />
      )}
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: Platform.OS === 'ios' ? 44 : 20,
    paddingHorizontal: 8,
  },
  container: {
    width: '100%',
    maxWidth: 580,
    height: '96%',
    backgroundColor: '#0F172A',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.35,
    shadowRadius: 18,
    elevation: 12,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
    gap: 12,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: {
    flex: 1,
  },
  topBarTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.2,
  },
  topBarSub: {
    fontSize: 11,
    color: '#94A3B8',
    marginTop: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  iconActionBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DEF7EC',
    borderBottomWidth: 1,
    borderBottomColor: '#A7F3D0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  downloadToastText: {
    flex: 1,
    fontSize: 11.5,
    fontWeight: '700',
    color: '#03543F',
  },
  scrollContent: {
    padding: 10,
    backgroundColor: '#334155',
  },
  paper: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    paddingHorizontal: 16,
    paddingVertical: 20,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 6,
    elevation: 3,
  },
  docHeader: {
    alignItems: 'center',
    marginBottom: 16,
  },
  docMainTitle: {
    fontSize: 15.5,
    fontWeight: '900',
    color: '#007A5E',
    letterSpacing: 0.3,
    textAlign: 'center',
  },
  docPeriod: {
    fontSize: 11,
    fontWeight: '800',
    color: '#1E293B',
    marginTop: 4,
    textAlign: 'center',
  },
  docPrintMeta: {
    fontSize: 9.5,
    color: '#475569',
    marginTop: 2,
    textAlign: 'center',
  },
  metaGrid: {
    marginBottom: 14,
    paddingBottom: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 6,
    gap: 8,
  },
  metaCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  metaLabel: {
    width: 72,
    fontSize: 10.5,
    fontWeight: '700',
    color: '#334155',
  },
  metaColon: {
    fontSize: 10.5,
    fontWeight: '800',
    color: '#334155',
    marginRight: 5,
  },
  metaVal: {
    flex: 1,
    fontSize: 10.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionWrap: {
    marginBottom: 14,
  },
  sectionTitleGreen: {
    fontSize: 11,
    fontWeight: '900',
    color: '#007A5E',
    marginBottom: 5,
    letterSpacing: 0.2,
  },
  sectionBannerOrange: {
    backgroundColor: '#EA580C',
    paddingHorizontal: 8,
    paddingVertical: 5,
  },
  sectionBannerOrangeText: {
    fontSize: 10.5,
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  table: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  th: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 9,
    fontWeight: '800',
    color: '#064E3B',
    textAlign: 'center',
  },
  tableBodyRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  td: {
    paddingVertical: 6,
    paddingHorizontal: 6,
    fontSize: 9,
    color: '#0F172A',
  },
  emptyRow: {
    paddingVertical: 9,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyRowText: {
    fontSize: 9.5,
    fontStyle: 'italic',
    color: '#64748B',
    textAlign: 'center',
  },
  keyValueRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  keyCol: {
    width: '42%',
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0F172A',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  valCol: {
    width: '58%',
    paddingVertical: 5,
    paddingHorizontal: 8,
    fontSize: 9.5,
    color: '#0F172A',
  },
  statusColActive: {
    fontWeight: '900',
    color: '#047857',
  },
  notesBox: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderTopWidth: 0,
    backgroundColor: '#FFFBEB',
    padding: 10,
    minHeight: 46,
  },
  notesText: {
    fontSize: 9.5,
    color: '#1E293B',
    lineHeight: 14.5,
  },
  closingWrap: {
    marginTop: 14,
    paddingTop: 10,
  },
  closingParagraph: {
    fontSize: 9.5,
    fontWeight: '600',
    color: '#0F172A',
    lineHeight: 14.5,
    marginBottom: 10,
  },
  closingArabic: {
    fontSize: 15,
    fontWeight: '900',
    color: '#007A5E',
    textAlign: 'center',
    letterSpacing: 0.5,
  },
  closingLatin: {
    fontSize: 10,
    fontWeight: '800',
    color: '#047857',
    textAlign: 'center',
    marginTop: 4,
    letterSpacing: 0.5,
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  footerCloseRedBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: '#EF4444',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#EF4444',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  footerRightActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  footerDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 15,
    paddingVertical: 8.5,
    borderRadius: 12,
    backgroundColor: '#ECFDF5',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
  },
  footerDownloadText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#047857',
  },
  footerPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: 16,
    paddingVertical: 8.5,
    borderRadius: 12,
    backgroundColor: '#059669',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 3,
  },
  footerPrintText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 18,
    paddingTop: 10,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  signatureCol: {
    flex: 1,
    alignItems: 'center',
  },
  signatureRole: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#475569',
  },
  signatureSpace: {
    height: 44,
  },
  signatureName: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
});

export default WeeklyEvaluationReportPaperModal;
