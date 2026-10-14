import React, { useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { AppFeedbackModal } from '../AppFeedbackModal';
import { mobileApiService } from '../../services/mobileApiService';

interface PrincipalMonthlyReportModalProps {
  visible: boolean;
  onClose: () => void;
  unitName?: string;
  onSuccess?: () => void;
}

const MONTHS = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

export default function PrincipalMonthlyReportModal({
  visible,
  onClose,
  unitName = 'Unit Madrasah',
  onSuccess,
}: PrincipalMonthlyReportModalProps) {
  const currentMonthIdx = new Date().getMonth();
  const currentYear = new Date().getFullYear();

  const [selectedMonth, setSelectedMonth] = useState(MONTHS[currentMonthIdx]);
  const [selectedYear, setSelectedYear] = useState(String(currentYear));
  const [activeTab, setActiveTab] = useState<'kbm' | 'presensi' | 'tahfizh' | 'sarpras' | 'usulan'>('kbm');

  // Form Fields
  const [evaluasiKbm, setEvaluasiKbm] = useState('');
  const [evaluasiPresensi, setEvaluasiPresensi] = useState('');
  const [evaluasiTahfizh, setEvaluasiTahfizh] = useState('');
  const [evaluasiSarpras, setEvaluasiSarpras] = useState('');
  const [kendalaRekomendasi, setKendalaRekomendasi] = useState('');

  // UI / State Feedback
  const [submitting, setSubmitting] = useState(false);
  const [feedbackState, setFeedbackState] = useState<{
    visible: boolean;
    type: 'success' | 'warning' | 'error' | 'confirm';
    title: string;
    message: string;
    actionLabel?: string;
    isDestructive?: boolean;
    onConfirmAction?: () => void;
  }>({
    visible: false,
    type: 'info' as any,
    title: '',
    message: '',
  });

  const handlePromptClearForm = () => {
    setFeedbackState({
      visible: true,
      type: 'confirm',
      isDestructive: true,
      title: 'Kosongkan Seluruh Formulir?',
      message: 'Apakah Anda yakin ingin menghapus seluruh isian evaluasi laporan bulanan ini?',
      actionLabel: 'Ya, Bersihkan',
      onConfirmAction: () => {
        setEvaluasiKbm('');
        setEvaluasiPresensi('');
        setEvaluasiTahfizh('');
        setEvaluasiSarpras('');
        setKendalaRekomendasi('');
        setFeedbackState({
          visible: true,
          type: 'success',
          title: 'Formulir Telah Dikosongkan',
          message: 'Seluruh isian evaluasi telah dibersihkan.',
          actionLabel: 'Selesai',
        });
      },
    });
  };

  const handleValidateAndConfirm = () => {
    if (!evaluasiKbm.trim() && !evaluasiPresensi.trim() && !kendalaRekomendasi.trim()) {
      setFeedbackState({
        visible: true,
        type: 'warning',
        title: 'Formulir Belum Lengkap',
        message: 'Mohon isi setidaknya bagian Evaluasi KBM, Disiplin Presensi, atau Rekomendasi sebelum mengirim laporan.',
        actionLabel: 'Lengkapi Data',
      });
      return;
    }

    setFeedbackState({
      visible: true,
      type: 'confirm',
      isDestructive: false,
      title: 'Konfirmasi Kirim Laporan',
      message: `Apakah Anda yakin ingin mengirim Laporan Bulanan ${unitName} periode ${selectedMonth} ${selectedYear} ke Pengurus Yayasan?`,
      actionLabel: 'Ya, Kirim Laporan',
      onConfirmAction: handleFinalSubmit,
    });
  };

  const handleFinalSubmit = async () => {
    setFeedbackState((prev) => ({ ...prev, visible: false }));
    setSubmitting(true);
    try {
      const payload = {
        bulan: selectedMonth,
        tahun: selectedYear,
        unit: unitName,
        evaluasi_kbm: evaluasiKbm,
        evaluasi_presensi: evaluasiPresensi,
        evaluasi_tahfizh: evaluasiTahfizh,
        evaluasi_sarpras: evaluasiSarpras,
        rekomendasi_yayasan: kendalaRekomendasi,
        tanggal_kirim: new Date().toISOString(),
      };

      await mobileApiService.submitPrincipalMonthlyReport(payload);

      setFeedbackState({
        visible: true,
        type: 'success',
        title: 'Laporan Berhasil Dikirim',
        message: `Laporan bulanan ${unitName} untuk periode ${selectedMonth} ${selectedYear} telah tersimpan dan diteruskan ke Pengurus Yayasan.`,
        actionLabel: 'Alhamdulillah',
      });

      // Clear Form
      setEvaluasiKbm('');
      setEvaluasiPresensi('');
      setEvaluasiTahfizh('');
      setEvaluasiSarpras('');
      setKendalaRekomendasi('');

      onSuccess?.();
    } catch (err: any) {
      setFeedbackState({
        visible: true,
        type: 'error',
        title: 'Gagal Mengirim Laporan',
        message: err?.response?.data?.message || err?.message || 'Terjadi kesalahan saat menyimpan laporan bulanan ke server.',
        actionLabel: 'Coba Lagi',
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <View style={styles.backdrop}>
          <View style={styles.sheetContainer}>
            {/* Header Gradient */}
            <LinearGradient
              colors={['#065F46', '#059669', '#10B981']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.sheetHeader}
            >
              <View style={styles.headerLeft}>
                <View style={styles.headerIconWrap}>
                  <MaterialCommunityIcons name="file-document-edit" size={22} color="#059669" />
                </View>
                <View>
                  <Text style={styles.headerTitle}>Input Laporan Bulanan</Text>
                  <Text style={styles.headerSub}>
                    Evaluasi Kinerja Kepala Sekolah — {unitName}
                  </Text>
                </View>
              </View>

              <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.closeBtn}>
                <MaterialCommunityIcons name="close" size={20} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            {/* Period Selector Bar */}
            <View style={styles.periodBar}>
              <View style={styles.periodCol}>
                <Text style={styles.periodLabel}>Bulan Laporan:</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.monthChips}>
                  {MONTHS.map((m) => (
                    <TouchableOpacity
                      key={m}
                      activeOpacity={0.7}
                      onPress={() => setSelectedMonth(m)}
                      style={[styles.monthChip, selectedMonth === m && styles.monthChipActive]}
                    >
                      <Text style={[styles.monthChipText, selectedMonth === m && styles.monthChipTextActive]}>
                        {m}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>

              <View style={styles.yearPill}>
                <MaterialCommunityIcons name="calendar" size={14} color="#059669" />
                <Text style={styles.yearText}>{selectedYear}</Text>
              </View>
            </View>

            {/* Section Tabs */}
            <View style={styles.tabBar}>
              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('kbm')}
                style={[styles.tabItem, activeTab === 'kbm' && styles.tabItemActive]}
              >
                <MaterialCommunityIcons name="book-open-page-variant" size={15} color={activeTab === 'kbm' ? '#059669' : '#64748B'} />
                <Text style={[styles.tabLabel, activeTab === 'kbm' && styles.tabLabelActive]}>KBM</Text>
                {Boolean(evaluasiKbm.trim()) && <View style={styles.tabDoneDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('presensi')}
                style={[styles.tabItem, activeTab === 'presensi' && styles.tabItemActive]}
              >
                <MaterialCommunityIcons name="account-check" size={15} color={activeTab === 'presensi' ? '#059669' : '#64748B'} />
                <Text style={[styles.tabLabel, activeTab === 'presensi' && styles.tabLabelActive]}>Presensi</Text>
                {Boolean(evaluasiPresensi.trim()) && <View style={styles.tabDoneDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('tahfizh')}
                style={[styles.tabItem, activeTab === 'tahfizh' && styles.tabItemActive]}
              >
                <MaterialCommunityIcons name="book-open-page-variant" size={15} color={activeTab === 'tahfizh' ? '#059669' : '#64748B'} />
                <Text style={[styles.tabLabel, activeTab === 'tahfizh' && styles.tabLabelActive]}>Tahfizh</Text>
                {Boolean(evaluasiTahfizh.trim()) && <View style={styles.tabDoneDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('sarpras')}
                style={[styles.tabItem, activeTab === 'sarpras' && styles.tabItemActive]}
              >
                <MaterialCommunityIcons name="office-building" size={15} color={activeTab === 'sarpras' ? '#059669' : '#64748B'} />
                <Text style={[styles.tabLabel, activeTab === 'sarpras' && styles.tabLabelActive]}>Sarpras</Text>
                {Boolean(evaluasiSarpras.trim()) && <View style={styles.tabDoneDot} />}
              </TouchableOpacity>

              <TouchableOpacity
                activeOpacity={0.7}
                onPress={() => setActiveTab('usulan')}
                style={[styles.tabItem, activeTab === 'usulan' && styles.tabItemActive]}
              >
                <MaterialCommunityIcons name="lightbulb-on" size={15} color={activeTab === 'usulan' ? '#059669' : '#64748B'} />
                <Text style={[styles.tabLabel, activeTab === 'usulan' && styles.tabLabelActive]}>Usulan</Text>
                {Boolean(kendalaRekomendasi.trim()) && <View style={styles.tabDoneDot} />}
              </TouchableOpacity>
            </View>

            {/* Scrollable Form Body */}
            <ScrollView style={styles.formBody} contentContainerStyle={styles.formContent} keyboardShouldPersistTaps="handled">
              {activeTab === 'kbm' && (
                <View style={styles.inputGroup}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.inputTitle}>1. Evaluasi KBM & Kurikulum</Text>
                    <Text style={styles.charCountText}>{evaluasiKbm.length} karakter</Text>
                  </View>
                  <Text style={styles.inputHint}>
                    Tuliskan catatan kemajuan kurikulum, efektivitas pengajaran guru, dan ketuntasan materi ajar santri bulan ini.
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    placeholder="Contoh: KBM terlaksana 98% sesuai silabus. Ujian formatif pekan ketiga berjalan lancar..."
                    placeholderTextColor="#94A3B8"
                    value={evaluasiKbm}
                    onChangeText={setEvaluasiKbm}
                  />
                </View>
              )}

              {activeTab === 'presensi' && (
                <View style={styles.inputGroup}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.inputTitle}>2. Evaluasi Kedisiplinan & Presensi</Text>
                    <Text style={styles.charCountText}>{evaluasiPresensi.length} karakter</Text>
                  </View>
                  <Text style={styles.inputHint}>
                    Ringkasan ketidakhadiran santri, keterlambatan, penanganan wali murid, dan catatan guru piket.
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    placeholder="Contoh: Rata-rata presensi santri mencapai 96.5%. Keterlambatan didominasi karena cuaca..."
                    placeholderTextColor="#94A3B8"
                    value={evaluasiPresensi}
                    onChangeText={setEvaluasiPresensi}
                  />
                </View>
              )}

              {activeTab === 'tahfizh' && (
                <View style={styles.inputGroup}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.inputTitle}>3. Capaian Tahfizh & Ibadah Yaumiyyah</Text>
                    <Text style={styles.charCountText}>{evaluasiTahfizh.length} karakter</Text>
                  </View>
                  <Text style={styles.inputHint}>
                    Tingkat ketuntasan setoran hafalan Al-Qur'an, pelaksanaan shalat berjamaah, dan mutabaah santri.
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    placeholder="Contoh: Sebanyak 42 santri telah menyelesaikan target hafalan juz 30 dan juz 29..."
                    placeholderTextColor="#94A3B8"
                    value={evaluasiTahfizh}
                    onChangeText={setEvaluasiTahfizh}
                  />
                </View>
              )}

              {activeTab === 'sarpras' && (
                <View style={styles.inputGroup}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.inputTitle}>4. Sarana, Prasarana & Operasional</Text>
                    <Text style={styles.charCountText}>{evaluasiSarpras.length} karakter</Text>
                  </View>
                  <Text style={styles.inputHint}>
                    Kondisi fasilitas fisik ruang kelas, laboratorium, asrama, masjid, serta kebutuhan pengadaan.
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    placeholder="Contoh: AC ruang kelas 3 butuh servis berkala. Penambahan sound system musholla telah diajukan..."
                    placeholderTextColor="#94A3B8"
                    value={evaluasiSarpras}
                    onChangeText={setEvaluasiSarpras}
                  />
                </View>
              )}

              {activeTab === 'usulan' && (
                <View style={styles.inputGroup}>
                  <View style={styles.inputHeaderRow}>
                    <Text style={styles.inputTitle}>5. Kendala Utama & Rekomendasi ke Yayasan</Text>
                    <Text style={styles.charCountText}>{kendalaRekomendasi.length} karakter</Text>
                  </View>
                  <Text style={styles.inputHint}>
                    Usulan strategis, permohonan persetujuan program kerja, atau tindak lanjut yang memerlukan keputusan pengurus yayasan.
                  </Text>
                  <TextInput
                    style={styles.textArea}
                    multiline
                    numberOfLines={6}
                    textAlignVertical="top"
                    placeholder="Contoh: Mohon persetujuan Yayasan terkait penambahan guru tahfizh halaqah intensif..."
                    placeholderTextColor="#94A3B8"
                    value={kendalaRekomendasi}
                    onChangeText={setKendalaRekomendasi}
                  />
                </View>
              )}

              {/* Quick Fill Suggestions */}
              <View style={styles.quickPromptWrap}>
                <Text style={styles.quickPromptLabel}>Saran Cepat:</Text>
                <View style={styles.quickPromptRow}>
                  <TouchableOpacity
                    style={styles.quickPromptBtn}
                    onPress={() => {
                      if (activeTab === 'kbm') setEvaluasiKbm((prev) => `${prev} KBM berjalan 100% kondusif.`.trim());
                      if (activeTab === 'presensi') setEvaluasiPresensi((prev) => `${prev} Kedisiplinan santri meningkat, nihil pelanggaran berat.`.trim());
                      if (activeTab === 'tahfizh') setEvaluasiTahfizh((prev) => `${prev} Target capaian hafalan santri melampaui standar bulanan.`.trim());
                      if (activeTab === 'sarpras') setEvaluasiSarpras((prev) => `${prev} Fasilitas belajar dalam kondisi baik dan terawat.`.trim());
                      if (activeTab === 'usulan') setKendalaRekomendasi((prev) => `${prev} Rekomendasi pelatihan pengayaan metode tartil bagi guru.`.trim());
                    }}
                  >
                    <Text style={styles.quickPromptText}>+ Kalimat Standar Baik</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>

            {/* Footer Buttons */}
            <View style={styles.sheetFooter}>
              {(evaluasiKbm || evaluasiPresensi || evaluasiTahfizh || evaluasiSarpras || kendalaRekomendasi) ? (
                <TouchableOpacity activeOpacity={0.7} onPress={handlePromptClearForm} style={styles.clearBtn}>
                  <MaterialCommunityIcons name="trash-can-outline" size={15} color="#E11D48" />
                  <Text style={styles.clearBtnText}>Bersihkan</Text>
                </TouchableOpacity>
              ) : (
                <TouchableOpacity activeOpacity={0.7} onPress={onClose} style={styles.cancelBtn}>
                  <Text style={styles.cancelBtnText}>Batal</Text>
                </TouchableOpacity>
              )}

              <TouchableOpacity
                activeOpacity={0.85}
                disabled={submitting}
                onPress={handleValidateAndConfirm}
                style={[styles.submitBtn, submitting && { opacity: 0.6 }]}
              >
                <LinearGradient
                  colors={['#059669', '#10B981']}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                  style={styles.submitGradient}
                >
                  {submitting ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <MaterialCommunityIcons name="send" size={16} color="#FFFFFF" />
                      <Text style={styles.submitBtnText}>Kirim Laporan ke Yayasan</Text>
                    </>
                  )}
                </LinearGradient>
              </TouchableOpacity>
            </View>

            {/* Pop Up Feedback & Confirmations */}
            <AppFeedbackModal
              asOverlay
              visible={feedbackState.visible}
              type={feedbackState.type}
              title={feedbackState.title}
              message={feedbackState.message}
              actionLabel={feedbackState.actionLabel}
              isDestructive={feedbackState.isDestructive}
              onConfirm={feedbackState.type === 'confirm' ? feedbackState.onConfirmAction || handleFinalSubmit : undefined}
              onClose={() => {
                setFeedbackState((prev) => ({ ...prev, visible: false }));
                if (feedbackState.type === 'success') {
                  onClose();
                }
              }}
            />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.75)',
    justifyContent: 'flex-end',
  },
  sheetContainer: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    maxHeight: '90%',
    overflow: 'hidden',
  },
  sheetHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 16,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  headerSub: {
    fontSize: 11.5,
    color: 'rgba(255, 255, 255, 0.9)',
    fontWeight: '600',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  periodBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingHorizontal: 16,
    paddingVertical: 10,
  },
  periodCol: {
    flex: 1,
  },
  periodLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#64748B',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  monthChips: {
    flexDirection: 'row',
    gap: 6,
  },
  monthChip: {
    paddingHorizontal: 10,
    paddingVertical: 4.5,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  monthChipActive: {
    backgroundColor: '#059669',
    borderColor: '#059669',
  },
  monthChipText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#475569',
  },
  monthChipTextActive: {
    color: '#FFFFFF',
  },
  yearPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 10,
    marginLeft: 8,
  },
  yearText: {
    fontSize: 12,
    fontWeight: '800',
    color: '#059669',
  },
  tabBar: {
    flexDirection: 'row',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 6,
  },
  tabItem: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingVertical: 8,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    backgroundColor: '#E2E8F0',
  },
  tabItemActive: {
    backgroundColor: '#FFFFFF',
  },
  tabLabel: {
    fontSize: 11,
    fontWeight: '700',
    color: '#64748B',
  },
  tabLabelActive: {
    color: '#059669',
    fontWeight: '800',
  },
  formBody: {
    maxHeight: 320,
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  formContent: {
    paddingBottom: 24,
  },
  inputGroup: {
    marginBottom: 12,
  },
  inputTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#0F172A',
    marginBottom: 4,
  },
  inputHint: {
    fontSize: 11,
    color: '#64748B',
    lineHeight: 16,
    marginBottom: 8,
  },
  textArea: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1.5,
    borderColor: '#E2E8F0',
    borderRadius: 14,
    padding: 12,
    fontSize: 12.5,
    color: '#1E293B',
    minHeight: 120,
  },
  quickPromptWrap: {
    marginTop: 8,
  },
  quickPromptLabel: {
    fontSize: 10.5,
    fontWeight: '700',
    color: '#94A3B8',
    marginBottom: 4,
  },
  quickPromptRow: {
    flexDirection: 'row',
    gap: 8,
  },
  quickPromptBtn: {
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
  },
  quickPromptText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  sheetFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  cancelBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#CBD5E1',
  },
  cancelBtnText: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#64748B',
  },
  clearBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#FECDD3',
    backgroundColor: '#FFF1F2',
  },
  clearBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#E11D48',
  },
  tabDoneDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#059669',
    marginLeft: 2,
  },
  inputHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  charCountText: {
    fontSize: 10.5,
    color: '#94A3B8',
    fontWeight: '600',
  },
  submitBtn: {
    flex: 1,
    borderRadius: 14,
    overflow: 'hidden',
  },
  submitGradient: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
  },
  submitBtnText: {
    fontSize: 13,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
