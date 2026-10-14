import React from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { MaterialCommunityIcons } from '@expo/vector-icons';

interface Props {
  activeTab: 'academic' | 'tahfizh' | 'mutabaah';
  average: number | null;
  predicate: string;
  totalCount: number;
  studentName?: string;
  onPressAction: () => void;
}

export const GradeHeroSummary: React.FC<Props> = ({
  activeTab,
  average,
  predicate,
  totalCount,
  studentName,
  onPressAction,
}) => {
  const isAcademic = activeTab === 'academic';
  const isTahfizh = activeTab === 'tahfizh';

  const title = isAcademic
    ? 'Rata-rata Nilai Akademik'
    : isTahfizh
    ? 'Rata-rata Nilai Tahfizh'
    : 'Skor Mutabaah Yaumiyah';

  const subtitle = isAcademic
    ? `${totalCount} Mata Pelajaran Terdata`
    : isTahfizh
    ? `${totalCount} Riwayat Setoran Surat`
    : (average != null ? `Tingkat Kepatuhan ${average}%` : 'Tingkat Kepatuhan -');

  const actionLabel = isAcademic
    ? 'Lihat Rapor Semester'
    : isTahfizh
    ? 'Target & Evaluasi Tahfizh'
    : 'Rekap Laporan Mutabaah';

  const gradientColors = isAcademic
    ? (['#065F46', '#047857', '#059669'] as const)
    : isTahfizh
    ? (['#0F766E', '#0D9488', '#14B8A6'] as const)
    : (['#1E293B', '#334155', '#475569'] as const);

  return (
    <View style={styles.cardContainer}>
      <LinearGradient
        colors={gradientColors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradientBg}
      >
        <View style={styles.decorCircle1} />
        <View style={styles.decorCircle2} />

        <View style={styles.topRow}>
          <View style={styles.scoreBlock}>
            {studentName ? (
              <View style={styles.studentBadge}>
                <MaterialCommunityIcons name="account-circle-outline" size={13} color="#FFFFFF" />
                <Text style={styles.studentBadgeText} numberOfLines={1} ellipsizeMode="tail">
                  {studentName}
                </Text>
              </View>
            ) : null}
            <Text style={styles.cardTitle}>{title}</Text>
            <View style={styles.scoreRow}>
              <Text style={styles.bigScore}>{average != null ? average : '-'}</Text>
              <View style={styles.predicatePill}>
                <Text style={styles.predicateText}>{predicate}</Text>
              </View>
            </View>
            <Text style={styles.subText}>{subtitle}</Text>
          </View>

          <View style={styles.iconCircle}>
            <MaterialCommunityIcons
              name={isAcademic ? 'school' : isTahfizh ? 'book-open-page-variant' : 'checkbox-marked-circle-outline'}
              size={32}
              color="rgba(255, 255, 255, 0.9)"
            />
          </View>
        </View>

        <View style={styles.divider} />

        <TouchableOpacity
          activeOpacity={0.85}
          onPress={onPressAction}
          style={styles.actionBtn}
        >
          <Text style={styles.actionBtnText}>{actionLabel}</Text>
          <MaterialCommunityIcons name="chevron-right" size={18} color="#FFFFFF" />
        </TouchableOpacity>
      </LinearGradient>
    </View>
  );
};

const styles = StyleSheet.create({
  cardContainer: {
    borderRadius: 20,
    overflow: 'hidden',
    marginBottom: 14,
    shadowColor: '#047857',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  gradientBg: {
    padding: 16,
    position: 'relative',
    overflow: 'hidden',
  },
  decorCircle1: {
    position: 'absolute',
    top: -20,
    right: -20,
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  decorCircle2: {
    position: 'absolute',
    bottom: -15,
    left: 40,
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  topRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  scoreBlock: {
    flex: 1,
  },
  studentBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 12,
    gap: 4,
    marginBottom: 6,
    maxWidth: '90%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.35)',
  },
  studentBadgeText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
    letterSpacing: 0.1,
  },
  cardTitle: {
    fontSize: 12,
    fontWeight: '600',
    color: 'rgba(255, 255, 255, 0.85)',
    marginBottom: 4,
    letterSpacing: 0.2,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: 8,
  },
  bigScore: {
    fontSize: 34,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  predicatePill: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.3)',
  },
  predicateText: {
    fontSize: 11,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  subText: {
    fontSize: 11,
    color: 'rgba(255, 255, 255, 0.8)',
    marginTop: 4,
    fontWeight: '500',
  },
  iconCircle: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.15)',
    marginVertical: 12,
  },
  actionBtn: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 12,
  },
  actionBtnText: {
    fontSize: 12,
    fontWeight: '700',
    color: '#FFFFFF',
  },
});
