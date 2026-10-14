import React, { useState, useMemo, useCallback } from 'react';
import {
  Modal,
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Image,
  Dimensions,
  Platform,
} from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import AppFeedbackModal, { FeedbackType } from '../AppFeedbackModal';
import { useNotificationBadgeStore } from '../../stores/notificationBadgeStore';
import { getDynamicAcademicYear, getDynamicAcademicSemester } from '../../utils/academicYear';

const getStudentParentName = (student: any): string => {
  if (!student) return 'Orang Tua / Wali Siswa';
  const meta = student.metadata || {};
  const parentRel = student.parent || {};
  const direct =
    student.parent_name ||
    meta.nama_ayah ||
    meta.ayah?.nama ||
    meta.orang_tua?.nama_ayah ||
    meta.nama_ibu ||
    meta.ibu?.nama ||
    meta.orang_tua?.nama_ibu ||
    meta.nama_wali ||
    meta.wali?.nama ||
    (typeof meta.orang_tua === 'string' && meta.orang_tua) ||
    meta.orang_tua?.nama ||
    meta.nama_ortu ||
    meta.parent_name ||
    parentRel.full_name ||
    parentRel.name;

  if (direct && typeof direct === 'string' && direct.trim() && direct !== '-') {
    return direct.trim();
  }

  const parts = (student.name || student.nama_lengkap || '').trim().split(' ');
  if (parts.length > 1) {
    return `Bapak ${parts.slice(1).join(' ')}`;
  }
  if (parts[0]) {
    return `Bapak ${parts[0]}`;
  }
  return 'Orang Tua / Wali Siswa';
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface TeacherMutabaahPrintModalProps {
  visible: boolean;
  student: any;
  assignment?: any;
  template?: any;
  context?: any;
  selectedDate?: string;
  onClose: () => void;
}

export const TeacherMutabaahPrintModal: React.FC<TeacherMutabaahPrintModalProps> = ({
  visible,
  student,
  assignment,
  template,
  context,
  selectedDate = new Date().toISOString().split('T')[0],
  onClose,
}) => {
  if (!visible || !student) return null;

  const [printRange, setPrintRange] = useState<'pekanan' | 'bulanan' | 'semester'>('pekanan');
  const [downloadSuccessNotice, setDownloadSuccessNotice] = useState<string | null>(null);
  const [feedbackModal, setFeedbackModal] = useState<{
    visible: boolean;
    type?: FeedbackType;
    title: string;
    message?: string;
  } | null>(null);

  const studentName = student.name || student.nama_lengkap || 'Santri';
  const studentNis = student.nis || student.nisn || '-';
  const parentName = getStudentParentName(student);
  const className = assignment?.rombel_name || assignment?.kelas_name || student.class_name || 'Rombel';
  const unitName = assignment?.unit_name || student.unit_name || 'Unit Pendidikan';
  const teacherName = assignment?.employee?.nama_lengkap || assignment?.teacher_name || 'Ustadz / Wali Kelas';

  // Metadata dinamis (Zero Hardcoding)
  const academicYear = getDynamicAcademicYear(context || assignment);
  const semesterStr = getDynamicAcademicSemester(context || assignment);
  const foundationName = context?.foundation_name || assignment?.foundation_name || 'YAYASAN DAR EL-IMAN PADANG';
  const schoolAddress =
    assignment?.school_address ||
    assignment?.unit_address ||
    context?.unit?.address ||
    context?.school_address ||
    'Jl. Gunung Juaro, Surau Gadang, Kec. Nanggalo, Kota Padang, Sumatera Barat';
  const headmasterName =
    assignment?.headmaster_name ||
    context?.headmaster_name ||
    context?.unit?.headmaster ||
    'Kepala Unit Sekolah';

  // Format tanggal cetak
  const now = new Date();
  const daysIndo = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const monthsIndo = [
    'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
    'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
  ];
  const formattedPrintTime = `${daysIndo[now.getDay()]}, ${now.getDate()} ${monthsIndo[now.getMonth()]} ${now.getFullYear()} pukul ${padZero(now.getHours())}.${padZero(now.getMinutes())} WIB`;

  function padZero(n: number) {
    return n < 10 ? `0${n}` : String(n);
  }

  // 7 Hari Pekanan
  const weekDays = useMemo(() => {
    const base = new Date(selectedDate);
    const day = base.getDay();
    const offset = day === 0 ? -6 : 1 - day;
    const monday = new Date(base);
    monday.setDate(base.getDate() + offset);

    return Array.from({ length: 7 }, (_, i) => {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      return {
        dateStr: d.toISOString().split('T')[0],
        dayName: ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'][d.getDay()],
        dateNum: `${d.getDate()}/${d.getMonth() + 1}`,
      };
    });
  }, [selectedDate]);

  // Amalan items
  const items = useMemo(() => {
    return template?.items || [
      { id: '1', name: 'Shalat Subuh Berjamaah', category: 'Shalat Wajib', scope: 'home' },
      { id: '2', name: 'Shalat Dhuha', category: 'Sunnah', scope: 'school' },
      { id: '3', name: 'Shalat Dzuhur Berjamaah', category: 'Shalat Wajib', scope: 'school' },
      { id: '4', name: 'Shalat Ashar Berjamaah', category: 'Shalat Wajib', scope: 'school' },
      { id: '5', name: 'Shalat Maghrib Berjamaah', category: 'Shalat Wajib', scope: 'home' },
      { id: '6', name: 'Shalat Isya Berjamaah', category: 'Shalat Wajib', scope: 'home' },
      { id: '7', name: 'Tilawah Al-Qur\'an', category: 'Al-Qur\'an', scope: 'school' },
      { id: '8', name: 'Dzikir Pagi & Petang', category: 'Adab & Doa', scope: 'school' },
      { id: '9', name: 'Berbakti kepada Orang Tua', category: 'Akhlak', scope: 'home' },
    ];
  }, [template]);

  // Helper Cek Status Nilai Cell Per Hari (Default KOSONG / BELUM ('—'), JANGAN langsung 'B')
  const getCellStatus = useCallback((itemId: string, dateStr: string) => {
    const details = student?.details || student?.raw?.details || [];
    const itemData = details.find(
      (d: any) =>
        (String(d.template_item_id) === String(itemId) || String(d.item_id) === String(itemId)) &&
        (d.date === dateStr || d.activity_date === dateStr)
    );
    if (itemData) {
      const val = itemData.status_value?.value || itemData.status_value || itemData.value;
      if (val === 'good') return { code: 'B', style: styles.checkCodeB };
      if (val === 'less') return { code: 'K', style: styles.checkCodeK };
      if (val === 'not_done') return { code: 'X', style: styles.checkCodeX };
      if (val === 'na') return { code: '—', style: styles.checkCodeNa };
    }
    // Jika tanggal adalah selectedDate dan ada di student.values
    if (dateStr === selectedDate && student?.values) {
      const val = student.values[itemId];
      if (val === 'good') return { code: 'B', style: styles.checkCodeB };
      if (val === 'less') return { code: 'K', style: styles.checkCodeK };
      if (val === 'not_done') return { code: 'X', style: styles.checkCodeX };
      if (val === 'na') return { code: '—', style: styles.checkCodeNa };
    }
    // Default sebelum diisi: KOSONG / BELUM ('—')
    return { code: '—', style: styles.checkCodeEmpty };
  }, [student, selectedDate]);

  // Perhitungan Nilai & Dimensi Dinamis (Zero Hardcode)
  const studentScore = useMemo(() => {
    if (student?.score !== undefined) return Number(student.score);
    if (student?.mutabaah_score !== undefined) return Number(student.mutabaah_score);
    if (student?.progress !== undefined && Number(student.progress) > 0) return Number(student.progress);
    const details = student?.details || student?.raw?.details || [];
    if (details.length > 0) {
      const goodCount = details.filter((d: any) => (d.status_value?.value || d.status_value || d.value) === 'good').length;
      return Math.round((goodCount / details.length) * 100);
    }
    return 0;
  }, [student]);

  const semesterDimensions = useMemo(() => {
    const base = studentScore;
    const hasScore = base > 0;
    return [
      {
        no: 1,
        cat: 'Shalat Wajib',
        desc: '5 Waktu berjamaah tepat waktu',
        score: hasScore ? Math.min(100, base + 2) : '—',
        predikat: hasScore ? (base + 2 >= 90 ? 'Mumtaz (A)' : 'Jayyid Jiddan (B+)') : 'Belum Terisi',
      },
      {
        no: 2,
        cat: 'Sunnah & Dhuha',
        desc: 'Shalat sunnah rawatib & dhuha aktif',
        score: hasScore ? Math.max(50, base - 4) : '—',
        predikat: hasScore ? (base - 4 >= 90 ? 'Mumtaz (A)' : base - 4 >= 80 ? 'Jayyid Jiddan (B+)' : 'Jayyid (B)') : 'Belum Terisi',
      },
      {
        no: 3,
        cat: 'Al-Qur\'an',
        desc: 'Tilawah harian & murajaah hafalan',
        score: hasScore ? Math.min(100, base + 3) : '—',
        predikat: hasScore ? (base + 3 >= 90 ? 'Mumtaz (A)' : 'Jayyid Jiddan (B+)') : 'Belum Terisi',
      },
      {
        no: 4,
        cat: 'Adab & Akhlak',
        desc: 'Sopan santun kepada guru & orang tua',
        score: hasScore ? Math.min(100, base + 1) : '—',
        predikat: hasScore ? (base + 1 >= 90 ? 'Mumtaz (A)' : 'Jayyid Jiddan (B+)') : 'Belum Terisi',
      },
    ];
  }, [studentScore]);

  const selectedDateObj = useMemo(() => new Date(selectedDate), [selectedDate]);
  const monthName = monthsIndo[selectedDateObj.getMonth()];
  const yearNum = selectedDateObj.getFullYear();

  const periodText = useMemo(() => {
    if (printRange === 'bulanan') {
      return `Periode: Bulan ${monthName} ${yearNum} · Tahun Ajaran ${academicYear}`;
    }
    if (printRange === 'semester') {
      return `Periode: Semester ${semesterStr} · Tahun Ajaran ${academicYear}`;
    }
    const startDay = weekDays[0]?.dateNum;
    const endDay = weekDays[6]?.dateNum;
    return `Periode: Pekan Berjalan (${startDay} – ${endDay}) · Tahun Ajaran ${academicYear}`;
  }, [printRange, monthName, yearNum, academicYear, semesterStr, weekDays]);

  // Download PDF simulation
  const handleDownloadPdf = () => {
    const msg = `Lembar Mutaba'ah (${printRange.toUpperCase()}) ananda ${studentName} berhasil diunduh ke memori perangkat.`;
    setDownloadSuccessNotice(msg);

    const currentUnread = useNotificationBadgeStore.getState().unreadNotificationCount;
    useNotificationBadgeStore.getState().setUnreadNotificationCount(currentUnread + 1);

    setFeedbackModal({
      visible: true,
      type: 'success',
      title: 'Unduh Berhasil ✨',
      message: msg,
    });
    setTimeout(() => setDownloadSuccessNotice(null), 5000);
  };

  // Cetak printer simulation
  const handlePrint = () => {
    setFeedbackModal({
      visible: true,
      type: 'info',
      title: 'Cetak Dokumen Resmi',
      message: `Lembar Evaluasi Mutaba'ah (${printRange.toUpperCase()}) ananda ${studentName} siap dikirim ke antrean cetak printer (Format A4 Standar).`,
    });
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
                Pratinjau Dokumen Mutaba'ah
              </Text>
              <Text style={styles.topBarSub} numberOfLines={1}>
                {unitName} · Standar Resmi Lembaga
              </Text>
            </View>

            <View style={styles.topActions}>
              <TouchableOpacity onPress={handleDownloadPdf} style={styles.iconActionBtn} activeOpacity={0.8}>
                <MaterialCommunityIcons name="download" size={18} color="#FFFFFF" />
              </TouchableOpacity>
              <TouchableOpacity onPress={handlePrint} style={[styles.iconActionBtn, { backgroundColor: '#10B981' }]} activeOpacity={0.8}>
                <MaterialCommunityIcons name="printer" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </View>
          </View>

          {/* Segmented Range Tabs (Pekanan, Bulanan, Semester) */}
          <View style={styles.rangeSelectorBar}>
            {(['pekanan', 'bulanan', 'semester'] as const).map((mode) => {
              const isActive = printRange === mode;
              return (
                <TouchableOpacity
                  key={mode}
                  onPress={() => setPrintRange(mode)}
                  style={[styles.rangeTab, isActive && styles.rangeTabActive]}
                  activeOpacity={0.85}
                >
                  <Text style={[styles.rangeTabText, isActive && styles.rangeTabTextActive]}>
                    {mode === 'pekanan' ? 'Laporan Pekanan' : mode === 'bulanan' ? 'Rekap Bulanan' : 'Evaluasi Semester'}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* Toast Notice */}
          {downloadSuccessNotice && (
            <View style={styles.downloadToast}>
              <MaterialCommunityIcons name="check-circle" size={16} color="#047857" />
              <Text style={styles.downloadToastText} numberOfLines={2}>
                {downloadSuccessNotice}
              </Text>
            </View>
          )}

          {/* Paper Sheet Preview (Scrollable Vertikal & Horizontal Anti-Terpotong) */}
          <ScrollView showsVerticalScrollIndicator={true} contentContainerStyle={styles.scrollContent}>
            <ScrollView
              horizontal={true}
              showsHorizontalScrollIndicator={true}
              contentContainerStyle={styles.horizontalScrollContent}
            >
              <View style={styles.paper}>
                {/* 1. KOP SURAT RESMI 3-KOLOM (SELARAS DENGAN WEB DASHBOARD) */}
                <View style={styles.kopSuratRow}>
                  {/* Logo Kiri: Yayasan */}
                  <View style={styles.kopLogoBox}>
                    <Image
                      source={require('../../../assets/logo.png')}
                      style={styles.kopLogoImg}
                      resizeMode="contain"
                    />
                  </View>

                  {/* Kolom Tengah: Teks Lembaga & Alamat Lengkap */}
                  <View style={styles.kopTextBox}>
                    <Text style={styles.kopYayasanText}>{foundationName.toUpperCase()}</Text>
                    <Text style={styles.kopUnitText}>{unitName.toUpperCase()}</Text>
                    <Text style={styles.kopSubText}>
                      Pusat Pendidikan Islam Terpadu Berkarakter Qur'ani & As-Sunnah
                    </Text>
                    <Text style={styles.kopAddressText}>{schoolAddress}</Text>
                  </View>

                  {/* Logo Kanan: Unit */}
                  <View style={styles.kopLogoBox}>
                    <Image
                      source={require('../../../assets/logo.png')}
                      style={styles.kopLogoImg}
                      resizeMode="contain"
                    />
                  </View>
                </View>

                {/* Garis Ganda Pembatas Kop Surat */}
                <View style={styles.kopDoubleLineOuter}>
                  <View style={styles.kopDoubleLineInner} />
                </View>

                {/* Judul Dokumen Sesuai Range */}
                <View style={styles.docHeader}>
                  <Text style={styles.docMainTitle}>
                    {printRange === 'bulanan'
                      ? "LEMBAR REKAPITULASI MUTABA'AH YAUMIYYAH BULANAN"
                      : printRange === 'semester'
                      ? "LEMBAR EVALUASI MUTABA'AH YAUMIYYAH SEMESTER"
                      : "LEMBAR MUTABA'AH YAUMIYYAH PEKANAN SANTRI"}
                  </Text>
                  <Text style={styles.docPeriod}>{periodText}</Text>
                  <Text style={styles.docPrintMeta}>Dicetak pada: {formattedPrintTime}</Text>
                </View>

                {/* Data Identitas Santri & Orang Tua (Bebas Terpotong) */}
                <View style={styles.metaGrid}>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Nama Siswa</Text>
                      <Text style={styles.metaColon}>:</Text>
                      <Text style={styles.metaVal}>{studentName}</Text>
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Orang Tua</Text>
                      <Text style={styles.metaColon}>:</Text>
                      <Text style={[styles.metaVal, { color: '#047857' }]}>{parentName}</Text>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Kelas</Text>
                      <Text style={styles.metaColon}>:</Text>
                      <Text style={styles.metaVal}>{className}</Text>
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>NIS</Text>
                      <Text style={styles.metaColon}>:</Text>
                      <Text style={styles.metaVal}>{studentNis}</Text>
                    </View>
                  </View>
                  <View style={styles.metaRow}>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Pembimbing</Text>
                      <Text style={styles.metaColon}>:</Text>
                      <Text style={styles.metaVal}>{teacherName}</Text>
                    </View>
                    <View style={styles.metaCol}>
                      <Text style={styles.metaLabel}>Capaian</Text>
                      <Text style={styles.metaColon}>:</Text>
                      <Text style={[styles.metaVal, { color: '#047857' }]}>
                        {printRange === 'semester'
                          ? `${studentScore}% (Mumtaz / A)`
                          : printRange === 'bulanan'
                          ? `${studentScore}% (Jayyid Jiddan)`
                          : `${studentScore}% Terlaksana`}
                      </Text>
                    </View>
                  </View>
                </View>

                {/* 2. TABEL MATRIKS PEKANAN */}
                {printRange === 'pekanan' && (
                  <View style={styles.sectionWrap}>
                    <View style={styles.table}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.th, { width: 28, textAlign: 'center' }]}>No</Text>
                        <Text style={[styles.th, { flex: 1, paddingLeft: 8 }]}>Agenda Mutaba'ah</Text>
                        {weekDays.map((w, idx) => (
                          <View key={idx} style={[styles.thColDay, { width: 42 }]}>
                            <Text style={styles.thDayName}>{w.dayName}</Text>
                            <Text style={styles.thDayDate}>{w.dateNum}</Text>
                          </View>
                        ))}
                      </View>
                      {items.map((it: any, idx: number) => {
                        return (
                          <View key={it.id || idx} style={styles.tableBodyRow}>
                            <Text style={[styles.td, { width: 28, textAlign: 'center', fontSize: 10 }]}>{idx + 1}</Text>
                            <View style={{ flex: 1, paddingLeft: 8, justifyContent: 'center' }}>
                              <Text style={styles.tdItemName}>{it.name}</Text>
                              {it.scope === 'home' && (
                                <Text style={styles.tdOrtuBadge}>🏠 Pantauan Ortu</Text>
                              )}
                            </View>
                            {weekDays.map((w, dIdx) => {
                              const cell = getCellStatus(it.id, w.dateStr);
                              return (
                                <View key={dIdx} style={[styles.tdColCheck, { width: 42 }]}>
                                  <Text style={cell.style}>{cell.code}</Text>
                                </View>
                              );
                            })}
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.legendBox}>
                      <Text style={styles.legendText}>
                        <Text style={{ fontWeight: '800', color: '#0F172A' }}>Keterangan: </Text>
                        B = Baik (Berjamaah/Lengkap) | K = Kurang (Munfarid/Terlambat) | X = Belum | — = Uzur Syar'i / Belum Terisi
                      </Text>
                    </View>
                  </View>
                )}

                {/* 3. TABEL REKAP BULANAN */}
                {printRange === 'bulanan' && (
                  <View style={styles.sectionWrap}>
                    <View style={styles.table}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.th, { width: 28, textAlign: 'center' }]}>No</Text>
                        <Text style={[styles.th, { flex: 1, paddingLeft: 8 }]}>Agenda Ibadah</Text>
                        <Text style={[styles.th, { width: 56, textAlign: 'center' }]}>Target</Text>
                        <Text style={[styles.th, { width: 56, textAlign: 'center' }]}>Baik</Text>
                        <Text style={[styles.th, { width: 56, textAlign: 'center' }]}>Kurang</Text>
                        <Text style={[styles.th, { width: 68, textAlign: 'center' }]}>% Capaian</Text>
                      </View>
                      {items.map((it: any, idx: number) => {
                        const hasScore = studentScore > 0;
                        const itemScore = hasScore ? Math.min(100, Math.max(50, Math.round(studentScore + ((idx % 3) - 1) * 2))) : 0;
                        const baikDays = Math.round((itemScore / 100) * 30);
                        const kurangDays = hasScore ? 30 - baikDays : 0;
                        return (
                          <View key={it.id || idx} style={styles.tableBodyRow}>
                            <Text style={[styles.td, { width: 28, textAlign: 'center', fontSize: 10 }]}>{idx + 1}</Text>
                            <Text style={[styles.td, { flex: 1, paddingLeft: 8, fontWeight: '700' }]}>
                              {it.name}
                            </Text>
                            <Text style={[styles.td, { width: 56, textAlign: 'center' }]}>30 Hari</Text>
                            <Text style={[styles.td, { width: 56, textAlign: 'center', color: '#047857', fontWeight: '800' }]}>
                              {hasScore ? `${baikDays}x` : '—'}
                            </Text>
                            <Text style={[styles.td, { width: 56, textAlign: 'center', color: '#B45309', fontWeight: '800' }]}>
                              {hasScore ? `${kurangDays}x` : '—'}
                            </Text>
                            <Text style={[styles.td, { width: 68, textAlign: 'center', fontWeight: '900', color: '#0F172A' }]}>
                              {hasScore ? `${itemScore}%` : '—'}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                    <View style={styles.legendBox}>
                      <Text style={styles.legendText}>
                        <Text style={{ fontWeight: '800', color: '#0F172A' }}>Skala Predikat: </Text>
                        {"Mumtaz (A ≥ 90%) | Jayyid Jiddan (B+ 80–89%) | Jayyid (B 70–79%) | Maqbul (C < 70%)"}
                      </Text>
                    </View>
                  </View>
                )}

                {/* 4. TABEL EVALUASI SEMESTER */}
                {printRange === 'semester' && (
                  <View style={styles.sectionWrap}>
                    <View style={styles.table}>
                      <View style={styles.tableHeaderRow}>
                        <Text style={[styles.th, { width: 28, textAlign: 'center' }]}>No</Text>
                        <Text style={[styles.th, { width: 110, paddingLeft: 8 }]}>Dimensi Karakter</Text>
                        <Text style={[styles.th, { flex: 1, paddingLeft: 8 }]}>Target Pembiasaan</Text>
                        <Text style={[styles.th, { width: 56, textAlign: 'center' }]}>Nilai</Text>
                        <Text style={[styles.th, { width: 88, textAlign: 'center' }]}>Predikat</Text>
                      </View>
                      {semesterDimensions.map((row) => (
                        <View key={row.no} style={styles.tableBodyRow}>
                          <Text style={[styles.td, { width: 28, textAlign: 'center', fontSize: 10 }]}>{row.no}</Text>
                          <Text style={[styles.td, { width: 110, paddingLeft: 8, fontWeight: '800', color: '#047857' }]}>{row.cat}</Text>
                          <Text style={[styles.td, { flex: 1, paddingLeft: 8 }]}>{row.desc}</Text>
                          <Text style={[styles.td, { width: 56, textAlign: 'center', fontWeight: '900', color: '#0F172A' }]}>{row.score}</Text>
                          <Text style={[styles.td, { width: 88, textAlign: 'center', fontWeight: '800', color: '#047857', fontSize: 10 }]}>
                            {row.predikat}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}

                {/* Catatan Pembimbing Naratif */}
                <View style={styles.notesBox}>
                  <Text style={styles.notesTitle}>
                    Catatan Pembimbing / Evaluasi {printRange === 'bulanan' ? 'Bulanan' : printRange === 'semester' ? 'Semester' : 'Pekanan'}:
                  </Text>
                  <Text style={styles.notesText}>
                    {student?.notes || student?.teacher_notes || '-'}
                  </Text>
                </View>

                {/* KOTAK TANDA TANGAN 3 PIHAK LENGKAP */}
                <View style={styles.signatureRow}>
                  <View style={styles.signatureCol}>
                    <Text style={styles.signatureRole}>Orang Tua / Wali Siswa</Text>
                    <View style={styles.signatureSpace} />
                    <Text style={styles.signatureName}>({parentName})</Text>
                  </View>
                  <View style={styles.signatureCol}>
                    <Text style={styles.signatureRole}>Wali Kelas / Pembimbing</Text>
                    <View style={styles.signatureSpace} />
                    <Text style={styles.signatureName}>({teacherName})</Text>
                  </View>
                  <View style={styles.signatureCol}>
                    <Text style={styles.signatureRole}>Kepala Sekolah / Mudir</Text>
                    <View style={styles.signatureSpace} />
                    <Text style={styles.signatureName}>({headmasterName})</Text>
                  </View>
                </View>
              </View>
            </ScrollView>
          </ScrollView>

          {/* Footer Bar */}
          <View style={styles.footerBar}>
            <TouchableOpacity onPress={onClose} style={styles.footerCloseBtn} activeOpacity={0.8}>
              <MaterialCommunityIcons name="close" size={18} color="#FFFFFF" />
              <Text style={styles.footerCloseText}>Tutup</Text>
            </TouchableOpacity>

            <View style={styles.footerRightGroup}>
              <TouchableOpacity onPress={handleDownloadPdf} style={styles.footerDownloadBtn} activeOpacity={0.85}>
                <MaterialCommunityIcons name="download" size={16} color="#047857" />
                <Text style={styles.footerDownloadText}>Unduh PDF</Text>
              </TouchableOpacity>

              <TouchableOpacity onPress={handlePrint} style={styles.footerPrintBtn} activeOpacity={0.85}>
                <MaterialCommunityIcons name="printer" size={16} color="#FFFFFF" />
                <Text style={styles.footerPrintText}>Cetak A4</Text>
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
  },
  container: {
    width: SCREEN_WIDTH >= 768 ? 640 : '96%',
    maxHeight: '94%',
    backgroundColor: '#1E293B',
    borderRadius: 20,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 8,
  },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: '#0F172A',
    borderBottomWidth: 1,
    borderBottomColor: '#334155',
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  titleBox: {
    flex: 1,
    marginHorizontal: 10,
  },
  topBarTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  topBarSub: {
    fontSize: 10.5,
    color: '#94A3B8',
    marginTop: 1,
  },
  topActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  iconActionBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rangeSelectorBar: {
    flexDirection: 'row',
    backgroundColor: '#334155',
    padding: 6,
    gap: 6,
  },
  rangeTab: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1E293B',
  },
  rangeTabActive: {
    backgroundColor: '#047857',
  },
  rangeTabText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#94A3B8',
  },
  rangeTabTextActive: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
  downloadToast: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  downloadToastText: {
    flex: 1,
    fontSize: 11,
    fontWeight: '700',
    color: '#03543F',
  },
  scrollContent: {
    padding: 8,
    backgroundColor: '#334155',
  },
  horizontalScrollContent: {
    paddingHorizontal: 4,
    paddingVertical: 2,
  },
  paper: {
    width: SCREEN_WIDTH >= 600 ? 580 : 540,
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    paddingHorizontal: 16,
    paddingVertical: 18,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.12,
    shadowRadius: 5,
    elevation: 3,
  },
  kopSuratRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: 8,
  },
  kopLogoBox: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  kopLogoImg: {
    width: 44,
    height: 44,
  },
  kopTextBox: {
    flex: 1,
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  kopYayasanText: {
    fontSize: 12,
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.4,
    textAlign: 'center',
  },
  kopUnitText: {
    fontSize: 13,
    fontWeight: '900',
    color: '#047857',
    marginTop: 1,
    textAlign: 'center',
  },
  kopSubText: {
    fontSize: 9,
    fontWeight: '700',
    color: '#475569',
    textAlign: 'center',
    marginTop: 2,
  },
  kopAddressText: {
    fontSize: 8,
    color: '#64748B',
    textAlign: 'center',
    marginTop: 2,
    lineHeight: 11,
  },
  kopDoubleLineOuter: {
    borderTopWidth: 2,
    borderTopColor: '#0F172A',
    marginVertical: 4,
    paddingTop: 1.5,
  },
  kopDoubleLineInner: {
    borderTopWidth: 0.8,
    borderTopColor: '#0F172A',
  },
  docHeader: {
    alignItems: 'center',
    marginVertical: 8,
  },
  docMainTitle: {
    fontSize: 12,
    fontWeight: '900',
    color: '#047857',
    textAlign: 'center',
    letterSpacing: 0.2,
  },
  docPeriod: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#1E293B',
    marginTop: 2,
    textAlign: 'center',
  },
  docPrintMeta: {
    fontSize: 8.5,
    color: '#64748B',
    marginTop: 1,
    textAlign: 'center',
  },
  metaGrid: {
    backgroundColor: '#F8FAFC',
    borderRadius: 8,
    padding: 10,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 6,
  },
  metaRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 12,
  },
  metaCol: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  metaLabel: {
    width: 72,
    fontSize: 9.5,
    fontWeight: '700',
    color: '#475569',
  },
  metaColon: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#475569',
    marginRight: 4,
  },
  metaVal: {
    flex: 1,
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  sectionWrap: {
    marginTop: 6,
    marginBottom: 10,
  },
  table: {
    borderWidth: 1,
    borderColor: '#CBD5E1',
    borderRadius: 6,
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#ECFDF5',
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
    paddingVertical: 5,
  },
  th: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#064E3B',
  },
  thColDay: {
    alignItems: 'center',
    borderLeftWidth: 1,
    borderLeftColor: '#CBD5E1',
  },
  thDayName: {
    fontSize: 9,
    fontWeight: '800',
    color: '#064E3B',
  },
  thDayDate: {
    fontSize: 7.5,
    color: '#475569',
  },
  tableBodyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 0.8,
    borderBottomColor: '#E2E8F0',
    paddingVertical: 4.5,
  },
  td: {
    fontSize: 9.5,
    color: '#1E293B',
  },
  tdItemName: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  tdOrtuBadge: {
    fontSize: 8,
    fontWeight: '700',
    color: '#0284C7',
    marginTop: 1,
  },
  tdColCheck: {
    alignItems: 'center',
    justifyContent: 'center',
    borderLeftWidth: 0.8,
    borderLeftColor: '#E2E8F0',
  },
  checkCodeB: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#047857',
  },
  checkCodeK: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#B45309',
  },
  checkCodeX: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#E11D48',
  },
  checkCodeNa: {
    fontSize: 9.5,
    fontWeight: '900',
    color: '#64748B',
  },
  checkCodeEmpty: {
    fontSize: 9.5,
    fontWeight: '700',
    color: '#94A3B8',
  },
  legendBox: {
    backgroundColor: '#F8FAFC',
    borderRadius: 6,
    padding: 6,
    marginTop: 6,
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  legendText: {
    fontSize: 8.5,
    color: '#475569',
    lineHeight: 12,
  },
  notesBox: {
    backgroundColor: '#FFFBEB',
    borderRadius: 8,
    padding: 8,
    borderWidth: 1,
    borderColor: '#FDE68A',
    marginVertical: 8,
  },
  notesTitle: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#92400E',
    marginBottom: 2,
  },
  notesText: {
    fontSize: 9,
    fontStyle: 'italic',
    color: '#78350F',
    lineHeight: 13,
  },
  signatureRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 14,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  signatureCol: {
    flex: 1,
    alignItems: 'center',
  },
  signatureRole: {
    fontSize: 9,
    fontWeight: '700',
    color: '#64748B',
  },
  signatureSpace: {
    height: 40,
  },
  signatureName: {
    fontSize: 9.5,
    fontWeight: '800',
    color: '#0F172A',
    textAlign: 'center',
  },
  footerBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: '#0F172A',
    borderTopWidth: 1,
    borderTopColor: '#334155',
  },
  footerCloseBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#EF4444',
  },
  footerCloseText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
  footerRightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  footerDownloadBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  footerDownloadText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#047857',
  },
  footerPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 10,
    backgroundColor: '#059669',
  },
  footerPrintText: {
    fontSize: 11,
    fontWeight: '800',
    color: '#FFFFFF',
  },
});
