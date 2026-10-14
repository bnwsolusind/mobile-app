import React, { useMemo, useState } from 'react';
import { getDynamicSemesterOptions } from '../../utils/academicYear';
import {
  Alert,
  Dimensions,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppFeedbackModal, FeedbackType } from '../AppFeedbackModal';

const { width } = Dimensions.get('window');

// ==================== 1. SUBJECT DETAIL MODAL (MOCKUP 3) ====================
export const SubjectDetailModal: React.FC<{
  visible: boolean;
  subject: any;
  onClose: () => void;
}> = ({ visible, subject, onClose }) => {
  const [tab, setTab] = useState<'summary' | 'assignments' | 'exams'>('summary');

  if (!subject) return null;

  const kkmVal = subject.kkm != null && !isNaN(Number(subject.kkm)) ? Number(subject.kkm) : null;
  const isHigh = subject.score >= 85;
  const isRemedial = kkmVal != null ? subject.score < kkmVal : false;

  const assignmentsList: any[] = Array.isArray(subject.assignments)
    ? subject.assignments
    : Array.isArray(subject.tugas)
    ? subject.tugas
    : [];

  const examsList: any[] = Array.isArray(subject.exams)
    ? subject.exams
    : Array.isArray(subject.ujian)
    ? subject.ujian
    : [];

  const teacherNote: string =
    subject.teacher_note || subject.notes || subject.description || subject.catatan || '';

  // Komposisi nilai kanonikal dari subject
  const compositionItems = useMemo(() => {
    if (Array.isArray(subject.composition) && subject.composition.length > 0) {
      return subject.composition;
    }
    const items: Array<{ label: string; pct?: string; score: number | string }> = [];
    if (subject.score_assignment !== null && subject.score_assignment !== undefined) {
      items.push({ label: 'Tugas Harian', score: subject.score_assignment });
    }
    if (subject.score_mid !== null && subject.score_mid !== undefined) {
      items.push({ label: 'PTS (Tengah Semester)', score: subject.score_mid });
    }
    if (subject.score_final !== null && subject.score_final !== undefined) {
      items.push({ label: 'PAS (Akhir Semester)', score: subject.score_final });
    }
    return items;
  }, [subject]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.dragHandle} />

          {/* Header */}
          <View style={modalStyles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.headerCategory}>Detail Nilai Mata Pelajaran</Text>
              <Text numberOfLines={1} style={modalStyles.headerTitle}>
                {subject.name}
              </Text>
              <Text style={modalStyles.headerSubtitle}>{subject.teacher}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Sub Tabs */}
          <View style={modalStyles.subTabRow}>
            {[
              { key: 'summary', label: 'Ringkasan' },
              { key: 'assignments', label: `Tugas (${assignmentsList.length})` },
              { key: 'exams', label: `Ujian (${examsList.length})` },
            ].map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setTab(t.key as any)}
                style={[modalStyles.subTabBtn, tab === t.key && modalStyles.subTabBtnActive]}
              >
                <Text style={[modalStyles.subTabBtnText, tab === t.key && modalStyles.subTabBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {tab === 'summary' && (
              <>
                {/* Score Circle Card */}
                <View style={modalStyles.scoreCard}>
                  <LinearGradient
                    colors={['#047857', '#059669', '#10B981']}
                    style={modalStyles.scoreGradient}
                  >
                    <Text style={modalStyles.scoreCardTitle}>Nilai Akhir Semester</Text>
                    <View style={modalStyles.bigScoreRow}>
                      <Text style={modalStyles.bigScoreNum}>{subject.score}</Text>
                      <View style={modalStyles.scorePredBox}>
                        <Text style={modalStyles.scorePredText}>{subject.predicate}</Text>
                      </View>
                    </View>
                    <Text style={modalStyles.scoreStatusText}>
                      {isHigh
                        ? (kkmVal != null ? 'Sangat Baik • Di Atas KKM' : 'Sangat Baik')
                        : isRemedial
                        ? 'Remedial'
                        : (kkmVal != null ? 'Baik • Tuntas' : 'Baik')}
                    </Text>
                  </LinearGradient>
                </View>

                {/* KKM Comparison Bar */}
                <View style={modalStyles.cardSection}>
                  <Text style={modalStyles.sectionTitle}>Perbandingan dengan KKM</Text>
                  <View style={modalStyles.kkmBarWrap}>
                    <View style={modalStyles.kkmLabelRow}>
                      <Text style={modalStyles.kkmLabel}>
                        KKM Sekolah: {kkmVal != null ? kkmVal : '-'}
                      </Text>
                      <Text style={modalStyles.kkmLabelBold}>Nilai Ananda: {subject.score}</Text>
                    </View>
                    <View style={modalStyles.kkmTrack}>
                      <View
                        style={[
                          modalStyles.kkmFill,
                          {
                            width: `${Math.min(100, Math.max(0, Number(subject.score) || 0))}%`,
                            backgroundColor: isHigh ? '#10B981' : isRemedial ? '#EF4444' : '#3B82F6',
                          },
                        ]}
                      />
                      {kkmVal != null && (
                        <View style={[modalStyles.kkmLine, { left: `${Math.min(100, Math.max(0, kkmVal))}%` }]} />
                      )}
                    </View>
                  </View>
                </View>

                {/* Bobot Penilaian */}
                {compositionItems.length > 0 ? (
                  <View style={modalStyles.cardSection}>
                    <Text style={modalStyles.sectionTitle}>Komposisi Bobot Nilai</Text>
                    <View style={modalStyles.bobotGrid}>
                      {compositionItems.map((b: any, i: number) => (
                        <View key={i} style={modalStyles.bobotItem}>
                          {b.pct ? <Text style={modalStyles.bobotPct}>{b.pct}</Text> : null}
                          <Text style={modalStyles.bobotLabel}>{b.label}</Text>
                          <Text style={modalStyles.bobotScore}>
                            {b.score !== null && b.score !== undefined ? String(b.score) : '-'}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                ) : (
                  <View style={modalStyles.cardSection}>
                    <Text style={modalStyles.sectionTitle}>Komposisi Bobot Nilai</Text>
                    <View style={modalStyles.emptyRowBox}>
                      <Text style={modalStyles.emptyRowText}>
                        Rincian komponen nilai belum tersedia.
                      </Text>
                    </View>
                  </View>
                )}

                {/* Catatan Guru */}
                <View style={modalStyles.notesCard}>
                  <View style={modalStyles.notesHeader}>
                    <MaterialCommunityIcons name="comment-text-outline" size={16} color="#059669" />
                    <Text style={modalStyles.notesTitle}>Catatan Guru Pengampu</Text>
                  </View>
                  <Text style={[modalStyles.notesBody, !teacherNote && { color: '#94A3B8', fontStyle: 'italic' }]}>
                    {teacherNote || 'Belum ada catatan evaluasi untuk mata pelajaran ini.'}
                  </Text>
                </View>
              </>
            )}

            {tab === 'assignments' && (
              <View style={{ gap: 10 }}>
                {assignmentsList.length === 0 ? (
                  <View style={modalStyles.emptyStateContainer}>
                    <MaterialCommunityIcons name="clipboard-text-outline" size={36} color="#94A3B8" />
                    <Text style={modalStyles.emptyStateTitle}>Belum Ada Data Tugas</Text>
                    <Text style={modalStyles.emptyStateSubtitle}>
                      Data penugasan belum tersedia untuk mata pelajaran ini.
                    </Text>
                  </View>
                ) : (
                  assignmentsList.map((item, idx) => {
                    const title = item.title || item.judul || item.name || `Tugas ${idx + 1}`;
                    const date = item.date || item.tanggal || (item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '-');
                    const score = item.score ?? item.nilai;
                    return (
                      <View key={item.id || idx} style={modalStyles.itemRowCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={modalStyles.itemRowTitle}>{title}</Text>
                          <Text style={modalStyles.itemRowDate}>{date}</Text>
                        </View>
                        <View style={modalStyles.itemRowScoreBadge}>
                          <Text style={modalStyles.itemRowScore}>
                            {score !== null && score !== undefined ? String(score) : '-'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}

            {tab === 'exams' && (
              <View style={{ gap: 10 }}>
                {examsList.length === 0 ? (
                  <View style={modalStyles.emptyStateContainer}>
                    <MaterialCommunityIcons name="file-document-edit-outline" size={36} color="#94A3B8" />
                    <Text style={modalStyles.emptyStateTitle}>Belum Ada Data Ujian</Text>
                    <Text style={modalStyles.emptyStateSubtitle}>
                      Data ujian belum tersedia untuk mata pelajaran ini.
                    </Text>
                  </View>
                ) : (
                  examsList.map((item, idx) => {
                    const title = item.title || item.judul || item.name || `Ujian ${idx + 1}`;
                    const date = item.date || item.tanggal || (item.created_at ? new Date(item.created_at).toLocaleDateString('id-ID') : '-');
                    const score = item.score ?? item.nilai;
                    return (
                      <View key={item.id || idx} style={modalStyles.itemRowCard}>
                        <View style={{ flex: 1 }}>
                          <Text style={modalStyles.itemRowTitle}>{title}</Text>
                          <Text style={modalStyles.itemRowDate}>{date}</Text>
                        </View>
                        <View style={[modalStyles.itemRowScoreBadge, { backgroundColor: '#DEF7EC' }]}>
                          <Text style={[modalStyles.itemRowScore, { color: '#03543F' }]}>
                            {score !== null && score !== undefined ? String(score) : '-'}
                          </Text>
                        </View>
                      </View>
                    );
                  })
                )}
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ==================== 2. TAHFIZH DETAIL MODAL WITH AUDIO (MOCKUP 5) ====================
export const TahfizhDetailModal: React.FC<{
  visible: boolean;
  item: any;
  onClose: () => void;
}> = ({ visible, item, onClose }) => {
  const [isPlaying, setIsPlaying] = useState(false);

  if (!item) return null;

  const hasScore = typeof item.score === 'number' && item.score > 0;
  const primaryPredicate = item.predicate && item.predicate !== '-' ? item.predicate : (item.kelancaran || 'Terverifikasi');
  const surahTitle = item.surah || item.hafalan_surah_name || item.nama_surah || 'Setoran Tahfizh';
  const teacherName = item.teacher || item.teacher_name || 'Pembimbing Tahfizh';
  const dateStr = item.date || item.record_date || '-';
  const notesText = item.notes_teacher || item.note || item.catatan;
  const audioAvailable = !!item.audio_url;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.dragHandle} />

          {/* Header */}
          <View style={modalStyles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.headerCategory}>Detail Nilai & Setoran Tahfizh</Text>
              <Text numberOfLines={1} style={modalStyles.headerTitle}>
                {surahTitle}
              </Text>
              <Text style={modalStyles.headerSubtitle}>
                {item.type || 'Ziyadah'}{item.ayat ? ` • Ayat ${item.ayat}` : ''}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Score / Predicate Banner */}
            <View style={modalStyles.scoreCard}>
              <LinearGradient colors={['#0F766E', '#0D9488', '#14B8A6']} style={modalStyles.scoreGradient}>
                <Text style={modalStyles.scoreCardTitle}>Evaluasi Kualitas Setoran</Text>
                <View style={modalStyles.bigScoreRow}>
                  {hasScore ? (
                    <>
                      <Text style={modalStyles.bigScoreNum}>{item.score}</Text>
                      <View style={modalStyles.scorePredBox}>
                        <Text style={modalStyles.scorePredText}>{primaryPredicate}</Text>
                      </View>
                    </>
                  ) : (
                    <View style={modalStyles.scorePredBoxWide}>
                      <Text style={modalStyles.scorePredTextWide}>{primaryPredicate}</Text>
                    </View>
                  )}
                </View>
                <Text style={modalStyles.scoreStatusText}>
                  Diuji oleh {teacherName} pada {dateStr}
                </Text>
              </LinearGradient>
            </View>

            {/* Rubrik Penilaian Tahfizh Aktual */}
            <View style={modalStyles.cardSection}>
              <Text style={modalStyles.sectionTitle}>Aspek Penilaian Tilawah & Tahfizh</Text>
              <View style={modalStyles.tahfizhMetricsRow}>
                {[
                  { label: 'Kelancaran', val: item.kelancaran || item.raw_kelancaran || '—' },
                  { label: 'Hukum Tajwid', val: item.tajwid || item.raw_tajwid || '—' },
                  { label: 'Makharijul Huruf', val: item.makhraj || item.raw_makhraj || '—' },
                  { label: 'Adab & Tartil', val: item.adab != null ? String(item.adab) : (item.adab_label || '—') },
                ].map((m, i) => (
                  <View key={i} style={modalStyles.metricBox}>
                    <Text style={modalStyles.metricLabel}>{m.label}</Text>
                    <Text style={modalStyles.metricVal}>{m.val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Rekaman Suara Setoran */}
            <View style={modalStyles.cardSection}>
              <Text style={modalStyles.sectionTitle}>Rekaman Suara Setoran Santri</Text>
              {audioAvailable ? (
                <View style={modalStyles.audioPlayerCard}>
                  <View style={modalStyles.audioWaveRow}>
                    <TouchableOpacity
                      activeOpacity={0.8}
                      onPress={() => setIsPlaying(!isPlaying)}
                      style={modalStyles.playBtn}
                    >
                      <MaterialCommunityIcons
                        name={isPlaying ? 'pause' : 'play'}
                        size={24}
                        color="#FFFFFF"
                      />
                    </TouchableOpacity>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={modalStyles.waveform}>
                        {[30, 60, 45, 80, 95, 60, 40, 75, 90, 50, 65, 85, 40, 70, 95, 50, 30].map(
                          (h, idx) => (
                            <View
                              key={idx}
                              style={[
                                modalStyles.waveBar,
                                {
                                  height: (h / 100) * 26,
                                  backgroundColor: isPlaying && idx < 9 ? '#059669' : '#CBD5E1',
                                },
                              ]}
                            />
                          )
                        )}
                      </View>
                      <View style={modalStyles.audioTimeRow}>
                        <Text style={modalStyles.audioTimeText}>
                          {isPlaying ? 'Putar' : '00:00'}
                        </Text>
                        <Text style={modalStyles.audioTimeText}>Rekaman Audio</Text>
                      </View>
                    </View>
                  </View>
                </View>
              ) : (
                <View style={modalStyles.emptyAudioBox}>
                  <MaterialCommunityIcons name="microphone-off" size={20} color="#94A3B8" />
                  <Text style={modalStyles.emptyAudioText}>
                    Rekaman audio tidak tersedia untuk sesi setoran ini.
                  </Text>
                </View>
              )}
            </View>

            {/* Catatan Pembimbing Tahfizh */}
            <View style={modalStyles.notesCard}>
              <View style={modalStyles.notesHeader}>
                <MaterialCommunityIcons name="book-check-outline" size={16} color="#0D9488" />
                <Text style={modalStyles.notesTitle}>Catatan Pembimbing Tahfizh</Text>
              </View>
              <Text style={notesText ? modalStyles.notesBody : modalStyles.notesBodyEmpty}>
                {notesText || 'Tidak ada catatan khusus dari pembimbing tahfizh.'}
              </Text>
            </View>

            {/* Catatan Wali Santri jika ada */}
            {item.notes_parent ? (
              <View style={[modalStyles.notesCard, { marginTop: 10, borderColor: '#BAE6FD', backgroundColor: '#F0F9FF' }]}>
                <View style={modalStyles.notesHeader}>
                  <MaterialCommunityIcons name="account-heart-outline" size={16} color="#0284C7" />
                  <Text style={[modalStyles.notesTitle, { color: '#0369A1' }]}>Catatan Wali Santri</Text>
                </View>
                <Text style={[modalStyles.notesBody, { color: '#0369A1' }]}>
                  {item.notes_parent}
                </Text>
              </View>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ==================== 3. MUTABAAH DETAIL MODAL (MOCKUP 7) ====================
export const MutabaahDetailModal: React.FC<{
  visible: boolean;
  aspect: any;
  onClose: () => void;
}> = ({ visible, aspect, onClose }) => {
  if (!aspect) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.dragHandle} />

          {/* Header */}
          <View style={modalStyles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.headerCategory}>Detail Mutabaah Yaumiyah</Text>
              <Text numberOfLines={1} style={modalStyles.headerTitle}>
                {aspect.aspect}
              </Text>
              <Text style={modalStyles.headerSubtitle}>{aspect.teacher}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* Aspect Score Header */}
            <View style={modalStyles.scoreCard}>
              <LinearGradient colors={['#1E293B', '#334155', '#475569']} style={modalStyles.scoreGradient}>
                <Text style={modalStyles.scoreCardTitle}>Capaian Kepatuhan Karakter</Text>
                <View style={modalStyles.bigScoreRow}>
                  <Text style={modalStyles.bigScoreNum}>{aspect.score}%</Text>
                  <View style={modalStyles.scorePredBox}>
                    <Text style={modalStyles.scorePredText}>{aspect.predicate}</Text>
                  </View>
                </View>
                <Text style={modalStyles.scoreStatusText}>
                  Berdasarkan pemantauan jurnal ibadah harian
                </Text>
              </LinearGradient>
            </View>

            {/* Monthly Trend Bar Chart */}
            <View style={modalStyles.cardSection}>
              <Text style={modalStyles.sectionTitle}>Tren Kepatuhan Per Minggu (Bulan Ini)</Text>
              <View style={modalStyles.mutabaahChartWrap}>
                {[
                  { week: 'Minggu 1', score: 85 },
                  { week: 'Minggu 2', score: 90 },
                  { week: 'Minggu 3', score: 92 },
                  { week: 'Minggu 4', score: 95 },
                ].map((w, idx) => (
                  <View key={idx} style={modalStyles.mutabaahBarCol}>
                    <Text style={modalStyles.mutabaahBarNum}>{w.score}%</Text>
                    <View style={modalStyles.mutabaahBarSlot}>
                      <View
                        style={[
                          modalStyles.mutabaahBarFill,
                          {
                            height: `${w.score}%`,
                            backgroundColor: idx === 3 ? '#059669' : '#3B82F6',
                          },
                        ]}
                      />
                    </View>
                    <Text style={modalStyles.mutabaahBarLabel}>{w.week}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Checklist Indikator */}
            <View style={modalStyles.cardSection}>
              <Text style={modalStyles.sectionTitle}>Indikator Pembiasaan</Text>
              <View style={{ gap: 8 }}>
                {[
                  { name: 'Kesesuaian Waktu & Tertib Pelaksanaan', val: 'Sangat Baik' },
                  { name: 'Kemandirian Tanpa Diingatkan', val: 'Baik' },
                  { name: 'Kesesuaian Adab & Sunnah', val: 'Sangat Baik' },
                  { name: 'Verifikasi & Catatan Orang Tua', val: 'Lengkap' },
                ].map((chk, i) => (
                  <View key={i} style={modalStyles.checklistRow}>
                    <MaterialCommunityIcons name="check-circle" size={18} color="#059669" />
                    <Text style={modalStyles.checklistName}>{chk.name}</Text>
                    <Text style={modalStyles.checklistVal}>{chk.val}</Text>
                  </View>
                ))}
              </View>
            </View>

            {/* Catatan Pembimbing */}
            <View style={modalStyles.notesCard}>
              <View style={modalStyles.notesHeader}>
                <MaterialCommunityIcons name="star-outline" size={16} color="#059669" />
                <Text style={modalStyles.notesTitle}>Apresiasi & Arahan Wali Kelas</Text>
              </View>
              <Text style={modalStyles.notesBody}>{aspect.notes}</Text>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ==================== 4. SEMESTER REPORT MODAL (MOCKUP 8) ====================
export const SemesterReportModal: React.FC<{
  visible: boolean;
  student: any;
  average: number;
  predicate: string;
  onOpenPdf: () => void;
  onClose: () => void;
}> = ({ visible, student, average, predicate, onOpenPdf, onClose }) => {
  const [reportTab, setReportTab] = useState<'summary' | 'grades' | 'attendance'>('summary');

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.dragHandle} />

          {/* Header */}
          <View style={modalStyles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.headerCategory}>Rapor Hasil Belajar Semester</Text>
              <Text numberOfLines={1} style={modalStyles.headerTitle}>
                {student?.nama_lengkap || student?.name || 'Ananda'}
              </Text>
              <Text style={modalStyles.headerSubtitle}>
                NISN: {student?.nisn || '-'} • Kelas {student?.rombongan_belajar?.nama_rombel || student?.kelas?.nama_kelas || student?.class_name || '-'}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          {/* Sub Tabs */}
          <View style={modalStyles.subTabRow}>
            {[
              { key: 'summary', label: 'Ringkasan' },
              { key: 'grades', label: 'Nilai Mapel' },
              { key: 'attendance', label: 'Kehadiran' },
            ].map((t) => (
              <TouchableOpacity
                key={t.key}
                onPress={() => setReportTab(t.key as any)}
                style={[modalStyles.subTabBtn, reportTab === t.key && modalStyles.subTabBtnActive]}
              >
                <Text style={[modalStyles.subTabBtnText, reportTab === t.key && modalStyles.subTabBtnTextActive]}>
                  {t.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 }}>
            {/* KPI Cards Row */}
            <View style={modalStyles.kpiRow}>
              <View style={modalStyles.kpiBox}>
                <Text style={modalStyles.kpiLabel}>Rata-rata</Text>
                <Text style={modalStyles.kpiValue}>{average}</Text>
                <Text style={modalStyles.kpiSub}>Predikat {predicate}</Text>
              </View>
              <View style={modalStyles.kpiBox}>
                <Text style={modalStyles.kpiLabel}>Peringkat</Text>
                <Text style={modalStyles.kpiValue}>
                  {student?.rank != null || student?.peringkat != null
                    ? String(student.rank ?? student.peringkat)
                    : '-'}
                </Text>
                <Text style={modalStyles.kpiSub}>
                  {student?.total_students != null || student?.jumlah_siswa != null
                    ? `dari ${student.total_students ?? student.jumlah_siswa} Siswa`
                    : 'Peringkat Kelas'}
                </Text>
              </View>
              <View style={modalStyles.kpiBox}>
                <Text style={modalStyles.kpiLabel}>Kehadiran</Text>
                <Text style={modalStyles.kpiValue}>
                  {student?.attendance_percentage != null
                    ? `${student.attendance_percentage}%`
                    : student?.persentase_kehadiran != null
                    ? `${student.persentase_kehadiran}%`
                    : '-'}
                </Text>
                <Text style={modalStyles.kpiSub}>
                  {student?.attendance_summary ||
                    (student?.sakit != null || student?.izin != null
                      ? `Sakit: ${student.sakit ?? 0} • Izin: ${student.izin ?? 0}`
                      : 'Rekap Kehadiran')}
                </Text>
              </View>
            </View>

            {/* Tombol Lihat PDF Preview */}
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={() => {
                onClose();
                onOpenPdf();
              }}
              style={modalStyles.pdfActionBanner}
            >
              <LinearGradient colors={['#047857', '#059669']} style={modalStyles.pdfBannerGradient}>
                <MaterialCommunityIcons name="file-pdf-box" size={24} color="#FFFFFF" />
                <View style={{ flex: 1 }}>
                  <Text style={modalStyles.pdfBannerTitle}>Lihat & Unduh Dokumen Rapor PDF</Text>
                  <Text style={modalStyles.pdfBannerSub}>Pratinjau format resmi ber-Kop Sekolah</Text>
                </View>
                <MaterialCommunityIcons name="chevron-right" size={20} color="#FFFFFF" />
              </LinearGradient>
            </TouchableOpacity>

            {/* Overview / Ekstrakurikuler */}
            {(() => {
              const rawEkskul = student?.extracurriculars || student?.ekstrakurikuler || student?.activities;
              const ekskulList = Array.isArray(rawEkskul) ? rawEkskul : [];
              return (
                <View style={modalStyles.cardSection}>
                  <Text style={modalStyles.sectionTitle}>Kegiatan Ekstrakurikuler</Text>
                  {ekskulList.length === 0 ? (
                    <Text style={{ fontSize: 13, color: '#64748B', fontStyle: 'italic', paddingVertical: 4 }}>
                      Belum ada data kegiatan ekstrakurikuler
                    </Text>
                  ) : (
                    <View style={{ gap: 8 }}>
                      {ekskulList.map((ekskul: any, idx: number) => {
                        const name = typeof ekskul === 'string' ? ekskul : (ekskul.name || ekskul.nama || `Ekstrakurikuler ${idx + 1}`);
                        const pred = typeof ekskul === 'object' ? (ekskul.predicate || ekskul.pred || ekskul.nilai || '-') : '-';
                        return (
                          <View key={idx} style={modalStyles.checklistRow}>
                            <MaterialCommunityIcons name="medal-outline" size={18} color="#D97706" />
                            <Text style={modalStyles.checklistName}>{name}</Text>
                            <Text style={modalStyles.checklistVal}>{pred}</Text>
                          </View>
                        );
                      })}
                    </View>
                  )}
                </View>
              );
            })()}

            {/* Sikap Spiritual & Sosial */}
            {Boolean(student?.character_notes || student?.catatan_karakter || student?.catatan_wali_kelas || student?.notes) && (
              <View style={modalStyles.notesCard}>
                <View style={modalStyles.notesHeader}>
                  <MaterialCommunityIcons name="shield-check-outline" size={16} color="#059669" />
                  <Text style={modalStyles.notesTitle}>Perkembangan Karakter & Sikap</Text>
                </View>
                <Text style={modalStyles.notesBody}>
                  {student?.character_notes || student?.catatan_karakter || student?.catatan_wali_kelas || student?.notes}
                </Text>
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

// ==================== 5. PDF REPORT PREVIEW MODAL (MOCKUP 9) ====================
export const PdfReportModal: React.FC<{
  visible: boolean;
  student: any;
  subjects: any[];
  academicYear?: string;
  semester?: string;
  onClose: () => void;
}> = ({ visible, student, subjects, academicYear, semester, onClose }) => {
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  if (!visible) return null;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={modalStyles.pdfOverlay}>
        <View style={modalStyles.pdfContainer}>
          {/* Top Bar Actions */}
          <View style={modalStyles.pdfTopBar}>
            <TouchableOpacity onPress={onClose} style={modalStyles.pdfCloseBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
            </TouchableOpacity>
            <Text style={modalStyles.pdfTopTitle}>Tampilan Rapor Resmi (PDF)</Text>
            <TouchableOpacity
              onPress={() =>
                setFeedbackModal({
                  visible: true,
                  type: 'success',
                  title: 'Unduh Rapor',
                  message: 'Dokumen Rapor Semester Ananda berhasil diunduh ke penyimpanan perangkat.',
                })
              }
              style={modalStyles.pdfShareBtn}
            >
              <MaterialCommunityIcons name="download" size={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          {/* Paper Sheet View */}
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={modalStyles.paperScrollContent}
          >
            <View style={modalStyles.paperSheet}>
              {/* Kop Surat Sekolah */}
              <View style={modalStyles.kopContainer}>
                <MaterialCommunityIcons name="school" size={36} color="#059669" />
                <View style={{ alignItems: 'center', marginTop: 4 }}>
                  <Text style={modalStyles.kopYayasan}>
                    {student?.unit?.foundation_name || student?.foundation_name || 'LEMBAGA PENDIDIKAN ISLAM TERPADU'}
                  </Text>
                  <Text style={modalStyles.kopSekolah}>
                    {student?.unit?.name || student?.unit_name || student?.sekolah || 'LAPORAN HASIL BELAJAR'}
                  </Text>
                  {Boolean(student?.unit?.address || student?.unit_address || student?.alamat_sekolah) && (
                    <Text style={modalStyles.kopAlamat}>
                      {student?.unit?.address || student?.unit_address || student?.alamat_sekolah}
                    </Text>
                  )}
                </View>
                <View style={modalStyles.kopDividerDouble} />
              </View>

              {/* Judul Rapor */}
              <View style={{ alignItems: 'center', marginVertical: 12 }}>
                <Text style={modalStyles.raporDocTitle}>LAPORAN HASIL BELAJAR SISWA</Text>
                <Text style={modalStyles.raporDocSub}>
                  {academicYear || student?.academic_year || student?.tahun_ajaran?.tahun || student?.tahun_ajaran
                    ? `TAHUN AJARAN ${academicYear || student?.academic_year || student?.tahun_ajaran?.tahun || student?.tahun_ajaran}${semester || student?.semester?.semester || student?.semester ? ` - SEMESTER ${String(semester || student?.semester?.semester || student?.semester).toUpperCase()}` : ''}`
                    : (semester || student?.semester ? `SEMESTER ${String(semester || student?.semester).toUpperCase()}` : 'HASIL EVALUASI AKADEMIK')}
                </Text>
              </View>

              {/* Biodata Table */}
              <View style={modalStyles.bioTable}>
                <View style={modalStyles.bioRow}>
                  <Text style={modalStyles.bioLabel}>Nama Siswa</Text>
                  <Text style={modalStyles.bioVal}>: {student?.nama_lengkap || student?.name || 'Ananda'}</Text>
                </View>
                <View style={modalStyles.bioRow}>
                  <Text style={modalStyles.bioLabel}>NIS / NISN</Text>
                  <Text style={modalStyles.bioVal}>: {student?.nis || '-'} / {student?.nisn || '-'}</Text>
                </View>
                <View style={modalStyles.bioRow}>
                  <Text style={modalStyles.bioLabel}>Kelas / Semester</Text>
                  <Text style={modalStyles.bioVal}>: {student?.rombongan_belajar?.nama_rombel || student?.kelas?.nama_kelas || student?.class_name || 'Rombel'} / {semester || student?.semester?.semester || student?.semester || 'Semester Aktif'}</Text>
                </View>
              </View>

              {/* Nilai Table */}
              <View style={modalStyles.tableHeaderRow}>
                <Text style={[modalStyles.th, { width: 30 }]}>No</Text>
                <Text style={[modalStyles.th, { flex: 1 }]}>Mata Pelajaran</Text>
                <Text style={[modalStyles.th, { width: 45 }]}>KKM</Text>
                <Text style={[modalStyles.th, { width: 45 }]}>Nilai</Text>
                <Text style={[modalStyles.th, { width: 45 }]}>Pred</Text>
              </View>

              {subjects.map((sub, idx) => (
                <View key={sub.id} style={modalStyles.tableRow}>
                  <Text style={[modalStyles.td, { width: 30 }]}>{idx + 1}</Text>
                  <Text style={[modalStyles.td, { flex: 1, textAlign: 'left', fontWeight: '600' }]}>
                    {sub.name}
                  </Text>
                  <Text style={[modalStyles.td, { width: 45 }]}>{sub.kkm ?? '-'}</Text>
                  <Text style={[modalStyles.td, { width: 45, fontWeight: '700' }]}>{sub.score}</Text>
                  <Text style={[modalStyles.td, { width: 45, fontWeight: '700' }]}>{sub.predicate}</Text>
                </View>
              ))}

              {/* Signatures */}
              <View style={modalStyles.signatureRow}>
                <View style={{ alignItems: 'center' }}>
                  <Text style={modalStyles.sigLabel}>Orang Tua / Wali,</Text>
                  <View style={{ height: 40 }} />
                  <Text style={modalStyles.sigName}>( .................................. )</Text>
                </View>
                <View style={{ alignItems: 'center' }}>
                  <Text style={modalStyles.sigLabel}>Wali Kelas,</Text>
                  <View style={{ height: 40 }} />
                  <Text style={modalStyles.sigName}>
                    {student?.wali_kelas?.nama_lengkap ||
                     student?.wali_kelas?.nama ||
                     student?.wali_kelas?.name ||
                     student?.homeroom_teacher ||
                     (typeof student?.wali_kelas === 'string' ? student?.wali_kelas : '( .................................. )')}
                  </Text>
                </View>
              </View>
            </View>
          </ScrollView>

          {/* Bottom Actions */}
          <View style={modalStyles.pdfBottomActions}>
            <TouchableOpacity
              onPress={() =>
                setFeedbackModal({
                  visible: true,
                  type: 'info',
                  title: 'Cetak Dokumen',
                  message: 'Perintah pencetakan dokumen rapor telah dikirimkan ke printer terhubung.',
                })
              }
              style={modalStyles.pdfPrintBtn}
            >
              <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" />
              <Text style={modalStyles.pdfPrintBtnText}>Cetak Rapor</Text>
            </TouchableOpacity>
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

// ==================== 6. SEMESTER PICKER MODAL (MOCKUP 10) ====================
export const SemesterPickerModal: React.FC<{
  visible: boolean;
  selectedSemester: string | { year: string; semester: string; months?: string };
  onSelect: (sem: any) => void;
  onClose: () => void;
}> = ({ visible, selectedSemester, onSelect, onClose }) => {
  const currentLabel =
    typeof selectedSemester === 'string'
      ? selectedSemester
      : `Semester ${selectedSemester.semester} ${selectedSemester.year}`;

  const semesters = useMemo(() => getDynamicSemesterOptions(selectedSemester, 6), [selectedSemester]);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={modalStyles.overlay}>
        <View style={modalStyles.container}>
          <View style={modalStyles.dragHandle} />

          {/* Header */}
          <View style={modalStyles.headerRow}>
            <View style={{ flex: 1 }}>
              <Text style={modalStyles.headerTitle}>Pilih Tahun Ajaran & Semester</Text>
              <Text style={modalStyles.headerSubtitle}>
                Pilih periode untuk melihat riwayat nilai rapor
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={modalStyles.closeBtn}>
              <MaterialCommunityIcons name="close" size={20} color="#64748B" />
            </TouchableOpacity>
          </View>

          <View style={{ gap: 10, paddingBottom: 24, paddingTop: 10 }}>
            {semesters.map((s, idx) => {
              const isSelected = currentLabel.includes(s.label) || s.label.includes(currentLabel);
              return (
                <TouchableOpacity
                  key={idx}
                  activeOpacity={0.8}
                  onPress={() => {
                    onSelect(s.label);
                    onClose();
                  }}
                  style={[
                    modalStyles.semesterChoiceCard,
                    isSelected && modalStyles.semesterChoiceCardActive,
                  ]}
                >
                  <View style={{ flex: 1 }}>
                    <Text
                      style={[
                        modalStyles.semesterChoiceText,
                        isSelected && modalStyles.semesterChoiceTextActive,
                      ]}
                    >
                      {s.label}
                    </Text>
                    {s.isCurrent && (
                      <View style={modalStyles.aktifTag}>
                        <Text style={modalStyles.aktifTagText}>Periode Aktif Berjalan</Text>
                      </View>
                    )}
                  </View>
                  <MaterialCommunityIcons
                    name={isSelected ? 'radiobox-marked' : 'radiobox-blank'}
                    size={22}
                    color={isSelected ? '#059669' : '#CBD5E1'}
                  />
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
};

// ==================== STYLES ====================
const modalStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'flex-end',
  },
  container: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '88%',
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  dragHandle: {
    width: 44,
    height: 4,
    backgroundColor: '#E2E8F0',
    borderRadius: 2,
    alignSelf: 'center',
    marginBottom: 14,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  headerCategory: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  subTabRow: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    borderRadius: 12,
    padding: 3,
    marginBottom: 14,
  },
  subTabBtn: {
    flex: 1,
    paddingVertical: 7,
    alignItems: 'center',
    borderRadius: 9,
  },
  subTabBtnActive: {
    backgroundColor: '#FFFFFF',
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 3,
    elevation: 2,
  },
  subTabBtnText: {
    fontSize: 11,
    fontWeight: '600',
    color: '#64748B',
  },
  subTabBtnTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  scoreCard: {
    borderRadius: 18,
    overflow: 'hidden',
    marginBottom: 14,
  },
  scoreGradient: {
    padding: 16,
    alignItems: 'center',
  },
  scoreCardTitle: {
    fontSize: 11,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
  },
  bigScoreRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginVertical: 4,
  },
  bigScoreNum: {
    fontSize: 40,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scorePredBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  scorePredText: {
    fontSize: 14,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  scoreStatusText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    fontWeight: '500',
  },
  cardSection: {
    backgroundColor: '#F8FAFC',
    borderRadius: 16,
    padding: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  sectionTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
    marginBottom: 10,
  },
  kkmBarWrap: {
    gap: 6,
  },
  kkmLabelRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  kkmLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  kkmLabelBold: {
    fontSize: 10,
    fontWeight: '700',
    color: '#0F172A',
  },
  kkmTrack: {
    height: 10,
    backgroundColor: '#E2E8F0',
    borderRadius: 5,
    position: 'relative',
    overflow: 'hidden',
  },
  kkmFill: {
    height: '100%',
    borderRadius: 5,
  },
  kkmLine: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    width: 2,
    backgroundColor: '#475569',
  },
  bobotGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  bobotItem: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  bobotPct: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  bobotLabel: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  bobotScore: {
    fontSize: 14,
    fontWeight: '800',
    color: '#0F172A',
    marginTop: 4,
  },
  notesCard: {
    backgroundColor: '#ECFDF5',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  notesHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 6,
  },
  notesTitle: {
    fontSize: 11,
    fontWeight: '700',
    color: '#065F46',
  },
  notesBody: {
    fontSize: 11,
    color: '#047857',
    lineHeight: 17,
  },
  itemRowCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  itemRowTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0F172A',
  },
  itemRowDate: {
    fontSize: 10,
    color: '#64748B',
    marginTop: 2,
  },
  itemRowScoreBadge: {
    backgroundColor: '#E0E7FF',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  itemRowScore: {
    fontSize: 12,
    fontWeight: '800',
    color: '#3730A3',
  },
  tahfizhMetricsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  metricBox: {
    flex: 1,
    minWidth: '45%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  metricLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  metricVal: {
    fontSize: 11,
    fontWeight: '700',
    color: '#0D9488',
    marginTop: 2,
  },
  metricScore: {
    fontSize: 10,
    fontWeight: '600',
    color: '#475569',
    marginTop: 2,
  },
  audioPlayerCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  audioWaveRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  playBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#059669',
    justifyContent: 'center',
    alignItems: 'center',
  },
  waveform: {
    flexDirection: 'row',
    alignItems: 'center',
    height: 30,
    gap: 4,
  },
  waveBar: {
    width: 4,
    borderRadius: 2,
  },
  audioTimeRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  audioTimeText: {
    fontSize: 10,
    color: '#64748B',
  },
  mutabaahChartWrap: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    height: 100,
    paddingTop: 10,
  },
  mutabaahBarCol: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  mutabaahBarNum: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 4,
  },
  mutabaahBarSlot: {
    width: 16,
    height: 60,
    backgroundColor: '#F1F5F9',
    borderRadius: 8,
    justifyContent: 'flex-end',
    overflow: 'hidden',
  },
  mutabaahBarFill: {
    width: '100%',
    borderRadius: 8,
  },
  mutabaahBarLabel: {
    fontSize: 9,
    color: '#64748B',
    marginTop: 4,
  },
  checklistRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#FFFFFF',
    padding: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  checklistName: {
    flex: 1,
    fontSize: 11,
    color: '#1E293B',
    fontWeight: '500',
  },
  checklistVal: {
    fontSize: 10,
    fontWeight: '700',
    color: '#059669',
  },
  kpiRow: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 14,
  },
  kpiBox: {
    flex: 1,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 12,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  kpiLabel: {
    fontSize: 10,
    color: '#64748B',
  },
  kpiValue: {
    fontSize: 18,
    fontWeight: '800',
    color: '#059669',
    marginVertical: 2,
  },
  kpiSub: {
    fontSize: 9,
    color: '#64748B',
  },
  pdfActionBanner: {
    borderRadius: 16,
    overflow: 'hidden',
    marginBottom: 14,
  },
  pdfBannerGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 14,
    gap: 12,
  },
  pdfBannerTitle: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pdfBannerSub: {
    fontSize: 10,
    color: 'rgba(255, 255, 255, 0.85)',
    marginTop: 2,
  },
  // PDF Fullscreen Preview Styles
  pdfOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.85)',
  },
  pdfContainer: {
    flex: 1,
    marginTop: 40,
    backgroundColor: '#334155',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    overflow: 'hidden',
  },
  pdfTopBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#1E293B',
  },
  pdfCloseBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  pdfTopTitle: {
    fontSize: 13,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  pdfShareBtn: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  paperScrollContent: {
    padding: 16,
    alignItems: 'center',
  },
  paperSheet: {
    width: '100%',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 10,
    elevation: 6,
  },
  kopContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  kopYayasan: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
  },
  kopSekolah: {
    fontSize: 11,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  kopAlamat: {
    fontSize: 8,
    color: '#64748B',
    marginTop: 1,
  },
  kopDividerDouble: {
    height: 2,
    backgroundColor: '#0F172A',
    width: '100%',
    marginTop: 8,
  },
  raporDocTitle: {
    fontSize: 12,
    fontWeight: '800',
    color: '#0F172A',
  },
  raporDocSub: {
    fontSize: 9,
    fontWeight: '600',
    color: '#64748B',
    marginTop: 2,
  },
  bioTable: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 8,
    marginBottom: 10,
    gap: 3,
  },
  bioRow: {
    flexDirection: 'row',
  },
  bioLabel: {
    width: 100,
    fontSize: 9,
    color: '#64748B',
    fontWeight: '500',
  },
  bioVal: {
    flex: 1,
    fontSize: 9,
    fontWeight: '700',
    color: '#0F172A',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#059669',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderRadius: 4,
  },
  th: {
    fontSize: 8,
    fontWeight: '700',
    color: '#FFFFFF',
    textAlign: 'center',
  },
  tableRow: {
    flexDirection: 'row',
    paddingVertical: 6,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  td: {
    fontSize: 8,
    color: '#334155',
    textAlign: 'center',
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
    paddingHorizontal: 12,
  },
  sigLabel: {
    fontSize: 8,
    color: '#64748B',
  },
  sigName: {
    fontSize: 8,
    fontWeight: '700',
    color: '#0F172A',
  },
  pdfBottomActions: {
    padding: 12,
    backgroundColor: '#1E293B',
    alignItems: 'center',
  },
  pdfPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 12,
  },
  pdfPrintBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  // Semester Choice Card
  semesterChoiceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  semesterChoiceCardActive: {
    backgroundColor: '#ECFDF5',
    borderColor: '#10B981',
  },
  semesterChoiceText: {
    fontSize: 13,
    fontWeight: '600',
    color: '#334155',
  },
  semesterChoiceTextActive: {
    color: '#059669',
    fontWeight: '700',
  },
  aktifTag: {
    alignSelf: 'flex-start',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    marginTop: 4,
  },
  aktifTagText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#03543F',
  },
  emptyStateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 28,
    paddingHorizontal: 16,
    backgroundColor: '#F8FAFC',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyStateTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#475569',
    marginTop: 8,
  },
  emptyStateSubtitle: {
    fontSize: 12,
    color: '#94A3B8',
    textAlign: 'center',
    marginTop: 4,
  },
  emptyRowBox: {
    paddingVertical: 12,
    paddingHorizontal: 14,
    backgroundColor: '#F8FAFC',
    borderRadius: 10,
    alignItems: 'center',
  },
  emptyRowText: {
    fontSize: 12,
    color: '#94A3B8',
    fontStyle: 'italic',
  },
  scorePredBoxWide: {
    backgroundColor: 'rgba(255, 255, 255, 0.25)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scorePredTextWide: {
    fontSize: 18,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.5,
  },
  emptyAudioBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: '#F8FAFC',
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  emptyAudioText: {
    flex: 1,
    fontSize: 12,
    color: '#64748B',
    fontStyle: 'italic',
  },
  notesBodyEmpty: {
    fontSize: 11,
    color: '#94A3B8',
    fontStyle: 'italic',
    lineHeight: 17,
  },
});
