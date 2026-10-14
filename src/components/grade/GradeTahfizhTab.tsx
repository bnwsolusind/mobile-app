import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  tahfizhList: any[];
  tahfizhAchievement?: any;
  averageScore?: number;
  predicate?: string;
  studentName?: string;
  className?: string;
  academicYear?: string;
  semester?: string;
  kkm?: number;
  evaluationNote?: string;
  tasmiStatus?: string;
  targetDescription?: string;
  onSelectTahfizh: (item: any) => void;
  onOpenWeeklyReport?: () => void;
  onNavigateToTahfizh?: () => void;
}

export const GradeTahfizhTab: React.FC<Props> = ({
  tahfizhList,
  tahfizhAchievement,
  averageScore,
  predicate,
  studentName,
  className,
  academicYear,
  semester,
  kkm,
  evaluationNote,
  tasmiStatus,
  targetDescription,
  onSelectTahfizh,
  onOpenWeeklyReport,
  onNavigateToTahfizh,
}) => {
  // 1. Hitung skor rata-rata efektif secara dinamis dari API / list riil (tanpa hardcode 92)
  const effectiveScore = useMemo(() => {
    if (typeof averageScore === 'number' && Number.isFinite(averageScore)) {
      return Math.round(averageScore);
    }
    if (tahfizhAchievement?.average_score != null) {
      return Math.round(Number(tahfizhAchievement.average_score));
    }
    if (tahfizhAchievement?.score != null) {
      return Math.round(Number(tahfizhAchievement.score));
    }
    if (Array.isArray(tahfizhList) && tahfizhList.length > 0) {
      const sum = tahfizhList.reduce((acc, it) => acc + (Number(it.score) || 0), 0);
      return Math.round(sum / tahfizhList.length);
    }
    return 0;
  }, [averageScore, tahfizhAchievement, tahfizhList]);

  // 2. Tentukan predikat evaluasi dinamis (Mumtaz, Jayyid Jiddan, Jayyid, Maqbul, Dhaif)
  const effectivePredicate = useMemo(() => {
    if (predicate && predicate !== '-') return predicate;
    if (tahfizhAchievement?.predicate) return tahfizhAchievement.predicate;
    if (tahfizhAchievement?.grade_letter) return tahfizhAchievement.grade_letter;
    if (effectiveScore >= 90) return 'Mumtaz';
    if (effectiveScore >= 80) return 'Jayyid Jiddan';
    if (effectiveScore >= 70) return 'Jayyid';
    if (effectiveScore >= 60) return 'Maqbul';
    if (effectiveScore > 0) return 'Dhaif';
    return '-';
  }, [predicate, tahfizhAchievement, effectiveScore]);

  // Status kelulusan KKM
  const hasKkm = typeof kkm === 'number' && kkm > 0;
  const isPassing = hasKkm ? effectiveScore >= (kkm as number) : null;

  // Tahun Ajaran & Semester dinamis
  const effectiveYear = academicYear || tahfizhAchievement?.academic_year || 'Tahun Ajaran Berjalan';
  const effectiveSem = semester || tahfizhAchievement?.semester || 'Semester Berjalan';

interface AspectEvaluation {
  isNumeric: boolean;
  score: number | null;
  label: string;
}

const isPureNumeric = (val: any): boolean => {
  if (val === null || val === undefined) return false;
  if (typeof val === 'number') {
    return Number.isFinite(val) && !Number.isNaN(val);
  }
  if (typeof val === 'string') {
    const trimmed = val.trim();
    if (trimmed === '') return false;
    return /^\d+(\.\d+)?$/.test(trimmed);
  }
  return false;
};

const resolveAspect = (
  items: any[],
  getVal: (it: any) => any,
  fallbackAchievementValues: any[]
): AspectEvaluation => {
  const numericScores: number[] = [];
  const qualitativeValues: string[] = [];

  if (Array.isArray(items) && items.length > 0) {
    for (const it of items) {
      if (!it) continue;
      const raw = getVal(it);
      if (raw === null || raw === undefined) continue;

      if (isPureNumeric(raw)) {
        numericScores.push(Number(raw));
      } else if (typeof raw === 'string') {
        const trimmed = raw.trim();
        if (trimmed !== '' && trimmed !== '-' && trimmed !== '—') {
          qualitativeValues.push(trimmed);
        }
      }
    }
  }

  // 1. Jika ada skor numerik yang valid (angka riil resmi)
  if (numericScores.length > 0) {
    const avg = Math.round(numericScores.reduce((sum, n) => sum + n, 0) / numericScores.length);
    const clamped = Math.min(100, Math.max(0, avg));
    return {
      isNumeric: true,
      score: clamped,
      label: String(clamped),
    };
  }

  // 2. Jika ada nilai kualitatif (predikat riil: Sangat Baik, Baik, A, Lancar, dll)
  if (qualitativeValues.length > 0) {
    return {
      isNumeric: false,
      score: null,
      label: qualitativeValues[0],
    };
  }

  // 3. Fallback ke data capaian semester/tahfizhAchievement jika tersedia
  for (const achVal of fallbackAchievementValues) {
    if (achVal === null || achVal === undefined) continue;
    if (isPureNumeric(achVal)) {
      const clamped = Math.min(100, Math.max(0, Math.round(Number(achVal))));
      return {
        isNumeric: true,
        score: clamped,
        label: String(clamped),
      };
    }
    if (typeof achVal === 'string') {
      const trimmed = achVal.trim();
      if (trimmed !== '' && trimmed !== '-' && trimmed !== '—') {
        return {
          isNumeric: false,
          score: null,
          label: trimmed,
        };
      }
    }
  }

  // 4. Fallback jujur jika data kosong atau tidak dikenal: '—' (tanpa skor fiktif)
  return {
    isNumeric: false,
    score: null,
    label: '—',
  };
};

  // 3. Rubrik Evaluasi 4 Dimensi Al-Qur'an (Makhraj, Tajwid, Kelancaran, Adab)
  const rubrik = useMemo(() => {
    const getValMakhraj = (it: any) =>
      it?.makhraj !== undefined && it?.makhraj !== null && !Number.isNaN(it?.makhraj)
        ? it.makhraj
        : it?.raw_makhraj ?? it?.makharijul_huruf ?? it?.metadata?.makhraj;

    const getValTajwid = (it: any) =>
      it?.tajwid !== undefined && it?.tajwid !== null && !Number.isNaN(it?.tajwid)
        ? it.tajwid
        : it?.raw_tajwid ?? it?.metadata?.tajwid;

    const getValFluency = (it: any) =>
      it?.kelancaran !== undefined && it?.kelancaran !== null && !Number.isNaN(it?.kelancaran)
        ? it.kelancaran
        : it?.raw_kelancaran ?? (isPureNumeric(it?.fluency) ? it.fluency : null) ?? it?.metadata?.kelancaran;

    const getValAdab = (it: any) =>
      it?.adab !== undefined && it?.adab !== null && !Number.isNaN(it?.adab)
        ? it.adab
        : it?.raw_adab ?? it?.metadata?.adab;

    return {
      makhraj: resolveAspect(tahfizhList, getValMakhraj, [
        tahfizhAchievement?.makhraj,
        tahfizhAchievement?.nilai_makhraj,
        tahfizhAchievement?.makharijul_huruf,
      ]),
      tajwid: resolveAspect(tahfizhList, getValTajwid, [
        tahfizhAchievement?.tajwid,
        tahfizhAchievement?.nilai_tajwid,
      ]),
      fluency: resolveAspect(tahfizhList, getValFluency, [
        tahfizhAchievement?.kelancaran,
        tahfizhAchievement?.nilai_kelancaran,
        tahfizhAchievement?.fluency,
      ]),
      adab: resolveAspect(tahfizhList, getValAdab, [
        tahfizhAchievement?.adab,
        tahfizhAchievement?.nilai_adab,
      ]),
    };
  }, [tahfizhList, tahfizhAchievement]);

  // 4. Catatan Evaluasi Guru / Deskripsi Rapor Berdasarkan Data Riil
  const noteText = useMemo(() => {
    if (evaluationNote) return evaluationNote;
    if (tahfizhAchievement?.evaluation_note) return tahfizhAchievement.evaluation_note;
    if (tahfizhAchievement?.notes) return tahfizhAchievement.notes;
    if (tahfizhAchievement?.catatan_ustadz) return tahfizhAchievement.catatan_ustadz;
    if (tahfizhAchievement?.description) return tahfizhAchievement.description;

    const childCalling = studentName ? `ananda ${studentName}` : 'ananda';
    if (effectiveScore >= 90) {
      return `Alhamdulillah, ${childCalling} menunjukkan kelancaran hafalan yang sangat baik (predikat ${effectivePredicate}), tartil, fashih dalam pelafalan makhraj huruf, serta disiplin dalam muroja'ah yaumiyyah.`;
    }
    if (effectiveScore >= 80) {
      return `Alhamdulillah, capaian hafalan ${childCalling} terlaksana dengan baik (${effectivePredicate}). Tingkatkan muroja'ah mandiri untuk memantapkan kaidah mad dan dengung (ghunnah).`;
    }
    if (hasKkm && effectiveScore >= (kkm as number)) {
      return `Capaian hafalan ${childCalling} telah memenuhi batas tuntas kriteria ketuntasan (KKM ${kkm}). Dianjurkan memperbanyak talaqqi dan muroja'ah ayat-ayat pertengahan surah.`;
    }
    if (hasKkm && effectiveScore > 0) {
      return `Capaian hafalan ${childCalling} memerlukan bimbingan muroja'ah lebih intensif untuk mencapai ketuntasan kriteria KKM ${kkm}.`;
    }
    if (effectiveScore > 0) {
      return `Capaian hafalan ${childCalling} tercatat dengan predikat ${effectivePredicate}. Dianjurkan memperbanyak talaqqi dan muroja'ah hafalan Al-Qur'an secara istiqomah.`;
    }
    return `Belum ada catatan evaluasi semester berjalan untuk ${childCalling}. Data akan diperbarui setelah setoran diverifikasi ustadz.`;
  }, [evaluationNote, tahfizhAchievement, studentName, effectiveScore, effectivePredicate, kkm, hasKkm]);

  // 5. Total Hafalan & Target Kurikulum Riil
  const totalHafalanText = useMemo(() => {
    if (tahfizhAchievement?.completed_juz_text) return tahfizhAchievement.completed_juz_text;
    if (tahfizhAchievement?.total_hafalan) return String(tahfizhAchievement.total_hafalan);
    if (tahfizhAchievement?.completed_juz_count != null) return `${tahfizhAchievement.completed_juz_count} Juz`;
    if (tahfizhAchievement?.juz_count != null) return `${tahfizhAchievement.juz_count} Juz`;
    if (Array.isArray(tahfizhList) && tahfizhList.length > 0) {
      const distinctJuz = Array.from(new Set(tahfizhList.map((it: any) => it.juz).filter(Boolean)));
      if (distinctJuz.length > 0) return `${distinctJuz.length} Juz (${tahfizhList.length} Setoran)`;
      return `${tahfizhList.length} Riwayat Setoran`;
    }
    return '0 Setoran';
  }, [tahfizhAchievement, tahfizhList]);

  const targetCurriculumLabel = useMemo(() => {
    if (targetDescription) return targetDescription;
    if (tahfizhAchievement?.target_description) return tahfizhAchievement.target_description;
    if (tahfizhAchievement?.target_juz) return `Juz ${tahfizhAchievement.target_juz}`;
    if (tahfizhAchievement?.target) return String(tahfizhAchievement.target);
    return 'Target Kurikulum';
  }, [targetDescription, tahfizhAchievement]);

  const targetPercent = useMemo(() => {
    if (tahfizhAchievement?.achievement_percentage != null) {
      return Math.min(100, Math.max(0, Math.round(Number(tahfizhAchievement.achievement_percentage))));
    }
    if (tahfizhAchievement?.progress_percentage != null) {
      return Math.min(100, Math.max(0, Math.round(Number(tahfizhAchievement.progress_percentage))));
    }
    if (Array.isArray(tahfizhList) && tahfizhList.length > 0) {
      const targetCount = Number(tahfizhAchievement?.target_count) || 10;
      return Math.min(100, Math.round((tahfizhList.length / targetCount) * 100));
    }
    return 0;
  }, [tahfizhAchievement, tahfizhList]);

  // 6. Status Ujian Tasmi' Riil
  const tasmiInfo = useMemo(() => {
    if (tasmiStatus) return tasmiStatus;
    if (tahfizhAchievement?.tasmi_status) return tahfizhAchievement.tasmi_status;
    if (tahfizhAchievement?.exam_status) return tahfizhAchievement.exam_status;
    if (effectiveScore >= 85) {
      return `Lulus Ujian Tasmi' Al-Qur'an dengan predikat ${effectivePredicate}.`;
    }
    if (hasKkm && effectiveScore >= (kkm as number)) {
      return `Tuntas Ujian Tahfizh Semester Berjalan dengan predikat ${effectivePredicate}.`;
    }
    if (effectiveScore > 0) {
      return `Dalam persiapan bimbingan Ujian Tahfizh Semester Berjalan.`;
    }
    return `Jadwal ujian tasmi' semester akan diumumkan oleh pengampu tahfizh.`;
  }, [tasmiStatus, tahfizhAchievement, effectiveScore, effectivePredicate, kkm, hasKkm]);

  // Dynamic Predicate Style Color
  const predicateStyle = useMemo(() => {
    if (effectiveScore >= 90) return { bg: '#FEF08A', text: '#713F12' }; // Mumtaz (Gold)
    if (effectiveScore >= 80) return { bg: '#A7F3D0', text: '#065F46' }; // Jayyid Jiddan (Emerald)
    if (effectiveScore >= 70) return { bg: '#BAE6FD', text: '#0369A1' }; // Jayyid (Sky)
    if (effectiveScore >= 60) return { bg: '#FED7AA', text: '#9A3412' }; // Maqbul (Orange)
    return { bg: '#FECDD3', text: '#9F1239' }; // Dhaif (Rose)
  }, [effectiveScore]);

  // Cuplikan 3 setoran terakhir riil
  const recentItems = useMemo(() => {
    return (tahfizhList || []).slice(0, 3);
  }, [tahfizhList]);

  return (
    <View style={styles.tabContainer}>
      {/* 1. TOMBOL CETAK LAPORAN RESMI TAHFIZH */}
      {onOpenWeeklyReport && (
        <TouchableOpacity
          activeOpacity={0.88}
          onPress={onOpenWeeklyReport}
          style={styles.topPrintBtn}
        >
          <View style={styles.topPrintIconSquircle}>
            <MaterialCommunityIcons name="printer" size={24} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.topPrintTitle}>Cetak Laporan Rapor Tahfizh</Text>
            <Text style={styles.topPrintSub}>Format Resmi Sekolah (PDF / Siap Cetak)</Text>
          </View>
          <View style={styles.topPrintArrowBox}>
            <MaterialCommunityIcons name="chevron-right" size={20} color="#059669" />
          </View>
        </TouchableOpacity>
      )}

      {/* 2. KARTU NILAI & PREDIKAT RAPOR TAHFIZH (EXECUTIVE GRADE CARD) */}
      <View style={styles.reportScoreCard}>
        <LinearGradient
          colors={['#064E3B', '#047857', '#059669']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.reportScoreGradient}
        >
          <View style={styles.scoreTopRow}>
            <View style={{ flex: 1 }}>
              <View style={styles.badgeRow}>
                <View style={styles.kkmBadge}>
                  <Text style={styles.kkmBadgeText}>
                    {hasKkm ? `KKM: ${kkm} • ${isPassing ? 'TUNTAS' : 'BELUM TUNTAS'}` : 'KKM: -'}
                  </Text>
                </View>
              </View>
              <Text style={styles.reportTitle}>Nilai Rapor Tahfizh Al-Qur'an</Text>
              <Text style={styles.reportSub}>
                {className ? `Kelas ${className} • ` : ''}Tahun Ajaran {effectiveYear}
              </Text>
            </View>

            <View style={styles.bigScoreBox}>
              <Text style={styles.bigScoreNum}>{effectiveScore > 0 ? effectiveScore : '-'}</Text>
              <View style={[styles.predicatePill, { backgroundColor: predicateStyle.bg }]}>
                <Text style={[styles.predicatePillText, { color: predicateStyle.text }]}>
                  {effectivePredicate}
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.scoreDivider} />

          {/* Deskripsi Evaluasi Rapor */}
          <View style={styles.evalNoteRow}>
            <MaterialCommunityIcons name="format-quote-open" size={20} color="#6EE7B7" style={{ marginTop: -2 }} />
            <Text style={styles.evalNoteText}>{noteText}</Text>
          </View>
        </LinearGradient>
      </View>

      {/* 3. CAPAIAN TARGET & PORTOFOLIO HAFALAN */}
      <View style={styles.portfolioCard}>
        <View style={styles.cardHeaderRow}>
          <View style={styles.headerIconBox}>
            <MaterialCommunityIcons name="target" size={20} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardSectionTitle}>Capaian Target Kurikulum</Text>
            <Text style={styles.cardSectionSub}>Target {effectiveSem} · {effectiveYear}</Text>
          </View>
          <View style={styles.targetStatusBadge}>
            <MaterialCommunityIcons
              name={targetPercent >= 100 ? 'check-decagram' : 'clock-outline'}
              size={13}
              color="#059669"
            />
            <Text style={styles.targetStatusText}>{targetPercent}% Tuntas</Text>
          </View>
        </View>

        {/* Progress Bar Target */}
        <View style={styles.targetProgressContainer}>
          <View style={styles.targetProgressLabels}>
            <Text style={styles.progressLabelLeft}>Total Hafalan: <Text style={styles.progressBold}>{totalHafalanText}</Text></Text>
            <Text style={styles.progressLabelRight}>Target: <Text style={styles.progressBold}>{targetCurriculumLabel} ({targetPercent}%)</Text></Text>
          </View>
          <View style={styles.progressBarTrack}>
            <View style={[styles.progressBarFill, { width: `${targetPercent}%` }]} />
          </View>
        </View>

        {/* Info Tambahan Tasmi' */}
        <View style={styles.tasmiInfoBox}>
          <MaterialCommunityIcons name="certificate-outline" size={18} color="#0D9488" />
          <Text style={styles.tasmiInfoText}>
            Status Ujian Semester: <Text style={styles.tasmiBold}>{tasmiInfo}</Text>
          </Text>
        </View>
      </View>

      {/* 4. RUBRIK EVALUASI 4 ASPEK AL-QUR'AN (RAPOR RUBRIC GRID) */}
      <View style={styles.rubrikCard}>
        <View style={styles.cardHeaderRow}>
          <View style={[styles.headerIconBox, { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' }]}>
            <MaterialCommunityIcons name="chart-box-outline" size={20} color="#2563EB" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardSectionTitle}>Rubrik Aspek Penilaian Tahfizh</Text>
            <Text style={styles.cardSectionSub}>Rincian indikator penilaian hasil belajar</Text>
          </View>
        </View>

        <View style={styles.rubrikGrid}>
          {/* Item 1: Makharijul Huruf */}
          <View style={styles.rubrikItem}>
            <View style={styles.rubrikTop}>
              <Text style={styles.rubrikLabel}>Makhraj Huruf</Text>
              <Text style={[styles.rubrikScore, !rubrik.makhraj.isNumeric && styles.rubrikScoreQualitative]}>
                {rubrik.makhraj.label}
              </Text>
            </View>
            <Text style={styles.rubrikDesc}>Ketepatan tempat keluarnya huruf hijaiyah</Text>
            <View style={styles.miniBarTrack}>
              <View
                style={[
                  styles.miniBarFill,
                  {
                    width: rubrik.makhraj.isNumeric && rubrik.makhraj.score !== null ? `${rubrik.makhraj.score}%` : '0%',
                    backgroundColor: '#059669',
                  },
                ]}
              />
            </View>
          </View>

          {/* Item 2: Tajwid */}
          <View style={styles.rubrikItem}>
            <View style={styles.rubrikTop}>
              <Text style={styles.rubrikLabel}>Kaidah Tajwid</Text>
              <Text style={[styles.rubrikScore, !rubrik.tajwid.isNumeric && styles.rubrikScoreQualitative]}>
                {rubrik.tajwid.label}
              </Text>
            </View>
            <Text style={styles.rubrikDesc}>Ghunnah, Mad, Idgham, Ikhfa' & Iqlab</Text>
            <View style={styles.miniBarTrack}>
              <View
                style={[
                  styles.miniBarFill,
                  {
                    width: rubrik.tajwid.isNumeric && rubrik.tajwid.score !== null ? `${rubrik.tajwid.score}%` : '0%',
                    backgroundColor: '#0D9488',
                  },
                ]}
              />
            </View>
          </View>

          {/* Item 3: Kelancaran */}
          <View style={styles.rubrikItem}>
            <View style={styles.rubrikTop}>
              <Text style={styles.rubrikLabel}>Kelancaran (Fashohah)</Text>
              <Text style={[styles.rubrikScore, !rubrik.fluency.isNumeric && styles.rubrikScoreQualitative]}>
                {rubrik.fluency.label}
              </Text>
            </View>
            <Text style={styles.rubrikDesc}>Kelancaran hafalan tanpa terbata-bata</Text>
            <View style={styles.miniBarTrack}>
              <View
                style={[
                  styles.miniBarFill,
                  {
                    width: rubrik.fluency.isNumeric && rubrik.fluency.score !== null ? `${rubrik.fluency.score}%` : '0%',
                    backgroundColor: '#2563EB',
                  },
                ]}
              />
            </View>
          </View>

          {/* Item 4: Adab */}
          <View style={styles.rubrikItem}>
            <View style={styles.rubrikTop}>
              <Text style={styles.rubrikLabel}>Adab & Tartil</Text>
              <Text style={[styles.rubrikScore, !rubrik.adab.isNumeric && styles.rubrikScoreQualitative]}>
                {rubrik.adab.label}
              </Text>
            </View>
            <Text style={styles.rubrikDesc}>Adab tilawah, ketenangan & kekhusyukan</Text>
            <View style={styles.miniBarTrack}>
              <View
                style={[
                  styles.miniBarFill,
                  {
                    width: rubrik.adab.isNumeric && rubrik.adab.score !== null ? `${rubrik.adab.score}%` : '0%',
                    backgroundColor: '#7C3AED',
                  },
                ]}
              />
            </View>
          </View>
        </View>
      </View>

      {/* 5. CUPLIKAN 3 SETORAN TERAKHIR SEBAGAI BUKTI NYATA (RECENT HIGHLIGHTS) */}
      {recentItems.length > 0 && (
        <View style={styles.recentSection}>
          <View style={styles.recentHeaderRow}>
            <Text style={styles.recentSectionTitle}>Cuplikan Evaluasi Setoran Terakhir</Text>
            <Text style={styles.recentCountText}>{recentItems.length} Terbaru</Text>
          </View>

          <View style={styles.recentList}>
            {recentItems.map((item) => (
              <TouchableOpacity
                key={item.id}
                activeOpacity={0.85}
                onPress={() => onSelectTahfizh(item)}
                style={styles.recentItemCard}
              >
                <View style={styles.recentIconBox}>
                  <MaterialCommunityIcons name="book-open-page-variant" size={20} color="#059669" />
                </View>
                <View style={{ flex: 1 }}>
                  <Text numberOfLines={1} style={styles.recentSurahName}>
                    {item.surah || item.hafalan_surah_name || item.nama_surah || 'Setoran Tahfizh'}
                  </Text>
                  <Text style={styles.recentMetaText}>
                    {item.date || item.created_at || '-'} • {item.teacher || item.teacher_name || 'Ust. Pengampu'}
                  </Text>
                </View>
                <View style={styles.recentScoreBadge}>
                  <Text style={styles.recentScoreNum}>
                    {typeof item.score === 'number' && item.score > 0 ? item.score : (item.predicate || '—')}
                  </Text>
                  {typeof item.score === 'number' && item.score > 0 && (
                    <Text style={styles.recentScorePred}>{item.predicate || effectivePredicate}</Text>
                  )}
                </View>
              </TouchableOpacity>
            ))}
          </View>
        </View>
      )}

      {/* 6. JEMBATAN NAVIGASI / CTA KE MODUL UTAMA TAHFIZH */}
      <View style={styles.bridgeCtaCard}>
        <LinearGradient
          colors={['#ECFDF5', '#F0FDF4']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.bridgeCtaGradient}
        >
          <View style={styles.bridgeIconBox}>
            <MaterialCommunityIcons name="book-arrow-right-outline" size={26} color="#059669" />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.bridgeTitle}>Buku Induk Riwayat Tahfizh Lengkap</Text>
            <Text style={styles.bridgeSub}>
              Ingin melihat seluruh riwayat setoran harian, rekaman audio ustadz, dan mushaf Al-Qur'an interaktif?
            </Text>
            <TouchableOpacity
              activeOpacity={0.85}
              onPress={onNavigateToTahfizh}
              style={styles.bridgeButton}
            >
              <Text style={styles.bridgeButtonText}>Buka Modul Tahfizh Lengkap</Text>
              <MaterialCommunityIcons name="arrow-right" size={16} color="#FFFFFF" />
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  tabContainer: {
    paddingBottom: 28,
  },
  topPrintBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#FFFFFF',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    borderRadius: 18,
    paddingVertical: 12,
    paddingHorizontal: 14,
    marginBottom: 14,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 5,
    elevation: 2,
  },
  topPrintIconSquircle: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: '#DEF7EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topPrintTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#064E3B',
    letterSpacing: 0.1,
  },
  topPrintSub: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '600',
    marginTop: 2,
  },
  topPrintArrowBox: {
    width: 30,
    height: 30,
    borderRadius: 10,
    backgroundColor: '#F0FDF4',
    borderWidth: 1,
    borderColor: '#BBF7D0',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // 2. Report Score Card
  reportScoreCard: {
    borderRadius: 22,
    overflow: 'hidden',
    marginBottom: 16,
    shadowColor: '#064E3B',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.12,
    shadowRadius: 10,
    elevation: 4,
  },
  reportScoreGradient: {
    padding: 18,
  },
  scoreTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  badgeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 6,
  },
  kkmBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  kkmBadgeText: {
    fontSize: 10,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.3,
  },
  reportTitle: {
    fontSize: 15,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  reportSub: {
    fontSize: 11.5,
    color: '#D1FAE5',
    marginTop: 2,
    fontWeight: '500',
  },
  bigScoreBox: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  bigScoreNum: {
    fontSize: 26,
    fontWeight: '900',
    color: '#FFFFFF',
    lineHeight: 30,
  },
  predicatePill: {
    marginTop: 4,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  predicatePillText: {
    fontSize: 10,
    fontWeight: '800',
  },
  scoreDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    marginVertical: 14,
  },
  evalNoteRow: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-start',
  },
  evalNoteText: {
    flex: 1,
    fontSize: 11.5,
    color: '#ECFDF5',
    lineHeight: 17,
    fontStyle: 'italic',
  },

  // 3. Portfolio Card
  portfolioCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  cardHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: 12,
  },
  headerIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardSectionTitle: {
    fontSize: 13.5,
    fontWeight: '800',
    color: '#0F172A',
  },
  cardSectionSub: {
    fontSize: 11,
    color: '#64748B',
    marginTop: 1,
  },
  targetStatusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: '#ECFDF5',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#A7F3D0',
  },
  targetStatusText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#059669',
  },
  targetProgressContainer: {
    marginBottom: 12,
  },
  targetProgressLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  progressLabelLeft: {
    fontSize: 11.5,
    color: '#475569',
  },
  progressLabelRight: {
    fontSize: 11.5,
    color: '#475569',
  },
  progressBold: {
    fontWeight: '800',
    color: '#0F172A',
  },
  progressBarTrack: {
    height: 8,
    borderRadius: 4,
    backgroundColor: '#F1F5F9',
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: '#059669',
    borderRadius: 4,
  },
  tasmiInfoBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#F0FDFA',
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#CCFBF1',
  },
  tasmiInfoText: {
    flex: 1,
    fontSize: 11,
    color: '#0F766E',
    lineHeight: 16,
  },
  tasmiBold: {
    fontWeight: '700',
    color: '#0F766E',
  },

  // 4. Rubric Card
  rubrikCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 16,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: 16,
    shadowColor: '#0F172A',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.04,
    shadowRadius: 6,
    elevation: 2,
  },
  rubrikGrid: {
    gap: 12,
  },
  rubrikItem: {
    backgroundColor: '#F8FAFC',
    padding: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#F1F5F9',
  },
  rubrikTop: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 2,
  },
  rubrikLabel: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#1E293B',
  },
  rubrikScore: {
    fontSize: 13,
    fontWeight: '800',
    color: '#059669',
  },
  rubrikScoreQualitative: {
    fontSize: 12,
    fontWeight: '700',
    color: '#0D9488',
  },
  rubrikDesc: {
    fontSize: 10.5,
    color: '#64748B',
    marginBottom: 6,
  },
  miniBarTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  miniBarFill: {
    height: '100%',
    borderRadius: 2,
  },

  // 5. Recent Section
  recentSection: {
    marginBottom: 16,
  },
  recentHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
    paddingHorizontal: 2,
  },
  recentSectionTitle: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#475569',
  },
  recentCountText: {
    fontSize: 11,
    color: '#059669',
    fontWeight: '700',
  },
  recentList: {
    gap: 8,
  },
  recentItemCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: '#E2E8F0',
    gap: 10,
  },
  recentIconBox: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#ECFDF5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  recentSurahName: {
    fontSize: 12.5,
    fontWeight: '700',
    color: '#0F172A',
  },
  recentMetaText: {
    fontSize: 10.5,
    color: '#64748B',
    marginTop: 2,
  },
  recentScoreBadge: {
    alignItems: 'center',
    backgroundColor: '#DEF7EC',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
  },
  recentScoreNum: {
    fontSize: 12.5,
    fontWeight: '800',
    color: '#03543F',
  },
  recentScorePred: {
    fontSize: 9,
    fontWeight: '700',
    color: '#03543F',
  },

  // 6. Bridge CTA
  bridgeCtaCard: {
    borderRadius: 18,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: '#A7F3D0',
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06,
    shadowRadius: 6,
    elevation: 2,
  },
  bridgeCtaGradient: {
    padding: 16,
    flexDirection: 'row',
    gap: 12,
    alignItems: 'flex-start',
  },
  bridgeIconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: '#DEF7EC',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bridgeTitle: {
    fontSize: 13,
    fontWeight: '800',
    color: '#064E3B',
  },
  bridgeSub: {
    fontSize: 11,
    color: '#047857',
    lineHeight: 16,
    marginTop: 3,
    marginBottom: 10,
  },
  bridgeButton: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: '#059669',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    shadowColor: '#059669',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 2,
  },
  bridgeButtonText: {
    fontSize: 11.5,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
